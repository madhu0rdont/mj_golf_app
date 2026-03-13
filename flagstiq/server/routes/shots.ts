import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

const shotsQuerySchema = z.object({
  since: z.coerce.number().int().positive().optional(),
  clubId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50000).optional(),
});

// GET /api/shots — user's shots (for yardage book computation)
// Optional filters: ?since=TIMESTAMP, ?clubId=UUID, ?limit=N
router.get('/', async (req, res) => {
  try {
    const parsed = shotsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.flatten().fieldErrors });
    }
    const { since, clubId, limit: queryLimit } = parsed.data;

    const userId = req.session.userId!;
    const conditions: string[] = ['shots.user_id = $1'];
    const values: unknown[] = [userId];
    let paramIndex = 2;

    // Only JOIN sessions when filtering by date (avoids unnecessary join for yardage book)
    const needsSessionJoin = !!since;

    if (since) {
      conditions.push(`s.date >= $${paramIndex++}`);
      values.push(since);
    }
    if (clubId) {
      conditions.push(`shots.club_id = $${paramIndex++}`);
      values.push(clubId);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const limit = Math.min(queryLimit ?? 5000, 5000);
    values.push(limit);

    const join = needsSessionJoin ? 'JOIN sessions s ON s.id = shots.session_id' : '';
    const { rows } = await query(
      `SELECT shots.* FROM shots
       ${join}
       ${where}
       ORDER BY shots.id
       LIMIT $${paramIndex}`,
      values
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('GET /api/shots failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
