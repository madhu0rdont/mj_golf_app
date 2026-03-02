import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
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
 * If userId is provided, only that user's plans are marked stale.
 * If both omitted, ALL plans are marked stale.
 * After marking stale, triggers debounced server-side regeneration.
 */
export async function markPlansStale(reason: string, courseId?: string, userId?: string) {
  const conditions: string[] = ['stale = FALSE'];
  const params: unknown[] = [reason];

  if (courseId) {
    params.push(courseId);
    conditions.push(`course_id = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`user_id = $${params.length}`);
  }

  await query(
    `UPDATE game_plan_cache SET stale = TRUE, stale_reason = $1 WHERE ${conditions.join(' AND ')}`,
    params,
  );

  // Debounced fire-and-forget regeneration
  if (regenTimer) clearTimeout(regenTimer);
  regenTimer = setTimeout(() => {
    regenTimer = null;
    regenerateStalePlans().catch((err) => logger.error('Plan regeneration failed', { error: String(err) }));
  }, DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// History endpoints (registered BEFORE /:courseId/:teeBox/:mode)
// ---------------------------------------------------------------------------

// GET /api/game-plans/history/:courseId/:teeBox/:mode — list history for charting
router.get('/history/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, teeBox, mode } = req.params;
    const { rows } = await query(
      `SELECT id, total_expected, trigger_reason, created_at
       FROM game_plan_history
       WHERE course_id = $1 AND tee_box = $2 AND mode = $3 AND user_id = $4
       ORDER BY created_at DESC
       LIMIT 100`,
      [courseId, teeBox, mode, userId],
    );
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to fetch game plan history', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/game-plans/history/:courseId/:teeBox/:mode/:id — full historical plan
router.get('/history/:courseId/:teeBox/:mode/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const { rows } = await query(
      `SELECT * FROM game_plan_history WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'History entry not found' });
    }
    res.json(toCamel(rows[0]));
  } catch (err) {
    logger.error('Failed to fetch game plan history entry', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------------------------
// Cache CRUD
// ---------------------------------------------------------------------------

// GET /api/game-plans/:courseId/:teeBox/:mode — fetch cached plan
router.get('/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, teeBox, mode } = req.params;
    const { rows } = await query(
      `SELECT * FROM game_plan_cache WHERE course_id = $1 AND tee_box = $2 AND mode = $3 AND user_id = $4`,
      [courseId, teeBox, mode, userId],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No cached plan' });
    }
    res.json(toCamel(rows[0]));
  } catch (err) {
    logger.error('Failed to fetch game plan cache', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/game-plans/:courseId/:teeBox/:mode — upsert plan
router.put('/:courseId/:teeBox/:mode', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, teeBox, mode } = req.params;
    const { plan } = req.body;
    if (!plan) {
      return res.status(400).json({ error: 'plan is required' });
    }
    const now = Date.now();
    const id = `${userId}_${courseId}_${teeBox}_${mode}`;
    await query(
      `INSERT INTO game_plan_cache (id, course_id, tee_box, mode, plan, stale, stale_reason, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, $6, $7, $7)
       ON CONFLICT (user_id, course_id, tee_box, mode)
       DO UPDATE SET plan = $5, stale = FALSE, stale_reason = NULL, updated_at = $7`,
      [id, courseId, teeBox, mode, JSON.stringify(plan), userId, now],
    );
    res.json({ ok: true, updatedAt: now });
  } catch (err) {
    logger.error('Failed to upsert game plan cache', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/game-plans/:courseId — purge user's plans for a course
router.delete('/:courseId', async (req, res) => {
  try {
    const userId = req.session.userId!;
    await query(`DELETE FROM game_plan_cache WHERE course_id = $1 AND user_id = $2`, [req.params.courseId, userId]);
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete game plan cache', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
