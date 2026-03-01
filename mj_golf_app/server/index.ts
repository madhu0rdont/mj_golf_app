import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { pool } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { csrfCheck } from './middleware/csrf.js';
import authRouter from './routes/auth.js';
import clubsRouter from './routes/clubs.js';
import sessionsRouter from './routes/sessions.js';
import shotsRouter from './routes/shots.js';
import backupRouter from './routes/backup.js';

import seedRouter from './routes/seed.js';
import extractRouter from './routes/extract.js';
import wedgeOverridesRouter from './routes/wedge-overrides.js';
import coursesRouter from './routes/courses.js';
import adminRouter from './routes/admin.js';
import gamePlansRouter from './routes/game-plans.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;

// Trust Railway's reverse proxy so secure cookies work behind TLS termination
if (isProd) app.set('trust proxy', 1);

app.use(express.json({ limit: '50mb' }));

// CSRF protection — require custom header on mutating requests
app.use(csrfCheck);

// Session secret — require in production, allow dev fallback
const sessionSecret = process.env.SESSION_SECRET;
if (isProd && !sessionSecret) {
  console.error('FATAL: SESSION_SECRET must be set in production');
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

// Protected API routes
app.use('/api/clubs', clubsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/shots', shotsRouter);
app.use('/api/backup', backupRouter);

app.use('/api/seed', seedRouter);
app.use('/api/extract', extractRouter);
app.use('/api/wedge-overrides', wedgeOverridesRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/admin', adminRouter);
app.use('/api/game-plans', gamePlansRouter);

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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
