import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from '../utils/db-columns.js';
import { markPlansStale } from './game-plans.js';

const importBackupSchema = z.object({
  version: z.number(),
  clubs: z.array(z.record(z.string(), z.unknown())),
  sessions: z.array(z.record(z.string(), z.unknown())),
  shots: z.array(z.record(z.string(), z.unknown())),
});

const router = Router();

// GET /api/backup/export — export current user's data
router.get('/export', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const clubs = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
    const sessions = await query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY date', [userId]);
    const shots = await query('SELECT * FROM shots WHERE user_id = $1 ORDER BY session_id, shot_number', [userId]);

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs: clubs.rows.map(toCamel),
      sessions: sessions.rows.map(toCamel),
      shots: shots.rows.map(toCamel),
    });
  } catch (err) {
    logger.error('Failed to export backup', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/backup/import — import backup (clear + replace current user's data)
router.post('/import', async (req, res) => {
  try {
    const parsed = importBackupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }

    const userId = req.session.userId!;
    const { clubs, sessions, shots } = parsed.data;

    // Validate referential integrity: every shot must reference a session in the import
    const sessionIds = new Set(sessions.map((s) => s.id as string));
    const clubIds = new Set(clubs.map((c) => c.id as string));
    for (const shot of shots) {
      if (shot.sessionId && !sessionIds.has(shot.sessionId as string)) {
        return res.status(400).json({ error: 'Shot references a session not in this backup' });
      }
      if (shot.clubId && !clubIds.has(shot.clubId as string)) {
        return res.status(400).json({ error: 'Shot references a club not in this backup' });
      }
    }

    await withTransaction(async (client) => {
      // Clear current user's data only
      await client.query('DELETE FROM shots WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM wedge_overrides WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM clubs WHERE user_id = $1', [userId]);

      // Insert clubs with user_id
      for (const club of clubs) {
        const row = pickColumns({ ...club, userId }, CLUB_COLUMNS);
        const q = buildInsert('clubs', row);
        await client.query(q.text, q.values);
      }

      // Insert sessions with user_id
      for (const session of (sessions || [])) {
        const row = pickColumns({ ...session, userId }, SESSION_COLUMNS);
        const q = buildInsert('sessions', row);
        await client.query(q.text, q.values);
      }

      // Insert shots with user_id
      for (const shot of (shots || [])) {
        const row = pickColumns({ ...shot, userId }, SHOT_COLUMNS);
        const q = buildInsert('shots', row);
        await client.query(q.text, q.values);
      }
    });

    logger.info(`Imported ${clubs.length} clubs, ${(sessions || []).length} sessions, ${(shots || []).length} shots for user ${userId}`);

    // Fire-and-forget: mark game plans stale after data import
    markPlansStale('Data imported from backup', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));

    res.json({
      clubs: clubs.length,
      sessions: (sessions || []).length,
      shots: (shots || []).length,
    });
  } catch (err) {
    logger.error('Import failed', { error: String(err) });
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
