import { query } from './db.js';
import { logger } from './logger.js';
import { regenerateStalePlans } from './services/plan-regenerator.js';
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
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      club_id     TEXT REFERENCES bag_clubs(id),
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
      club_id         TEXT NOT NULL REFERENCES bag_clubs(id),
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

  // Shot position for wedge practice (full / shoulder / hip)
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS position TEXT`);

  // Interleaved practice: hole number per shot, session metadata (hole definitions)
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS hole_number INTEGER`);
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS metadata JSONB`);

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

  // Indexes for filtered /api/shots queries
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_club_id ON shots (club_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions (source)`);

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
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE shots ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);
  await query(`ALTER TABLE game_plan_cache ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id)`);

  // Assign existing data to the first player account (MJ)
  const { rows: firstPlayer } = await query(
    `SELECT id FROM users WHERE role = 'player' ORDER BY created_at LIMIT 1`,
  );
  if (firstPlayer.length > 0) {
    const playerId = firstPlayer[0].id;
    await query('UPDATE sessions SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE shots SET user_id = $1 WHERE user_id IS NULL', [playerId]);
    await query('UPDATE game_plan_cache SET user_id = $1 WHERE user_id IS NULL', [playerId]);
  }

  // Set NOT NULL on user_id columns (only if no NULLs remain)
  for (const table of ['sessions', 'shots', 'game_plan_cache']) {
    const { rows: nullRows } = await query(`SELECT count(*) FROM ${table} WHERE user_id IS NULL`);
    if (parseInt(nullRows[0].count) === 0) {
      await query(`ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`).catch(() => {});
    }
  }

  // Indexes for user-scoped queries
  await query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_user ON shots(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_shots_user_session ON shots(user_id, session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_game_plan_cache_user ON game_plan_cache(user_id, course_id)`);

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
  const STRATEGY_SYNC_VERSION = 'strategy_sync_v6'; // v6: stronger mode weights + dedup identical strategies
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
    // Fire-and-forget regeneration after server finishes starting
    setTimeout(() => {
      regenerateStalePlans().catch((err) => logger.error('Post-migration regen failed', { error: String(err) }));
    }, 5000);
  }

  // Home course preference
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS home_course_id TEXT REFERENCES courses(id)`);

  // Per-tee rating/slope data
  await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS tee_sets JSONB`);

  // Course logo (base64 data URL)
  await query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS logo TEXT`);

  // ── Auth flows: user status + password reset tokens ──
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active' NOT NULL`);

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_prt_token_hash ON password_reset_tokens(token_hash)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_prt_user_id ON password_reset_tokens(user_id)`);

  // ── API usage tracking ──
  await query(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id SERIAL PRIMARY KEY,
      service TEXT NOT NULL,
      endpoint TEXT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      input_tokens INTEGER,
      output_tokens INTEGER,
      items INTEGER DEFAULT 1,
      api_calls INTEGER DEFAULT 1,
      estimated_cost REAL,
      metadata JSONB,
      created_at BIGINT NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_api_usage_service ON api_usage(service)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage(created_at)`);

  // ── Scorecard seed: TPC Stonebrae ──
  const STONEBRAE_SEED = 'stonebrae_scorecard_v1';
  const { rows: stonebraeFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [STONEBRAE_SEED]);
  if (stonebraeFlag.length === 0) {
    const { rows: stonebraeCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%stonebrae%' LIMIT 1");
    if (stonebraeCourse.length > 0) {
      const cid = stonebraeCourse[0].id;
      const teeSets = {
        tour:     { rating: 74.8, slope: 138 },
        black:    { rating: 72.0, slope: 133 },
        silver:   { rating: 69.8, slope: 126, ratingWomen: 74.4, slopeWomen: 135 },
        orange:   { rating: 67.3, slope: 119, ratingWomen: 71.5, slopeWomen: 127 },
        gold:     { rating: 64.2, slope: 114, ratingWomen: 67.3, slopeWomen: 117 },
        combo_tb: { rating: 73.4, slope: 137 },
        combo_bs: { rating: 71.0, slope: 132 },
        combo_so: { rating: 68.6, slope: 122, ratingWomen: 73.3, slopeWomen: 134 },
        combo_og: { rating: 66.2, slope: 117, ratingWomen: 70.5, slopeWomen: 126 },
      };
      await query('UPDATE courses SET par = 72, slope = 138, rating = 74.8, tee_sets = $1, designers = $2 WHERE id = $3', [
        JSON.stringify(teeSets), ['David McLay Kidd'], cid,
      ]);
      const stonebraeHoles = [
        //       par  hcp  tour  black silver orange gold  combo_tb combo_bs combo_so combo_og
        { n: 1,  p: 4, h: 9,  y: { tour: 396, black: 370, silver: 332, orange: 275, gold: 267, combo_tb: 396, combo_bs: 370, combo_so: 332, combo_og: 275 } },
        { n: 2,  p: 4, h: 7,  y: { tour: 461, black: 385, silver: 342, orange: 342, gold: 229, combo_tb: 385, combo_bs: 385, combo_so: 342, combo_og: 229 } },
        { n: 3,  p: 3, h: 15, y: { tour: 193, black: 176, silver: 164, orange: 140, gold: 129, combo_tb: 193, combo_bs: 176, combo_so: 164, combo_og: 140 } },
        { n: 4,  p: 5, h: 11, y: { tour: 479, black: 462, silver: 443, orange: 417, gold: 364, combo_tb: 479, combo_bs: 443, combo_so: 417, combo_og: 417 } },
        { n: 5,  p: 4, h: 13, y: { tour: 326, black: 301, silver: 274, orange: 249, gold: 224, combo_tb: 326, combo_bs: 301, combo_so: 274, combo_og: 249 } },
        { n: 6,  p: 5, h: 1,  y: { tour: 606, black: 576, silver: 562, orange: 493, gold: 422, combo_tb: 576, combo_bs: 562, combo_so: 493, combo_og: 422 } },
        { n: 7,  p: 3, h: 17, y: { tour: 176, black: 159, silver: 142, orange: 120, gold: 85,  combo_tb: 176, combo_bs: 159, combo_so: 142, combo_og: 120 } },
        { n: 8,  p: 4, h: 3,  y: { tour: 466, black: 433, silver: 390, orange: 390, gold: 316, combo_tb: 433, combo_bs: 390, combo_so: 390, combo_og: 390 } },
        { n: 9,  p: 4, h: 5,  y: { tour: 438, black: 407, silver: 362, orange: 325, gold: 278, combo_tb: 438, combo_bs: 362, combo_so: 325, combo_og: 325 } },
        { n: 10, p: 4, h: 6,  y: { tour: 437, black: 397, silver: 350, orange: 270, gold: 270, combo_tb: 437, combo_bs: 397, combo_so: 350, combo_og: 270 } },
        { n: 11, p: 3, h: 10, y: { tour: 240, black: 204, silver: 175, orange: 149, gold: 149, combo_tb: 204, combo_bs: 175, combo_so: 175, combo_og: 149 } },
        { n: 12, p: 5, h: 4,  y: { tour: 625, black: 571, silver: 544, orange: 521, gold: 478, combo_tb: 625, combo_bs: 571, combo_so: 521, combo_og: 521 } },
        { n: 13, p: 3, h: 18, y: { tour: 160, black: 138, silver: 124, orange: 112, gold: 99,  combo_tb: 160, combo_bs: 138, combo_so: 124, combo_og: 112 } },
        { n: 14, p: 4, h: 14, y: { tour: 377, black: 321, silver: 279, orange: 268, gold: 253, combo_tb: 377, combo_bs: 279, combo_so: 279, combo_og: 253 } },
        { n: 15, p: 3, h: 16, y: { tour: 188, black: 156, silver: 150, orange: 141, gold: 129, combo_tb: 188, combo_bs: 156, combo_so: 150, combo_og: 141 } },
        { n: 16, p: 5, h: 12, y: { tour: 557, black: 469, silver: 437, orange: 425, gold: 339, combo_tb: 469, combo_bs: 469, combo_so: 437, combo_og: 425 } },
        { n: 17, p: 4, h: 8,  y: { tour: 465, black: 436, silver: 424, orange: 381, gold: 336, combo_tb: 465, combo_bs: 436, combo_so: 381, combo_og: 381 } },
        { n: 18, p: 5, h: 2,  y: { tour: 598, black: 554, silver: 537, orange: 467, gold: 407, combo_tb: 554, combo_bs: 537, combo_so: 467, combo_og: 407 } },
      ];
      for (const hole of stonebraeHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded TPC Stonebrae scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [STONEBRAE_SEED, Date.now()]);
  }

  // ── Scorecard seed: TPC Harding Park ──
  const HARDING_SEED = 'harding_scorecard_v1';
  const { rows: hardingFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [HARDING_SEED]);
  if (hardingFlag.length === 0) {
    const { rows: hardingCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%harding%' LIMIT 1");
    if (hardingCourse.length > 0) {
      const cid = hardingCourse[0].id;
      const teeSets = {
        championship: { rating: 74.3, slope: 129 },
        blue:         { rating: 72.9, slope: 126 },
        white:        { rating: 70.5, slope: 121 },
        red:          { rating: 68.1, slope: 118, ratingWomen: 73.4, slopeWomen: 126 },
      };
      await query('UPDATE courses SET par = 72, slope = 129, rating = 74.3, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const hardingHoles = [
        { n: 1,  p: 4, h: 13, y: { championship: 395, blue: 395, white: 375, red: 345 } },
        { n: 2,  p: 4, h: 3,  y: { championship: 449, blue: 430, white: 400, red: 360 } },
        { n: 3,  p: 3, h: 9,  y: { championship: 183, blue: 165, white: 155, red: 135 } },
        { n: 4,  p: 5, h: 1,  y: { championship: 606, blue: 580, white: 540, red: 500 } },
        { n: 5,  p: 4, h: 15, y: { championship: 429, blue: 395, white: 365, red: 335 } },
        { n: 6,  p: 4, h: 5,  y: { championship: 473, blue: 440, white: 390, red: 350 } },
        { n: 7,  p: 4, h: 11, y: { championship: 344, blue: 335, white: 325, red: 305 } },
        { n: 8,  p: 3, h: 7,  y: { championship: 230, blue: 200, white: 190, red: 170 } },
        { n: 9,  p: 5, h: 17, y: { championship: 525, blue: 495, white: 475, red: 455 } },
        { n: 10, p: 5, h: 4,  y: { championship: 562, blue: 550, white: 530, red: 500 } },
        { n: 11, p: 3, h: 12, y: { championship: 200, blue: 185, white: 155, red: 125 } },
        { n: 12, p: 5, h: 16, y: { championship: 494, blue: 480, white: 450, red: 410 } },
        { n: 13, p: 4, h: 14, y: { championship: 428, blue: 405, white: 375, red: 365 } },
        { n: 14, p: 4, h: 6,  y: { championship: 467, blue: 440, white: 410, red: 370 } },
        { n: 15, p: 4, h: 10, y: { championship: 405, blue: 405, white: 375, red: 345 } },
        { n: 16, p: 4, h: 8,  y: { championship: 336, blue: 330, white: 310, red: 280 } },
        { n: 17, p: 3, h: 18, y: { championship: 175, blue: 175, white: 165, red: 125 } },
        { n: 18, p: 4, h: 2,  y: { championship: 468, blue: 440, white: 420, red: 400 } },
      ];
      for (const hole of hardingHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded TPC Harding Park scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [HARDING_SEED, Date.now()]);
  }

  // ── Scorecard seed: Meadow Club ──
  const MEADOW_SEED = 'meadow_club_scorecard_v1';
  const { rows: meadowFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [MEADOW_SEED]);
  if (meadowFlag.length === 0) {
    const { rows: meadowCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%meadow%club%' LIMIT 1");
    if (meadowCourse.length > 0) {
      const cid = meadowCourse[0].id;
      const teeSets = {
        black_blue:  { rating: 72.8, slope: 136 },
        blue:        { rating: 72.2, slope: 134 },
        blue_white:  { rating: 71.4, slope: 133 },
        white:       { rating: 70.7, slope: 131 },
        white_gold:  { rating: 69.4, slope: 130 },
        gold:        { rating: 69.0, slope: 129, ratingWomen: 75.2, slopeWomen: 135 },
        gold_red:    { rating: 68.7, slope: 128, ratingWomen: 74.3, slopeWomen: 132 },
        red:         { rating: 68.3, slope: 127, ratingWomen: 74.0, slopeWomen: 130 },
        red_green:   { rating: 66.7, slope: 124, ratingWomen: 71.7, slopeWomen: 127 },
        green:       { rating: 65.1, slope: 122, ratingWomen: 69.7, slopeWomen: 121 },
      };
      await query('UPDATE courses SET par = 71, slope = 136, rating = 72.8, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const meadowHoles = [
        { n: 1,  p: 5, h: 15, y: { black_blue: 492, blue: 492, blue_white: 492, white: 478, white_gold: 478, gold: 478, gold_red: 464, red: 464, red_green: 464, green: 464 } },
        { n: 2,  p: 4, h: 9,  y: { black_blue: 443, blue: 443, blue_white: 423, white: 423, white_gold: 420, gold: 420, gold_red: 420, red: 417, red_green: 417, green: 381 } },
        { n: 3,  p: 4, h: 1,  y: { black_blue: 403, blue: 383, blue_white: 365, white: 365, white_gold: 365, gold: 357, gold_red: 357, red: 351, red_green: 317, green: 317 } },
        { n: 4,  p: 4, h: 13, y: { black_blue: 400, blue: 400, blue_white: 400, white: 380, white_gold: 350, gold: 350, gold_red: 350, red: 345, red_green: 345, green: 268 } },
        { n: 5,  p: 3, h: 11, y: { black_blue: 194, blue: 194, blue_white: 194, white: 177, white_gold: 177, gold: 165, gold_red: 144, red: 144, red_green: 104, green: 104 } },
        { n: 6,  p: 4, h: 7,  y: { black_blue: 454, blue: 415, blue_white: 395, white: 395, white_gold: 383, gold: 383, gold_red: 346, red: 346, red_green: 315, green: 315 } },
        { n: 7,  p: 4, h: 5,  y: { black_blue: 436, blue: 417, blue_white: 404, white: 404, white_gold: 350, gold: 350, gold_red: 344, red: 344, red_green: 309, green: 309 } },
        { n: 8,  p: 3, h: 17, y: { black_blue: 165, blue: 165, blue_white: 165, white: 150, white_gold: 150, gold: 139, gold_red: 139, red: 139, red_green: 139, green: 118 } },
        { n: 9,  p: 4, h: 3,  y: { black_blue: 464, blue: 448, blue_white: 438, white: 438, white_gold: 379, gold: 379, gold_red: 372, red: 372, red_green: 313, green: 313 } },
        { n: 10, p: 4, h: 6,  y: { black_blue: 378, blue: 378, blue_white: 378, white: 348, white_gold: 348, gold: 348, gold_red: 348, red: 340, red_green: 340, green: 340 } },
        { n: 11, p: 3, h: 18, y: { black_blue: 152, blue: 152, blue_white: 152, white: 142, white_gold: 131, gold: 131, gold_red: 120, red: 120, red_green: 96,  green: 96 } },
        { n: 12, p: 4, h: 14, y: { black_blue: 374, blue: 374, blue_white: 374, white: 369, white_gold: 369, gold: 348, gold_red: 348, red: 344, red_green: 298, green: 298 } },
        { n: 13, p: 5, h: 12, y: { black_blue: 543, blue: 543, blue_white: 508, white: 508, white_gold: 508, gold: 503, gold_red: 478, red: 478, red_green: 478, green: 448 } },
        { n: 14, p: 3, h: 10, y: { black_blue: 208, blue: 199, blue_white: 181, white: 181, white_gold: 163, gold: 163, gold_red: 163, red: 131, red_green: 131, green: 87 } },
        { n: 15, p: 5, h: 4,  y: { black_blue: 506, blue: 506, blue_white: 506, white: 496, white_gold: 482, gold: 482, gold_red: 456, red: 456, red_green: 403, green: 403 } },
        { n: 16, p: 4, h: 16, y: { black_blue: 323, blue: 323, blue_white: 323, white: 307, white_gold: 294, gold: 294, gold_red: 294, red: 289, red_green: 289, green: 240 } },
        { n: 17, p: 4, h: 2,  y: { black_blue: 428, blue: 405, blue_white: 395, white: 395, white_gold: 395, gold: 395, gold_red: 395, red: 385, red_green: 321, green: 321 } },
        { n: 18, p: 4, h: 8,  y: { black_blue: 363, blue: 363, blue_white: 352, white: 352, white_gold: 352, gold: 352, gold_red: 341, red: 341, red_green: 341, green: 277 } },
      ];
      for (const hole of meadowHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded Meadow Club scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [MEADOW_SEED, Date.now()]);
  }

  // ── Scorecard seed: Presidio Golf Course ──
  const PRESIDIO_SEED = 'presidio_scorecard_v1';
  const { rows: presidioFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [PRESIDIO_SEED]);
  if (presidioFlag.length === 0) {
    const { rows: presidioCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%presidio%' LIMIT 1");
    if (presidioCourse.length > 0) {
      const cid = presidioCourse[0].id;
      const teeSets = {
        black: { rating: 72.6, slope: 135 },
        white: { rating: 70.5, slope: 131 },
        blue:  { rating: 69.0, slope: 127 },
        red:   { rating: 67.2, slope: 120 },
      };
      await query('UPDATE courses SET par = 72, slope = 135, rating = 72.6, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const presidioHoles = [
        { n: 1,  p: 4, h: 10, y: { black: 372, white: 349, blue: 339, red: 319 } },
        { n: 2,  p: 5, h: 16, y: { black: 472, white: 435, blue: 411, red: 350 } },
        { n: 3,  p: 4, h: 2,  y: { black: 385, white: 365, blue: 348, red: 300 } },
        { n: 4,  p: 3, h: 18, y: { black: 130, white: 118, blue: 108, red: 86 } },
        { n: 5,  p: 4, h: 14, y: { black: 307, white: 298, blue: 289, red: 256 } },
        { n: 6,  p: 4, h: 4,  y: { black: 388, white: 361, blue: 347, red: 295 } },
        { n: 7,  p: 3, h: 6,  y: { black: 219, white: 184, blue: 175, red: 145 } },
        { n: 8,  p: 4, h: 8,  y: { black: 378, white: 356, blue: 348, red: 269 } },
        { n: 9,  p: 5, h: 12, y: { black: 524, white: 493, blue: 440, red: 371 } },
        { n: 10, p: 5, h: 9,  y: { black: 501, white: 486, blue: 460, red: 391 } },
        { n: 11, p: 4, h: 3,  y: { black: 419, white: 387, blue: 373, red: 298 } },
        { n: 12, p: 4, h: 1,  y: { black: 453, white: 442, blue: 420, red: 282 } },
        { n: 13, p: 3, h: 13, y: { black: 188, white: 169, blue: 156, red: 120 } },
        { n: 14, p: 4, h: 11, y: { black: 335, white: 326, blue: 310, red: 295 } },
        { n: 15, p: 3, h: 17, y: { black: 171, white: 147, blue: 133, red: 129 } },
        { n: 16, p: 4, h: 7,  y: { black: 383, white: 364, blue: 340, red: 276 } },
        { n: 17, p: 4, h: 5,  y: { black: 350, white: 343, blue: 326, red: 281 } },
        { n: 18, p: 5, h: 15, y: { black: 506, white: 480, blue: 433, red: 413 } },
      ];
      for (const hole of presidioHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded Presidio Golf Course scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [PRESIDIO_SEED, Date.now()]);
  }

  // ── Scorecard seed: Blackhawk Country Club ──
  const BLACKHAWK_SEED = 'blackhawk_scorecard_v1';
  const { rows: blackhawkFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [BLACKHAWK_SEED]);
  if (blackhawkFlag.length === 0) {
    const { rows: blackhawkCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%blackhawk%' LIMIT 1");
    if (blackhawkCourse.length > 0) {
      const cid = blackhawkCourse[0].id;
      const teeSets = {
        black: { rating: 72.9, slope: 133 },
        white: { rating: 71.2, slope: 123 },
        gold:  { rating: 67.6, slope: 121, ratingWomen: 73.1, slopeWomen: 125 },
        red:   { rating: 70.9, slope: 123 },
      };
      await query('UPDATE courses SET par = 72, slope = 133, rating = 72.9, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const blackhawkHoles = [
        { n: 1,  p: 4, h: 8,  y: { black: 402, white: 375, gold: 324, red: 316 } },
        { n: 2,  p: 4, h: 14, y: { black: 355, white: 319, gold: 286, red: 240 } },
        { n: 3,  p: 3, h: 18, y: { black: 178, white: 144, gold: 134, red: 125 } },
        { n: 4,  p: 4, h: 12, y: { black: 339, white: 326, gold: 296, red: 273 } },
        { n: 5,  p: 5, h: 2,  y: { black: 484, white: 458, gold: 408, red: 378 } },
        { n: 6,  p: 4, h: 10, y: { black: 333, white: 318, gold: 306, red: 254 } },
        { n: 7,  p: 3, h: 16, y: { black: 187, white: 169, gold: 147, red: 143 } },
        { n: 8,  p: 5, h: 4,  y: { black: 493, white: 472, gold: 430, red: 426 } },
        { n: 9,  p: 4, h: 6,  y: { black: 344, white: 320, gold: 315, red: 259 } },
        { n: 10, p: 5, h: 7,  y: { black: 528, white: 504, gold: 479, red: 476 } },
        { n: 11, p: 4, h: 1,  y: { black: 436, white: 401, gold: 328, red: 322 } },
        { n: 12, p: 3, h: 15, y: { black: 222, white: 202, gold: 180, red: 140 } },
        { n: 13, p: 4, h: 9,  y: { black: 363, white: 333, gold: 320, red: 286 } },
        { n: 14, p: 4, h: 13, y: { black: 400, white: 333, gold: 338, red: 326 } },
        { n: 15, p: 3, h: 17, y: { black: 135, white: 105, gold: 95,  red: 91 } },
        { n: 16, p: 4, h: 5,  y: { black: 418, white: 395, gold: 343, red: 336 } },
        { n: 17, p: 5, h: 3,  y: { black: 586, white: 540, gold: 472, red: 427 } },
        { n: 18, p: 4, h: 11, y: { black: 397, white: 358, gold: 325, red: 315 } },
      ];
      for (const hole of blackhawkHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded Blackhawk Country Club scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [BLACKHAWK_SEED, Date.now()]);
  }

  // ── Scorecard seed: Tilden Park Golf Course ──
  const TILDEN_SEED = 'tilden_scorecard_v1';
  const { rows: tildenFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [TILDEN_SEED]);
  if (tildenFlag.length === 0) {
    const { rows: tildenCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%tilden%' LIMIT 1");
    if (tildenCourse.length > 0) {
      const cid = tildenCourse[0].id;
      const teeSets = {
        blue:  { rating: 71.6, slope: 130, ratingWomen: 76.4, slopeWomen: 137 },
        white: { rating: 69.5, slope: 124, ratingWomen: 73.8, slopeWomen: 132 },
        red:   { rating: 67.8, slope: 120, ratingWomen: 71.6, slopeWomen: 124 },
        gold:  { rating: 0, slope: 0 },
      };
      await query('UPDATE courses SET par = 70, slope = 130, rating = 71.6, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const tildenHoles = [
        { n: 1,  p: 4, h: 1,  y: { blue: 411, white: 404, red: 401, gold: 200 } },
        { n: 2,  p: 4, h: 7,  y: { blue: 399, white: 385, red: 376, gold: 264 } },
        { n: 3,  p: 4, h: 3,  y: { blue: 464, white: 377, red: 356, gold: 150 } },
        { n: 4,  p: 3, h: 11, y: { blue: 143, white: 137, red: 123, gold: 60 } },
        { n: 5,  p: 4, h: 9,  y: { blue: 366, white: 327, red: 316, gold: 205 } },
        { n: 6,  p: 4, h: 17, y: { blue: 316, white: 297, red: 270, gold: 168 } },
        { n: 7,  p: 3, h: 5,  y: { blue: 221, white: 201, red: 170, gold: 94 } },
        { n: 8,  p: 5, h: 13, y: { blue: 475, white: 467, red: 460, gold: 269 } },
        { n: 9,  p: 5, h: 15, y: { blue: 334, white: 320, red: 286, gold: 160 } },
        { n: 10, p: 4, h: 10, y: { blue: 395, white: 387, red: 381, gold: 232 } },
        { n: 11, p: 3, h: 6,  y: { blue: 234, white: 199, red: 120, gold: 120 } },
        { n: 12, p: 4, h: 2,  y: { blue: 350, white: 300, red: 264, gold: 160 } },
        { n: 13, p: 5, h: 16, y: { blue: 504, white: 438, red: 431, gold: 265 } },
        { n: 14, p: 4, h: 14, y: { blue: 352, white: 311, red: 284, gold: 171 } },
        { n: 15, p: 4, h: 18, y: { blue: 329, white: 322, red: 309, gold: 166 } },
        { n: 16, p: 3, h: 8,  y: { blue: 206, white: 186, red: 138, gold: 138 } },
        { n: 17, p: 4, h: 4,  y: { blue: 395, white: 395, red: 379, gold: 195 } },
        { n: 18, p: 4, h: 12, y: { blue: 400, white: 370, red: 335, gold: 160 } },
      ];
      for (const hole of tildenHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded Tilden Park scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [TILDEN_SEED, Date.now()]);
  }

  // ── Scorecard seed: Claremont Country Club ──
  const CLAREMONT_SEED = 'claremont_scorecard_v1';
  const { rows: claremontFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [CLAREMONT_SEED]);
  if (claremontFlag.length === 0) {
    const { rows: claremontCourse } = await query("SELECT id FROM courses WHERE name ILIKE '%claremont%' LIMIT 1");
    if (claremontCourse.length > 0) {
      const cid = claremontCourse[0].id;
      const teeSets = {
        blue:  { rating: 67.7, slope: 125, ratingWomen: 73.2, slopeWomen: 131 },
        white: { rating: 66.1, slope: 122, ratingWomen: 71.2, slopeWomen: 127 },
        green: { rating: 59.2, slope: 104, ratingWomen: 61.6, slopeWomen: 106 },
      };
      await query('UPDATE courses SET par = 68, slope = 125, rating = 67.7, tee_sets = $1 WHERE id = $2', [
        JSON.stringify(teeSets), cid,
      ]);
      const claremontHoles = [
        { n: 1,  p: 5, h: 14, y: { blue: 443, white: 381, green: 279 } },
        { n: 2,  p: 3, h: 4,  y: { blue: 212, white: 202, green: 109 } },
        { n: 3,  p: 3, h: 10, y: { blue: 139, white: 120, green: 83 } },
        { n: 4,  p: 4, h: 8,  y: { blue: 339, white: 333, green: 206 } },
        { n: 5,  p: 4, h: 16, y: { blue: 329, white: 324, green: 202 } },
        { n: 6,  p: 4, h: 18, y: { blue: 252, white: 238, green: 172 } },
        { n: 7,  p: 4, h: 2,  y: { blue: 380, white: 368, green: 192 } },
        { n: 8,  p: 3, h: 12, y: { blue: 164, white: 140, green: 83 } },
        { n: 9,  p: 4, h: 6,  y: { blue: 387, white: 375, green: 245 } },
        { n: 10, p: 3, h: 9,  y: { blue: 164, white: 151, green: 112 } },
        { n: 11, p: 4, h: 5,  y: { blue: 389, white: 350, green: 267 } },
        { n: 12, p: 4, h: 1,  y: { blue: 395, white: 387, green: 268 } },
        { n: 13, p: 3, h: 3,  y: { blue: 224, white: 200, green: 124 } },
        { n: 14, p: 4, h: 17, y: { blue: 287, white: 268, green: 241 } },
        { n: 15, p: 4, h: 11, y: { blue: 336, white: 320, green: 198 } },
        { n: 16, p: 4, h: 7,  y: { blue: 374, white: 361, green: 291 } },
        { n: 17, p: 3, h: 13, y: { blue: 135, white: 120, green: 111 } },
        { n: 18, p: 5, h: 15, y: { blue: 503, white: 486, green: 361 } },
      ];
      for (const hole of claremontHoles) {
        await query(
          'UPDATE holes SET par = $1, handicap = $2 WHERE course_id = $3 AND hole_number = $4',
          [hole.p, hole.h, cid, hole.n],
        );
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, yardage)
           SELECT gen_random_uuid()::text, h.id, kv.key, 0, 0, (kv.value)::integer
           FROM holes h, jsonb_each_text($1::jsonb) kv
           WHERE h.course_id = $2 AND h.hole_number = $3
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = EXCLUDED.yardage`,
          [JSON.stringify(hole.y), cid, hole.n],
        );
      }
      logger.info('Seeded Claremont Country Club scorecard data');
    }
    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [CLAREMONT_SEED, Date.now()]);
  }

  // ── Strategy constants table ──
  await query(`
    CREATE TABLE IF NOT EXISTS strategy_constants (
      key         TEXT PRIMARY KEY,
      value       REAL NOT NULL,
      category    TEXT NOT NULL,
      description TEXT,
      updated_at  BIGINT NOT NULL
    )
  `);

  // Seed default strategy constants
  const STRATEGY_DEFAULTS: [string, number, string, string][] = [
    // Lie multipliers
    ['lie_fairway', 1.0, 'lie', 'Fairway lie dispersion multiplier'],
    ['lie_rough', 1.15, 'lie', 'Rough lie dispersion multiplier (+15%)'],
    ['lie_green', 1.0, 'lie', 'Green lie dispersion multiplier'],
    ['lie_fairway_bunker', 1.25, 'lie', 'Fairway bunker dispersion multiplier (+25%)'],
    ['lie_greenside_bunker', 1.20, 'lie', 'Greenside bunker dispersion multiplier (+20%)'],
    ['lie_trees', 1.40, 'lie', 'Trees lie dispersion multiplier (+40%)'],
    ['lie_recovery', 1.60, 'lie', 'Recovery lie dispersion multiplier (+60%)'],
    // Surface rollout
    ['rollout_fairway', 1.0, 'rollout', 'Fairway rollout multiplier (full roll)'],
    ['rollout_rough', 0.15, 'rollout', 'Rough rollout multiplier (85% reduction)'],
    ['rollout_green', 0.65, 'rollout', 'Green rollout multiplier (35% reduction)'],
    ['rollout_bunker', 0.0, 'rollout', 'Bunker rollout multiplier (no roll)'],
    // Mode weights
    ['safe_variance_weight', 1.0, 'mode', 'Safe mode variance penalty (+Nσ)'],
    ['aggressive_green_bonus', 0.6, 'mode', 'Aggressive mode green probability bonus'],
    // Sampling
    ['samples_base', 100, 'sampling', 'Monte Carlo samples for safe anchors'],
    ['samples_hazard', 250, 'sampling', 'Monte Carlo samples near hazards'],
    ['samples_high_risk', 350, 'sampling', 'Monte Carlo samples near OB/water'],
    // Thresholds
    ['chip_range', 30, 'threshold', 'Yards — treat as chip within this distance'],
    ['short_game_threshold', 60, 'threshold', 'Yards — bypass interpolation, use short-game model'],
    ['green_radius', 10, 'threshold', 'Yards — green detection fallback radius'],
    // Spatial
    ['zone_interval', 20, 'spatial', 'Yards between anchor markers along centerline'],
    ['lateral_offset', 20, 'spatial', 'Yards left/right of centerline for anchors'],
    ['bearing_range', 30, 'spatial', 'Degrees ± from center line for aim bearings'],
    ['k_neighbors', 6, 'spatial', 'Number of neighbors for kernel interpolation'],
    ['kernel_h_s', 25, 'spatial', 'Interpolation bandwidth in s-direction (yards)'],
    ['kernel_h_u', 20, 'spatial', 'Interpolation bandwidth in u-direction (yards)'],
    // Flight model
    ['tree_height_yards', 15, 'flight', 'Tree canopy height in yards (~45 ft)'],
    ['ball_apex_yards', 28, 'flight', 'Default ball apex height in yards (~84 ft)'],
    ['elev_yards_per_meter', 1.09, 'flight', 'Yard adjustment per meter of elevation change'],
    // Rollout
    ['rollout_slope_factor', 3.0, 'rollout', 'Rollout adjustment per unit slope (m/yd)'],
    ['default_loft', 30, 'rollout', 'Default club loft (degrees) for rollout calc'],
    // Putting model
    ['putt_coefficient', 0.75, 'putting', 'Log coefficient in expected putts formula'],
    ['putt_cap', 4, 'putting', 'Maximum expected putts (cap)'],
    // MC trials
    ['mc_trials', 2000, 'simulation', 'Monte Carlo trials per strategy'],
    // DP convergence
    ['max_iterations', 50, 'dp', 'Maximum value iteration rounds'],
    ['convergence_threshold', 0.001, 'dp', 'Convergence delta threshold'],
    // Club selection
    ['min_carry_ratio', 0.5, 'club', 'Minimum carry as fraction of distance to pin'],
    ['max_carry_ratio', 1.10, 'club', 'Maximum carry as fraction of distance to pin'],
    // Hazard
    ['hazard_drop_penalty', 0.3, 'hazard', 'Default penalty strokes for hazard drops'],
    ['max_shots_per_hole', 8, 'simulation', 'Maximum shots allowed per simulation trial'],
  ];
  const constNow = Date.now();
  for (const [key, value, category, description] of STRATEGY_DEFAULTS) {
    await query(
      `INSERT INTO strategy_constants (key, value, category, description, updated_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
      [key, value, category, description, constNow],
    );
  }

  // ── Phase 1: Split course_holes into normalized tables ──
  await query(`
    CREATE TABLE IF NOT EXISTS holes (
      id           TEXT PRIMARY KEY,
      course_id    TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      hole_number  INTEGER NOT NULL,
      par          INTEGER NOT NULL,
      handicap     INTEGER,
      heading      NUMERIC(6,2),
      notes        TEXT,
      center_line  JSONB DEFAULT '[]',
      targets      JSONB DEFAULT '[]',
      fairway      JSONB DEFAULT '[]',
      green        JSONB DEFAULT '[]',
      UNIQUE(course_id, hole_number)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_holes_course ON holes(course_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS hole_tees (
      id                  TEXT PRIMARY KEY,
      hole_id             TEXT NOT NULL REFERENCES holes(id) ON DELETE CASCADE,
      tee_name            TEXT NOT NULL,
      lat                 REAL NOT NULL,
      lng                 REAL NOT NULL,
      elevation           REAL DEFAULT 0,
      yardage             INTEGER NOT NULL,
      plays_like_yardage  INTEGER,
      UNIQUE(hole_id, tee_name)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hole_tees_hole ON hole_tees(hole_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS hole_pins (
      id          TEXT PRIMARY KEY,
      hole_id     TEXT NOT NULL REFERENCES holes(id) ON DELETE CASCADE,
      pin_name    TEXT NOT NULL DEFAULT 'default',
      lat         REAL NOT NULL,
      lng         REAL NOT NULL,
      elevation   REAL DEFAULT 0,
      is_default  BOOLEAN DEFAULT true,
      UNIQUE(hole_id, pin_name)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hole_pins_hole ON hole_pins(hole_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS hole_hazards (
      id          TEXT PRIMARY KEY,
      hole_id     TEXT NOT NULL REFERENCES holes(id) ON DELETE CASCADE,
      hazard_type TEXT NOT NULL,
      name        TEXT,
      penalty     REAL NOT NULL DEFAULT 1.0,
      confidence  TEXT DEFAULT 'high',
      source      TEXT DEFAULT 'manual',
      polygon     JSONB NOT NULL,
      status      TEXT DEFAULT 'accepted'
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_hole_hazards_hole ON hole_hazards(hole_id)`);

  // ── Phase 2: Split clubs → bag_clubs + club_profiles ──
  await query(`
    CREATE TABLE IF NOT EXISTS bag_clubs (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      name            TEXT NOT NULL,
      category        TEXT NOT NULL,
      brand           TEXT,
      model           TEXT,
      loft            REAL,
      shaft           TEXT,
      flex            TEXT,
      preferred_shape TEXT,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at      BIGINT NOT NULL,
      updated_at      BIGINT NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_bag_clubs_user ON bag_clubs(user_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS club_profiles (
      id                  TEXT PRIMARY KEY,
      bag_club_id         TEXT NOT NULL REFERENCES bag_clubs(id) ON DELETE CASCADE,
      profile_type        TEXT NOT NULL DEFAULT 'manual',
      carry_mean          REAL,
      carry_sd            REAL,
      total_mean          REAL,
      total_sd            REAL,
      offline_mean        REAL,
      offline_sd          REAL,
      ball_speed_mean     REAL,
      launch_angle_mean   REAL,
      spin_rate_mean      REAL,
      apex_height_mean    REAL,
      descent_angle_mean  REAL,
      sample_size         INTEGER DEFAULT 0,
      is_current          BOOLEAN NOT NULL DEFAULT TRUE,
      effective_from      BIGINT NOT NULL,
      created_at          BIGINT NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_club_profiles_bag_club ON club_profiles(bag_club_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS club_distance_profiles (
      id               TEXT PRIMARY KEY,
      club_profile_id  TEXT NOT NULL REFERENCES club_profiles(id) ON DELETE CASCADE,
      shot_intent      TEXT NOT NULL,
      swing_pct        REAL,
      carry_mean       REAL NOT NULL,
      carry_sd         REAL,
      offline_mean     REAL,
      offline_sd       REAL,
      sample_size      INTEGER DEFAULT 0,
      created_at       BIGINT NOT NULL,
      UNIQUE(club_profile_id, shot_intent)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_club_distance_profiles_profile ON club_distance_profiles(club_profile_id)`);

  // ── Phase 3: Normalize game_plan_history → optimizer_runs + child tables ──
  await query(`
    CREATE TABLE IF NOT EXISTS optimizer_runs (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL REFERENCES users(id),
      course_id        TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      tee_box          TEXT NOT NULL,
      mode             TEXT NOT NULL,
      total_expected   REAL NOT NULL,
      total_plays_like REAL,
      course_name      TEXT NOT NULL DEFAULT '',
      trigger_reason   TEXT,
      plan_payload     JSONB,
      created_at       BIGINT NOT NULL
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_optimizer_runs_user_course ON optimizer_runs(user_id, course_id, tee_box, mode, created_at DESC)`);

  await query(`
    CREATE TABLE IF NOT EXISTS optimizer_run_holes (
      id                 TEXT PRIMARY KEY,
      run_id             TEXT NOT NULL REFERENCES optimizer_runs(id) ON DELETE CASCADE,
      hole_number        INTEGER NOT NULL,
      par                INTEGER NOT NULL,
      yardage            INTEGER NOT NULL,
      plays_like_yardage REAL,
      expected_strokes   REAL NOT NULL,
      strategy_name      TEXT NOT NULL,
      strategy_type      TEXT NOT NULL,
      strategy_label     TEXT,
      blowup_risk        REAL,
      std_strokes        REAL,
      fairway_rate       REAL,
      color_code         TEXT,
      eagle_pct          REAL,
      birdie_pct         REAL,
      par_pct            REAL,
      bogey_pct          REAL,
      double_pct         REAL,
      worse_pct          REAL,
      UNIQUE(run_id, hole_number)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_optimizer_run_holes_run ON optimizer_run_holes(run_id)`);

  await query(`
    CREATE TABLE IF NOT EXISTS optimizer_run_aim_points (
      id              TEXT PRIMARY KEY,
      run_hole_id     TEXT NOT NULL REFERENCES optimizer_run_holes(id) ON DELETE CASCADE,
      shot_number     INTEGER NOT NULL,
      club_name       TEXT NOT NULL,
      carry           REAL NOT NULL,
      carry_note      TEXT,
      tip             TEXT,
      lat             REAL NOT NULL,
      lng             REAL NOT NULL,
      UNIQUE(run_hole_id, shot_number)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_optimizer_run_aim_points_hole ON optimizer_run_aim_points(run_hole_id)`);

  // ── Drop old normalized-away tables ──
  const DROP_OLD_FLAG = 'drop_old_tables_v1';
  const { rows: dropOldFlag } = await query('SELECT 1 FROM _migration_flags WHERE flag = $1', [DROP_OLD_FLAG]);
  if (dropOldFlag.length === 0) {
    // Re-point FK constraints from old clubs → bag_clubs
    await query(`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_club_id_fkey`);
    await query(`ALTER TABLE shots DROP CONSTRAINT IF EXISTS shots_club_id_fkey`);
    await query(`
      DO $$ BEGIN
        ALTER TABLE sessions ADD CONSTRAINT sessions_club_id_fkey FOREIGN KEY (club_id) REFERENCES bag_clubs(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await query(`
      DO $$ BEGIN
        ALTER TABLE shots ADD CONSTRAINT shots_club_id_fkey FOREIGN KEY (club_id) REFERENCES bag_clubs(id);
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // Drop old tables (order matters for FK dependencies)
    await query(`DROP TABLE IF EXISTS wedge_overrides`);
    await query(`DROP TABLE IF EXISTS game_plan_history`);
    await query(`DROP TABLE IF EXISTS clubs`);
    await query(`DROP TABLE IF EXISTS course_holes`);

    await query('INSERT INTO _migration_flags (flag, applied_at) VALUES ($1, $2)', [DROP_OLD_FLAG, Date.now()]);
    logger.info('Dropped old tables: wedge_overrides, game_plan_history, clubs, course_holes');
  }

  logger.info('Database migration complete');
}
