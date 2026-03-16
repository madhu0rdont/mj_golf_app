import type { ClubDistribution, ApproachStrategy } from './monte-carlo.js';
import type { CourseHole, HazardFeature, StrategyConstants } from '../models/types.js';
import { projectPoint, haversineYards, pointInPolygon, bearingBetween } from './geo.js';
import { query } from '../db.js';

// Re-export for convenience
export { buildDistributions } from './monte-carlo.js';

// ---------------------------------------------------------------------------
// Strategy Constants — DB-backed with hardcoded fallbacks
// ---------------------------------------------------------------------------

export const DEFAULT_STRATEGY_CONSTANTS: StrategyConstants = {
  lie_fairway: 1.0, lie_rough: 1.25, lie_green: 1.0, lie_fairway_bunker: 1.25,
  lie_greenside_bunker: 1.20, lie_trees: 1.50, lie_recovery: 1.60,
  rollout_fairway: 1.0, rollout_rough: 0.15, rollout_green: 0.65, rollout_bunker: 0.0,
  safe_variance_weight: 1.0, aggressive_green_bonus: 0.6,
  samples_base: 100, samples_hazard: 250, samples_high_risk: 350,
  chip_range: 30, short_game_threshold: 60, green_radius: 10,
  zone_interval: 20, lateral_offset: 20, bearing_range: 30,
  k_neighbors: 6, kernel_h_s: 25, kernel_h_u: 20,
  tree_height_yards: 15, ball_apex_yards: 28, elev_yards_per_meter: 1.09,
  rollout_slope_factor: 3.0, default_loft: 30,
  putt_coefficient: 0.42, putt_cap: 3,
  mc_trials: 2000, max_iterations: 50, convergence_threshold: 0.001,
  min_carry_ratio: 0.5, max_carry_ratio: 1.10,
  hazard_drop_penalty: 0.3, max_shots_per_hole: 8,
};

export async function loadStrategyConstants(): Promise<StrategyConstants> {
  try {
    const { rows } = await query('SELECT key, value FROM strategy_constants');
    const result = { ...DEFAULT_STRATEGY_CONSTANTS };
    for (const row of rows) {
      if (row.key in result) {
        (result as Record<string, number>)[row.key] = row.value;
      }
    }
    return result;
  } catch {
    return { ...DEFAULT_STRATEGY_CONSTANTS };
  }
}

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
  carry: number;
  carryNote: string | null;
  tip: string;
  remainingToPin?: number;
  shortGameStrokes?: number;
}

export interface OptimizedStrategy extends ApproachStrategy {
  strategyName: string;
  strategyType: 'scoring' | 'safe' | 'balanced';
  scoreDistribution: ScoreDistribution;
  blowupRisk: number;
  stdStrokes: number;
  fairwayRate: number;  // proportion of MC trials with first shot on fairway/green (0-1)
  aimPoints: AimPoint[];
}


export interface NamedStrategyPlan {
  name: string;
  type: 'scoring' | 'safe' | 'balanced';
  shots: {
    clubDist: ClubDistribution;
    aimPoint: { lat: number; lng: number };
    displayCarry?: number;
  }[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export let HOLE_THRESHOLD = 10;  // yards — fallback when no green polygon defined
export let MAX_SHOTS_PER_HOLE = 8;

/** Check if a position is on the green using polygon geofence, falling back to 10-yard radius */
export function isOnGreen(
  pos: { lat: number; lng: number },
  greenPoly: { lat: number; lng: number }[],
  pin: { lat: number; lng: number },
): boolean {
  if (greenPoly.length >= 3 && pointInPolygon(pos, greenPoly)) return true;
  return haversineYards(pos, pin) <= HOLE_THRESHOLD;
}
export let DEFAULT_TRIALS = 2000;
export const MIN_HAZARD_POINTS = 3;
export let TREE_HEIGHT_YARDS = 15; // ~45 feet — typical mature golf course tree
export let BALL_APEX_YARDS = 28;   // ~84 feet — reasonable average across all clubs

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function gaussianSample(mu: number, sigma: number): number {
  const u1 = Math.max(1e-10, Math.random());
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mu + sigma * z;
}

export function greedyClub(target: number, clubs: ClubDistribution[]): ClubDistribution {
  // Exclude drivers — greedy is for approach/recovery shots, not tee shots
  const eligible = clubs.filter((c) => c.category !== 'driver');
  const pool = eligible.length > 0 ? eligible : clubs; // fallback if all are drivers
  let best = pool[0];
  let bestDiff = Math.abs(pool[0].meanCarry - target);
  for (let i = 1; i < pool.length; i++) {
    const diff = Math.abs(pool[i].meanCarry - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = pool[i];
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Elevation Profile
// ---------------------------------------------------------------------------

export let ELEV_YARDS_PER_METER = 1.09; // ~1 yard per 3 feet of elevation change
const ELEV_PROFILE_STEP = 10;      // yards between elevation profile samples

export interface ElevationProfile {
  /** Elevation samples at ELEV_PROFILE_STEP-yard intervals from tee to pin */
  samples: number[];
  totalDist: number;
}

/**
 * Build an O(1)-lookup elevation profile from the centerLine.
 * Each entry is the elevation (meters) at that distance along the centerLine.
 */
export function buildElevationProfile(
  centerLine: { lat: number; lng: number; elevation: number }[],
  tee: { lat: number; lng: number; elevation: number },
  pin: { lat: number; lng: number; elevation: number },
  fallbackBearing: number,
  totalDist: number,
): ElevationProfile {
  const samples: number[] = [];

  for (let d = 0; d <= totalDist; d += ELEV_PROFILE_STEP) {
    const elev = interpolateElevation(centerLine, tee, pin, fallbackBearing, d, totalDist);
    samples.push(elev);
  }

  return { samples, totalDist };
}

/**
 * Interpolate elevation at a given distance along the centerLine.
 * Falls back to linear tee→pin interpolation when centerLine has no real elevation data.
 */
function interpolateElevation(
  centerLine: { lat: number; lng: number; elevation: number }[],
  tee: { lat: number; lng: number; elevation: number },
  pin: { lat: number; lng: number; elevation: number },
  _fallbackBearing: number,
  targetDist: number,
  totalDist: number,
): number {
  // If centerLine has real elevation data (non-zero), interpolate from it
  if (centerLine.length >= 2 && centerLine.some((p) => p.elevation !== 0)) {
    let cumDist = 0;
    let prev = centerLine[0];
    for (let i = 1; i < centerLine.length; i++) {
      const segDist = haversineYards(prev, centerLine[i]);
      if (cumDist + segDist >= targetDist) {
        const fraction = segDist > 0 ? (targetDist - cumDist) / segDist : 0;
        return prev.elevation + (centerLine[i].elevation - prev.elevation) * fraction;
      }
      cumDist += segDist;
      prev = centerLine[i];
    }
    return prev.elevation; // past end — use last point
  }

  // Fallback: linear interpolation from tee to pin elevation
  if (totalDist > 0) {
    const fraction = Math.min(targetDist / totalDist, 1);
    return tee.elevation + (pin.elevation - tee.elevation) * fraction;
  }
  return tee.elevation;
}

/** Compute local slope (meters/yard) at a point along the profile. Positive = uphill. */
export function getProfileSlope(profile: ElevationProfile, distFromTee: number): number {
  const delta = ELEV_PROFILE_STEP;
  const before = getProfileElevation(profile, distFromTee - delta / 2);
  const after = getProfileElevation(profile, distFromTee + delta / 2);
  return (after - before) / delta;
}

/** O(1) lookup into pre-computed elevation profile. */
export function getProfileElevation(profile: ElevationProfile, distFromTee: number): number {
  if (profile.samples.length === 0) return 0;
  const clamped = Math.max(0, Math.min(distFromTee, profile.totalDist));
  const idx = clamped / ELEV_PROFILE_STEP;
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, profile.samples.length - 1);
  const frac = idx - lo;
  if (lo >= profile.samples.length) return profile.samples[profile.samples.length - 1];
  return profile.samples[lo] + frac * (profile.samples[hi] - profile.samples[lo]);
}

// ---------------------------------------------------------------------------
// Rollout Model
// ---------------------------------------------------------------------------

let SURFACE_ROLLOUT: Record<string, number> = {
  fairway: 1.0,
  rough: 0.15,
  green: 0.65,
  bunker: 0.0,
};
let DEFAULT_LOFT = 30;

let ROLLOUT_SLOPE_FACTOR = 3.0; // rollout adjustment per unit slope (m/yd)

/**
 * Compute rollout distance for a shot based on club data, landing surface, and slope.
 * Rollout is proportional to carry: rollout = carry × rolloutFraction × surfaceMultiplier × slopeMultiplier.
 * Optional localSlope (meters elevation per yard of ground distance) adjusts rollout:
 * downhill (negative slope) = more rollout, uphill (positive) = less.
 */
export function computeRollout(
  carry: number,
  club: ClubDistribution,
  carryLanding: { lat: number; lng: number },
  hole: CourseHole,
  localSlope?: number,
): number {
  // Rollout fraction: from measured data or loft-based imputation
  let frac: number;
  if (club.meanTotal != null && club.meanTotal > club.meanCarry) {
    frac = (club.meanTotal - club.meanCarry) / club.meanCarry;
  } else {
    const loft = club.loft ?? DEFAULT_LOFT;
    frac = Math.max(0, 0.12 * Math.exp(-0.05 * loft));
  }

  // Determine landing surface — bunker/water kills rollout
  const hazard = checkHazards(carryLanding, hole.hazards);
  let surface: string;
  if (hazard.inHazard) {
    surface = hazard.hazardType?.includes('bunker') ? 'bunker' : 'water';
  } else {
    surface = classifyLieLocal(carryLanding, hole.fairway, hole.green);
  }

  let multiplier = SURFACE_ROLLOUT[surface] ?? 0;

  // Backspin damping: wedges (high loft) generate backspin that checks the
  // ball on the green. Reduce green rollout proportionally to loft.
  if (surface === 'green') {
    const loft = club.loft ?? DEFAULT_LOFT;
    if (loft > 30) {
      const backspinFactor = Math.max(0.25, 1 - (loft - 30) * 0.03);
      multiplier *= backspinFactor;
    }
  }

  // Slope factor: downhill landing = more rollout, uphill = less
  const slopeMultiplier = localSlope != null
    ? Math.max(0.5, Math.min(1.5, 1 - localSlope * ROLLOUT_SLOPE_FACTOR))
    : 1.0;

  return carry * frac * multiplier * slopeMultiplier;
}

/** Classify lie at a position — fairway, rough, or green. */
function classifyLieLocal(
  pos: { lat: number; lng: number },
  fairwayPolygons: { lat: number; lng: number }[][],
  greenPoly: { lat: number; lng: number }[],
): 'fairway' | 'rough' | 'green' {
  if (greenPoly.length >= 3 && pointInPolygon(pos, greenPoly)) return 'green';
  for (const fw of fairwayPolygons) {
    if (fw.length >= 3 && pointInPolygon(pos, fw)) return 'fairway';
  }
  return 'rough';
}

// ---------------------------------------------------------------------------
// Rough Penalty (from hazard_penalties table)
// ---------------------------------------------------------------------------

export const DEFAULT_ROUGH_PENALTY = 0.3;

/** Apply StrategyConstants to module-level variables for the current optimization run. */
export function applyStrategyConstants(c: StrategyConstants): void {
  HOLE_THRESHOLD = c.green_radius;
  MAX_SHOTS_PER_HOLE = c.max_shots_per_hole;
  DEFAULT_TRIALS = c.mc_trials;
  TREE_HEIGHT_YARDS = c.tree_height_yards;
  BALL_APEX_YARDS = c.ball_apex_yards;
  ELEV_YARDS_PER_METER = c.elev_yards_per_meter;
  SURFACE_ROLLOUT = {
    fairway: c.rollout_fairway,
    rough: c.rollout_rough,
    green: c.rollout_green,
    bunker: c.rollout_bunker,
  };
  DEFAULT_LOFT = c.default_loft;
  ROLLOUT_SLOPE_FACTOR = c.rollout_slope_factor;
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
// Hazard Drop Resolution (Rules of Golf)
// ---------------------------------------------------------------------------

export interface HazardDropResult {
  landing: { lat: number; lng: number };
  penalty: number;
}

const MAX_RETREAT_STEPS = 10;
const RETREAT_STEP = 2;          // yards per retreat step

/** Check if a point is in a "bad" hazard (OB, water, trees) — NOT bunker, which is playable. */
function isInBadHazard(
  point: { lat: number; lng: number },
  hazards: HazardFeature[],
): boolean {
  for (const h of hazards) {
    if (h.polygon.length < MIN_HAZARD_POINTS) continue;
    if (h.type === 'bunker' || h.type === 'fairway_bunker' || h.type === 'greenside_bunker') continue;
    if (h.type === 'rough' || h.type === 'green') continue;
    if (pointInPolygon(point, h.polygon)) return true;
  }
  return false;
}

/** Step backward along retreatBearing until the point is not in a bad hazard. */
function findSafeDrop(
  point: { lat: number; lng: number },
  retreatBearing: number,
  hazards: HazardFeature[],
): { lat: number; lng: number } {
  for (let step = 0; step < MAX_RETREAT_STEPS; step++) {
    if (!isInBadHazard(point, hazards)) return point;
    point = projectPoint(point, retreatBearing, RETREAT_STEP);
  }
  return point;
}

/**
 * Resolve hazard landing per Rules of Golf:
 * - OB: drop at boundary entry point on playable ground
 * - Bunker: ball stays in bunker (playable surface)
 * - Water: move backward, validate safe drop
 * - Trees/rough/green: return as-is
 * - Off fairway/green with no hazard: rough penalty
 */
export function resolveHazardDrop(
  shotOrigin: { lat: number; lng: number },
  landing: { lat: number; lng: number },
  hazards: HazardFeature[],
  fairwayPolygons: { lat: number; lng: number }[][],
  greenPoly: { lat: number; lng: number }[] = [],
  roughPenalty: number = DEFAULT_ROUGH_PENALTY,
): HazardDropResult {
  // Green takes priority — a ball on the putting surface is never OB/hazard,
  // even if hazard polygons overlap the green boundary.
  if (greenPoly.length >= 3 && pointInPolygon(landing, greenPoly)) {
    return { landing, penalty: 0 };
  }

  const hazResult = checkHazards(landing, hazards);
  if (!hazResult.inHazard) {
    for (const fw of fairwayPolygons) {
      if (fw.length >= 3 && pointInPolygon(landing, fw)) {
        return { landing, penalty: 0 };
      }
    }
    // Not on fairway or green = rough
    return { landing, penalty: roughPenalty };
  }

  const hazardType = hazResult.hazardType!;

  // Bunker: ball stays where it is (penalty represents shot difficulty)
  if (hazardType === 'bunker' || hazardType === 'fairway_bunker' || hazardType === 'greenside_bunker') {
    return { landing, penalty: hazResult.penalty };
  }

  // OB: stroke-and-distance — return to shot origin, hitting 3 (1 penalty stroke)
  // The player replays from where they hit, losing all distance + 1 stroke.
  if (hazardType === 'ob') {
    return { landing: shotOrigin, penalty: 1 };
  }

  // Water: move backward, validate safe
  if (hazardType === 'water') {
    const retreatBearing = bearingBetween(landing, shotOrigin);
    const rawDrop = projectPoint(landing, retreatBearing, 5);
    const safeDrop = findSafeDrop(rawDrop, retreatBearing, hazards);
    return { landing: safeDrop, penalty: hazResult.penalty };
  }

  // Trees/rough/green: return as-is with penalty
  return { landing, penalty: hazResult.penalty };
}

// ---------------------------------------------------------------------------
// Tree Trajectory Collision
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;

/** Ball height (yards) at distance d along the flight arc.
 *  When club flight data is available (apex, descentAngle), uses an asymmetric
 *  two-segment model with the apex forward-shifted. Falls back to a symmetric
 *  parabola with constant 28y apex when no data is available. */
export function ballHeightAtDistance(
  d: number,
  carry: number,
  apex?: number,
  descentAngle?: number,
): number {
  if (d <= 0 || d >= carry) return 0;

  // Asymmetric model: use measured apex height and descent angle
  if (apex != null && descentAngle != null && descentAngle > 0) {
    const tanDescent = Math.tan(descentAngle * DEG_TO_RAD);
    // Apex horizontal position: ball descends from apex to ground over (carry - dApex) yards
    const dApex = Math.max(carry * 0.3, carry - apex / tanDescent);

    if (d <= dApex) {
      // Ascending phase: quadratic ramp from 0 to apex
      const t = d / dApex;
      return apex * t * (2 - t); // quadratic ease-out: starts steep, flattens at apex
    } else {
      // Descending phase: linear at descent angle
      return apex * (carry - d) / (carry - dApex);
    }
  }

  // Fallback: symmetric parabola with constant apex
  return 4 * BALL_APEX_YARDS * (d / carry) * (1 - d / carry);
}

/** Check if a ball's trajectory passes through any tree or OB polygon below canopy height.
 *  Samples the flight path at 10y intervals near each polygon.
 *  Trees: single sample point triggers (ball hits a tree).
 *  OB: requires 3 consecutive sample points (30y sustained flight through OB forest),
 *      distinguishing "flying through OB forest" from "clipping the polygon edge." */
export function checkTreeTrajectory(
  from: { lat: number; lng: number },
  bearing: number,
  carry: number,
  hazards: HazardFeature[],
  club?: ClubDistribution,
): { hitTrees: boolean; hitOB: boolean; hitDistance: number } {
  let closestHit: { type: 'trees' | 'ob'; distance: number } | null = null;

  for (const h of hazards) {
    if (h.type !== 'trees' && h.type !== 'ob') continue;
    if (h.polygon.length < MIN_HAZARD_POINTS) continue;

    // Quick filter: skip polygons not along the shot direction
    const centroid = polygonCentroid(h.polygon);
    const hazBearing = bearingBetween(from, centroid);
    let angleDiff = Math.abs(hazBearing - bearing);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    if (angleDiff > 45) continue;

    const centroidDist = haversineYards(from, centroid);
    if (centroidDist > carry + 20 || centroidDist < 10) continue;

    // Sample flight path at 10y intervals through the hazard area
    const minDist = Math.max(20, centroidDist - 50);
    const maxDist = Math.min(carry - 5, centroidDist + 50);

    const isOB = h.type === 'ob';
    const requiredHits = isOB ? 3 : 1; // OB needs sustained flight through forest
    let consecutiveHits = 0;
    let firstHitDist = 0;

    for (let d = minDist; d <= maxDist; d += 10) {
      const height = ballHeightAtDistance(d, carry, club?.meanApex, club?.meanDescentAngle);
      if (height >= TREE_HEIGHT_YARDS) {
        consecutiveHits = 0;
        continue;
      }
      const pos = projectPoint(from, bearing, d);
      if (pointInPolygon(pos, h.polygon)) {
        if (consecutiveHits === 0) firstHitDist = d;
        consecutiveHits++;
        if (consecutiveHits >= requiredHits) {
          if (!closestHit || firstHitDist < closestHit.distance) {
            closestHit = { type: h.type as 'trees' | 'ob', distance: firstHitDist };
          }
          break;
        }
      } else {
        consecutiveHits = 0;
      }
    }
  }

  if (closestHit) {
    return {
      hitTrees: closestHit.type === 'trees',
      hitOB: closestHit.type === 'ob',
      hitDistance: closestHit.distance,
    };
  }
  return { hitTrees: false, hitOB: false, hitDistance: 0 };
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
// Strategy Helpers
// ---------------------------------------------------------------------------

export function polygonCentroid(poly: { lat: number; lng: number }[]): { lat: number; lng: number } {
  if (poly.length === 0) return { lat: 0, lng: 0 };
  let lat = 0, lng = 0;
  for (const p of poly) { lat += p.lat; lng += p.lng; }
  return { lat: lat / poly.length, lng: lng / poly.length };
}

export function compensateForBias(
  target: { lat: number; lng: number },
  shotBearing: number,
  club: ClubDistribution,
): { lat: number; lng: number } {
  if (Math.abs(club.meanOffline) <= 0.5) return target;
  return projectPoint(target, shotBearing + 90, -club.meanOffline);
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

export function computeCarryNote(
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

    const hazBearing = bearingBetween(from, centroid);
    let angleDiff = Math.abs(hazBearing - bearing);
    if (angleDiff > 180) angleDiff = 360 - angleDiff;
    if (angleDiff > 35) continue;

    let nearestDist = Infinity;
    for (const v of h.polygon) {
      const vBearing = bearingBetween(from, v);
      let vAngle = Math.abs(vBearing - bearing);
      if (vAngle > 180) vAngle = 360 - vAngle;
      if (vAngle > 40) continue;
      const d = haversineYards(from, v);
      if (d < nearestDist) nearestDist = d;
    }

    const dist = nearestDist < Infinity ? nearestDist : haversineYards(from, centroid);

    if (dist > carry + 50 || dist < 20) continue;

    if (dist > bestDist) {
      bestDist = dist;
      const label = HAZARD_SHORT[h.type] ?? h.type;
      const clearance = Math.round(carry - dist);
      if (clearance >= 0) {
        bestNote = `+${clearance}y past ${label}`;
      } else {
        bestNote = `~${Math.abs(clearance)}y short of ${label}`;
      }
    }
  }

  return bestNote;
}

export function normalizeAngle(a: number): number {
  let d = a % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function describeHazard(
  h: HazardFeature,
  centroid: { lat: number; lng: number },
  from: { lat: number; lng: number },
  side: 'left' | 'right',
  isApproach: boolean,
): string {
  const typeName = HAZARD_SHORT[h.type] ?? h.type;
  const dist = Math.round(haversineYards(from, centroid));

  if (isApproach) {
    return `${side} ${typeName}`;
  }
  return `${side} ${typeName} at ${dist}y`;
}

export function generateCaddyTip(
  from: { lat: number; lng: number },
  aimPos: { lat: number; lng: number },
  target: { lat: number; lng: number },
  club: ClubDistribution,
  hazards: HazardFeature[],
  isApproach: boolean,
): string {
  const shotBearing = bearingBetween(from, target);

  const aimShiftAngle = normalizeAngle(bearingBetween(from, aimPos) - shotBearing);
  const aimSide: 'left' | 'right' | null =
    aimShiftAngle < -1 ? 'left' : aimShiftAngle > 1 ? 'right' : null;

  const ballDir = club.meanOffline > 1 ? 'right' : club.meanOffline < -1 ? 'left' : null;
  const ballWorks = ballDir ? `works ${ballDir}` : null;

  const aimBearing = bearingBetween(from, aimPos);
  const shotDist = haversineYards(from, aimPos);
  interface NearbyHaz { desc: string; side: 'left' | 'right'; dist: number }
  const nearHaz: NearbyHaz[] = [];
  for (const h of hazards) {
    if (h.polygon.length < MIN_HAZARD_POINTS) continue;
    const c = polygonCentroid(h.polygon);
    const distToAim = haversineYards(aimPos, c);
    const nearAim = distToAim <= 50;

    const distFromOrigin = haversineYards(from, c);
    const hazBearing = bearingBetween(from, c);
    let bearingDelta = Math.abs(hazBearing - aimBearing);
    if (bearingDelta > 180) bearingDelta = 360 - bearingDelta;
    const perpDist = distFromOrigin * Math.sin(bearingDelta * Math.PI / 180);
    const projDist = distFromOrigin * Math.cos(bearingDelta * Math.PI / 180);
    const inCorridor = perpDist <= 35 && projDist >= shotDist * 0.2 && projDist <= shotDist * 1.2;

    if (!nearAim && !inCorridor) continue;

    const relAngle = normalizeAngle(bearingBetween(from, c) - aimBearing);
    const side: 'left' | 'right' = relAngle >= 0 ? 'right' : 'left';
    const relevance = Math.min(distToAim, perpDist);
    nearHaz.push({
      desc: describeHazard(h, c, from, side, isApproach),
      side,
      dist: relevance,
    });
  }

  nearHaz.sort((a, b) => a.dist - b.dist);

  const bySide = new Map<string, NearbyHaz>();
  for (const h of nearHaz) {
    if (!bySide.has(h.side)) bySide.set(h.side, h);
  }

  const dest = isApproach ? 'the pin' : 'the fairway';

  if (isApproach) {
    if (!aimSide) return 'Straight at the pin';
    const avoiding = [...bySide.values()].find((h) => h.side !== aimSide);
    if (avoiding) {
      return `Aim ${aimSide} of the ${avoiding.desc}${ballWorks ? `, ${ballWorks} to the pin` : ''}`;
    }
    return ballWorks ? `Start ${aimSide}, ${ballWorks} toward the pin` : 'Aim at the pin';
  }

  if (!aimSide && !ballWorks) return 'Down the center';

  if (bySide.size > 0 && aimSide) {
    const sameHaz = bySide.get(aimSide);
    const oppHaz = bySide.get(aimSide === 'left' ? 'right' : 'left');

    if (sameHaz && ballWorks) {
      return `Start at the ${sameHaz.desc}, ${ballWorks} to ${dest}`;
    }
    if (oppHaz) {
      return `Aim ${aimSide} of the ${oppHaz.desc}${ballWorks ? `, ${ballWorks} to ${dest}` : ''}`;
    }
  }

  if (aimSide && ballWorks) {
    return `Start ${aimSide} side, ${ballWorks} to center`;
  }

  return 'Down the center';
}
