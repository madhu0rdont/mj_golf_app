/**
 * Runs game plan generation in worker threads so the main event loop
 * stays free for HTTP requests.
 *
 * - generatePlanInWorker()   — single worker, sequential holes (legacy)
 * - generatePlanParallel()   — splits holes across N workers for ~Nx speedup
 */
import { Worker } from 'node:worker_threads';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { logger } from '../logger.js';
import { computeClubShotGroups } from './club-shot-groups.js';
import { buildDistributions } from './monte-carlo.js';
import { assembleGamePlan } from './game-plan.js';
import type { GamePlan } from './game-plan.js';
import type { OptimizedStrategy } from './strategy-optimizer.js';
import type { Club, Shot, CourseWithHoles, CourseHole, StrategyConstants } from '../models/types.js';
import type { ScoringMode } from './dp-optimizer.js';
import type { ClubDistribution } from './monte-carlo.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, 'generate-plan-worker.js');
const HOLES_WORKER_SCRIPT = join(__dirname, 'generate-holes-worker.js');

/** Max parallel workers for hole-level parallelism */
const MAX_WORKERS = 2;
const WORKER_COUNT = Math.min(availableParallelism(), MAX_WORKERS);

/** Semaphore: only one plan generation at a time to avoid OOM */
let planGenerationActive = false;
export function isPlanGenerationActive() { return planGenerationActive; }

// ---------------------------------------------------------------------------
// Single-worker path (legacy — used by generate-plan-worker for sequential)
// ---------------------------------------------------------------------------

export interface PlanWorkerInput {
  clubs: Club[];
  shots: Shot[];
  course: CourseWithHoles;
  teeBox: string;
  mode: ScoringMode;
  roughPenalty: number;
  constants?: StrategyConstants;
}

export function generatePlanInWorker(input: PlanWorkerInput): Promise<GamePlan> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT);

    worker.on('message', (msg: { ok: boolean; plan?: GamePlan; error?: string }) => {
      worker.terminate();
      if (msg.ok && msg.plan) {
        resolve(msg.plan);
      } else {
        reject(new Error(msg.error ?? 'Worker failed'));
      }
    });

    worker.on('error', (err) => {
      logger.error('Plan worker crashed', { error: String(err) });
      worker.terminate();
      reject(err);
    });

    worker.postMessage(input);
  });
}

// ---------------------------------------------------------------------------
// Parallel path — splits holes across N workers
// ---------------------------------------------------------------------------

interface HoleResult {
  holeNumber: number;
  strategies: OptimizedStrategy[];
}

function runHolesWorker(
  holes: CourseHole[],
  teeBox: string,
  distributions: ClubDistribution[],
  roughPenalty: number,
  constants?: StrategyConstants,
  onProgress?: (holeNumber: number) => void,
): Promise<HoleResult[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(HOLES_WORKER_SCRIPT);

    worker.on('message', (msg: { type?: string; ok?: boolean; results?: HoleResult[]; error?: string; holeNumber?: number }) => {
      if (msg.type === 'progress') {
        onProgress?.(msg.holeNumber!);
        return;
      }
      worker.terminate();
      if (msg.ok && msg.results) {
        resolve(msg.results);
      } else {
        reject(new Error(msg.error ?? 'Holes worker failed'));
      }
    });

    worker.on('error', (err) => {
      logger.error('Holes worker crashed', { error: String(err) });
      worker.terminate();
      reject(err);
    });

    worker.postMessage({ holes, teeBox, distributions, roughPenalty, constants });
  });
}

/**
 * Generate a game plan by splitting holes across multiple worker threads.
 * Computes club distributions once, then fans out hole batches in parallel.
 */
export async function generatePlanParallel(
  input: PlanWorkerInput,
  onProgress?: (completed: number, total: number) => void,
): Promise<GamePlan> {
  // Wait for any running plan generation to finish (prevents OOM from concurrent workers)
  while (planGenerationActive) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  planGenerationActive = true;

  try {
    return await _generatePlanParallelInner(input, onProgress);
  } finally {
    planGenerationActive = false;
  }
}

async function _generatePlanParallelInner(
  input: PlanWorkerInput,
  onProgress?: (completed: number, total: number) => void,
): Promise<GamePlan> {
  const { clubs, shots, course, teeBox, mode, roughPenalty, constants } = input;

  // 1. Compute distributions once on main thread (fast, ~50ms)
  const groups = computeClubShotGroups(clubs, shots);
  const distributions = buildDistributions(groups);
  if (distributions.length === 0) {
    throw new Error('No distributions — not enough shot data');
  }

  const holes = course.holes;
  const workerCount = Math.min(WORKER_COUNT, holes.length);

  logger.info(`Parallel plan: ${holes.length} holes across ${workerCount} workers`, {
    component: 'plan-parallel',
  });
  const startTime = Date.now();

  // 2. Split holes into batches (round-robin for even load)
  const batches: CourseHole[][] = Array.from({ length: workerCount }, () => []);
  for (let i = 0; i < holes.length; i++) {
    batches[i % workerCount].push(holes[i]);
  }

  // 3. Spawn workers in parallel, tracking per-hole progress
  let completed = 0;
  const handleHoleProgress = onProgress
    ? () => { completed++; onProgress(completed, holes.length); }
    : undefined;

  const batchResults = await Promise.all(
    batches.map((batch) => runHolesWorker(batch, teeBox, distributions, roughPenalty, constants, handleHoleProgress)),
  );

  // 4. Merge results into a single map
  const holeStrategies = new Map<number, OptimizedStrategy[]>();
  for (const results of batchResults) {
    for (const { holeNumber, strategies } of results) {
      holeStrategies.set(holeNumber, strategies);
    }
  }

  // 5. Assemble the GamePlan
  const plan = assembleGamePlan(course, teeBox, mode, holeStrategies);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info(`Parallel plan complete: ${plan.totalExpected.toFixed(1)} xS in ${elapsed}s`, {
    component: 'plan-parallel',
  });

  return plan;
}
