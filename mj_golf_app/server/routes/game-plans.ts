import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { regenerateStalePlans } from '../services/plan-regenerator.js';

const router = Router();

// ---------------------------------------------------------------------------
// Debounced auto-regeneration
// ---------------------------------------------------------------------------

let regenTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 5000;

/**
 * Mark cached game plans as stale.
 * If courseId is provided, only that course's plans are marked stale.
 * If omitted, ALL plans are marked stale (e.g. new practice data).
 * After marking stale, triggers debounced server-side regeneration.
 */
export async function markPlansStale(reason: string, courseId?: string) {
  if (courseId) {
    await query(
      `UPDATE game_plan_cache SET stale = TRUE, stale_reason = $1 WHERE course_id = $2 AND stale = FALSE`,
      [reason, courseId],
    );
  } else {
    await query(
      `UPDATE game_plan_cache SET stale = TRUE, stale_reason = $1 WHERE stale = FALSE`,
      [reason],
    );
  }

  // Debounced fire-and-forget regeneration
  if (regenTimer) clearTimeout(regenTimer);
  regenTimer = setTimeout(() => {
    regenTimer = null;
    regenerateStalePlans().catch((err) => console.error('[plan-regen]', err));
  }, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// History endpoints (registered BEFORE /:courseId/:teeBox/:mode)
// ---------------------------------------------------------------------------

// GET /api/game-plans/history/:courseId/:teeBox/:mode — list history for charting
router.get('/history/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const { courseId, teeBox, mode } = req.params;
    const { rows } = await query(
      `SELECT id, total_expected, trigger_reason, created_at
       FROM game_plan_history
       WHERE course_id = $1 AND tee_box = $2 AND mode = $3
       ORDER BY created_at DESC
       LIMIT 100`,
      [courseId, teeBox, mode],
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    console.error('Failed to fetch game plan history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/game-plans/history/:courseId/:teeBox/:mode/:id — full historical plan
router.get('/history/:courseId/:teeBox/:mode/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `SELECT * FROM game_plan_history WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    res.json(toCamel(rows[0]));
  } catch (err) {
    console.error('Failed to fetch game plan history entry:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Cache CRUD
// ---------------------------------------------------------------------------

// GET /api/game-plans/:courseId/:teeBox/:mode — fetch cached plan
router.get('/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const { courseId, teeBox, mode } = req.params;
    const { rows } = await query(
      `SELECT * FROM game_plan_cache WHERE course_id = $1 AND tee_box = $2 AND mode = $3`,
      [courseId, teeBox, mode],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No cached plan' });
    }
    res.json(toCamel(rows[0]));
  } catch (err) {
    console.error('Failed to fetch game plan cache:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/game-plans/:courseId/:teeBox/:mode — upsert plan
router.put('/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const { courseId, teeBox, mode } = req.params;
    const { plan } = req.body;
    if (!plan) {
      return res.status(400).json({ error: 'plan is required' });
    }
    const now = Date.now();
    const id = `${courseId}_${teeBox}_${mode}`;
    await query(
      `INSERT INTO game_plan_cache (id, course_id, tee_box, mode, plan, stale, stale_reason, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, $6, $6)
       ON CONFLICT (course_id, tee_box, mode)
       DO UPDATE SET plan = $5, stale = FALSE, stale_reason = NULL, updated_at = $6`,
      [id, courseId, teeBox, mode, JSON.stringify(plan), now],
    );
    res.json({ ok: true, updatedAt: now });
  } catch (err) {
    console.error('Failed to upsert game plan cache:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/game-plans/:courseId — purge all plans for a course
router.delete('/:courseId', async (req, res) => {
  try {
    await query(`DELETE FROM game_plan_cache WHERE course_id = $1`, [req.params.courseId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete game plan cache:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
