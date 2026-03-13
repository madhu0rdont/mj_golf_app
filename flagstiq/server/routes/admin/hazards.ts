import { Router } from 'express';
import { query, pool } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';

const router = Router();

// GET /api/admin/hazard-penalties — return global hazard penalties
router.get('/hazard-penalties', async (_req, res) => {
  try {
    const { rows } = await query('SELECT type, penalty FROM hazard_penalties ORDER BY type');
    res.json(rows);
  } catch (err) {
    logger.error('Failed to fetch hazard penalties', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/hazard-penalties — update global hazard penalties
router.put('/hazard-penalties', async (req, res) => {
  const { penalties } = req.body as { penalties: { type: string; penalty: number }[] };
  if (!Array.isArray(penalties) || penalties.length === 0) {
    return res.status(400).json({ error: 'penalties array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();

    // 1. Batch upsert all penalties in one query
    if (penalties.length > 0) {
      const placeholders = penalties.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
      const values = penalties.flatMap(({ type, penalty }) => [type, penalty, now]);
      await client.query(
        `INSERT INTO hazard_penalties (type, penalty, updated_at) VALUES ${placeholders.join(', ')}
         ON CONFLICT (type) DO UPDATE SET penalty = EXCLUDED.penalty, updated_at = EXCLUDED.updated_at`,
        values,
      );
    }

    // 2. Build penalty map for bulk-updating course hazards
    const penaltyMap = new Map(penalties.map((p) => [p.type, p.penalty]));

    // 3. Update all course_holes hazard objects with new penalty values
    const { rows: holeRows } = await client.query('SELECT id, hazards FROM course_holes WHERE hazards IS NOT NULL');
    for (const row of holeRows) {
      const hazards = row.hazards as { type: string; penalty: number }[];
      if (!Array.isArray(hazards) || hazards.length === 0) continue;

      let changed = false;
      const updated = hazards.map((h) => {
        const newPenalty = penaltyMap.get(h.type);
        if (newPenalty !== undefined && newPenalty !== h.penalty) {
          changed = true;
          return { ...h, penalty: newPenalty };
        }
        return h;
      });

      if (changed) {
        await client.query('UPDATE course_holes SET hazards = $1 WHERE id = $2', [
          JSON.stringify(updated),
          row.id,
        ]);
      }
    }

    await client.query('COMMIT');

    // 4. Mark all game plans stale
    await markPlansStale('Hazard penalties updated');

    // 5. Return updated penalties
    const { rows: result } = await query('SELECT type, penalty FROM hazard_penalties ORDER BY type');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Hazard penalty update failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
