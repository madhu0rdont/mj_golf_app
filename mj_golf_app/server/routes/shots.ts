import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/shots — all shots (for yardage book computation)
// Optional filters: ?since=TIMESTAMP, ?clubId=UUID, ?limit=N
router.get('/', async (req, res) => {
  try {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (req.query.since) {
      conditions.push(`s.date >= $${paramIndex++}`);
      values.push(Number(req.query.since));
    }
    if (req.query.clubId) {
      conditions.push(`shots.club_id = $${paramIndex++}`);
      values.push(req.query.clubId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(parseInt(req.query.limit as string) || 10000, 50000);

    const { rows } = await query(
      `SELECT shots.* FROM shots
       JOIN sessions s ON s.id = shots.session_id
       ${where}
       ORDER BY shots.id
       LIMIT ${limit}`,
      values
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('GET /api/shots failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
