import { Router } from 'express';
import { query, pool, toCamel, toSnake } from '../db.js';

const router = Router();

// GET /api/backup/export — export all data
router.get('/export', async (_req, res) => {
  const clubs = await query('SELECT * FROM clubs ORDER BY sort_order');
  const sessions = await query('SELECT * FROM sessions ORDER BY date');
  const shots = await query('SELECT * FROM shots ORDER BY session_id, shot_number');

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs: clubs.rows.map(toCamel),
    sessions: sessions.rows.map(toCamel),
    shots: shots.rows.map(toCamel),
  });
});

// POST /api/backup/import — import backup (clear + replace)
router.post('/import', async (req, res) => {
  const { clubs, sessions, shots } = req.body;

  if (!Array.isArray(clubs)) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear all data (shots cascade from sessions)
    await client.query('DELETE FROM shots');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM clubs');

    // Insert clubs
    for (const club of clubs) {
      const snake = toSnake(club);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO clubs (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    // Insert sessions
    for (const session of sessions) {
      const snake = toSnake(session);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO sessions (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    // Insert shots
    for (const shot of shots) {
      const snake = toSnake(shot);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO shots (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    await client.query('COMMIT');
    res.json({
      clubs: clubs.length,
      sessions: sessions.length,
      shots: shots.length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

export default router;
