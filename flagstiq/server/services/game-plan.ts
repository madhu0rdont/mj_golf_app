import type { OptimizedStrategy, ScoreDistribution } from './strategy-optimizer.js';
import { dpOptimizeHole } from './dp-optimizer.js';
import type { ScoringMode } from './dp-optimizer.js';
import type { ClubDistribution } from './monte-carlo.js';
import type { CourseWithHoles, StrategyConstants } from '../models/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HolePlan {
  holeNumber: number;
  par: number;
  yardage: number;
  playsLikeYardage: number | null;
  strategy: OptimizedStrategy;
  allStrategies: OptimizedStrategy[];   // all 3 modes [scoring, safe, aggressive]
  colorCode: 'green' | 'yellow' | 'red';
}

export interface GamePlan {
  courseName: string;
  teeBox: string;
  date: string;
  totalExpected: number;
  breakdown: ScoreDistribution;
  keyHoles: number[];
  totalPlaysLike: number;
  holes: HolePlan[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colorCodeHole(strategy: OptimizedStrategy): 'green' | 'yellow' | 'red' {
  if (strategy.scoreDistribution.birdie > 0.15) return 'green';
  if (strategy.blowupRisk > 0.20) return 'red';
  return 'yellow';
}

function aggregateScoreDistribution(holes: HolePlan[]): ScoreDistribution {
  const agg: ScoreDistribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 };
  if (holes.length === 0) return agg;
  for (const h of holes) {
    agg.eagle += h.strategy.scoreDistribution.eagle;
    agg.birdie += h.strategy.scoreDistribution.birdie;
    agg.par += h.strategy.scoreDistribution.par;
    agg.bogey += h.strategy.scoreDistribution.bogey;
    agg.double += h.strategy.scoreDistribution.double;
    agg.worse += h.strategy.scoreDistribution.worse;
  }
  const n = holes.length;
  agg.eagle /= n;
  agg.birdie /= n;
  agg.par /= n;
  agg.bogey /= n;
  agg.double /= n;
  agg.worse /= n;
  return agg;
}

// ---------------------------------------------------------------------------
// Assembly — builds GamePlan from pre-computed per-hole strategies
// ---------------------------------------------------------------------------

/** Mode index mapping: scoring=0, safe=1, aggressive=2 (order from dpOptimizeHole) */
const MODE_INDEX: Record<ScoringMode, number> = { scoring: 0, safe: 1, aggressive: 2 };

/**
 * Assemble a GamePlan from pre-computed strategies per hole.
 * Used by both the sequential `generateGamePlan` and the parallel worker pool.
 */
export function assembleGamePlan(
  course: CourseWithHoles,
  teeBox: string,
  mode: ScoringMode,
  holeStrategies: Map<number, OptimizedStrategy[]>,
): GamePlan {
  const holes: HolePlan[] = [];

  for (const hole of course.holes) {
    const strategies = holeStrategies.get(hole.holeNumber);
    if (!strategies || strategies.length === 0) continue;

    const modeIdx = MODE_INDEX[mode];
    const strategy = strategies[modeIdx] ?? strategies[0];

    const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
    const playsLikeYardage = hole.playsLikeYards?.[teeBox] ?? null;

    holes.push({
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage,
      playsLikeYardage,
      strategy,
      allStrategies: strategies,
      colorCode: colorCodeHole(strategy),
    });
  }

  // Key holes: biggest delta between scoring (idx 0) and safe (idx 1) expected strokes
  const deltas = course.holes.map((hole) => {
    const strats = holeStrategies.get(hole.holeNumber) ?? [];
    if (strats.length < 2) return { holeNumber: hole.holeNumber, delta: 0 };
    return {
      holeNumber: hole.holeNumber,
      delta: Math.abs(strats[1].expectedStrokes - strats[0].expectedStrokes),
    };
  });
  deltas.sort((a, b) => b.delta - a.delta);
  const keyHoles = deltas.slice(0, 4).map((d) => d.holeNumber).sort((a, b) => a - b);

  const rawTotal = holes.reduce((sum, h) => sum + h.strategy.expectedStrokes, 0);
  const totalExpected = Number.isFinite(rawTotal) ? rawTotal : holes.reduce((sum, h) => sum + h.par, 0);
  const totalPlaysLike = holes.reduce((sum, h) => sum + (h.playsLikeYardage ?? h.yardage), 0);

  return {
    courseName: course.name,
    teeBox,
    date: new Date().toLocaleDateString(),
    totalExpected,
    breakdown: aggregateScoreDistribution(holes),
    keyHoles,
    totalPlaysLike,
    holes,
  };
}

// ---------------------------------------------------------------------------
// Generator (server-side — sequential, used by single-worker path)
// ---------------------------------------------------------------------------

export function generateGamePlan(
  course: CourseWithHoles,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: ScoringMode = 'scoring',
  constants?: StrategyConstants,
): GamePlan {
  const allStrategies = new Map<number, OptimizedStrategy[]>();

  for (const hole of course.holes) {
    const strategies = dpOptimizeHole(hole, teeBox, distributions, constants);
    allStrategies.set(hole.holeNumber, strategies);
  }

  return assembleGamePlan(course, teeBox, mode, allStrategies);
}
