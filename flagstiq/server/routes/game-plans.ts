import { Router } from 'express';
import crypto from 'node:crypto';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { regenerateStalePlans } from '../services/plan-regenerator.js';
import { getRoughPenalty } from '../services/strategy-optimizer.js';
import { generatePlanParallel } from '../services/plan-worker-pool.js';
import type { ScoringMode } from '../services/dp-optimizer.js';
import type { Club, Shot, CourseWithHoles, CourseHole } from '../models/types.js';

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
// Estimated handicap from cached scoring plans
// ---------------------------------------------------------------------------

router.get('/handicap', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { rows } = await query(
      `SELECT gpc.plan, c.name, c.par, c.rating, c.slope
       FROM game_plan_cache gpc
       JOIN courses c ON c.id = gpc.course_id
       WHERE gpc.user_id = $1 AND gpc.mode = 'scoring'`,
      [userId],
    );

    const differentials: number[] = [];
    const courseNames: string[] = [];
    for (const row of rows) {
      const plan = typeof row.plan === 'string' ? JSON.parse(row.plan) : row.plan;
      const totalExpected = plan.totalExpected;
      if (typeof totalExpected !== 'number') continue;

      const par = row.par as number;
      const rating = row.rating as number | null;
      const slope = row.slope as number | null;

      // Skip 9-hole courses (par < 60) — scale them by 2x
      if (par < 60) {
        const scaled = totalExpected * 2;
        if (rating && slope) {
          differentials.push(((scaled - rating * 2) * 113) / (slope));
        } else {
          differentials.push(scaled - par * 2);
        }
      } else {
        if (rating && slope) {
          differentials.push(((totalExpected - rating) * 113) / slope);
        } else {
          differentials.push(totalExpected - par);
        }
      }
      courseNames.push(row.name as string);
    }

    if (differentials.length === 0) {
      return res.json({ handicap: null, courses: 0, courseNames: [] });
    }

    const avg = differentials.reduce((a, b) => a + b, 0) / differentials.length;
    res.json({ handicap: Math.round(avg * 10) / 10, courses: differentials.length, courseNames });
  } catch (err) {
    logger.error('Failed to compute handicap estimate', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
// Server-side plan generation
// ---------------------------------------------------------------------------

// POST /api/game-plans/:courseId/:teeBox/:mode/generate — generate plan on server
router.post('/:courseId/:teeBox/:mode/generate', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, teeBox, mode } = req.params;

    if (!['scoring', 'safe', 'aggressive'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be scoring, safe, or aggressive' });
    }

    // Load course + holes
    const { rows: courseRows } = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    if (courseRows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const course = toCamel<CourseWithHoles>(courseRows[0]);

    const { rows: holeRows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );
    course.holes = holeRows.map(toCamel<CourseHole>);

    if (course.holes.length === 0) {
      return res.status(400).json({ error: 'Course has no holes' });
    }

    // Load user's club/shot data
    const { rows: clubRows } = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
    const clubs = clubRows.map(toCamel<Club>);

    const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
    const shots = shotRows.map(toCamel<Shot>);

    // Generate plan across parallel worker threads (non-blocking)
    const roughPenalty = await getRoughPenalty();
    const plan = await generatePlanParallel({
      clubs,
      shots,
      course,
      teeBox,
      mode: mode as ScoringMode,
      roughPenalty,
    });

    // Upsert cache
    const now = Date.now();
    const cacheId = `${userId}_${courseId}_${teeBox}_${mode}`;
    await query(
      `INSERT INTO game_plan_cache (id, course_id, tee_box, mode, plan, stale, stale_reason, user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NULL, $6, $7, $7)
       ON CONFLICT (user_id, course_id, tee_box, mode)
       DO UPDATE SET plan = $5, stale = FALSE, stale_reason = NULL, updated_at = $7`,
      [cacheId, courseId, teeBox, mode, JSON.stringify(plan), userId, now],
    );

    // Insert history
    const historyId = crypto.randomUUID();
    await query(
      `INSERT INTO game_plan_history (id, course_id, tee_box, mode, total_expected, plan, trigger_reason, user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [historyId, courseId, teeBox, mode, plan.totalExpected, JSON.stringify(plan), 'manual_generate', userId, now],
    );

    logger.info(`Generated ${mode} plan for ${course.name} (${teeBox}): ${plan.totalExpected.toFixed(1)} xS`, {
      component: 'game-plan-generate',
    });

    res.json({ ok: true, plan });
  } catch (err) {
    logger.error('Failed to generate game plan', { error: String(err) });
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
