/**
 * Experience Routes
 * /api/v1/experiences/*
 *
 * Handles both SkillExperience (type:"skill") and
 * DebugExperience (type:"debug_note") via the shared `experiences` table.
 */

const { Router } = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { experienceLimiter, applicationLimiter } = require('../middleware/rateLimit');
const { success, created } = require('../utils/response');
const { queryOne, queryAll, transaction } = require('../config/database');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { generateExperienceId } = require('../utils/id');
const { embedExperience, generateEmbedding, isEmbeddingAvailable } = require('../utils/embedding');
const { VALID_VISIBILITIES } = require('../utils/validation');

const router = Router();

const VALID_OUTCOMES = ['success', 'failure', 'partial', 'skipped'];

// Bayesian average prior: assume 3 applications at 50% success before we have real data.
// This prevents a single success from immediately giving trust_score=100.
const PRIOR_N = 3;
const PRIOR_SCORE = 50;

function bayesianTrustScore(successful, total) {
  return ((successful + PRIOR_N * (PRIOR_SCORE / 100)) / (total + PRIOR_N)) * 100;
}

/**
 * POST /experiences
 * Create a new Experience (skill or debug_note).
 */
router.post('/', requireAuth, experienceLimiter, asyncHandler(async (req, res) => {
  const {
    type,
    title,
    description,
    tags,
    applicability,
    provenance,
    data,
    visibility = 'public'
  } = req.body;

  if (!type || !['skill', 'debug_note'].includes(type)) {
    throw new BadRequestError(
      'type must be "skill" or "debug_note"',
      'INVALID_TYPE',
      'Provide type as "skill" for successful motions or "debug_note" for failure recoveries'
    );
  }

  if (!title) {
    throw new BadRequestError('title is required');
  }

  if (!VALID_VISIBILITIES.includes(visibility)) {
    throw new BadRequestError(
      `visibility must be one of: ${VALID_VISIBILITIES.join(', ')}`,
      'INVALID_VISIBILITY',
      `Got "${visibility}". Use "public" unless your org has a private FleetSeek deployment.`
    );
  }

  const id = generateExperienceId();

  const initialTrustSignals = {
    applications: { total: 0, successful: 0, failed: 0 },
    upvotes: 0,
    downvotes: 0
  };

  const experience = await queryOne(
    `INSERT INTO experiences (
       id, type, robot_id, title, description, tags,
       applicability, provenance, data, visibility,
       trust_signals, trust_score, status, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, 0, 'candidate', NOW(), NOW()
     )
     RETURNING *`,
    [
      id,
      type,
      req.agent.id,
      title,
      description || null,
      tags || null,
      JSON.stringify(applicability || {}),
      JSON.stringify(provenance || {}),
      JSON.stringify(data || {}),
      visibility,
      JSON.stringify(initialTrustSignals)
    ]
  );

  // Generate embedding asynchronously (don't block the response)
  if (isEmbeddingAvailable()) {
    embedExperience({ title, description, data }).then(vector => {
      if (vector) {
        queryOne(
          `UPDATE experiences SET embedding = $1 WHERE id = $2`,
          [`[${vector.join(',')}]`, id]
        ).catch(err => console.error('[embedding] update failed:', err.message));
      }
    });
  }

  created(res, { experience });
}));

/**
 * GET /experiences/:id
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const experience = await queryOne(
    `SELECT * FROM experiences WHERE id = $1`,
    [req.params.id]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  success(res, { experience });
}));

/**
 * POST /experiences/search
 * Hybrid search: vector similarity (if embedding available) + ILIKE text filter.
 * Body: { query?, type?, tags?, limit?, semantic? }
 *
 * When OPENAI_API_KEY is set and `query` is provided:
 *   - Generates a query embedding
 *   - Returns results ordered by cosine similarity (vector <=> query_vector)
 *   - Falls back to ILIKE if embedding generation fails
 *
 * When OPENAI_API_KEY is not set (or semantic=false):
 *   - Pure ILIKE keyword search ordered by trust_score DESC
 */
router.post('/search', asyncHandler(async (req, res) => {
  // Note: /search must be declared before /:id
  const { query: textQuery, type, tags, limit = 20, semantic = true } = req.body;

  const safeLimit = Math.min(parseInt(limit, 10) || 20, 100);

  // Try semantic (vector) search first
  if (textQuery && semantic && isEmbeddingAvailable()) {
    const queryVector = await generateEmbedding(textQuery);
    if (queryVector) {
      const conditions = [];
      const params = [`[${queryVector.join(',')}]`];
      let paramIndex = 2;

      // Require embedding to be non-null for vector search
      conditions.push('embedding IS NOT NULL');

      if (type) {
        if (!['skill', 'debug_note'].includes(type)) {
          throw new BadRequestError('type must be "skill" or "debug_note"');
        }
        conditions.push(`type = $${paramIndex}`);
        params.push(type);
        paramIndex++;
      }

      if (tags && Array.isArray(tags) && tags.length > 0) {
        conditions.push(`tags::jsonb ?| $${paramIndex}::text[]`);
        params.push(tags);
        paramIndex++;
      }

      params.push(safeLimit);
      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const experiences = await queryAll(
        `SELECT *, (embedding <=> $1) AS _distance
         FROM experiences
         ${whereClause}
         ORDER BY _distance ASC
         LIMIT $${paramIndex}`,
        params
      );

      // Strip internal _distance field from response
      const cleaned = experiences.map(({ _distance, ...e }) => e);

      // If vector search returned results, use them; otherwise fall through to ILIKE
      if (cleaned.length > 0) {
        return success(res, { experiences: cleaned, count: cleaned.length, mode: 'semantic' });
      }
    }
  }

  // Fallback: ILIKE keyword search ordered by trust_score DESC
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (textQuery) {
    conditions.push(`(title ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${textQuery}%`);
    paramIndex++;
  }

  if (type) {
    if (!['skill', 'debug_note'].includes(type)) {
      throw new BadRequestError('type must be "skill" or "debug_note"');
    }
    conditions.push(`type = $${paramIndex}`);
    params.push(type);
    paramIndex++;
  }

  if (tags && Array.isArray(tags) && tags.length > 0) {
    conditions.push(`tags::jsonb ?| $${paramIndex}::text[]`);
    params.push(tags);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(safeLimit);

  const experiences = await queryAll(
    `SELECT * FROM experiences
     ${whereClause}
     ORDER BY trust_score DESC
     LIMIT $${paramIndex}`,
    params
  );

  success(res, { experiences, count: experiences.length, mode: 'keyword' });
}));

/**
 * POST /experiences/:id/intent_to_apply
 */
router.post('/:id/intent_to_apply', requireAuth, asyncHandler(async (req, res) => {
  const experienceId = req.params.id;

  const experience = await queryOne(
    `SELECT id FROM experiences WHERE id = $1`,
    [experienceId]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  const application = await queryOne(
    `INSERT INTO experience_applications (
       experience_id, robot_id, intent_at, outcome, created_at
     ) VALUES ($1, $2, NOW(), NULL, NOW())
     RETURNING *`,
    [experienceId, req.agent.id]
  );

  created(res, { application });
}));

/**
 * POST /experiences/:id/applications
 * Report outcome and update trust_score using Bayesian average.
 */
router.post('/:id/applications', requireAuth, applicationLimiter, asyncHandler(async (req, res) => {
  const experienceId = req.params.id;
  const { outcome, outcome_notes, session_id } = req.body;

  if (!outcome || !VALID_OUTCOMES.includes(outcome)) {
    throw new BadRequestError(
      `outcome must be one of: ${VALID_OUTCOMES.join(', ')}`,
      'INVALID_OUTCOME'
    );
  }

  const experience = await queryOne(
    `SELECT id, trust_signals FROM experiences WHERE id = $1`,
    [experienceId]
  );

  if (!experience) {
    throw new NotFoundError('Experience');
  }

  const result = await transaction(async (client) => {
    const application = (
      await client.query(
        `INSERT INTO experience_applications (
           experience_id, robot_id, outcome, outcome_notes, session_id,
           intent_at, created_at
         ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING *`,
        [experienceId, req.agent.id, outcome, outcome_notes || null, session_id || null]
      )
    ).rows[0];

    const signals = experience.trust_signals || {
      applications: { total: 0, successful: 0, failed: 0 }
    };
    if (!signals.applications) {
      signals.applications = { total: 0, successful: 0, failed: 0 };
    }

    signals.applications.total += 1;
    if (outcome === 'success') {
      signals.applications.successful += 1;
    } else if (outcome === 'failure') {
      signals.applications.failed += 1;
    }

    const newTrustScore = bayesianTrustScore(
      signals.applications.successful,
      signals.applications.total
    );

    await client.query(
      `UPDATE experiences
       SET trust_signals = $1, trust_score = $2, updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(signals), newTrustScore, experienceId]
    );

    return application;
  });

  created(res, { application: result });
}));

module.exports = router;
