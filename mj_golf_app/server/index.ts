import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { requireAuth, requirePlayer } from './middleware/auth.js';
import { csrfCheck } from './middleware/csrf.js';
import authRouter from './routes/auth.js';
import clubsRouter from './routes/clubs.js';
import sessionsRouter from './routes/sessions.js';
import shotsRouter from './routes/shots.js';
import backupRouter from './routes/backup.js';
import usersRouter from './routes/users.js';

import seedRouter from './routes/seed.js';
import extractRouter from './routes/extract.js';
import wedgeOverridesRouter from './routes/wedge-overrides.js';
import coursesRouter from './routes/courses.js';
import adminRouter from './routes/admin.js';
import gamePlansRouter, { markPlansStale } from './routes/game-plans.js';
import strategyRouter from './routes/strategy.js';
import { readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

// Trust Railway's reverse proxy so secure cookies work behind TLS termination
if (isProd) app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // SPA manages its own CSP via meta tags
}));

// Response compression
app.use(compression());

app.use(express.json({ limit: '50mb' }));

// CSRF protection — require custom header on mutating requests
app.use(csrfCheck);

// Health checks (unauthenticated)
app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ready: true });
  } catch {
    res.status(503).json({ ready: false });
  }
});

// Session secret — require in production, allow dev fallback
const sessionSecret = process.env.SESSION_SECRET;
if (isProd && !sessionSecret) {
  logger.error('FATAL: SESSION_SECRET must be set in production');
  process.exit(1);
}

// Session middleware
const PgStore = connectPgSimple(session);
app.use(
  session({
    store: new PgStore({
      pool,
      tableName: 'user_sessions',
    }),
    secret: sessionSecret || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: 'lax',
    },
  })
);

// Auth routes (unprotected)
app.use('/api/auth', authRouter);

// Auth middleware — protects all subsequent /api/* routes
app.use('/api', requireAuth);

// User management (admin-only endpoints handled inside router)
app.use('/api/users', usersRouter);

// Player-only API routes (requirePlayer blocks admin account)
app.use('/api/clubs', requirePlayer, clubsRouter);
app.use('/api/sessions', requirePlayer, sessionsRouter);
app.use('/api/shots', requirePlayer, shotsRouter);
app.use('/api/backup', requirePlayer, backupRouter);
app.use('/api/wedge-overrides', requirePlayer, wedgeOverridesRouter);
app.use('/api/game-plans', requirePlayer, gamePlansRouter);
app.use('/api/strategy', requirePlayer, strategyRouter);

// Shared routes (any authenticated user)
app.use('/api/courses', coursesRouter);
app.use('/api/extract', extractRouter);

// Admin-only routes (requireAdmin handled inside routers)
app.use('/api/seed', seedRouter);
app.use('/api/admin', adminRouter);

// Serve static SPA files
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback — serve index.html for all non-API routes
app.get('/{*splat}', (_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

async function start() {
  await migrate();
  await seed();

  // Auto-regenerate game plans when optimizer version changes
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    const appVersion = pkg.version as string;
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'optimizer_version'`,
    );
    const dbVersion = rows[0]?.value;
    if (dbVersion !== appVersion) {
      logger.info(`Optimizer version changed: ${dbVersion ?? 'none'} → ${appVersion}, marking plans stale`);
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('optimizer_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [appVersion],
      );
      await markPlansStale(`Optimizer updated to ${appVersion}`);
    }
  } catch {
    // app_settings table may not exist yet — create it
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('optimizer_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [pkg.version],
    );
    await markPlansStale(`Optimizer updated to ${pkg.version}`);
  }

  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
