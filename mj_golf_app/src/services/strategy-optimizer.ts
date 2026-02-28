import { buildDistributions, expectedPutts } from './monte-carlo';
import type { ClubDistribution, ApproachStrategy } from './monte-carlo';
import type { CourseHole, HazardFeature } from '../models/course';
import { projectPoint, haversineYards, pointInPolygon, bearingBetween } from '../utils/geo';

// Re-export for convenience
export { buildDistributions };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScoreDistribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  worse: number;
}

export interface AimPoint {
  position: { lat: number; lng: number };
  clubName: string;
  shotNumber: number;
  carry: number; // meanCarry in yards
  carryNote: string | null; // e.g. "clears bunker +20y"
}

export interface OptimizedStrategy extends ApproachStrategy {
  strategyName: string;
  strategyType: 'scoring' | 'safe' | 'balanced';
  scoreDistribution: ScoreDistribution;
  blowupRisk: number; // P(double bogey or worse), 0-1
  aimPoints: AimPoint[];
}

export type StrategyMode = 'scoring' | 'safe';

/** Internal plan used to drive GPS simulation */
export interface NamedStrategyPlan {
  name: string;
  type: 'scoring' | 'safe' | 'balanced';
  shots: {
    clubDist: ClubDistribution;
    aimPoint: { lat: number; lng: number };
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOLE_THRESHOLD = 10; // yards — within this = on the green
const MAX_SHOTS_PER_HOLE = 8;
const DEFAULT_TRIALS = 2000;
const MIN_HAZARD_POINTS = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Box-Muller Gaussian sample (duplicated from monte-carlo to keep that file untouched) */
function gaussianSample(mu: number, sigma: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
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

// ---------------------------------------------------------------------------
// Hazard Checking
// ---------------------------------------------------------------------------

export function checkHazards(
  point: { lat: number; lng: number },
  hazards: HazardFeature[],
): { inHazard: boolean; penalty: number; hazardType: string | null } {
  for (const h of hazards) {
    if (h.polygon.length < MIN_HAZARD_POINTS) continue;
    if (pointInPolygon(point, h.polygon)) {
      return { inHazard: true, penalty: h.penalty, hazardType: h.type };
    }
  }
  return { inHazard: false, penalty: 0, hazardType: null };
}

// ---------------------------------------------------------------------------
// Score Distribution
// ---------------------------------------------------------------------------

export function computeScoreDistribution(scores: number[], par: number): ScoreDistribution {
  const dist: ScoreDistribution = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, worse: 0 };
  if (scores.length === 0) return dist;
  const n = scores.length;

  for (const s of scores) {
    const diff = Math.round(s) - par;
    if (diff <= -2) dist.eagle++;
    else if (diff === -1) dist.birdie++;
    else if (diff === 0) dist.par++;
    else if (diff === 1) dist.bogey++;
    else if (diff === 2) dist.double++;
    else dist.worse++;
  }

  dist.eagle /= n;
  dist.birdie /= n;
  dist.par /= n;
  dist.bogey /= n;
  dist.double /= n;
  dist.worse /= n;
  return dist;
}

// ---------------------------------------------------------------------------
// Named Strategy Generation
// ---------------------------------------------------------------------------

/** Midpoint of a polygon (centroid approximation) */
function polygonCentroid(poly: { lat: number; lng: number }[]): { lat: number; lng: number } {
  let lat = 0, lng = 0;
  for (const p of poly) { lat += p.lat; lng += p.lng; }
  return { lat: lat / poly.length, lng: lng / poly.length };
}

/** Find the club whose meanCarry is closest to target */
function closestClub(target: number, dists: ClubDistribution[]): ClubDistribution | undefined {
  if (dists.length === 0) return undefined;
  let best = dists[0];
  let bestDiff = Math.abs(dists[0].meanCarry - target);
  for (let i = 1; i < dists.length; i++) {
    const diff = Math.abs(dists[i].meanCarry - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = dists[i];
    }
  }
  return best;
}

/** Longest club available */
function longestClub(dists: ClubDistribution[]): ClubDistribution {
  return dists.reduce((a, b) => (b.meanCarry > a.meanCarry ? b : a), dists[0]);
}

/** Shortest club available */
function shortestClub(dists: ClubDistribution[]): ClubDistribution {
  return dists.reduce((a, b) => (b.meanCarry < a.meanCarry ? b : a), dists[0]);
}

/** Shift a point toward another by `yards` along the bearing between them */
function shiftToward(
  from: { lat: number; lng: number },
  toward: { lat: number; lng: number },
  yards: number,
): { lat: number; lng: number } {
  const brng = bearingBetween(from, toward);
  return projectPoint(from, brng, yards);
}

/** Offset aim point to compensate for the player's lateral bias.
 *  If meanOffline is +8 (misses right), shift aim 8y left so expected
 *  landing ends up on the intended target. Works for any handedness. */
function compensateForBias(
  target: { lat: number; lng: number },
  shotBearing: number,
  club: ClubDistribution,
): { lat: number; lng: number } {
  if (Math.abs(club.meanOffline) <= 0.5) return target;
  return projectPoint(target, shotBearing + 90, -club.meanOffline);
}

/** Find the point along the center line at a given distance from the start.
 *  Falls back to projecting along fallbackBearing if center line is too short. */
function centerLinePoint(
  centerLine: { lat: number; lng: number }[],
  from: { lat: number; lng: number },
  targetDist: number,
  fallbackBearing: number,
): { lat: number; lng: number } {
  if (centerLine.length < 2) {
    return projectPoint(from, fallbackBearing, targetDist);
  }

  let cumDist = 0;
  let prev = centerLine[0];
  for (let i = 1; i < centerLine.length; i++) {
    const segDist = haversineYards(prev, centerLine[i]);
    if (cumDist + segDist >= targetDist) {
      // Interpolate along this segment
      const remaining = targetDist - cumDist;
      const fraction = segDist > 0 ? remaining / segDist : 0;
      return {
        lat: prev.lat + (centerLine[i].lat - prev.lat) * fraction,
        lng: prev.lng + (centerLine[i].lng - prev.lng) * fraction,
      };
    }
    cumDist += segDist;
    prev = centerLine[i];
  }

  // Past the end of center line — project from the last point toward the pin
  return projectPoint(prev, fallbackBearing, targetDist - cumDist);
}

/** Nudge a target away from hazards. Tries small perpendicular shifts
 *  if the target sits inside a hazard polygon. */
function findSafeLanding(
  target: { lat: number; lng: number },
  heading: number,
  hazards: HazardFeature[],
): { lat: number; lng: number } {
  if (hazards.length === 0 || !checkHazards(target, hazards).inHazard) return target;
  for (const dir of [-1, 1]) {
    for (const offset of [10, 20, 30]) {
      const shifted = projectPoint(target, heading + 90, dir * offset);
      if (!checkHazards(shifted, hazards).inHazard) return shifted;
    }
  }
  return target;
}

const HAZARD_SHORT: Record<string, string> = {
  fairway_bunker: 'bunker',
  greenside_bunker: 'bunker',
  bunker: 'bunker',
  water: 'water',
  ob: 'OB',
  trees: 'trees',
  rough: 'rough',
};

/** Find the most relevant hazard along the shot path and describe clearance. */
function computeCarryNote(
  from: { lat: number; lng: number },
  carry: number,
  bearing: number,
  hazards: HazardFeature[],
): string | null {
  let bestNote: string | null = null;
  let bestDist = 0;

  for (const h of hazards) {
    if (h.polygon.length < MIN_HAZARD_POINTS) continue;
    const centroid = polygonCentroid(h.polygon);
    const dist = haversineYards(from, centroid);

    // Skip hazards too far, too close, or behind us
    if (dist > carry + 50 || dist < 20) continue;

    // Check if hazard is roughly along the bearing (within ±35°)
    const hazBearing = bearingBetween(from, centroid);
    let angleDiff = Math.abs(hazBearing - bearing);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    if (angleDiff > 35) continue;

    // Keep the farthest in-path hazard
    if (dist > bestDist) {
      bestDist = dist;
      const label = HAZARD_SHORT[h.type] ?? h.type;
      const clearance = Math.round(carry - dist);
      if (clearance >= 0) {
        bestNote = `+${clearance}y past ${label}`;
      } else {
        bestNote = `${clearance}y short of ${label}`;
      }
    }
  }

  return bestNote;
}

/** Project expected landing position including lateral bias */
function expectedLanding(
  from: { lat: number; lng: number },
  shotBearing: number,
  club: ClubDistribution,
): { lat: number; lng: number } {
  let landing = projectPoint(from, shotBearing, club.meanCarry);
  if (Math.abs(club.meanOffline) > 0.5) {
    landing = projectPoint(landing, shotBearing + 90, club.meanOffline);
  }
  return landing;
}

export function generateNamedStrategies(
  hole: CourseHole,
  teeBox: string,
  distributions: ClubDistribution[],
): NamedStrategyPlan[] {
  if (distributions.length === 0) return [];

  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const distance = hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  if (distance === 0) return [];

  const heading = bearingBetween(tee, pin);
  const cl = hole.centerLine ?? [];
  const plans: NamedStrategyPlan[] = [];

  if (hole.par === 3) {
    // --- Par 3: Pin Hunting, Center Green, Bail Out ---
    const pinClub = closestClub(distance, distributions);
    if (!pinClub) return [];

    // Pin Hunting: aim directly at pin
    plans.push({
      name: 'Pin Hunting',
      type: 'scoring',
      shots: [{ clubDist: pinClub, aimPoint: pin }],
    });

    // Center Green: aim at midpoint between tee projection and pin (green center proxy)
    const greenCenter = hole.fairway.length >= 3
      ? polygonCentroid(hole.fairway)
      : projectPoint(tee, heading, distance);
    const centerClub = closestClub(haversineYards(tee, greenCenter), distributions);
    if (centerClub) {
      plans.push({
        name: 'Center Green',
        type: 'balanced',
        shots: [{ clubDist: centerClub, aimPoint: greenCenter }],
      });
    }

    // Bail Out: aim away from worst hazard (shift 15y perpendicular from pin, away from nearest hazard)
    let bailPoint = projectPoint(pin, heading + 90, 15);
    if (hole.hazards.length > 0) {
      // Find nearest hazard centroid to pin and bail opposite
      let nearestDist = Infinity;
      let nearestBearing = heading + 90;
      for (const h of hole.hazards) {
        if (h.polygon.length < MIN_HAZARD_POINTS) continue;
        const hc = polygonCentroid(h.polygon);
        const d = haversineYards(pin, hc);
        if (d < nearestDist) {
          nearestDist = d;
          nearestBearing = bearingBetween(pin, hc);
        }
      }
      // Bail opposite direction
      bailPoint = projectPoint(pin, nearestBearing + 180, 15);
    }
    const bailClub = closestClub(haversineYards(tee, bailPoint), distributions);
    if (bailClub) {
      plans.push({
        name: 'Bail Out',
        type: 'safe',
        shots: [{ clubDist: bailClub, aimPoint: bailPoint }],
      });
    }
  } else if (hole.par === 4) {
    // --- Par 4: Conservative, Aggressive, Layup ---
    const longest = longestClub(distributions);

    // Conservative: aim at target[0] if available, else project along heading
    const conservTarget = findSafeLanding(
      hole.targets.length > 0
        ? { lat: hole.targets[0].coordinate.lat, lng: hole.targets[0].coordinate.lng }
        : centerLinePoint(cl, tee, longest.meanCarry, heading),
      heading,
      hole.hazards,
    );
    const conservDist1 = haversineYards(tee, conservTarget);
    const conservClub1 = closestClub(conservDist1, distributions)!;
    const conservLanding = expectedLanding(tee, heading, conservClub1);
    const conservRemaining = haversineYards(conservLanding, pin);
    const conservClub2 = closestClub(conservRemaining, distributions)!;
    plans.push({
      name: 'Conservative',
      type: 'balanced',
      shots: [
        { clubDist: conservClub1, aimPoint: conservTarget },
        { clubDist: conservClub2, aimPoint: pin },
      ],
    });

    // Aggressive: shift aim 12y toward pin from conservative target
    const aggTarget = findSafeLanding(shiftToward(conservTarget, pin, 12), heading, hole.hazards);
    const aggDist1 = haversineYards(tee, aggTarget);
    const aggClub1 = closestClub(aggDist1, distributions)!;
    const aggLanding = expectedLanding(tee, heading, aggClub1);
    const aggRemaining = haversineYards(aggLanding, pin);
    const aggClub2 = closestClub(aggRemaining, distributions)!;
    plans.push({
      name: 'Aggressive',
      type: 'scoring',
      shots: [
        { clubDist: aggClub1, aimPoint: aggTarget },
        { clubDist: aggClub2, aimPoint: pin },
      ],
    });

    // Layup: shorter club off tee, then approach
    const midClubs = distributions.filter((d) => d.meanCarry < longest.meanCarry - 20);
    const layupClub1 = midClubs.length > 0 ? longestClub(midClubs) : longest;
    const layupTarget = findSafeLanding(centerLinePoint(cl, tee, layupClub1.meanCarry, heading), heading, hole.hazards);
    const layupLanding = expectedLanding(tee, heading, layupClub1); // actual landing (for club selection)
    const layupRemaining = haversineYards(layupLanding, pin);
    const layupClub2 = closestClub(layupRemaining, distributions)!;
    plans.push({
      name: 'Layup',
      type: 'safe',
      shots: [
        { clubDist: layupClub1, aimPoint: layupTarget },
        { clubDist: layupClub2, aimPoint: pin },
      ],
    });
  } else if (hole.par === 5) {
    // --- Par 5: Conservative 3-Shot, Go-For-It, Safe Layup ---
    const longest = longestClub(distributions);
    const shortest = shortestClub(distributions);

    // Conservative 3-Shot: use targets as waypoints, or compute 3 equal segments
    const segDist = distance / 3;
    const wp1 = findSafeLanding(
      hole.targets.length >= 2
        ? { lat: hole.targets[0].coordinate.lat, lng: hole.targets[0].coordinate.lng }
        : centerLinePoint(cl, tee, segDist, heading),
      heading,
      hole.hazards,
    );
    const wp2 = findSafeLanding(
      hole.targets.length >= 2
        ? { lat: hole.targets[1].coordinate.lat, lng: hole.targets[1].coordinate.lng }
        : centerLinePoint(cl, tee, segDist * 2, heading),
      heading,
      hole.hazards,
    );

    const c3Club1 = closestClub(haversineYards(tee, wp1), distributions)!;
    const c3Landing1 = expectedLanding(tee, heading, c3Club1);
    const c3Club2 = closestClub(haversineYards(c3Landing1, wp2), distributions)!;
    const c3Bearing2 = bearingBetween(c3Landing1, wp2);
    const c3Landing2 = expectedLanding(c3Landing1, c3Bearing2, c3Club2);
    const c3Club3 = closestClub(haversineYards(c3Landing2, pin), distributions)!;
    plans.push({
      name: 'Conservative 3-Shot',
      type: 'balanced',
      shots: [
        { clubDist: c3Club1, aimPoint: wp1 },
        { clubDist: c3Club2, aimPoint: wp2 },
        { clubDist: c3Club3, aimPoint: pin },
      ],
    });

    // Go-For-It: driver + longest feasible, 2 shots
    const goTarget = findSafeLanding(centerLinePoint(cl, tee, longest.meanCarry, heading), heading, hole.hazards);
    const goLanding = expectedLanding(tee, heading, longest); // actual landing (for club selection)
    const goRemaining = haversineYards(goLanding, pin);
    const goClub2 = closestClub(goRemaining, distributions)!;
    plans.push({
      name: 'Go-For-It',
      type: 'scoring',
      shots: [
        { clubDist: longest, aimPoint: goTarget },
        { clubDist: goClub2, aimPoint: pin },
      ],
    });

    // Safe Layup: driver + mid-iron + wedge
    const safeTarget1 = findSafeLanding(centerLinePoint(cl, tee, longest.meanCarry, heading), heading, hole.hazards);
    const safeLanding1 = expectedLanding(tee, heading, longest); // actual landing (for club selection)
    const safeRemaining1 = distance - longest.meanCarry;
    const midDist = safeRemaining1 * 0.55;
    const safeMidClub = closestClub(midDist, distributions)!;
    const safeBearing2 = bearingBetween(safeLanding1, pin);
    const safeTarget2 = projectPoint(safeLanding1, safeBearing2, safeMidClub.meanCarry); // aim along line to pin
    const safeLanding2 = expectedLanding(safeLanding1, safeBearing2, safeMidClub); // actual landing
    const safeRemaining2 = haversineYards(safeLanding2, pin);
    const safeWedge = closestClub(safeRemaining2, distributions) ?? shortest;
    plans.push({
      name: 'Safe Layup',
      type: 'safe',
      shots: [
        { clubDist: longest, aimPoint: safeTarget1 },
        { clubDist: safeMidClub, aimPoint: safeTarget2 },
        { clubDist: safeWedge, aimPoint: pin },
      ],
    });
  }

  return plans;
}

// ---------------------------------------------------------------------------
// GPS-Aware Simulation
// ---------------------------------------------------------------------------

export function simulateHoleGPS(
  plan: NamedStrategyPlan,
  hole: CourseHole,
  distributions: ClubDistribution[],
  trials: number = DEFAULT_TRIALS,
): OptimizedStrategy {
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const minClubCarry = Math.min(...distributions.map((c) => c.meanCarry));
  const chipThreshold = Math.max(HOLE_THRESHOLD, minClubCarry * 0.5);

  const trialScores: number[] = [];

  for (let t = 0; t < trials; t++) {
    let currentPos = { lat: tee.lat, lng: tee.lng };
    let strokes = 0;

    // Fire planned shots
    for (const shot of plan.shots) {
      const carry = gaussianSample(shot.clubDist.meanCarry, shot.clubDist.stdCarry);
      const offline = gaussianSample(shot.clubDist.meanOffline, shot.clubDist.stdOffline);

      // Compensate aim direction for lateral bias so expected landing ≈ target
      const rawBearing = bearingBetween(currentPos, shot.aimPoint);
      const compensatedAim = compensateForBias(shot.aimPoint, rawBearing, shot.clubDist);
      const shotBearing = bearingBetween(currentPos, compensatedAim);

      // Project carry along shot bearing
      let landing = projectPoint(currentPos, shotBearing, carry);

      // Shift perpendicular by offline (positive = right)
      if (Math.abs(offline) > 0.5) {
        landing = projectPoint(landing, shotBearing + 90, offline);
      }

      strokes++;

      // Check hazards
      const hazResult = checkHazards(landing, hole.hazards);
      if (hazResult.inHazard) {
        strokes += hazResult.penalty;
        // Drop near hazard edge — move 5 yards back toward previous position
        landing = projectPoint(landing, bearingBetween(landing, currentPos), 5);
      }

      currentPos = landing;

      const distToPin = haversineYards(currentPos, pin);
      if (distToPin <= chipThreshold) break;
    }

    // Greedy continuation if not on the green
    let distToPin = haversineYards(currentPos, pin);
    while (distToPin > chipThreshold && strokes < MAX_SHOTS_PER_HOLE) {
      const club = greedyClub(distToPin, distributions);
      const carry = gaussianSample(club.meanCarry, club.stdCarry);
      const offline = gaussianSample(club.meanOffline, club.stdOffline);
      const greedyBearing = bearingBetween(currentPos, pin);
      const compensatedGreedyAim = compensateForBias(pin, greedyBearing, club);
      const shotBearing = bearingBetween(currentPos, compensatedGreedyAim);

      let landing = projectPoint(currentPos, shotBearing, carry);
      if (Math.abs(offline) > 0.5) {
        landing = projectPoint(landing, shotBearing + 90, offline);
      }

      strokes++;

      const hazResult = checkHazards(landing, hole.hazards);
      if (hazResult.inHazard) {
        strokes += hazResult.penalty;
        landing = projectPoint(landing, bearingBetween(landing, currentPos), 5);
      }

      currentPos = landing;
      distToPin = haversineYards(currentPos, pin);
    }

    // Putting / chipping
    if (distToPin > HOLE_THRESHOLD && distToPin <= chipThreshold) {
      trialScores.push(strokes + 1 + expectedPutts(3));
    } else {
      trialScores.push(strokes + expectedPutts(distToPin));
    }
  }

  const xS = trialScores.reduce((a, b) => a + b, 0) / trialScores.length;
  const scoreDist = computeScoreDistribution(trialScores, hole.par);
  const blowupRisk = scoreDist.double + scoreDist.worse;

  // Build aim points: show WHERE TO AIM (compensated for lateral bias)
  // so the expected landing ≈ the plan targets (on fairway).
  const aimPoints: AimPoint[] = [];
  let aimFrom = { lat: tee.lat, lng: tee.lng };
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    const bearing = bearingBetween(aimFrom, s.aimPoint);
    aimPoints.push({
      position: compensateForBias(s.aimPoint, bearing, s.clubDist),
      clubName: s.clubDist.clubName,
      shotNumber: i + 1,
      carry: Math.round(s.clubDist.meanCarry),
      carryNote: computeCarryNote(aimFrom, s.clubDist.meanCarry, bearing, hole.hazards),
    });
    aimFrom = s.aimPoint; // next shot fires from expected landing ≈ target
  }

  // Build label from club sequence
  const label = plan.shots
    .map((s) => `${s.clubDist.clubName} (${Math.round(s.clubDist.meanCarry)})`)
    .join(' → ');

  return {
    clubs: plan.shots.map((s) => ({ clubId: s.clubDist.clubId, clubName: s.clubDist.clubName })),
    expectedStrokes: xS,
    label,
    strategyName: plan.name,
    strategyType: plan.type,
    scoreDistribution: scoreDist,
    blowupRisk,
    aimPoints,
  };
}

// ---------------------------------------------------------------------------
// Top-level Orchestrator
// ---------------------------------------------------------------------------

export function optimizeHole(
  hole: CourseHole,
  teeBox: string,
  distributions: ClubDistribution[],
  mode: StrategyMode = 'scoring',
  trials: number = DEFAULT_TRIALS,
): OptimizedStrategy[] {
  if (distributions.length === 0) return [];

  const plans = generateNamedStrategies(hole, teeBox, distributions);
  if (plans.length === 0) return [];

  const results = plans.map((plan) =>
    simulateHoleGPS(plan, hole, distributions, trials),
  );

  // Sort: scoring = lowest xS first, safe = lowest blowup risk first
  if (mode === 'safe') {
    results.sort((a, b) => a.blowupRisk - b.blowupRisk);
  } else {
    results.sort((a, b) => a.expectedStrokes - b.expectedStrokes);
  }

  return results;
}
