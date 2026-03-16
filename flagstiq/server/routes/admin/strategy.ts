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
const VALID_CONSTANT_KEYS = new Set([
  'lie_fairway', 'lie_rough', 'lie_green', 'lie_fairway_bunker', 'lie_greenside_bunker',
  'lie_trees', 'lie_recovery', 'rollout_fairway', 'rollout_rough', 'rollout_green',
  'rollout_bunker', 'safe_variance_weight', 'aggressive_green_bonus', 'samples_base',
  'samples_hazard', 'samples_high_risk', 'chip_range', 'short_game_threshold',
  'green_radius', 'zone_interval', 'lateral_offset', 'bearing_range', 'k_neighbors',
  'kernel_h_s', 'kernel_h_u', 'tree_height_yards', 'ball_apex_yards',
  'elev_yards_per_meter', 'rollout_slope_factor', 'default_loft', 'putt_coefficient',
  'putt_cap', 'mc_trials', 'max_iterations', 'convergence_threshold', 'min_carry_ratio',
  'max_carry_ratio', 'hazard_drop_penalty', 'max_shots_per_hole',
]);

router.put('/strategy-constants', async (req, res) => {
  const { constants } = req.body as { constants: { key: string; value: number }[] };
  if (!Array.isArray(constants) || constants.length === 0) {
    return res.status(400).json({ error: 'constants array is required' });
  }

  for (const { key, value } of constants) {
    if (!VALID_CONSTANT_KEYS.has(key)) {
      return res.status(400).json({ error: `Unknown constant key: ${key}` });
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000) {
      return res.status(400).json({ error: `Invalid value for ${key}: must be a finite number between 0 and 100000` });
    }
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

// GET /api/admin/regen-settings — return QA regen mode status
router.get('/regen-settings', async (_req, res) => {
  try {
    const { rows } = await query("SELECT 1 FROM _migration_flags WHERE flag = 'regen_qa_mode'");
    res.json({ qaMode: rows.length > 0 });
  } catch (err) {
    logger.error('Failed to fetch regen settings', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/regen-settings — toggle QA regen mode
router.put('/regen-settings', async (req, res) => {
  const { qaMode } = req.body as { qaMode: boolean };
  try {
    if (qaMode) {
      await query(
        "INSERT INTO _migration_flags (flag, applied_at) VALUES ('regen_qa_mode', $1) ON CONFLICT (flag) DO NOTHING",
        [Date.now()],
      );
    } else {
      await query("DELETE FROM _migration_flags WHERE flag = 'regen_qa_mode'");
    }
    logger.info(`Regen QA mode ${qaMode ? 'enabled' : 'disabled'}`);
    res.json({ qaMode });
  } catch (err) {
    logger.error('Failed to update regen settings', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
