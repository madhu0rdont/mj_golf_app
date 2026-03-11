import { Router } from 'express';
import crypto from 'node:crypto';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { regenerateStalePlans } from '../services/plan-regenerator.js';
import { getRoughPenalty } from '../services/strategy-optimizer.js';
import { generatePlanParallel } from '../services/plan-worker-pool.js';
import { dpOptimizeHole } from '../services/dp-optimizer.js';
import type { ScoringMode } from '../services/dp-optimizer.js';
import { computeClubShotGroups } from '../services/club-shot-groups.js';
import { buildDistributions } from '../services/monte-carlo.js';
import { assembleGamePlan } from '../services/game-plan.js';
import type { GamePlan } from '../services/game-plan.js';
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
      `SELECT gpc.plan, gpc.tee_box, c.name, c.par, c.rating, c.slope, c.tee_sets
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
      const teeBox = row.tee_box as string;
      const teeSets = row.tee_sets as Record<string, { rating: number; slope: number }> | null;

      // Prefer tee-specific rating/slope from tee_sets, fall back to course-level
      const teeData = teeSets?.[teeBox];
      const rating = teeData?.rating ?? (row.rating as number | null);
      const slope = teeData?.slope ?? (row.slope as number | null);

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

    // Set up SSE for per-hole progress
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Generate plan across parallel worker threads (non-blocking)
    const roughPenalty = await getRoughPenalty();
    const plan = await generatePlanParallel(
      { clubs, shots, course, teeBox, mode: mode as ScoringMode, roughPenalty },
      (completed, total) => {
        res.write(`data: ${JSON.stringify({ type: 'progress', completed, total })}\n\n`);
      },
    );

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

    res.write(`data: ${JSON.stringify({ type: 'done', plan })}\n\n`);
    res.end();
  } catch (err) {
    logger.error('Failed to generate game plan', { error: String(err) });
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Internal server error' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// POST /api/game-plans/:courseId/:teeBox/:mode/generate/:holeNumber — regenerate single hole
router.post('/:courseId/:teeBox/:mode/generate/:holeNumber', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, teeBox, mode } = req.params;
    const holeNumber = parseInt(req.params.holeNumber);

    if (!['scoring', 'safe', 'aggressive'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be scoring, safe, or aggressive' });
    }
    if (isNaN(holeNumber) || holeNumber < 1 || holeNumber > 18) {
      return res.status(400).json({ error: 'Invalid hole number' });
    }

    // Load existing cached plan
    const { rows: cacheRows } = await query(
      `SELECT * FROM game_plan_cache WHERE course_id = $1 AND tee_box = $2 AND mode = $3 AND user_id = $4`,
      [courseId, teeBox, mode, userId],
    );
    if (cacheRows.length === 0) {
      return res.status(404).json({ error: 'No cached plan — generate the full plan first' });
    }
    const cachedPlan = toCamel<{ plan: GamePlan }>(cacheRows[0]).plan;

    // Load the specific hole
    const { rows: holeRows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [courseId, holeNumber],
    );
    if (holeRows.length === 0) {
      return res.status(404).json({ error: 'Hole not found' });
    }
    const hole = toCamel<CourseHole>(holeRows[0]);

    // Load user's club/shot data and build distributions
    const { rows: clubRows } = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
    const clubs = clubRows.map(toCamel<Club>);
    const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
    const shots = shotRows.map(toCamel<Shot>);

    const groups = computeClubShotGroups(clubs, shots);
    const distributions = buildDistributions(groups);
    if (distributions.length === 0) {
      return res.status(400).json({ error: 'No distributions — not enough shot data' });
    }

    // Run DP optimizer for this single hole (runs synchronously, ~15-20s for one hole)
    const roughPenalty = await getRoughPenalty();
    const strategies = dpOptimizeHole(hole, teeBox, distributions, roughPenalty);

    if (strategies.length === 0) {
      return res.status(400).json({ error: 'Optimizer returned no strategies for this hole' });
    }

    // Patch the single hole into the cached plan
    const MODE_INDEX: Record<string, number> = { scoring: 0, safe: 1, aggressive: 2 };
    const modeIdx = MODE_INDEX[mode] ?? 0;
    const strategy = strategies[modeIdx] ?? strategies[0];

    const holeIdx = cachedPlan.holes.findIndex((h) => h.holeNumber === holeNumber);
    if (holeIdx >= 0) {
      cachedPlan.holes[holeIdx].strategy = strategy;
      cachedPlan.holes[holeIdx].allStrategies = strategies;
    }

    // Recalculate total expected
    const rawTotal = cachedPlan.holes.reduce((sum, h) => sum + h.strategy.expectedStrokes, 0);
    cachedPlan.totalExpected = Number.isFinite(rawTotal)
      ? rawTotal
      : cachedPlan.holes.reduce((sum, h) => sum + h.par, 0);

    // Update cache
    const now = Date.now();
    await query(
      `UPDATE game_plan_cache SET plan = $1, stale = FALSE, stale_reason = NULL, updated_at = $2
       WHERE course_id = $3 AND tee_box = $4 AND mode = $5 AND user_id = $6`,
      [JSON.stringify(cachedPlan), now, courseId, teeBox, mode, userId],
    );

    logger.info(`Regenerated hole ${holeNumber} for ${courseId} (${teeBox}/${mode}): ${strategy.expectedStrokes.toFixed(1)} xS`, {
      component: 'game-plan-generate',
    });

    res.json({ ok: true, plan: cachedPlan });
  } catch (err) {
    logger.error('Failed to regenerate single hole', { error: String(err) });
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
