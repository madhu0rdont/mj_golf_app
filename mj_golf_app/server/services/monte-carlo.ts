import { mean, stddev } from './stats.js';
import type { ClubShotGroup } from './club-shot-groups.js';

export interface ClubDistribution {
  clubId: string;
  clubName: string;
  meanCarry: number;
  stdCarry: number;
  meanOffline: number;
  stdOffline: number;
}

export interface ApproachStrategy {
  clubs: { clubId: string; clubName: string }[];
  expectedStrokes: number;
  label: string;
  tip?: string;
}

const MIN_SHOTS_FOR_DISTRIBUTION = 3;

/** Log-curve putting model fitted to PGA strokes-gained data. */
export function expectedPutts(distanceYards: number): number {
  if (distanceYards <= 1) return 1.0;
  return Math.min(3, 1.0 + 0.42 * Math.log(distanceYards));
}

/** Simple linear regression: predict y at x from a set of (x, y) points */
export function linearPredict(points: [number, number][], x: number): number {
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const [xi, yi] of points) {
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return sumY / n;
  const b = (n * sumXY - sumX * sumY) / denom;
  const a = (sumY - b * sumX) / n;
  return a + b * x;
}

export function estimateDispersion(
  carry: number,
  realDists: { meanCarry: number; meanOffline: number; stdCarry: number; stdOffline: number }[],
): { meanOffline: number; stdCarry: number; stdOffline: number } {
  if (realDists.length >= 2) {
    return {
      meanOffline: linearPredict(
        realDists.map((d) => [d.meanCarry, d.meanOffline]),
        carry,
      ),
      stdCarry: Math.max(2, linearPredict(
        realDists.map((d) => [d.meanCarry, d.stdCarry]),
        carry,
      )),
      stdOffline: Math.max(2, linearPredict(
        realDists.map((d) => [d.meanCarry, d.stdOffline]),
        carry,
      )),
    };
  }

  return { meanOffline: 0, stdCarry: carry * 0.04, stdOffline: carry * 0.05 };
}

/** Build per-club carry/offline distributions from shot data. */
export function buildDistributions(groups: ClubShotGroup[]): ClubDistribution[] {
  const distributions: ClubDistribution[] = [];
  const realDists: { meanCarry: number; meanOffline: number; stdCarry: number; stdOffline: number }[] = [];

  for (const group of groups) {
    if (group.imputed) continue;
    if (group.shots.length < MIN_SHOTS_FOR_DISTRIBUTION) continue;

    const carries = group.shots.map((s) => s.carryYards);
    const offlines = group.shots
      .map((s) => s.offlineYards)
      .filter((v): v is number => v != null);

    const dist: ClubDistribution = {
      clubId: group.clubId,
      clubName: group.clubName,
      meanCarry: mean(carries),
      stdCarry: stddev(carries),
      meanOffline: offlines.length > 0 ? mean(offlines) : 0,
      stdOffline: offlines.length > 0 ? stddev(offlines) : 5,
    };
    distributions.push(dist);
    realDists.push({ meanCarry: dist.meanCarry, meanOffline: dist.meanOffline, stdCarry: dist.stdCarry, stdOffline: dist.stdOffline });
  }

  for (const group of groups) {
    if (!group.imputed || group.shots.length === 0) continue;
    const carry = group.shots[0].carryYards;
    if (carry <= 0) continue;

    const { meanOffline, stdCarry, stdOffline } = estimateDispersion(carry, realDists);
    distributions.push({
      clubId: group.clubId,
      clubName: group.clubName,
      meanCarry: carry,
      stdCarry,
      meanOffline,
      stdOffline,
    });
  }

  return distributions;
}
