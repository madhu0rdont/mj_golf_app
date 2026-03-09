import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { logApiUsage } from './services/usage.js';
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax',
    },
  })
);

// Auth routes (unprotected)
app.use('/api/auth', authRouter);

// Auth middleware — protects all subsequent /api/* routes
app.use('/api', requireAuth);

// Global write rate limiter — generous for normal use, blocks abuse
// Per-route limiters (login, extract) are stricter and take precedence
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
});
app.use('/api', writeLimiter);

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

// Lightweight map-impression tracker (any authenticated user)
const MAP_COSTS: Record<string, number> = { maps_js: 0.007, static_maps: 0.002 };
app.post('/api/track/map-impression', (req, res) => {
  const { type, count, endpoint } = req.body ?? {};
  const cost = MAP_COSTS[type as string];
  if (!cost) return res.status(400).json({ error: 'Invalid type' });
  const n = Math.min(Math.max(Math.round(Number(count) || 1), 1), 50);
  const userId = (req.session as { userId?: string }).userId;
  logApiUsage({
    service: 'google_maps',
    endpoint: endpoint ?? type,
    userId,
    items: n,
    apiCalls: n,
    estimatedCost: cost * n,
  });
  res.json({ ok: true });
});

// Shared routes (any authenticated user)
app.use('/api/courses', coursesRouter);
app.use('/api/extract', extractRouter);

// Admin-only routes (requireAdmin handled inside routers)
app.use('/api/seed', seedRouter);
app.use('/api/admin', adminRouter);

// Serve static SPA files
const distPath = join(__dirname, '..', 'dist');

// Hashed assets (Vite puts them in /assets/) — cache forever
app.use('/assets', express.static(join(distPath, 'assets'), {
  maxAge: '1y',
  immutable: true,
}));

// Other static files (sw.js, manifest, etc.) — short cache with revalidation
app.use(express.static(distPath, {
  maxAge: '1h',
  etag: true,
}));

// SPA fallback — serve index.html for all non-API routes (no cache)
app.get('/{*splat}', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(join(distPath, 'index.html'));
});

async function start() {
  await migrate();
  await seed();

  // Auto-regenerate game plans when optimizer version changes.
  // IMPORTANT: Only bump OPTIMIZER_VERSION when the DP optimizer / MC simulation
  // / game-plan logic actually changes. Package version bumps alone should NOT
  // trigger costly regeneration that blocks the event loop for minutes.
  const OPTIMIZER_VERSION = '1.5.7'; // tee bearing look-ahead fix for doglegs
  try {
    const { rows } = await pool.query(
      `SELECT value FROM app_settings WHERE key = 'optimizer_version'`,
    );
    const dbVersion = rows[0]?.value;
    if (dbVersion !== OPTIMIZER_VERSION) {
      logger.info(`Optimizer version changed: ${dbVersion ?? 'none'} → ${OPTIMIZER_VERSION}, marking plans stale`);
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('optimizer_version', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1`,
        [OPTIMIZER_VERSION],
      );
      await markPlansStale(`Optimizer updated to ${OPTIMIZER_VERSION}`);
    }
  } catch {
    // app_settings table may not exist yet — create it
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('optimizer_version', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [OPTIMIZER_VERSION],
    );
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server listening on port ${PORT}`);
  });

  function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close(() => {
      pool.end().then(() => {
        logger.info('Server and database pool closed');
        process.exit(0);
      });
    });
    // Force exit after 10s if graceful shutdown stalls
    setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error('Failed to start server', { error: String(err) });
  process.exit(1);
});
