import { query } from './db.js';

export async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS clubs (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      category       TEXT NOT NULL,
      brand          TEXT,
      model          TEXT,
      loft           REAL,
      shaft          TEXT,
      flex           TEXT,
      manual_carry   REAL,
      manual_total   REAL,
      computed_carry REAL,
      computed_total REAL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      created_at     BIGINT NOT NULL,
      updated_at     BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      club_id     TEXT NOT NULL REFERENCES clubs(id),
      date        BIGINT NOT NULL,
      location    TEXT,
      notes       TEXT,
      source      TEXT NOT NULL,
      shot_count  INTEGER NOT NULL DEFAULT 0,
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_sessions_club_date ON sessions(club_id, date)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS shots (
      id              TEXT PRIMARY KEY,
      session_id      TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      club_id         TEXT NOT NULL REFERENCES clubs(id),
      shot_number     INTEGER NOT NULL,
      carry_yards     REAL NOT NULL,
      total_yards     REAL,
      ball_speed      REAL,
      club_head_speed REAL,
      launch_angle    REAL,
      spin_rate       REAL,
      spin_axis       REAL,
      apex_height     REAL,
      descent_angle   REAL,
      side_spin_rate  REAL,
      push_pull       REAL,
      offline_yards   REAL,
      shape           TEXT,
      quality         TEXT,
      timestamp       BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_shots_session ON shots(session_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_shots_club ON shots(club_id)
  `);

  // Wedge matrix overrides
  await query(`
    CREATE TABLE IF NOT EXISTS wedge_overrides (
      club_id    TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      position   TEXT NOT NULL,
      carry      REAL NOT NULL,
      PRIMARY KEY (club_id, position)
    )
  `);

  // Session store table for connect-pg-simple
  await query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" VARCHAR NOT NULL PRIMARY KEY,
      "sess" JSON NOT NULL,
      "expire" TIMESTAMP(6) NOT NULL
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire")
  `);

  // Session type + multi-club support for wedge-distance sessions
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'block'`);
  await query(`ALTER TABLE sessions ALTER COLUMN club_id DROP NOT NULL`);

  // Shot position for wedge practice (full / shoulder / hip)
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS position TEXT`);

  // Interleaved practice: hole number per shot, session metadata (hole definitions)
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS hole_number INTEGER`);
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS metadata JSONB`);

  console.log('Database migration complete');
}
