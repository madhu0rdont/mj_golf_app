import { Router } from 'express';
import { query, toCamel, withTransaction } from '../db.js';
import { CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from '../utils/db-columns.js';

const router = Router();

// GET /api/backup/export — export all data
router.get('/export', async (_req, res) => {
  try {
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
  } catch (err) {
    console.error('Failed to export backup:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/backup/import — import backup (clear + replace)
router.post('/import', async (req, res) => {
  try {
    const { clubs, sessions, shots } = req.body;

    if (!Array.isArray(clubs)) {
      return res.status(400).json({ error: 'clubs must be an array' });
    }
    if (sessions !== undefined && !Array.isArray(sessions)) {
      return res.status(400).json({ error: 'sessions must be an array' });
    }
    if (shots !== undefined && !Array.isArray(shots)) {
      return res.status(400).json({ error: 'shots must be an array' });
    }

    await withTransaction(async (client) => {
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
    });

    console.log(`Imported ${clubs.length} clubs, ${(sessions || []).length} sessions, ${(shots || []).length} shots`);
    res.json({
      clubs: clubs.length,
      sessions: (sessions || []).length,
      shots: (shots || []).length,
    });
  } catch (err) {
    console.error('Import failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Import failed: ${message}` });
  }
});

export default router;
