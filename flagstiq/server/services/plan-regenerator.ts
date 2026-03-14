import crypto from 'node:crypto';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { loadStrategyConstants } from './strategy-optimizer.js';
import { generatePlanParallel, isPlanGenerationActive } from './plan-worker-pool.js';
import { loadCourseHoles } from './hole-loader.js';
import { loadUserClubs } from './club-loader.js';
import type { ScoringMode } from './dp-optimizer.js';
import type { Club, Shot, CourseWithHoles } from '../models/types.js';

// PostgreSQL advisory lock ID for plan regeneration
const REGEN_LOCK_ID = 1337;

// Max concurrent plan regenerations (each plan already uses N parallel workers)
const WORKER_CONCURRENCY = 1;

export async function regenerateStalePlans() {
  // Skip if a user-initiated plan generation is already running (avoid OOM)
  if (isPlanGenerationActive()) return;

  // Acquire advisory lock (non-blocking). Returns false if another instance holds it.
  const { rows: lockRows } = await query('SELECT pg_try_advisory_lock($1) AS acquired', [REGEN_LOCK_ID]);
  if (!lockRows[0].acquired) return;

  const startTime = Date.now();

  try {
    // 1. Query stale plans (including user_id), skip recently regenerated to avoid loops
    const { rows: stalePlans } = await query(
      `SELECT user_id, course_id, tee_box, mode, stale_reason FROM game_plan_cache WHERE stale = TRUE AND (updated_at IS NULL OR updated_at < $1)`,
      [Date.now() - 120_000],
    );
    if (stalePlans.length === 0) return;

    logger.info(`Regenerating ${stalePlans.length} stale plan(s)`, { component: 'plan-regen' });

    // 2. Group stale plans by user_id
    const byUser = new Map<string, typeof stalePlans>();
    for (const row of stalePlans) {
      const userId = row.user_id as string;
      if (!byUser.has(userId)) byUser.set(userId, []);
      byUser.get(userId)!.push(row);
    }

    // 3. For each user, load their clubs/shots once and regenerate all their stale plans
    for (const [userId, userPlans] of byUser) {
      const clubs = await loadUserClubs(userId);

      const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
      const shots = shotRows.map(toCamel<Shot>);

      const constants = await loadStrategyConstants();

      // Pre-load all courses + holes for this user's stale plans
      const courseIds = [...new Set(userPlans.map(r => r.course_id as string))];
      const courseMap = new Map<string, CourseWithHoles>();
      for (const courseId of courseIds) {
        const { rows: courseRows } = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
        if (courseRows.length === 0) continue;
        const course = toCamel<CourseWithHoles>(courseRows[0]);
        course.holes = await loadCourseHoles(courseId);
        if (course.holes.length > 0) courseMap.set(courseId, course);
      }

      // Regenerate plans in parallel batches
      for (let i = 0; i < userPlans.length; i += WORKER_CONCURRENCY) {
        const batch = userPlans.slice(i, i + WORKER_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (row) => {
            const courseId = row.course_id as string;
            const teeBox = row.tee_box as string;
            const mode = row.mode as string;
            const staleReason = row.stale_reason as string | null;
            const course = courseMap.get(courseId);
            if (!course) return;

            const plan = await generatePlanParallel({
              clubs,
              shots,
              course,
              teeBox,
              mode: mode as ScoringMode,
              constants,
            });

            // Upsert game_plan_cache (stale = FALSE)
            const now = Date.now();
            const cacheId = `${userId}_${courseId}_${teeBox}_${mode}`;
            await query(
              `INSERT INTO game_plan_cache (id, course_id, tee_box, mode, plan, stale, stale_reason, user_id, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, FALSE, NULL, $6, $7, $7)
               ON CONFLICT (user_id, course_id, tee_box, mode)
               DO UPDATE SET plan = $5, stale = FALSE, stale_reason = NULL, updated_at = $7`,
              [cacheId, courseId, teeBox, mode, JSON.stringify(plan), userId, now],
            );

            // Insert game_plan_history row
            const historyId = crypto.randomUUID();
            await query(
              `INSERT INTO game_plan_history (id, course_id, tee_box, mode, total_expected, plan, trigger_reason, user_id, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [historyId, courseId, teeBox, mode, plan.totalExpected, JSON.stringify(plan), staleReason, userId, now],
            );

            logger.info(`${course.name} (${teeBox}/${mode}): ${(plan.totalExpected ?? 0).toFixed(1)} xS`, { component: 'plan-regen' });
          }),
        );

        // Log any failures
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result.status === 'rejected') {
            const row = batch[j];
            logger.error(`Failed for ${row.course_id}/${row.tee_box}/${row.mode}`, {
              component: 'plan-regen',
              error: String(result.reason),
            });
          }
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Done in ${elapsed}s`, { component: 'plan-regen' });
  } catch (err) {
    logger.error('Fatal error', { component: 'plan-regen', error: String(err) });
  } finally {
    await query('SELECT pg_advisory_unlock($1)', [REGEN_LOCK_ID]).catch(() => {});
  }
}
