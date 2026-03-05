/**
 * Worker thread that processes a BATCH of holes (not a full game plan).
 * Used by generatePlanParallel() to split 18 holes across N workers.
 *
 * Input:  { holes: CourseHole[], teeBox: string, distributions: ClubDistribution[], roughPenalty: number }
 * Output: { ok: true, results: Array<{ holeNumber, strategies }> }
 */
import { parentPort } from 'node:worker_threads';
import { dpOptimizeHole } from './dp-optimizer.js';
import { optimizeHole } from './strategy-optimizer.js';

parentPort?.on('message', (msg) => {
  try {
    const { holes, teeBox, distributions, roughPenalty } = msg;
    const results: Array<{ holeNumber: number; strategies: unknown[] }> = [];

    for (const hole of holes) {
      let strategies = dpOptimizeHole(hole, teeBox, distributions, roughPenalty);

      // Fallback to template-based optimizer if DP returns nothing
      if (strategies.length === 0) {
        strategies = optimizeHole(hole, teeBox, distributions, undefined, roughPenalty);
      }

      results.push({ holeNumber: hole.holeNumber, strategies });
    }

    parentPort?.postMessage({ ok: true, results });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: String(err) });
  }
});
