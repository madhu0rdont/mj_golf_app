import { Router } from 'express';
import { query, pool, toCamel } from '../db.js';
import { CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from '../utils/db-columns.js';

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

    // Clear all data
    await client.query('DELETE FROM shots');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM clubs');

    // Insert clubs
    for (const club of clubs) {
      const row = pickColumns(club, CLUB_COLUMNS);
      const q = buildInsert('clubs', row);
      await client.query(q.text, q.values);
    }

    // Insert sessions
    for (const session of (sessions || [])) {
      const row = pickColumns(session, SESSION_COLUMNS);
      const q = buildInsert('sessions', row);
      await client.query(q.text, q.values);
    }

    // Insert shots
    for (const shot of (shots || [])) {
      const row = pickColumns(shot, SHOT_COLUMNS);
      const q = buildInsert('shots', row);
      await client.query(q.text, q.values);
    }

    await client.query('COMMIT');
    console.log(`Imported ${clubs.length} clubs, ${(sessions || []).length} sessions, ${(shots || []).length} shots`);
    res.json({
      clubs: clubs.length,
      sessions: (sessions || []).length,
      shots: (shots || []).length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Import failed: ${message}` });
  } finally {
    client.release();
  }
});

export default router;
