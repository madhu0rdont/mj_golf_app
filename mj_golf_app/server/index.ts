import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import clubsRouter from './routes/clubs.js';
import sessionsRouter from './routes/sessions.js';
import shotsRouter from './routes/shots.js';
import backupRouter from './routes/backup.js';
import yardageRouter from './routes/yardage.js';
import seedRouter from './routes/seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(express.json({ limit: '50mb' }));

// API routes
app.use('/api/clubs', clubsRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/shots', shotsRouter);
app.use('/api/backup', backupRouter);
app.use('/api/yardage', yardageRouter);
app.use('/api/seed', seedRouter);

// Serve static SPA files
const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (_req, res) => {
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
