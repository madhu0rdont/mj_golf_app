/**
 * Worker thread entry point for CPU-intensive game plan generation.
 * Runs computeClubShotGroups → buildDistributions → generateGamePlan
 * off the main event loop so HTTP requests remain responsive.
 */
import { parentPort } from 'node:worker_threads';
import { computeClubShotGroups } from './club-shot-groups.js';
import { buildDistributions } from './monte-carlo.js';
import { generateGamePlan } from './game-plan.js';
import type { ScoringMode } from './dp-optimizer.js';

parentPort?.on('message', (msg) => {
  try {
    const { clubs, shots, course, teeBox, mode, constants } = msg;
    const groups = computeClubShotGroups(clubs, shots);
    const distributions = buildDistributions(groups);
    if (distributions.length === 0) {
      parentPort?.postMessage({ ok: false, error: 'No distributions' });
      return;
    }
    const plan = generateGamePlan(course, teeBox, distributions, mode as ScoringMode, constants);
    parentPort?.postMessage({ ok: true, plan });
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: String(err) });
  }
});
