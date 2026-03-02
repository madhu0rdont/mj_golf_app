import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { computeClubShotGroups } from './club-shot-groups.js';
import { buildDistributions } from './monte-carlo.js';
import { generateGamePlan } from './game-plan.js';
import type { Club, Shot, CourseWithHoles, CourseHole } from '../models/types.js';

// PostgreSQL advisory lock ID for plan regeneration
const REGEN_LOCK_ID = 1337;

export async function regenerateStalePlans() {
  // Acquire advisory lock (non-blocking). Returns false if another instance holds it.
  const { rows: lockRows } = await query('SELECT pg_try_advisory_lock($1) AS acquired', [REGEN_LOCK_ID]);
  if (!lockRows[0].acquired) return;

  const startTime = Date.now();

  try {
    // 1. Query stale plans (including user_id)
    const { rows: stalePlans } = await query(
      `SELECT user_id, course_id, tee_box, mode, stale_reason FROM game_plan_cache WHERE stale = TRUE`,
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
      const { rows: clubRows } = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
      const clubs = clubRows.map(toCamel<Club>);

      const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
      const shots = shotRows.map(toCamel<Shot>);

      const groups = computeClubShotGroups(clubs, shots);
      const distributions = buildDistributions(groups);

      if (distributions.length === 0) {
        logger.info(`No distributions for user ${userId}, skipping`, { component: 'plan-regen' });
        continue;
      }

      for (const row of userPlans) {
        const courseId = row.course_id as string;
        const teeBox = row.tee_box as string;
        const mode = row.mode as string;
        const staleReason = row.stale_reason as string | null;

        try {
          // Fetch course + holes
          const { rows: courseRows } = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
          if (courseRows.length === 0) continue;

          const course = toCamel<CourseWithHoles>(courseRows[0]);

          const { rows: holeRows } = await query(
            'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
            [courseId],
          );
          course.holes = holeRows.map(toCamel<CourseHole>);

          if (course.holes.length === 0) continue;

          // Generate plan
          const plan = generateGamePlan(course, teeBox, distributions);

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

          logger.info(`${course.name} (${teeBox}/${mode}): ${plan.totalExpected.toFixed(1)} xS`, { component: 'plan-regen' });
        } catch (err) {
          logger.error(`Failed for ${courseId}/${teeBox}/${mode}`, { component: 'plan-regen', error: String(err) });
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
