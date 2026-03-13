/**
 * Worker thread that processes a BATCH of holes (not a full game plan).
 * Used by generatePlanParallel() to split 18 holes across N workers.
 *
 * Input:  { holes: CourseHole[], teeBox: string, distributions: ClubDistribution[], constants: StrategyConstants }
 * Output: { ok: true, results: Array<{ holeNumber, strategies }> }
 */
import { parentPort } from 'node:worker_threads';
import { dpOptimizeHole } from './dp-optimizer.js';

parentPort?.on('message', (msg) => {
  try {
    const { holes, teeBox, distributions, constants } = msg;
    const results: Array<{ holeNumber: number; strategies: unknown[] }> = [];

    for (const hole of holes) {
      const strategies = dpOptimizeHole(hole, teeBox, distributions, constants);
      results.push({ holeNumber: hole.holeNumber, strategies });

      // Report per-hole progress
      parentPort?.postMessage({ type: 'progress', holeNumber: hole.holeNumber });
    }

    parentPort?.postMessage({ type: 'done', ok: true, results });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: String(err) });
  }
});
