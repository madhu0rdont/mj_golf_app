import { query } from './db.js';
import { logger } from './logger.js';
import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

export async function migrate() {
  // ── Users table ──
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id           TEXT PRIMARY KEY,
      username     TEXT NOT NULL UNIQUE,
      password     TEXT NOT NULL,
      display_name TEXT,
      role         TEXT NOT NULL DEFAULT 'player',
      handedness   TEXT NOT NULL DEFAULT 'right',
      created_at   BIGINT NOT NULL,
      updated_at   BIGINT NOT NULL
    )
  `);

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
      ON game_plan_history(course_id, tee_box, mode, created_at);
    CREATE INDEX IF NOT EXISTS idx_gph_user_course_time
      ON game_plan_history(user_id, course_id, tee_box, mode, created_at DESC)
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

  // Migrate fairway from single polygon to array of polygons
  await query(`
    UPDATE course_holes
    SET fairway = jsonb_build_array(fairway)
    WHERE jsonb_typeof(fairway) = 'array'
      AND jsonb_array_length(fairway) > 0
      AND jsonb_typeof(fairway->0) = 'object'
  `);

  // ── Multi-user: bootstrap accounts ──
  const bootstrapNow = Date.now();

  // Bootstrap admin account from env vars (service account — admin page only)
  const adminUser = process.env.ADMIN_USERNAME;
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminUser && adminPass) {
    const { rows: existingAdmin } = await query(
      `SELECT id FROM users WHERE lower(username) = lower($1)`,
      [adminUser],
    );
    if (existingAdmin.length === 0) {
      const adminId = crypto.randomUUID();
      const hash = await bcrypt.hash(adminPass, 12);
      await query(
        `INSERT INTO users (id, username, password, display_name, role, handedness, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'admin', 'right', $5, $5)`,
        [adminId, adminUser.toLowerCase(), hash, 'Admin', bootstrapNow],
      );
      logger.info(`Bootstrap admin user '${adminUser}' created`);
    }
  }

  // Bootstrap MJ player account from env vars
  const mjUser = process.env.MJ_USERNAME;
  const mjPass = process.env.MJ_PASSWORD;
  if (mjUser && mjPass) {
    const { rows: existingMj } = await query(
      `SELECT id FROM users WHERE lower(username) = lower($1)`,
      [mjUser],
    );
    if (existingMj.length === 0) {
      const mjId = crypto.randomUUID();
      const hash = await bcrypt.hash(mjPass, 12);
      await query(
        `INSERT INTO users (id, username, password, display_name, role, handedness, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'player', 'left', $5, $5)`,
        [mjId, mjUser.toLowerCase(), hash, 'MJ', bootstrapNow],
      );
      logger.info(`Bootstrap player user '${mjUser}' created`);
    }
  }

  // ── Multi-user: add user_id columns ──
  await query(`ALTER TABLE clubs ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE wedge_overrides ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE game_plan_cache ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE game_plan_history ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);

  // Assign existing data to the first player account (MJ)
  const { rows: firstPlayer } = await query(
    `SELECT id FROM users WHERE role = 'player' ORDER BY created_at LIMIT 1`,
  );
  if (firstPlayer.length > 0) {
    const playerId = firstPlayer[0].id;
    await query('UPDATE clubs SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE sessions SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE shots SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE wedge_overrides SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE game_plan_cache SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE game_plan_history SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  }

  // Set NOT NULL on user_id columns (only if no NULLs remain)
  for (const table of ['clubs', 'sessions', 'shots', 'wedge_overrides', 'game_plan_cache', 'game_plan_history']) {
    const { rows: nullRows } = await query(`SELECT count(*) FROM ${table} WHERE user_id IS NULL`);
    if (parseInt(nullRows[0].count) === 0) {
      await query(`ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`).catch(() => {});
    }
  }

  // Indexes for user-scoped queries
  await query(`CREATE INDEX IF NOT EXISTS idx_clubs_user ON clubs(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_user ON shots(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_user_session ON shots(user_id, session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_cache_user ON game_plan_cache(user_id, course_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_history_user ON game_plan_history(user_id, course_id)`);

  // Update game_plan_cache unique constraint to include user_id
  await query(`ALTER TABLE game_plan_cache DROP CONSTRAINT IF EXISTS game_plan_cache_course_id_tee_box_mode_key`);
  await query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'game_plan_cache_user_course_tee_mode_key'
      ) THEN
        ALTER TABLE game_plan_cache ADD CONSTRAINT game_plan_cache_user_course_tee_mode_key
          UNIQUE(user_id, course_id, tee_box, mode);
      END IF;
    END $$
  `);

  // User profile fields: email + profile picture
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`);

  // ---- One-time migration flags for post-deploy operations ----
  await query(`CREATE TABLE IF NOT EXISTS _migration_flags (
    flag TEXT PRIMARY KEY,
    applied_at BIGINT NOT NULL
  )`);

  // Force regeneration of all cached game plans after strategy-optimizer changes
  // Bump version when optimizer logic changes (caddy tips, strategies, simulation, etc.)
  const STRATEGY_SYNC_VERSION = 'strategy_sync_v3'; // v3: DP/MDP optimizer replaces template strategies
  const { rows: syncFlag } = await query(
    'SELECT 1 FROM _migration_flags WHERE flag = $1',
    [STRATEGY_SYNC_VERSION],
  );
  if (syncFlag.length === 0) {
    await query(
      "UPDATE game_plan_cache SET stale = TRUE, stale_reason = 'Strategy optimizer sync' WHERE stale = FALSE",
    );
    await query(
      'INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)',
      [STRATEGY_SYNC_VERSION, Date.now()],
    );
    logger.info('Marked all cached plans stale for strategy optimizer sync');
  }

  logger.info('Database migration complete');
}
