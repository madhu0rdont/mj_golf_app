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

/** Box-Muller transform for Gaussian sampling */
function gaussianSample(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

/** Build per-club carry/offline distributions from raw shot data */
export function buildDistributions(groups: ClubShotGroup[]): ClubDistribution[] {
  const distributions: ClubDistribution[] = [];

  for (const group of groups) {
    if (group.imputed) continue;
    if (group.shots.length < MIN_SHOTS_FOR_DISTRIBUTION) continue;

    const carries = group.shots.map((s) => s.carryYards);
    const offlines = group.shots
      .map((s) => s.offlineYards)
      .filter((v): v is number => v != null);

    distributions.push({
      clubId: group.clubId,
      clubName: group.clubName,
      meanCarry: mean(carries),
      stdCarry: stddev(carries),
      meanOffline: offlines.length > 0 ? mean(offlines) : 0,
      stdOffline: offlines.length > 0 ? stddev(offlines) : 5, // default 5 yd if no data
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
      if (trueRemaining <= HOLE_THRESHOLD) break;
    }

    // Greedy continuation if not on the green yet
    while (trueRemaining > HOLE_THRESHOLD && strokes < MAX_SHOTS_PER_HOLE) {
      const club = greedyClub(trueRemaining, allClubs);
      const carry = gaussianSample(club.meanCarry, club.stdCarry);
      const offline = gaussianSample(club.meanOffline, club.stdOffline);
      const forward = trueRemaining - carry;
      trueRemaining = Math.sqrt(forward ** 2 + offline ** 2);
      strokes++;
    }

    totalStrokes += strokes + 2; // +2 putts
  }

  return totalStrokes / trials;
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
    // 1-club plans
    for (const c of clubs) {
      if (Math.abs(c.meanCarry - distance) < 40) {
        candidates.push({
          plan: [c],
          label: c.clubName,
        });
      }
    }
  } else if (distance <= 425) {
    // 2-club plans
    for (const c1 of clubs) {
      if (c1.meanCarry >= distance) continue;
      for (const c2 of clubs) {
        const sumCarry = c1.meanCarry + c2.meanCarry;
        if (Math.abs(sumCarry - distance) < 60) {
          candidates.push({
            plan: [c1, c2],
            label: `${c1.clubName} → ${c2.clubName}`,
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
          candidates.push({
            plan: [c1, c2],
            label: `${c1.clubName} → ${c2.clubName}`,
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
            candidates.push({
              plan: [c1, c2, c3],
              label: `${c1.clubName} → ${c2.clubName} → ${c3.clubName}`,
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
