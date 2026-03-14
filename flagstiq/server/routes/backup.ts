import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { BAG_CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from '../utils/db-columns.js';
import { markPlansStale } from './game-plans.js';
import { loadUserClubs } from '../services/club-loader.js';

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
    const clubs = await loadUserClubs(userId);
    const sessions = await query('SELECT * FROM sessions WHERE user_id = $1 ORDER BY date', [userId]);
    const shots = await query('SELECT * FROM shots WHERE user_id = $1 ORDER BY session_id, shot_number', [userId]);

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs,
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
      await client.query('DELETE FROM bag_clubs WHERE user_id = $1', [userId]);

      // Insert clubs into bag_clubs + club_profiles
      for (const club of clubs) {
        const now = Date.now();
        const row = pickColumns({ ...club, isActive: true, userId, createdAt: club.createdAt ?? now, updatedAt: club.updatedAt ?? now }, BAG_CLUB_COLUMNS);
        const q = buildInsert('bag_clubs', row);
        await client.query(q.text, q.values);

        // Create manual profile if carry/total present
        const clubId = (club.id ?? row.id) as string;
        const manualCarry = club.manualCarry as number | null | undefined;
        const manualTotal = club.manualTotal as number | null | undefined;
        if (manualCarry != null || manualTotal != null) {
          await client.query(
            `INSERT INTO club_profiles (id, bag_club_id, profile_type, carry_mean, total_mean, is_current, effective_from, created_at)
             VALUES (gen_random_uuid()::text, $1, 'manual', $2, $3, TRUE, $4, $4)`,
            [clubId, manualCarry ?? null, manualTotal ?? null, now],
          );
        }
        // Create computed profile if present
        const computedCarry = club.computedCarry as number | null | undefined;
        if (computedCarry != null) {
          await client.query(
            `INSERT INTO club_profiles (id, bag_club_id, profile_type, carry_mean, is_current, effective_from, created_at)
             VALUES (gen_random_uuid()::text, $1, 'computed', $2, TRUE, $3, $3)`,
            [clubId, computedCarry, now],
          );
        }
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
