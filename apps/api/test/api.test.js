/**
 * RoboNet API Test Suite
 * 
 * Run: npm test
 */

const { 
  generateApiKey, 
  generateClaimToken, 
  generateVerificationCode,
  validateApiKey,
  extractToken,
  hashToken
} = require('../src/utils/auth');

const {
  ApiError,
  BadRequestError,
  NotFoundError,
  UnauthorizedError
} = require('../src/utils/errors');

// Test framework
let passed = 0;
let failed = 0;
const tests = [];

function describe(name, fn) {
  tests.push({ type: 'describe', name });
  fn();
}

function test(name, fn) {
  tests.push({ type: 'test', name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('\nRoboNet API Test Suite\n');
  console.log('='.repeat(50));

  for (const item of tests) {
    if (item.type === 'describe') {
      console.log(`\n[${item.name}]\n`);
    } else {
      try {
        await item.fn();
        console.log(`  + ${item.name}`);
        passed++;
      } catch (error) {
        console.log(`  - ${item.name}`);
        console.log(`    Error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Tests

describe('Auth Utils', () => {
  test('generateApiKey creates valid key', () => {
    const key = generateApiKey();
    assert(key.startsWith('robonet_'), 'Should have correct prefix');
    assertEqual(key.length, 73, 'Should have correct length');
  });

  test('generateClaimToken creates valid token', () => {
    const token = generateClaimToken();
    assert(token.startsWith('robonet_claim_'), 'Should have correct prefix');
  });

  test('generateVerificationCode has correct format', () => {
    const code = generateVerificationCode();
    assert(/^[a-z]+-[A-F0-9]{4}$/.test(code), 'Should match pattern');
  });

  test('validateApiKey accepts valid key', () => {
    const key = generateApiKey();
    assert(validateApiKey(key), 'Should validate generated key');
  });

  test('validateApiKey rejects invalid key', () => {
    assert(!validateApiKey('invalid'), 'Should reject invalid');
    assert(!validateApiKey(null), 'Should reject null');
    assert(!validateApiKey('robonet_short'), 'Should reject short key');
  });

  test('extractToken extracts from Bearer header', () => {
    const token = extractToken('Bearer robonet_test123');
    assertEqual(token, 'robonet_test123');
  });

  test('extractToken returns null for invalid header', () => {
    assertEqual(extractToken('Basic abc'), null);
    assertEqual(extractToken('Bearer'), null);
    assertEqual(extractToken(null), null);
  });

  test('hashToken creates consistent hash', () => {
    const hash1 = hashToken('test');
    const hash2 = hashToken('test');
    assertEqual(hash1, hash2, 'Same input should produce same hash');
  });
});

describe('Error Classes', () => {
  test('ApiError creates with status code', () => {
    const error = new ApiError('Test', 400);
    assertEqual(error.statusCode, 400);
    assertEqual(error.message, 'Test');
  });

  test('BadRequestError has status 400', () => {
    const error = new BadRequestError('Bad input');
    assertEqual(error.statusCode, 400);
  });

  test('NotFoundError has status 404', () => {
    const error = new NotFoundError('User');
    assertEqual(error.statusCode, 404);
    assert(error.message.includes('not found'));
  });

  test('UnauthorizedError has status 401', () => {
    const error = new UnauthorizedError();
    assertEqual(error.statusCode, 401);
  });

  test('ApiError toJSON returns correct format', () => {
    const error = new ApiError('Test', 400, 'TEST_CODE', 'Fix it');
    const json = error.toJSON();
    assertEqual(json.success, false);
    assertEqual(json.error, 'Test');
    assertEqual(json.code, 'TEST_CODE');
    assertEqual(json.hint, 'Fix it');
  });
});

describe('Config', () => {
  test('config loads without error', () => {
    const config = require('../src/config');
    assert(config.port, 'Should have port');
    assert(config.robonet.tokenPrefix, 'Should have token prefix');
  });
});

describe('Database Error Mapping', () => {
  // Regression: customer experience_post with visibility="team" hit the
  // CHECK constraint and surfaced as a generic 500 (2026-06-05).
  // pg errors carry a string `code` (SQLSTATE) and `constraint` name.
  const { mapDatabaseError } = require('../src/middleware/errorHandler');

  function pgError(code, extra = {}) {
    const err = new Error('db error');
    err.code = code;
    return Object.assign(err, extra);
  }

  test('check_violation (23514) maps to 400 and names the constraint', () => {
    const mapped = mapDatabaseError(
      pgError('23514', { constraint: 'experiences_visibility_check' })
    );
    assert(mapped, 'Should map to an ApiError');
    assertEqual(mapped.statusCode, 400);
    assert(mapped.message.includes('experiences_visibility_check'),
      'Message should include the violated constraint name');
  });

  test('unique_violation (23505) maps to 409', () => {
    const mapped = mapDatabaseError(pgError('23505', { constraint: 'agents_name_key' }));
    assert(mapped, 'Should map to an ApiError');
    assertEqual(mapped.statusCode, 409);
  });

  test('not_null_violation (23502) maps to 400', () => {
    const mapped = mapDatabaseError(pgError('23502', { column: 'robot_id' }));
    assert(mapped, 'Should map to an ApiError');
    assertEqual(mapped.statusCode, 400);
  });

  test('invalid_text_representation (22P02) maps to 400', () => {
    const mapped = mapDatabaseError(pgError('22P02'));
    assert(mapped, 'Should map to an ApiError');
    assertEqual(mapped.statusCode, 400);
  });

  test('foreign_key_violation (23503) maps to 400', () => {
    const mapped = mapDatabaseError(pgError('23503', { constraint: 'experience_applications_experience_id_fkey' }));
    assert(mapped, 'Should map to an ApiError');
    assertEqual(mapped.statusCode, 400);
  });

  test('unrelated pg code (e.g. connection failure 08006) returns null', () => {
    assertEqual(mapDatabaseError(pgError('08006')), null);
  });

  test('non-pg error returns null', () => {
    assertEqual(mapDatabaseError(new Error('plain error')), null);
  });

  test('mapped error does not leak raw SQL detail', () => {
    const mapped = mapDatabaseError(
      pgError('23514', {
        constraint: 'experiences_visibility_check',
        detail: 'Failing row contains (exp_123, secret_internal_value, ...)'
      })
    );
    assert(!mapped.message.includes('secret_internal_value'),
      'Raw row detail must not leak into the client-facing message');
    assert(!(mapped.hint || '').includes('secret_internal_value'),
      'Raw row detail must not leak into the hint');
  });
});

describe('Experience Visibility Validation', () => {
  const { VALID_VISIBILITIES } = require('../src/utils/validation');

  test('allowed values match the DB CHECK constraint', () => {
    assertEqual(JSON.stringify(VALID_VISIBILITIES), JSON.stringify(['public', 'org', 'private']));
  });
});

// Run
runTests();
