import { mean, stddev } from './stats';
import type { ClubShotGroup } from '../hooks/useYardageBook';

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
}

const MIN_SHOTS_FOR_DISTRIBUTION = 3;
const HOLE_THRESHOLD = 10; // yards — within this = on the green
const MAX_SHOTS_PER_HOLE = 8; // safety cap
const DEFAULT_TRIALS = 2000;
const GRIP_DOWN_YDS_PER_INCH = 5;
const MAX_GRIP_DOWN_INCHES = 3;

/** Box-Muller transform for Gaussian sampling */
function gaussianSample(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

/** Simple linear regression: predict y at x from a set of (x, y) points */
function linearPredict(points: [number, number][], x: number): number {
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

/** Estimate carry and offline dispersion for a club at the given carry distance.
 *  Uses linear extrapolation from real clubs when available, otherwise a default CoV. */
function estimateDispersion(
  carry: number,
  realDists: { meanCarry: number; stdCarry: number; stdOffline: number }[],
): { stdCarry: number; stdOffline: number } {
  if (realDists.length >= 2) {
    return {
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

  // Fallback: 4% CoV for carry, 5% for offline
  return { stdCarry: carry * 0.04, stdOffline: carry * 0.05 };
}

/** Build per-club carry/offline distributions from shot data.
 *  Clubs with 3+ real shots use measured dispersion.
 *  Imputed clubs (manual carry, no shots) get dispersion extrapolated
 *  from real clubs via linear regression. */
export function buildDistributions(groups: ClubShotGroup[]): ClubDistribution[] {
  const distributions: ClubDistribution[] = [];
  const realDists: { meanCarry: number; stdCarry: number; stdOffline: number }[] = [];

  // First pass: clubs with real shot data
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
    realDists.push({ meanCarry: dist.meanCarry, stdCarry: dist.stdCarry, stdOffline: dist.stdOffline });
  }

  // Second pass: imputed clubs — estimate dispersion from real clubs' trend
  for (const group of groups) {
    if (!group.imputed || group.shots.length === 0) continue;
    const carry = group.shots[0].carryYards;
    if (carry <= 0) continue;

    const { stdCarry, stdOffline } = estimateDispersion(carry, realDists);
    distributions.push({
      clubId: group.clubId,
      clubName: group.clubName,
      meanCarry: carry,
      stdCarry,
      meanOffline: 0,
      stdOffline,
    });
  }

  return distributions;
}

/** Pick the club whose meanCarry is closest to the target distance */
function greedyClub(target: number, clubs: ClubDistribution[]): ClubDistribution {
  let best = clubs[0];
  let bestDiff = Math.abs(clubs[0].meanCarry - target);
  for (let i = 1; i < clubs.length; i++) {
    const diff = Math.abs(clubs[i].meanCarry - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = clubs[i];
    }
  }
  return best;
}

/** Simulate a planned club sequence over N trials, return mean strokes (including 2 putts) */
function simulateStrategy(
  distance: number,
  plan: ClubDistribution[],
  allClubs: ClubDistribution[],
  trials: number,
): number {
  // Below this distance, assume a chip-on in 1 stroke instead of simulating
  // full-swing clubs that would wildly overshoot and oscillate.
  const minClubCarry = Math.min(...allClubs.map((c) => c.meanCarry));
  const chipThreshold = Math.max(HOLE_THRESHOLD, minClubCarry * 0.5);

  let totalStrokes = 0;

  for (let t = 0; t < trials; t++) {
    let trueRemaining = distance;
    let strokes = 0;

    // Fire planned clubs
    for (const club of plan) {
      const carry = gaussianSample(club.meanCarry, club.stdCarry);
      const offline = gaussianSample(club.meanOffline, club.stdOffline);
      const forward = trueRemaining - carry;
      trueRemaining = Math.sqrt(forward ** 2 + offline ** 2);
      strokes++;
      if (trueRemaining <= chipThreshold) break;
    }

    // Greedy continuation if not on the green yet
    while (trueRemaining > chipThreshold && strokes < MAX_SHOTS_PER_HOLE) {
      const club = greedyClub(trueRemaining, allClubs);
      const carry = gaussianSample(club.meanCarry, club.stdCarry);
      const offline = gaussianSample(club.meanOffline, club.stdOffline);
      const forward = trueRemaining - carry;
      trueRemaining = Math.sqrt(forward ** 2 + offline ** 2);
      strokes++;
    }

    // If we stopped in chip range (> 10 yds but < chipThreshold), add 1 chip stroke
    if (trueRemaining > HOLE_THRESHOLD && trueRemaining <= chipThreshold) {
      strokes++;
    }

    totalStrokes += strokes + 2; // +2 putts
  }

  return totalStrokes / trials;
}

/** Compact label: "6 Iron (188)" */
function clubLabel(c: ClubDistribution): string {
  return `${c.clubName} (${Math.round(c.meanCarry)})`;
}

/** Verbose approach label with grip-down advice when the club overshoots the target */
function approachLabel(c: ClubDistribution, targetYards: number): string {
  const fullCarry = Math.round(c.meanCarry);
  const overshoot = c.meanCarry - targetYards;

  if (overshoot >= GRIP_DOWN_YDS_PER_INCH * 0.5) {
    const inches = Math.min(MAX_GRIP_DOWN_INCHES, Math.round(overshoot / GRIP_DOWN_YDS_PER_INCH));
    if (inches > 0) {
      const adjusted = fullCarry - inches * GRIP_DOWN_YDS_PER_INCH;
      return `${c.clubName} (Full = ${fullCarry}), Grip ${inches}" down for ${adjusted}y`;
    }
  }

  return `${c.clubName} (Full = ${fullCarry})`;
}

/** Find the best multi-club approach strategies for a given distance */
export function findBestApproaches(
  distance: number,
  clubs: ClubDistribution[],
  trials: number = DEFAULT_TRIALS,
): ApproachStrategy[] {
  if (clubs.length === 0) return [];

  const candidates: { plan: ClubDistribution[]; label: string }[] = [];

  // Plan depth based on distance:
  // ≤ 225 yds → 1-club plans (par-3 approach)
  // 226 – 425 yds → 2-club plans (par-4 approach)
  // > 425 yds → 2-club AND 3-club plans (par-5 approach)
  if (distance <= 225) {
    // 1-club plans — approach label with grip-down advice
    for (const c of clubs) {
      if (Math.abs(c.meanCarry - distance) < 40) {
        candidates.push({
          plan: [c],
          label: approachLabel(c, distance),
        });
      }
    }
  } else if (distance <= 425) {
    // 2-club plans — last club gets approach label
    for (const c1 of clubs) {
      if (c1.meanCarry >= distance) continue;
      for (const c2 of clubs) {
        const sumCarry = c1.meanCarry + c2.meanCarry;
        if (Math.abs(sumCarry - distance) < 60) {
          const remainder = distance - c1.meanCarry;
          candidates.push({
            plan: [c1, c2],
            label: `${clubLabel(c1)} → ${approachLabel(c2, remainder)}`,
          });
        }
      }
    }
  } else {
    // Par 5 range: 2-club plans (aggressive) + 3-club plans (layup)
    for (const c1 of clubs) {
      if (c1.meanCarry >= distance) continue;

      // 2-club plans (go for it in two)
      for (const c2 of clubs) {
        const sum2 = c1.meanCarry + c2.meanCarry;
        if (Math.abs(sum2 - distance) < 80) {
          const remainder = distance - c1.meanCarry;
          candidates.push({
            plan: [c1, c2],
            label: `${clubLabel(c1)} → ${approachLabel(c2, remainder)}`,
          });
        }
      }

      // 3-club plans (layup strategy)
      for (const c2 of clubs) {
        const sum12 = c1.meanCarry + c2.meanCarry;
        if (sum12 >= distance) continue; // first two shouldn't overshoot
        for (const c3 of clubs) {
          const sum3 = sum12 + c3.meanCarry;
          if (Math.abs(sum3 - distance) < 80) {
            const remainder = distance - sum12;
            candidates.push({
              plan: [c1, c2, c3],
              label: `${clubLabel(c1)} → ${clubLabel(c2)} → ${approachLabel(c3, remainder)}`,
            });
          }
        }
      }
    }
  }

  if (candidates.length === 0) return [];

  // Scale down trials if candidate count is large to keep total work bounded
  const maxWork = 400_000; // target ceiling: 400k total simulations
  const effectiveTrials = Math.max(500, Math.min(trials, Math.floor(maxWork / candidates.length)));

  // Simulate each candidate
  const results: ApproachStrategy[] = candidates.map(({ plan, label }) => ({
    clubs: plan.map((c) => ({ clubId: c.clubId, clubName: c.clubName })),
    expectedStrokes: simulateStrategy(distance, plan, clubs, effectiveTrials),
    label,
  }));

  // Sort by expected strokes ascending, return top 3
  results.sort((a, b) => a.expectedStrokes - b.expectedStrokes);
  return results.slice(0, 3);
}
