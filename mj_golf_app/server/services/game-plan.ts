import { optimizeHole } from './strategy-optimizer.js';
import type { OptimizedStrategy, ScoreDistribution, StrategyMode } from './strategy-optimizer.js';
import type { ClubDistribution } from './monte-carlo.js';
import type { CourseWithHoles } from '../models/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HolePlan {
  holeNumber: number;
  par: number;
  yardage: number;
  playsLikeYardage: number | null;
  strategy: OptimizedStrategy;
  colorCode: 'green' | 'yellow' | 'red';
}

export interface GamePlan {
  courseName: string;
  teeBox: string;
  mode: StrategyMode;
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
// Generator (server-side — no setTimeout yield, no onProgress)
// ---------------------------------------------------------------------------

export function generateGamePlan(
  course: CourseWithHoles,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: StrategyMode,
): GamePlan {
  const holes: HolePlan[] = [];

  for (let i = 0; i < course.holes.length; i++) {
    const hole = course.holes[i];

    const strategies = optimizeHole(hole, teeBox, distributions, mode);
    const topStrategy = strategies[0];

    if (!topStrategy) continue;

    const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
    const playsLikeYardage = hole.playsLikeYards?.[teeBox] ?? null;

    holes.push({
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage,
      playsLikeYardage,
      strategy: topStrategy,
      colorCode: colorCodeHole(topStrategy),
    });
  }

  // Compute key holes: biggest delta between first and last strategy xS
  const deltas = course.holes.map((hole) => {
    const strats = optimizeHole(hole, teeBox, distributions, mode);
    if (strats.length < 2) return { holeNumber: hole.holeNumber, delta: 0 };
    return {
      holeNumber: hole.holeNumber,
      delta: strats[strats.length - 1].expectedStrokes - strats[0].expectedStrokes,
    };
  });
  deltas.sort((a, b) => b.delta - a.delta);
  const keyHoles = deltas.slice(0, 4).map((d) => d.holeNumber).sort((a, b) => a - b);

  const totalExpected = holes.reduce((sum, h) => sum + h.strategy.expectedStrokes, 0);
  const totalPlaysLike = holes.reduce((sum, h) => sum + (h.playsLikeYardage ?? h.yardage), 0);

  return {
    courseName: course.name,
    teeBox,
    mode,
    date: new Date().toLocaleDateString(),
    totalExpected,
    breakdown: aggregateScoreDistribution(holes),
    keyHoles,
    totalPlaysLike,
    holes,
  };
}
