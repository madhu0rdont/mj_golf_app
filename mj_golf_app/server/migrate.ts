import { query } from './db.js';
import { logger } from './logger.js';

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

  // Preferred shot shape per club for yardage book filtering
  await query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS preferred_shape TEXT`);

  // Course strategy tables
  await query(`
    CREATE TABLE IF NOT EXISTS courses (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      par         INTEGER,
      slope       INTEGER,
      rating      NUMERIC(4,1),
      designers   TEXT[],
      created_at  BIGINT NOT NULL,
      updated_at  BIGINT NOT NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS course_holes (
      id               TEXT PRIMARY KEY,
      course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      hole_number      INTEGER NOT NULL,
      par              INTEGER NOT NULL,
      yardages         JSONB NOT NULL,
      heading          NUMERIC(6,2),
      tee              JSONB NOT NULL,
      pin              JSONB NOT NULL,
      targets          JSONB DEFAULT '[]',
      center_line      JSONB DEFAULT '[]',
      hazards          JSONB DEFAULT '[]',
      fairway          JSONB DEFAULT '[]',
      plays_like_yards JSONB,
      notes            TEXT,
      UNIQUE(course_id, hole_number)
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_course_holes_course ON course_holes(course_id)
  `);

  // Game plan cache
  await query(`
    CREATE TABLE IF NOT EXISTS game_plan_cache (
      id           TEXT PRIMARY KEY,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tee_box      TEXT NOT NULL,
      mode         TEXT NOT NULL,
      plan         JSONB NOT NULL,
      stale        BOOLEAN NOT NULL DEFAULT FALSE,
      stale_reason TEXT,
      created_at   BIGINT NOT NULL,
      updated_at   BIGINT NOT NULL,
      UNIQUE(course_id, tee_box, mode)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_cache_course ON game_plan_cache(course_id)`);

  // Game plan history (for charting projected scoring improvement over time)
  await query(`
    CREATE TABLE IF NOT EXISTS game_plan_history (
      id              TEXT PRIMARY KEY,
      course_id       TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tee_box         TEXT NOT NULL,
      mode            TEXT NOT NULL,
      total_expected  REAL NOT NULL,
      plan            JSONB NOT NULL,
      trigger_reason  TEXT,
      created_at      BIGINT NOT NULL
    )
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_gph_course_time
      ON game_plan_history(course_id, tee_box, mode, created_at)
  `);

  // Green polygon for course holes
  await query(`ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS green JSONB DEFAULT '[]'`);

  // Handicap (stroke index) per hole
  await query(`ALTER TABLE course_holes ADD COLUMN IF NOT EXISTS handicap INTEGER`);

  // Indexes for filtered /api/shots queries
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_club_id ON shots (club_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions (source)`);

  // Club bag ordering
  await query(`CREATE INDEX IF NOT EXISTS idx_clubs_sort_order ON clubs (sort_order)`);

  // Game plan cache: composite lookup
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_cache_lookup ON game_plan_cache (course_id, tee_box, mode)`);

  // Game plan cache: stale plan queries during regeneration (partial index)
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_cache_stale ON game_plan_cache (stale) WHERE stale = TRUE`);

  // Global hazard penalties
  await query(`
    CREATE TABLE IF NOT EXISTS hazard_penalties (
      type       TEXT PRIMARY KEY,
      penalty    REAL NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `);

  // Seed default hazard penalties
  const now = Date.now();
  const defaults = [
    ['fairway_bunker', 0.3],
    ['greenside_bunker', 0.5],
    ['bunker', 0.4],
    ['water', 1.0],
    ['ob', 1.0],
    ['trees', 0.5],
    ['rough', 0.2],
  ] as const;
  for (const [type, penalty] of defaults) {
    await query(
      `INSERT INTO hazard_penalties (type, penalty, updated_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [type, penalty, now],
    );
  }

  logger.info('Database migration complete');
}
