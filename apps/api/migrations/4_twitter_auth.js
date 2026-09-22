/**
 * Migration 4: Add Twitter OAuth columns to agents table
 */

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = async (pgm) => {
  await pgm.db.query(`
    ALTER TABLE agents
      ADD COLUMN IF NOT EXISTS owner_twitter_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS owner_twitter_handle VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_agents_owner_twitter_id ON agents(owner_twitter_id);
  `);
};

exports.down = async (pgm) => {
  await pgm.db.query(`
    ALTER TABLE agents
      DROP COLUMN IF EXISTS owner_twitter_id,
      DROP COLUMN IF EXISTS owner_twitter_handle;
  `);
};
