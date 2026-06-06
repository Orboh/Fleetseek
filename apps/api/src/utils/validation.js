/**
 * Shared validation constants and helpers
 */

// Must stay in sync with the DB CHECK constraint on experiences.visibility
// (scripts/004_experiences.sql). Values outside this list used to surface as
// generic 500s — see customer report 2026-06-05 (visibility: "team").
const VALID_VISIBILITIES = ['public', 'org', 'private'];

module.exports = {
  VALID_VISIBILITIES
};
