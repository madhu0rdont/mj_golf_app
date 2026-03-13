import { Router } from 'express';
import { query } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';

const router = Router();

// GET /api/admin/strategy-constants — return all strategy constants
router.get('/strategy-constants', async (_req, res) => {
  try {
    const { rows } = await query('SELECT key, value, category, description FROM strategy_constants ORDER BY category, key');
    res.json(rows);
  } catch (err) {
    logger.error('Failed to fetch strategy constants', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/strategy-constants — update strategy constants
router.put('/strategy-constants', async (req, res) => {
  const { constants } = req.body as { constants: { key: string; value: number }[] };
  if (!Array.isArray(constants) || constants.length === 0) {
    return res.status(400).json({ error: 'constants array is required' });
  }

  try {
    const now = Date.now();
    for (const { key, value } of constants) {
      await query(
        'UPDATE strategy_constants SET value = $1, updated_at = $2 WHERE key = $3',
        [value, now, key],
      );
    }

    // Mark all game plans stale since constants changed
    await markPlansStale('Strategy constants updated');

    const { rows } = await query('SELECT key, value, category, description FROM strategy_constants ORDER BY category, key');
    res.json(rows);
  } catch (err) {
    logger.error('Strategy constant update failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
