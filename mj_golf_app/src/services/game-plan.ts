import { optimizeHole } from './strategy-optimizer';
import type { OptimizedStrategy, ScoreDistribution, StrategyMode } from './strategy-optimizer';
import type { ClubDistribution } from './monte-carlo';
import type { CourseWithHoles, CourseHole } from '../models/course';
import { haversineYards, bearingBetween } from '../utils/geo';

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
  carryToAvoid: number | null;
  missSide: string | null;
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

function computeCarryToAvoid(hole: CourseHole): number | null {
  if (hole.hazards.length === 0) return null;

  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };

  // Find the nearest hazard's closest point distance from the tee
  let minCarry = Infinity;
  for (const h of hole.hazards) {
    if (h.type === 'trees') continue; // skip tree lines
    for (const p of h.polygon) {
      const d = haversineYards(tee, p);
      if (d < minCarry) minCarry = d;
    }
  }
  return minCarry < Infinity ? Math.round(minCarry) : null;
}

function computeMissSide(hole: CourseHole): string | null {
  if (hole.hazards.length === 0) return null;

  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const holeHeading = hole.heading;

  // Determine which side has more hazards
  let leftCount = 0;
  let rightCount = 0;

  for (const h of hole.hazards) {
    if (h.polygon.length < 3) continue;
    const centroid = {
      lat: h.polygon.reduce((s, p) => s + p.lat, 0) / h.polygon.length,
      lng: h.polygon.reduce((s, p) => s + p.lng, 0) / h.polygon.length,
    };
    const bearing = bearingBetween(tee, centroid);
    const relativeBearing = ((bearing - holeHeading + 360) % 360);
    if (relativeBearing > 0 && relativeBearing < 180) {
      rightCount++;
    } else {
      leftCount++;
    }
  }

  if (leftCount > rightCount) return 'Favor right';
  if (rightCount > leftCount) return 'Favor left';
  return null;
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
// Generator
// ---------------------------------------------------------------------------

export async function generateGamePlan(
  course: CourseWithHoles,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: StrategyMode,
  onProgress?: (current: number, total: number) => void,
): Promise<GamePlan> {
  const holes: HolePlan[] = [];
  const total = course.holes.length;

  for (let i = 0; i < total; i++) {
    const hole = course.holes[i];
    onProgress?.(i + 1, total);

    // Yield to UI
    await new Promise((r) => setTimeout(r, 0));

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
      carryToAvoid: computeCarryToAvoid(hole),
      missSide: computeMissSide(hole),
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
  const keyHoles = deltas.slice(0, 4).map((d) => d.holeNumber);

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
