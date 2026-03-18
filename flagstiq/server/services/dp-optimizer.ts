import { expectedPutts } from './monte-carlo.js';
import type { ClubDistribution } from './monte-carlo.js';
import type { CourseHole, HazardFeature, StrategyConstants } from '../models/types.js';
import { projectPoint, haversineYards, pointInPolygon, bearingBetween } from './geo.js';
import {
  gaussianSample,
  greedyClub,
  resolveHazardDrop,
  checkTreeTrajectory,
  checkHazards,
  computeCarryNote,
  generateCaddyTip,
  computeScoreDistribution,
  HOLE_THRESHOLD,
  MAX_SHOTS_PER_HOLE,
  DEFAULT_TRIALS,
  isOnGreen,
  computeRollout,
  buildElevationProfile,
  getProfileElevation,
  getProfileSlope,
  ELEV_YARDS_PER_METER,
  DEFAULT_STRATEGY_CONSTANTS,
  applyStrategyConstants,
  polygonCentroid,
  STEEP_SLOPE_THRESHOLD,
  STEEP_SLOPE_MAX_PENALTY,
  STEEP_SLOPE_PENALTY_RATE,
} from './strategy-optimizer.js';
import type { OptimizedStrategy, NamedStrategyPlan, AimPoint, ElevationProfile } from './strategy-optimizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScoringMode = 'scoring' | 'safe' | 'aggressive';

type LieClass = 'fairway' | 'rough' | 'green' | 'fairway_bunker' | 'greenside_bunker' | 'trees' | 'recovery';

interface AnchorState {
  id: number;
  position: { lat: number; lng: number };
  s: number;           // arc distance from tee (yards) along centerline
  u: number;           // lateral offset from centerline (yards, + = right)
  lie: LieClass;
  distToPin: number;
  elevation: number;
  distFromTee: number;
  isTerminal: boolean;
  localBearing: number;
}

interface PolicyEntry {
  clubIdx: number;
  bearingIdx: number;
  bearing: number;
  value: number;
}

interface HoleFrameCoord {
  s: number;
  u: number;
  segmentIndex: number;
}

interface LandingOutcome {
  s: number;
  u: number;
  lie: LieClass;
  penalty: number;
  isTerminal: boolean;
  distToPin: number;
}

interface ActionKey {
  anchorId: number;
  clubIdx: number;
  bearingIdx: number;
}

interface ActionOutcomes {
  key: ActionKey;
  club: ClubDistribution;
  bearing: number;
  outcomes: LandingOutcome[];
  pGreen: number;
  pFairway: number;
}

type LieGroup = 'fairway' | 'offFairway' | 'bunker' | 'green';

interface SpatialIndex {
  fairway: AnchorState[];
  offFairway: AnchorState[];
  bunker: AnchorState[];
  green: AnchorState[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let ZONE_INTERVAL = 20;        // yards between anchor markers along centerline
let LATERAL_OFFSET = 20;       // yards left/right of centerline
let BEARING_RANGE = 30;        // ±degrees from pin bearing
const TEE_LOOK_AHEAD = 200;     // yards — center tee bearing fan on driver landing zone
let SAMPLES_BASE = 100;       // minimum samples for safe anchors
let SAMPLES_HAZARD = 250;     // anchors with hazards in play
let SAMPLES_HIGH_RISK = 350;  // anchors with OB or water in play
let GREEN_RADIUS = 10;         // yards — used for anchor discretization near pin
let MAX_VALUE_ITERATIONS = 50;
let CONVERGENCE_THRESHOLD = 0.001;
let MIN_CARRY_RATIO = 0.5;     // club carry must be ≥ 50% of dist to pin
let MAX_CARRY_RATIO = 1.10;    // club carry must be ≤ 110% of dist to pin
let CHIP_RANGE = 30;           // within this distance, treat as near-green (chip/putt)
let HAZARD_DROP_PENALTY = 0.3;  // must match DEFAULT_STRATEGY_CONSTANTS.hazard_drop_penalty

// Interpolation constants
let K_NEIGHBORS = 6;
let KERNEL_H_S = 25;           // yards, s-direction bandwidth
let KERNEL_H_U = 20;           // yards, u-direction bandwidth
let SHORT_GAME_THRESHOLD = 60; // yards from pin — bypass interpolation

// Per-lie dispersion multiplier (replaces binary ROUGH_LIE_MULTIPLIER)
let LIE_MULTIPLIER: Record<LieClass, number> = {
  fairway: 1.0,
  rough: 1.25,
  green: 1.0,
  fairway_bunker: 1.25,
  greenside_bunker: 1.20,
  trees: 1.50,
  recovery: 1.60,
};

let SAFE_VARIANCE_WEIGHT = 1.0;
let AGGRESSIVE_GREEN_BONUS = 0.6;
let FAIRWAY_PREFERENCE = 0.15;

/** Apply StrategyConstants to module-level variables for the current optimization run. */
function applyConstants(c: StrategyConstants): void {
  ZONE_INTERVAL = c.zone_interval;
  LATERAL_OFFSET = c.lateral_offset;
  BEARING_RANGE = c.bearing_range;
  SAMPLES_BASE = c.samples_base;
  SAMPLES_HAZARD = c.samples_hazard;
  SAMPLES_HIGH_RISK = c.samples_high_risk;
  GREEN_RADIUS = c.green_radius;
  MAX_VALUE_ITERATIONS = c.max_iterations;
  CONVERGENCE_THRESHOLD = c.convergence_threshold;
  MIN_CARRY_RATIO = c.min_carry_ratio;
  MAX_CARRY_RATIO = c.max_carry_ratio;
  CHIP_RANGE = c.chip_range;
  HAZARD_DROP_PENALTY = c.hazard_drop_penalty;
  K_NEIGHBORS = c.k_neighbors;
  KERNEL_H_S = c.kernel_h_s;
  KERNEL_H_U = c.kernel_h_u;
  SHORT_GAME_THRESHOLD = c.short_game_threshold;
  SAFE_VARIANCE_WEIGHT = c.safe_variance_weight;
  AGGRESSIVE_GREEN_BONUS = c.aggressive_green_bonus;
  FAIRWAY_PREFERENCE = c.fairway_preference;
  LIE_MULTIPLIER = {
    fairway: c.lie_fairway,
    rough: c.lie_rough,
    green: c.lie_green,
    fairway_bunker: c.lie_fairway_bunker,
    greenside_bunker: c.lie_greenside_bunker,
    trees: c.lie_trees,
    recovery: c.lie_recovery,
  };
}

const MODE_TYPE: Record<ScoringMode, 'scoring' | 'safe' | 'balanced'> = {
  scoring: 'scoring',
  safe: 'safe',
  aggressive: 'balanced',
};

const MODE_NAME_POOL: Record<ScoringMode, string[]> = {
  scoring: [
    'Smart Play',
    'Optimal Line',
    'Best Score',
    'Course Management',
    'Calculated Play',
  ],
  safe: [
    'Safe Play',
    'Conservative Line',
    'Play It Safe',
    'Keep It In Play',
    'Fairways & Greens',
  ],
  aggressive: [
    'Attack',
    'Go For It',
    'Aggressive Line',
    'Full Send',
    'Pin Seeking',
  ],
};

function modeLabel(mode: ScoringMode, holeNumber: number): { name: string; type: 'scoring' | 'safe' | 'balanced' } {
  const pool = MODE_NAME_POOL[mode];
  const name = pool[(holeNumber - 1) % pool.length];
  return { name, type: MODE_TYPE[mode] };
}

// ---------------------------------------------------------------------------
// Hole-Frame Projection
// ---------------------------------------------------------------------------

/**
 * Project a GPS point into hole-relative (s, u) coordinates.
 * s = arc length along centerline from tee.
 * u = signed perpendicular offset (positive = right of centerline facing pin).
 */
function projectToHoleFrame(
  point: { lat: number; lng: number },
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  heading: number,
): HoleFrameCoord {
  if (centerLine.length < 2) {
    // Fallback: project onto tee→pin straight line
    const d = haversineYards(tee, point);
    const b = bearingBetween(tee, point);
    const angleRad = ((b - heading) * Math.PI) / 180;
    return {
      s: d * Math.cos(angleRad),
      u: d * Math.sin(angleRad),
      segmentIndex: 0,
    };
  }

  let bestDist = Infinity;
  let bestS = 0;
  let bestU = 0;
  let bestSeg = 0;
  let cumDist = 0;

  for (let i = 0; i < centerLine.length - 1; i++) {
    const A = centerLine[i];
    const B = centerLine[i + 1];
    const segLen = haversineYards(A, B);
    if (segLen < 0.01) { cumDist += segLen; continue; }

    const dAP = haversineYards(A, point);
    const bAP = bearingBetween(A, point);
    const bAB = bearingBetween(A, B);
    const angleRad = ((bAP - bAB) * Math.PI) / 180;

    const along = dAP * Math.cos(angleRad);
    const cross = dAP * Math.sin(angleRad);

    let perpDist: number;
    let projS: number;
    let projU: number;

    if (along <= 0) {
      perpDist = Math.abs(cross);
      projS = cumDist;
      projU = cross;
    } else if (along >= segLen) {
      const dBP = haversineYards(B, point);
      perpDist = dBP;
      projS = cumDist + segLen;
      const bBP = bearingBetween(B, point);
      projU = dBP * Math.sin(((bBP - bAB) * Math.PI) / 180);
    } else {
      perpDist = Math.abs(cross);
      projS = cumDist + along;
      projU = cross;
    }

    if (perpDist < bestDist) {
      bestDist = perpDist;
      bestS = projS;
      bestU = projU;
      bestSeg = i;
    }

    cumDist += segLen;
  }

  return { s: bestS, u: bestU, segmentIndex: bestSeg };
}

// ---------------------------------------------------------------------------
// Anchor Discretization
// ---------------------------------------------------------------------------

export function discretizeHole(
  hole: CourseHole,
  teeBox: string,
): { anchors: AnchorState[]; elevProfile: ElevationProfile; centerLine: { lat: number; lng: number }[] } {
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const heading = bearingBetween(tee, pin);
  const totalDist = hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  if (totalDist === 0) return { anchors: [], elevProfile: { samples: [], totalDist: 0 }, centerLine: [] };

  const fairwayPolygons = hole.fairway ?? [];
  let centerLine: { lat: number; lng: number; elevation: number }[] =
    (hole.centerLine ?? []).map(p => ({ ...p, elevation: (p as { elevation?: number }).elevation ?? 0 }));
  if (centerLine.length < 2 && fairwayPolygons.length > 0) {
    centerLine = synthesizeCenterLine(tee, pin, totalDist, fairwayPolygons, hole.hazards)
      .map(p => ({ ...p, elevation: 0 }));
  }
  const greenPoly = hole.green ?? [];
  const anchors: AnchorState[] = [];

  // Build elevation profile from centerLine (O(1) lookup for per-shot elevation)
  const elevProfile = buildElevationProfile(centerLine, hole.tee, hole.pin, heading, totalDist);

  // Tee anchor — look ahead to the driver landing zone (~200y), not just 20y.
  const teeLookAhead = Math.min(TEE_LOOK_AHEAD, totalDist - GREEN_RADIUS);
  const teeBearing = centerLine.length >= 2
    ? bearingBetween(tee, interpolateCenterLine(centerLine, tee, heading, teeLookAhead))
    : heading;
  anchors.push({
    id: 0,
    position: tee,
    s: 0,
    u: 0,
    lie: 'fairway',
    distToPin: totalDist,
    elevation: hole.tee.elevation,
    distFromTee: 0,
    isTerminal: false,
    localBearing: teeBearing,
  });

  // Walk centerline in intervals
  for (let d = ZONE_INTERVAL; d < totalDist - GREEN_RADIUS; d += ZONE_INTERVAL) {
    const centerPos = interpolateCenterLine(centerLine, tee, heading, d);
    const centerElev = getProfileElevation(elevProfile, d);
    const localBearing = d + ZONE_INTERVAL < totalDist
      ? bearingBetween(centerPos, interpolateCenterLine(centerLine, tee, heading, d + ZONE_INTERVAL))
      : heading;

    for (const lateralDir of [0, -1, 1, -2, 2]) {
      const lateralDist = Math.abs(lateralDir) <= 1
        ? lateralDir * LATERAL_OFFSET
        : Math.sign(lateralDir) * LATERAL_OFFSET * 2;
      const pos = lateralDir === 0
        ? centerPos
        : projectPoint(centerPos, localBearing + 90, lateralDist);

      const lie = classifyLie(pos, fairwayPolygons, greenPoly, hole.hazards);
      const distToPin = haversineYards(pos, pin);

      // Compute hole-frame coordinates
      const { s, u } = projectToHoleFrame(pos, centerLine, tee, heading);

      anchors.push({
        id: anchors.length,
        position: pos,
        s,
        u,
        lie,
        distToPin,
        elevation: centerElev,
        distFromTee: d,
        isTerminal: false,
        localBearing,
      });
    }
  }

  // Green anchor (terminal)
  const greenBearing = centerLine.length >= 2
    ? bearingBetween(centerLine[centerLine.length - 2], pin)
    : heading;
  anchors.push({
    id: anchors.length,
    position: pin,
    s: totalDist,
    u: 0,
    lie: 'green',
    distToPin: 0,
    elevation: hole.pin.elevation,
    distFromTee: totalDist,
    isTerminal: true,
    localBearing: greenBearing,
  });

  return { anchors, elevProfile, centerLine };
}

function interpolateCenterLine(
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  fallbackBearing: number,
  targetDist: number,
): { lat: number; lng: number } {
  if (centerLine.length < 2) {
    return projectPoint(tee, fallbackBearing, targetDist);
  }

  let cumDist = 0;
  let prev = centerLine[0];
  for (let i = 1; i < centerLine.length; i++) {
    const segDist = haversineYards(prev, centerLine[i]);
    if (cumDist + segDist >= targetDist) {
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

  return projectPoint(prev, fallbackBearing, targetDist - cumDist);
}

export function classifyLie(
  pos: { lat: number; lng: number },
  fairwayPolygons: { lat: number; lng: number }[][],
  greenPoly: { lat: number; lng: number }[],
  hazards?: HazardFeature[],
): LieClass {
  if (greenPoly.length >= 3 && pointInPolygon(pos, greenPoly)) return 'green';

  if (hazards) {
    for (const h of hazards) {
      if (h.polygon.length < 3 || !pointInPolygon(pos, h.polygon)) continue;
      if (h.type === 'greenside_bunker') return 'greenside_bunker';
      if (h.type === 'fairway_bunker') return 'fairway_bunker';
      if (h.type === 'bunker') return 'fairway_bunker';
      if (h.type === 'trees') return 'trees';
    }
  }

  for (const fw of fairwayPolygons) {
    if (fw.length >= 3 && pointInPolygon(pos, fw)) return 'fairway';
  }
  return 'rough';
}

// ---------------------------------------------------------------------------
// Synthetic Center Line (for doglegs without centerLine data)
// ---------------------------------------------------------------------------

function scoreCandidatePoint(
  point: { lat: number; lng: number },
  pin: { lat: number; lng: number },
  fairwayPolygons: { lat: number; lng: number }[][],
  hazards: HazardFeature[] | undefined,
): number {
  let score = 0;

  for (const fw of fairwayPolygons) {
    if (fw.length >= 3 && pointInPolygon(point, fw)) {
      score += 10;
      break;
    }
  }

  if (hazards) {
    for (const h of hazards) {
      if (h.polygon.length >= 3 && pointInPolygon(point, h.polygon)) {
        score -= 20;
        break;
      }
    }
  }

  const distToPin = haversineYards(point, pin);
  score += Math.max(0, 2 - distToPin / 200);

  return score;
}

function synthesizeCenterLine(
  tee: { lat: number; lng: number },
  pin: { lat: number; lng: number },
  totalDist: number,
  fairwayPolygons: { lat: number; lng: number }[][],
  hazards: HazardFeature[] | undefined,
): { lat: number; lng: number; elevation: number }[] {
  const path: { lat: number; lng: number; elevation: number }[] = [{ ...tee, elevation: 0 }];
  const stepSize = 20;
  let current = tee;

  for (let d = stepSize; d < totalDist - GREEN_RADIUS; d += stepSize) {
    const baseBearing = bearingBetween(current, pin);

    let bestPoint = projectPoint(current, baseBearing, stepSize);
    let bestScore = -Infinity;

    for (let offset = -75; offset <= 75; offset += 5) {
      const bearing = (baseBearing + offset + 360) % 360;
      const candidate = projectPoint(current, bearing, stepSize);
      const s = scoreCandidatePoint(candidate, pin, fairwayPolygons, hazards);
      if (s > bestScore) {
        bestScore = s;
        bestPoint = candidate;
      }
    }

    path.push({ ...bestPoint, elevation: 0 });
    current = bestPoint;
  }

  path.push({ ...pin, elevation: 0 });
  return path;
}

// ---------------------------------------------------------------------------
// Anchor Lookup
// ---------------------------------------------------------------------------

function findNearestAnchor(
  point: { lat: number; lng: number },
  anchors: AnchorState[],
  actualLie?: LieClass,
): AnchorState {
  let best = anchors[0];
  let bestScore = Infinity;
  const actualGroup = actualLie ? getLieGroup(actualLie) : null;
  for (const a of anchors) {
    const d = haversineYards(point, a.position);
    // Penalize lie mismatch: prefer same lie group within 30y
    const liePenalty = actualGroup && getLieGroup(a.lie) !== actualGroup ? 30 : 0;
    const score = d + liePenalty;
    if (score < bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Action Space
// ---------------------------------------------------------------------------

function getEligibleClubs(
  anchor: AnchorState,
  distributions: ClubDistribution[],
  pinElevation: number = 0,
): ClubDistribution[] {
  if (anchor.isTerminal) return [];
  const elevAdjust = (pinElevation - anchor.elevation) * ELEV_YARDS_PER_METER;
  const dist = anchor.distToPin + elevAdjust;
  const isTee = anchor.id === 0;
  return distributions.filter((c) => {
    if (c.category === 'driver' && !isTee) return false;
    return c.meanCarry >= dist * MIN_CARRY_RATIO && c.meanCarry <= dist * MAX_CARRY_RATIO;
  });
}



function bearingStepForDistance(yardage: number): number {
  if (yardage < 180) return 2; // par 3s need fine resolution — safe windows are narrow
  if (yardage <= 350) return 3;
  return 2;
}

function getAimBearings(
  anchor: AnchorState,
  _pin: { lat: number; lng: number },
  bearingStep: number,
  pinBearing?: number,
  extraBearings?: number[],
): number[] {
  const center = anchor.localBearing;
  const bearings: number[] = [];
  for (let offset = -BEARING_RANGE; offset <= BEARING_RANGE; offset += bearingStep) {
    bearings.push((center + offset + 360) % 360);
  }

  // Ensure the direct pin bearing is always evaluated (especially important
  // for par 3 tee shots where the safe window to the green is narrow)
  if (pinBearing != null) {
    const hasPinBearing = bearings.some((b) => {
      const diff = Math.abs(((b - pinBearing + 540) % 360) - 180);
      return diff < 1;
    });
    if (!hasPinBearing) {
      bearings.push((pinBearing + 360) % 360);
    }
  }

  // Inject additional forced bearings (e.g. fairway centroid) if not already covered
  if (extraBearings) {
    for (const eb of extraBearings) {
      const normalizedEB = (eb + 360) % 360;
      const alreadyPresent = bearings.some((b) => {
        const diff = Math.abs(((b - normalizedEB + 540) % 360) - 180);
        return diff < 1;
      });
      if (!alreadyPresent) bearings.push(normalizedEB);
    }
  }

  return bearings;
}

// ---------------------------------------------------------------------------
// Adaptive Sampling
// ---------------------------------------------------------------------------

const HIGH_RISK_TYPES = new Set(['ob', 'water']);
const PENALTY_TYPES = new Set(['ob', 'water', 'bunker', 'fairway_bunker', 'greenside_bunker']);

function samplesForAnchor(anchor: AnchorState, maxCarry: number, hazards: HazardFeature[]): number {
  let hasHighRisk = false;
  let hasPenalty = false;

  for (const h of hazards) {
    if (!PENALTY_TYPES.has(h.type) || h.polygon.length === 0) continue;

    const inRange = h.polygon.some(
      (pt) => haversineYards(anchor.position, pt) <= maxCarry * 1.3,
    );
    if (!inRange) continue;

    if (HIGH_RISK_TYPES.has(h.type)) {
      hasHighRisk = true;
      break;
    }
    hasPenalty = true;
  }

  if (hasHighRisk) return SAMPLES_HIGH_RISK;
  if (hasPenalty) return SAMPLES_HAZARD;
  return SAMPLES_BASE;
}

// ---------------------------------------------------------------------------
// Outcome Sampling (replaces transition sampling)
// ---------------------------------------------------------------------------

function sampleOutcomes(
  anchor: AnchorState,
  club: ClubDistribution,
  bearing: number,
  hole: CourseHole,
  sampleCount: number,
  elevProfile: ElevationProfile,
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  heading: number,
): { outcomes: LandingOutcome[]; pGreen: number; pFairway: number } {
  const outcomes: LandingOutcome[] = [];
  let greenCount = 0;
  let fairwayCount = 0;

  const lieMultiplier = LIE_MULTIPLIER[anchor.lie];
  const fairwayPolygons = hole.fairway ?? [];
  const greenPoly = hole.green ?? [];

  for (let i = 0; i < sampleCount; i++) {
    const carry = gaussianSample(club.meanCarry, club.stdCarry * lieMultiplier);
    const offline = gaussianSample(club.meanOffline, club.stdOffline * lieMultiplier);

    // Elevation-adjusted ground carry
    const landingDistFromTee = anchor.distFromTee + carry;
    const landingElev = getProfileElevation(elevProfile, landingDistFromTee);
    const elevDelta = landingElev - anchor.elevation;
    const adjustedCarry = Math.max(0, carry - elevDelta * ELEV_YARDS_PER_METER);

    let landing = projectPoint(anchor.position, bearing, adjustedCarry);
    if (Math.abs(offline) > 0.5) {
      landing = projectPoint(landing, bearing + 90, offline);
    }

    let penalty = 0;
    let hitTree = false;

    // Tree / OB trajectory collision
    const treeHit = checkTreeTrajectory(anchor.position, bearing, carry, hole.hazards, club);
    if (treeHit.hitOB) {
      // Stroke-and-distance: return to shot origin + 1 penalty stroke
      landing = anchor.position;
      penalty += 1;
    } else if (treeHit.hitTrees) {
      landing = projectPoint(anchor.position, bearing, treeHit.hitDistance);
      penalty += 0.5;
      hitTree = true;
    } else {
      // Apply rollout (slope-adjusted)
      const slope = getProfileSlope(elevProfile, landingDistFromTee);
      const rollout = computeRollout(carry, club, landing, hole, slope);
      if (rollout > 0.5) landing = projectPoint(landing, bearing, rollout);

      // Steep slope penalty — landing on steep terrain is unpredictable
      const absSlope = Math.abs(slope);
      if (absSlope > STEEP_SLOPE_THRESHOLD) {
        penalty += Math.min(
          STEEP_SLOPE_MAX_PENALTY,
          (absSlope - STEEP_SLOPE_THRESHOLD) * STEEP_SLOPE_PENALTY_RATE,
        );
      }
    }

    // Hazard check (skip if OB trajectory — ball never reached landing)
    if (!treeHit.hitOB) {
      const hazDrop = resolveHazardDrop(anchor.position, landing, hole.hazards, hole.fairway, hole.green, HAZARD_DROP_PENALTY);
      penalty += hazDrop.penalty;
      landing = hazDrop.landing;
    }

    const distToPin = haversineYards(landing, hole.pin);
    const onGreen = isOnGreen(landing, hole.green, hole.pin);

    // Classify lie at landing
    let lie: LieClass;
    if (onGreen) {
      lie = 'green';
      greenCount++;
      if (penalty === 0) fairwayCount++;
    } else if (hitTree) {
      lie = 'recovery';
    } else {
      lie = classifyLie(landing, fairwayPolygons, greenPoly, hole.hazards);
      if (penalty === 0 && (lie === 'fairway' || lie === 'green')) fairwayCount++;
    }

    // Project landing into hole-frame coordinates
    const { s, u } = projectToHoleFrame(landing, centerLine, tee, heading);

    outcomes.push({ s, u, lie, penalty, isTerminal: onGreen, distToPin });
  }

  return {
    outcomes,
    pGreen: greenCount / sampleCount,
    pFairway: fairwayCount / sampleCount,
  };
}

// ---------------------------------------------------------------------------
// Outcome Table (precomputed for all anchor-action pairs)
// ---------------------------------------------------------------------------

function buildOutcomeTable(
  anchors: AnchorState[],
  distributions: ClubDistribution[],
  hole: CourseHole,
  bearingStep: number,
  elevProfile: ElevationProfile,
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  heading: number,
): ActionOutcomes[] {
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const pinElev = hole.pin.elevation;
  const entries: ActionOutcomes[] = [];

  const maxCarry = distributions.reduce((m, d) => Math.max(m, d.meanCarry + 2 * d.stdCarry), 0);

  for (const anchor of anchors) {
    if (anchor.isTerminal) continue;

    const clubs = getEligibleClubs(anchor, distributions, pinElev);
    // Pass pin bearing for EVERY anchor so the direct-to-pin angle is
    // always in the bearing fan — prevents OB on doglegs where
    // localBearing diverges from the pin direction.
    const pinBearing = bearingBetween(anchor.position, pin);
    // Include fairway centroid bearings for all anchors
    let fairwayBearings: number[] | undefined;
    const fairways = hole.fairway ?? [];
    if (fairways.length > 0) {
      fairwayBearings = fairways.map((poly) => bearingBetween(anchor.position, polygonCentroid(poly)));
    }
    const bearings = getAimBearings(anchor, pin, bearingStep, pinBearing, fairwayBearings);
    const sampleCount = samplesForAnchor(anchor, maxCarry, hole.hazards);

    for (let ci = 0; ci < clubs.length; ci++) {
      for (let bi = 0; bi < bearings.length; bi++) {
        const { outcomes, pGreen, pFairway } = sampleOutcomes(
          anchor, clubs[ci], bearings[bi], hole, sampleCount,
          elevProfile, centerLine, tee, heading,
        );
        entries.push({
          key: { anchorId: anchor.id, clubIdx: ci, bearingIdx: bi },
          club: clubs[ci],
          bearing: bearings[bi],
          outcomes,
          pGreen,
          pFairway,
        });
      }
    }
  }

  return entries;
}

/** Expand the tee anchor's bearing grid with 1° steps, filtered to bearings
 *  where the MEAN landing is on the fairway and the trajectory is clear.
 *  Only called when all standard bearings produce terrible strategies. */
function expandTeeBearings(
  anchors: AnchorState[],
  distributions: ClubDistribution[],
  hole: CourseHole,
  existingBearings: Set<number>,
  elevProfile: ElevationProfile,
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  heading: number,
): ActionOutcomes[] {
  const teeAnchor = anchors[0];
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const pinElev = hole.pin.elevation;
  const clubs = getEligibleClubs(teeAnchor, distributions, pinElev);
  const maxCarry = distributions.reduce((m, d) => Math.max(m, d.meanCarry + 2 * d.stdCarry), 0);
  const sampleCount = samplesForAnchor(teeAnchor, maxCarry, hole.hazards);
  const entries: ActionOutcomes[] = [];
  const fairwayPolygons = hole.fairway ?? [];

  // Fine grid: 1° steps across ±BEARING_RANGE
  for (let offset = -BEARING_RANGE; offset <= BEARING_RANGE; offset += 1) {
    const b = (teeAnchor.localBearing + offset + 360) % 360;
    const bKey = Math.round(b);
    if (existingBearings.has(bKey)) continue;

    for (let ci = 0; ci < clubs.length; ci++) {
      const club = clubs[ci];

      // Check mean landing is on fairway
      const totalDist = club.meanTotal ?? club.meanCarry;
      const eld = teeAnchor.distFromTee + totalDist;
      const landElev = getProfileElevation(elevProfile, eld);
      const adjDist = totalDist - (landElev - teeAnchor.elevation) * ELEV_YARDS_PER_METER;
      const meanLanding = projectPoint(teeAnchor.position, b, adjDist);

      let onFairway = false;
      for (const fw of fairwayPolygons) {
        if (fw.length >= 3 && pointInPolygon(meanLanding, fw)) {
          onFairway = true;
          break;
        }
      }
      if (!onFairway) continue;

      // Check trajectory is safe
      const trajCheck = checkTreeTrajectory(teeAnchor.position, b, club.meanCarry, hole.hazards, club);
      if (trajCheck.hitTrees || trajCheck.hitOB) continue;

      // Safe fairway landing — evaluate this action
      const { outcomes, pGreen, pFairway } = sampleOutcomes(
        teeAnchor, club, b, hole, sampleCount,
        elevProfile, centerLine, tee, heading,
      );

      const bi = 1000 + offset + BEARING_RANGE; // unique bearing index
      entries.push({
        key: { anchorId: teeAnchor.id, clubIdx: ci, bearingIdx: bi },
        club,
        bearing: b,
        outcomes,
        pGreen,
        pFairway,
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Spatial Index (for efficient k-nearest lookup during interpolation)
// ---------------------------------------------------------------------------

function getLieGroup(lie: LieClass): LieGroup {
  switch (lie) {
    case 'fairway': return 'fairway';
    case 'rough': case 'trees': case 'recovery': return 'offFairway';
    case 'fairway_bunker': case 'greenside_bunker': return 'bunker';
    case 'green': return 'green';
  }
}

function buildSpatialIndex(anchors: AnchorState[]): SpatialIndex {
  const index: SpatialIndex = { fairway: [], offFairway: [], bunker: [], green: [] };
  for (const a of anchors) {
    if (a.isTerminal) continue;
    index[getLieGroup(a.lie)].push(a);
  }
  // Sort each group by s for binary search
  for (const key of Object.keys(index) as LieGroup[]) {
    index[key].sort((a, b) => a.s - b.s);
  }
  return index;
}

// ---------------------------------------------------------------------------
// Interpolation Engine
// ---------------------------------------------------------------------------

function findKNearestCompatible(
  s: number,
  u: number,
  lie: LieClass,
  index: SpatialIndex,
): { anchor: AnchorState; weight: number; minLateralDist: number }[] {
  const group = getLieGroup(lie);
  let candidates = index[group];

  // Fallback: try all non-terminal anchors
  if (candidates.length === 0) {
    candidates = [...index.fairway, ...index.offFairway, ...index.bunker];
    candidates.sort((a, b) => a.s - b.s);
  }
  if (candidates.length === 0) return [];

  // Binary search for closest s
  let lo = 0;
  let hi = candidates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candidates[mid].s < s) lo = mid + 1;
    else hi = mid;
  }

  // Scan outward from lo to find k nearest in (s, u) space
  const scored: { anchor: AnchorState; dist: number; absU: number; weight: number }[] = [];
  const scanRadius = Math.max(K_NEIGHBORS * 3, 20);
  const startIdx = Math.max(0, lo - scanRadius);
  const endIdx = Math.min(candidates.length, lo + scanRadius);

  for (let i = startIdx; i < endIdx; i++) {
    const a = candidates[i];
    const ds = a.s - s;
    const du = a.u - u;
    if (Math.abs(ds) > KERNEL_H_S * 3 && scored.length >= K_NEIGHBORS) continue;

    const dist = Math.sqrt(ds * ds + du * du);
    const absU = Math.abs(du);
    const weight = Math.exp(-(ds * ds) / (2 * KERNEL_H_S * KERNEL_H_S) - (du * du) / (2 * KERNEL_H_U * KERNEL_H_U));
    scored.push({ anchor: a, dist, absU, weight });
  }

  // Sort by distance and take k nearest
  scored.sort((a, b) => a.dist - b.dist);
  const selected = scored.slice(0, K_NEIGHBORS);

  if (selected.length === 0) return [];

  // Track minimum lateral distance to any selected anchor
  const minLateralDist = Math.min(...selected.map(item => item.absU));

  // Normalize weights
  const totalWeight = selected.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight < 1e-10) {
    // All weights near zero — use uniform over nearest
    const uniform = 1 / selected.length;
    return selected.map(item => ({ anchor: item.anchor, weight: uniform, minLateralDist }));
  }

  return selected.map(item => ({ anchor: item.anchor, weight: item.weight / totalWeight, minLateralDist }));
}

function interpolateValue(
  s: number,
  u: number,
  lie: LieClass,
  index: SpatialIndex,
  V: Map<number, number>,
): number {
  const neighbors = findKNearestCompatible(s, u, lie, index);

  if (neighbors.length === 0) {
    return 10; // pessimistic fallback
  }

  let value = 0;
  for (const { anchor, weight } of neighbors) {
    value += weight * (V.get(anchor.id) ?? 10);
  }

  // Extrapolation penalty: when the ball lands far outside the anchor grid
  // laterally, the Gaussian kernel gives near-zero weights and falls back to
  // uniform, making extreme offline positions look as good as on-target ones.
  // Only penalize the lateral (u) component — being far ahead/behind on the
  // centerline is handled by the s-direction kernel and anchor coverage.
  const minLateralDist = neighbors[0].minLateralDist;
  if (minLateralDist > KERNEL_H_U) {
    value += (minLateralDist - KERNEL_H_U) * 0.05;
  }

  return value;
}

// ---------------------------------------------------------------------------
// Short-Game Override (inside 60 yards — bypass interpolation)
// ---------------------------------------------------------------------------

function shortGameValue(distToPin: number, lie: LieClass): number {
  switch (lie) {
    case 'green':
      return expectedPutts(distToPin);
    case 'fairway':
      return 1 + expectedPutts(Math.max(3, distToPin * 0.15));
    case 'rough':
      return 1 + expectedPutts(Math.max(5, distToPin * 0.25));
    case 'fairway_bunker':
      return 1.2 + expectedPutts(Math.max(8, distToPin * 0.3));
    case 'greenside_bunker':
      return 1.1 + expectedPutts(Math.max(6, distToPin * 0.25));
    case 'trees':
      return 1.5 + expectedPutts(Math.max(10, distToPin * 0.35));
    case 'recovery':
      return 2.0 + expectedPutts(Math.max(12, distToPin * 0.4));
  }
}

// ---------------------------------------------------------------------------
// Value Iteration (interpolation-based Q-value computation)
// ---------------------------------------------------------------------------

interface ValueIterationResult {
  policy: Map<number, PolicyEntry>;
  values: Map<number, number>;
}

function evaluateOutcome(
  outcome: LandingOutcome,
  spatialIndex: SpatialIndex,
  V: Map<number, number>,
): number {
  if (outcome.isTerminal) {
    return expectedPutts(outcome.distToPin);
  }
  if (outcome.distToPin <= SHORT_GAME_THRESHOLD) {
    return shortGameValue(outcome.distToPin, outcome.lie);
  }
  return interpolateValue(outcome.s, outcome.u, outcome.lie, spatialIndex, V);
}

function valueIteration(
  anchors: AnchorState[],
  outcomeTable: ActionOutcomes[],
  mode: ScoringMode,
  distributions: ClubDistribution[],
  spatialIndex: SpatialIndex,
): ValueIterationResult {
  const pin = anchors[anchors.length - 1].position;

  // Initialize values
  const V = new Map<number, number>();
  for (const a of anchors) {
    if (a.isTerminal) {
      V.set(a.id, expectedPutts(0));
    } else {
      V.set(a.id, 10); // pessimistic initial
    }
  }

  const policy = new Map<number, PolicyEntry>();
  const modeV = new Map<number, number>(V);

  // Group table entries by anchor for fast lookup
  const byAnchor = new Map<number, ActionOutcomes[]>();
  for (const entry of outcomeTable) {
    const list = byAnchor.get(entry.key.anchorId) ?? [];
    list.push(entry);
    byAnchor.set(entry.key.anchorId, list);
  }

  for (let iter = 0; iter < MAX_VALUE_ITERATIONS; iter++) {
    let maxDelta = 0;

    for (const anchor of anchors) {
      if (anchor.isTerminal) continue;

      const actions = byAnchor.get(anchor.id);
      if (!actions || actions.length === 0) {
        // No eligible clubs — estimate strokes-to-hole realistically
        const chipDist = haversineYards(anchor.position, pin);
        const minCarry = Math.min(...distributions.map(d => d.meanCarry));
        let chipValue: number;
        if (chipDist <= minCarry) {
          chipValue = 1 + expectedPutts(Math.max(3, chipDist * 0.1));
        } else {
          const approachClub = greedyClub(chipDist, distributions);
          const expectedMiss = Math.abs(chipDist - approachClub.meanCarry) + approachClub.stdCarry;
          chipValue = 1 + expectedPutts(expectedMiss);
        }
        V.set(anchor.id, chipValue);
        continue;
      }

      let bestModeValue = Infinity;
      let bestMeanQ = Infinity;
      let bestEntry: ActionOutcomes | undefined;

      for (const entry of actions) {
        const N = entry.outcomes.length;
        let sumQ = 0;
        let sumQSq = 0;

        for (const outcome of entry.outcomes) {
          const contV = evaluateOutcome(outcome, spatialIndex, V);
          const q = 1 + outcome.penalty + contV;
          sumQ += q;
          sumQSq += q * q;
        }

        const meanQ = sumQ / N;
        const variance = sumQSq / N - meanQ * meanQ;

        let modeValue: number;
        if (mode === 'scoring') {
          modeValue = meanQ - FAIRWAY_PREFERENCE * entry.pFairway;
        } else if (mode === 'safe') {
          modeValue = meanQ + SAFE_VARIANCE_WEIGHT * Math.sqrt(Math.max(0, variance));
        } else {
          // aggressive — reward green attainment
          modeValue = meanQ - AGGRESSIVE_GREEN_BONUS * entry.pGreen;
        }

        if (modeValue < bestModeValue) {
          bestModeValue = modeValue;
          bestMeanQ = meanQ;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        const oldModeV = modeV.get(anchor.id) ?? 10;
        V.set(anchor.id, bestMeanQ);
        modeV.set(anchor.id, bestModeValue);
        // Convergence tracks mode-adjusted values so safe/aggressive don't terminate early
        maxDelta = Math.max(maxDelta, Math.abs(bestModeValue - oldModeV));

        policy.set(anchor.id, {
          clubIdx: bestEntry.key.clubIdx,
          bearingIdx: bestEntry.key.bearingIdx,
          bearing: bestEntry.bearing,
          value: bestModeValue,
        });
      }
    }

    if (maxDelta < CONVERGENCE_THRESHOLD) break;
  }

  return { policy, values: V };
}

// ---------------------------------------------------------------------------
// Alternative Tee Action (for diversity enforcement)
// ---------------------------------------------------------------------------

function findAlternativeTeeAction(
  anchors: AnchorState[],
  outcomeTable: ActionOutcomes[],
  values: Map<number, number>,
  mode: ScoringMode,
  excludeClubs: Set<string>,
  spatialIndex: SpatialIndex,
): { clubIdx: number; bearing: number } | null {
  const teeAnchor = anchors[0];
  const teeActions = outcomeTable.filter((e) => e.key.anchorId === teeAnchor.id);

  let bestValue = Infinity;
  let bestAction: { clubIdx: number; bearing: number } | null = null;

  for (const entry of teeActions) {
    if (excludeClubs.has(entry.club.clubName)) continue;

    const N = entry.outcomes.length;
    let sumQ = 0;
    let sumQSq = 0;

    for (const outcome of entry.outcomes) {
      const contV = evaluateOutcome(outcome, spatialIndex, values);
      const q = 1 + outcome.penalty + contV;
      sumQ += q;
      sumQSq += q * q;
    }

    const meanQ = sumQ / N;
    const variance = sumQSq / N - meanQ * meanQ;

    let modeValue: number;
    if (mode === 'scoring') {
      modeValue = meanQ - FAIRWAY_PREFERENCE * entry.pFairway;
    } else if (mode === 'safe') {
      modeValue = meanQ + SAFE_VARIANCE_WEIGHT * Math.sqrt(Math.max(0, variance));
    } else {
      modeValue = meanQ - AGGRESSIVE_GREEN_BONUS * entry.pGreen;
    }

    if (modeValue < bestValue) {
      bestValue = modeValue;
      bestAction = { clubIdx: entry.key.clubIdx, bearing: entry.bearing };
    }
  }

  return bestAction;
}

// ---------------------------------------------------------------------------
// Helpers for extractPlan
// ---------------------------------------------------------------------------

/** Try nearby bearing offsets to avoid OB/hazard and prefer fairway landings.
 *  HARD CONSTRAINT: never returns a bearing whose landing is in OB.
 *  When requireFairway is true, searches all candidate bearings and picks
 *  the one whose expected landing is most centered on the fairway. */
function findSafeBearing(
  origin: { lat: number; lng: number },
  initialBearing: number,
  adjustedTotalDist: number,
  club: ClubDistribution,
  hole: CourseHole,
  pin: { lat: number; lng: number },
  requireFairway: boolean = false,
): { bearing: number; rawLanding: { lat: number; lng: number }; penalty: number } {

  // Expected landing accounting for player's systematic miss
  const expectedLandingAt = (b: number, raw: { lat: number; lng: number }) => {
    if (Math.abs(club.meanOffline) <= 0.5) return raw;
    return projectPoint(raw, b + 90, club.meanOffline);
  };

  // Check if a point is on fairway or green
  const isOnFairwayOrGreen = (pt: { lat: number; lng: number }) => {
    if (hole.green && hole.green.length >= 3 && pointInPolygon(pt, hole.green)) return true;
    if (!hole.fairway || hole.fairway.length === 0) return true; // no polygon data = assume OK
    return hole.fairway.some(poly => poly.length >= 3 && pointInPolygon(pt, poly));
  };

  // Find centroid of the fairway polygon containing a point
  const fairwayCentroidAt = (pt: { lat: number; lng: number }) => {
    if (!hole.fairway) return null;
    for (const poly of hole.fairway) {
      if (poly.length >= 3 && pointInPolygon(pt, poly)) {
        return polygonCentroid(poly);
      }
    }
    return null;
  };

  const bearing = initialBearing;
  const rawLanding = projectPoint(origin, bearing, adjustedTotalDist);

  const trajHit = checkTreeTrajectory(origin, bearing, club.meanCarry, hole.hazards, club);
  const hazDrop = resolveHazardDrop(
    origin, rawLanding,
    hole.hazards ?? [], hole.fairway ?? [], hole.green ?? [], HAZARD_DROP_PENALTY,
  );

  const expLanding = expectedLandingAt(bearing, rawLanding);
  const onFairway = isOnFairwayOrGreen(expLanding);

  // Search for alternatives if: OB, hazard drop near origin, off fairway,
  // or requireFairway (always search for best-centered bearing)
  const needsSearch = trajHit.hitOB
    || (hazDrop.penalty > 0 && haversineYards(hazDrop.landing, origin) < 5)
    || requireFairway;

  if (needsSearch) {
    let bestAlt = { bearing, rawLanding, penalty: hazDrop.penalty };
    let bestFairway: { bearing: number; rawLanding: { lat: number; lng: number }; penalty: number } | null = null;
    let bestFairwayCenterDist = Infinity;

    // Score the initial bearing as a candidate too
    if (!trajHit.hitOB && hazDrop.penalty === 0 && onFairway) {
      const centroid = fairwayCentroidAt(expLanding);
      bestFairwayCenterDist = centroid ? haversineYards(expLanding, centroid) : Infinity;
      bestFairway = { bearing, rawLanding, penalty: 0 };
    }

    // Try offset bearings + pin bearing as candidates
    const pinBearing = bearingBetween(origin, pin);
    const offsets = [3, -3, 6, -6, 10, -10, 15, -15, 20, -20, 25, -25, 30, -30];
    const candidates = [
      ...offsets.map(o => (bearing + o + 360) % 360),
      pinBearing, // always try direct-to-pin
    ];

    for (const altBearing of candidates) {
      const altTraj = checkTreeTrajectory(origin, altBearing, club.meanCarry, hole.hazards, club);
      if (altTraj.hitOB) continue;
      const altLanding = projectPoint(origin, altBearing, adjustedTotalDist);
      const altHaz = resolveHazardDrop(
        origin, altLanding,
        hole.hazards ?? [], hole.fairway ?? [], hole.green ?? [], HAZARD_DROP_PENALTY,
      );

      const altExp = expectedLandingAt(altBearing, altLanding);
      const altOnFairway = isOnFairwayOrGreen(altExp);

      if (altHaz.penalty === 0 && altOnFairway) {
        // Score by distance to fairway centroid (lower = more centered)
        const centroid = fairwayCentroidAt(altExp);
        const centerDist = centroid ? haversineYards(altExp, centroid) : Infinity;
        if (centerDist < bestFairwayCenterDist) {
          bestFairway = { bearing: altBearing, rawLanding: altLanding, penalty: 0 };
          bestFairwayCenterDist = centerDist;
        }
      }

      // Track best fairway option even with hazard penalty
      if (requireFairway && altOnFairway && !bestFairway) {
        bestFairway = { bearing: altBearing, rawLanding: altLanding, penalty: altHaz.penalty };
      }

      // Track lowest-penalty alternative
      if (altHaz.penalty < bestAlt.penalty) {
        bestAlt = { bearing: altBearing, rawLanding: altLanding, penalty: altHaz.penalty };
      }
    }

    // Prefer most-centered fairway option over lowest-penalty option
    return bestFairway ?? bestAlt;
  }

  return { bearing, rawLanding, penalty: hazDrop.penalty };
}

/** Build an approach shot toward the pin with elevation adjustment. */
function buildApproachShot(
  landingPoint: { lat: number; lng: number },
  distToPin: number,
  pin: { lat: number; lng: number },
  pinElev: number,
  anchors: AnchorState[],
  distributions: ClubDistribution[],
): NamedStrategyPlan['shots'][number] {
  const nearAnchor = findNearestAnchor(landingPoint, anchors);
  const elevAdj = nearAnchor
    ? (pinElev - nearAnchor.elevation) * ELEV_YARDS_PER_METER
    : 0;
  const playsLikeDist = Math.round(distToPin + elevAdj);
  const approachClub = greedyClub(playsLikeDist, distributions);
  return { clubDist: approachClub, aimPoint: pin, displayCarry: playsLikeDist };
}

// ---------------------------------------------------------------------------
// Policy Extraction → NamedStrategyPlan
// ---------------------------------------------------------------------------

function extractPlan(
  anchors: AnchorState[],
  policy: Map<number, PolicyEntry>,
  distributions: ClubDistribution[],
  hole: CourseHole,
  teeBox: string,
  mode: ScoringMode,
  elevProfile: ElevationProfile,
  forcedFirstAction?: { clubIdx: number; bearing: number },
): NamedStrategyPlan {
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const pinElev = hole.pin.elevation;
  const shots: NamedStrategyPlan['shots'] = [];

  const approachThreshold = Math.min(...distributions.map((d) => d.meanCarry));

  let currentAnchor = anchors[0]; // tee
  const maxShots = hole.par + 1;

  for (let i = 0; i < maxShots; i++) {
    if (currentAnchor.isTerminal) break;

    let club: ClubDistribution | undefined;
    let bearing: number;

    if (i === 0 && forcedFirstAction) {
      const clubs = getEligibleClubs(currentAnchor, distributions, pinElev);
      club = clubs[forcedFirstAction.clubIdx];
      bearing = forcedFirstAction.bearing;
    } else {
      const entry = policy.get(currentAnchor.id);
      if (entry) {
        const clubs = getEligibleClubs(currentAnchor, distributions, pinElev);
        club = clubs[entry.clubIdx];
        bearing = entry.bearing;
      } else {
        club = undefined;
        bearing = bearingBetween(currentAnchor.position, pin);
      }
    }

    if (!club) {
      const elevAdj = (pinElev - currentAnchor.elevation) * ELEV_YARDS_PER_METER;
      club = greedyClub(currentAnchor.distToPin + elevAdj, distributions);
      bearing = bearingBetween(currentAnchor.position, pin);
    }

    // Elevation-adjusted total distance for expected landing
    const totalDist = club.meanTotal ?? club.meanCarry;
    const elevLandingDist = currentAnchor.distFromTee + totalDist;
    const landingElev = getProfileElevation(elevProfile, elevLandingDist);
    const elevDelta = landingElev - currentAnchor.elevation;
    const adjustedTotalDist = totalDist - elevDelta * ELEV_YARDS_PER_METER;

    // Find safe bearing (avoids OB/hazard, prefers fairway for non-approach shots)
    const isApproach = currentAnchor.distToPin <= approachThreshold;
    const safe = findSafeBearing(currentAnchor.position, bearing, adjustedTotalDist, club, hole, pin, !isApproach);
    bearing = safe.bearing;
    let aimPoint = safe.rawLanding;

    // HARD CONSTRAINT: never recommend a shot into or through OB
    const obLanding = checkHazards(aimPoint, hole.hazards ?? []);
    const obTraj = checkTreeTrajectory(currentAnchor.position, bearing, club.meanCarry, hole.hazards, club);
    if (obLanding.hazardType === 'ob' || obTraj.hitOB) {
      // Try pin bearing first
      const pinBearing = bearingBetween(currentAnchor.position, pin);
      const pinTraj = checkTreeTrajectory(currentAnchor.position, pinBearing, club.meanCarry, hole.hazards, club);
      if (!pinTraj.hitOB) {
        bearing = pinBearing;
        aimPoint = projectPoint(currentAnchor.position, bearing, adjustedTotalDist);
      } else {
        // Pin bearing also crosses OB — use findSafeBearing's best result
        bearing = safe.bearing;
        aimPoint = safe.rawLanding;

        // Fix 5: If safe bearing still has penalty, try shorter clubs
        if (safe.penalty > 0) {
          const eligible = getEligibleClubs(currentAnchor, distributions, pinElev);
          const currentIdx = eligible.findIndex(c => c.clubId === club!.clubId);
          for (let ci = currentIdx + 1; ci < eligible.length; ci++) {
            const shorter = eligible[ci];
            const shorterDist = shorter.meanTotal ?? shorter.meanCarry;
            const shorterSafe = findSafeBearing(
              currentAnchor.position, bearing, shorterDist, shorter, hole, pin,
            );
            if (shorterSafe.penalty === 0) {
              club = shorter;
              bearing = shorterSafe.bearing;
              aimPoint = shorterSafe.rawLanding;
              break;
            }
          }
        }
      }
    }

    // Resolve final landing after hazard drops
    const hazDrop = resolveHazardDrop(
      currentAnchor.position, aimPoint,
      hole.hazards ?? [], hole.fairway ?? [], hole.green ?? [], HAZARD_DROP_PENALTY,
    );
    const landing = hazDrop.landing;

    // Slope-adjusted carry: how far the club effectively covers on this terrain
    const adjustedCarry = Math.round(club.meanCarry - elevDelta * ELEV_YARDS_PER_METER);
    shots.push({ clubDist: { ...club, meanCarry: adjustedCarry }, aimPoint });

    const landingDist = haversineYards(landing, pin);

    if (isOnGreen(landing, hole.green, hole.pin)) break;

    if (landingDist < CHIP_RANGE) break;

    if (landingDist <= approachThreshold) {
      shots.push(buildApproachShot(landing, landingDist, pin, pinElev, anchors, distributions));
      break;
    }

    const landingLie = classifyLie(landing, hole.fairway ?? [], hole.green ?? [], hole.hazards);
    const nextAnchor = findNearestAnchor(landing, anchors, landingLie);
    if (nextAnchor.isTerminal) break;

    currentAnchor = nextAnchor;
  }

  // Post-loop: if last shot lands within approach range but we didn't add approach yet
  if (shots.length > 0) {
    const lastShot = shots[shots.length - 1];
    const lastLandingDist = haversineYards(lastShot.aimPoint, pin);
    if (lastLandingDist >= CHIP_RANGE && lastLandingDist <= approachThreshold) {
      shots.push(buildApproachShot(lastShot.aimPoint, lastLandingDist, pin, pinElev, anchors, distributions));
    }
  }

  if (shots.length === 0) {
    const dist = hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
    const fallbackClub = distributions.reduce((best, c) =>
      Math.abs(c.meanCarry - dist) < Math.abs(best.meanCarry - dist) ? c : best,
    );
    shots.push({ clubDist: fallbackClub, aimPoint: pin });
  }

  const { name, type } = modeLabel(mode, hole.holeNumber);
  return { name, type, shots };
}

// ---------------------------------------------------------------------------
// Post-Plan Validation (diagnostic — logs warnings for bad plans)
// ---------------------------------------------------------------------------

function validatePlan(
  plan: NamedStrategyPlan,
  hole: CourseHole,
  tee: { lat: number; lng: number },
  elevProfile: ElevationProfile,
): string[] {
  const issues: string[] = [];
  let currentPos = tee;

  for (let i = 0; i < plan.shots.length; i++) {
    const shot = plan.shots[i];
    const bearing = bearingBetween(currentPos, shot.aimPoint);

    // Expected landing accounts for player's systematic miss (meanOffline)
    const expectedLanding = Math.abs(shot.clubDist.meanOffline) > 0.5
      ? projectPoint(shot.aimPoint, bearing + 90, shot.clubDist.meanOffline)
      : shot.aimPoint;

    // Check trajectory for OB crossing
    const traj = checkTreeTrajectory(
      currentPos, bearing, shot.clubDist.meanCarry, hole.hazards, shot.clubDist,
    );
    if (traj.hitOB) {
      issues.push(`Shot ${i + 1} (${shot.clubDist.clubName}) trajectory crosses OB`);
    }

    // Check landing position for OB
    const landing = checkHazards(expectedLanding, hole.hazards ?? []);
    if (landing.hazardType === 'ob') {
      issues.push(`Shot ${i + 1} (${shot.clubDist.clubName}) lands in OB`);
    }

    // Check non-approach shots land on fairway
    const isLast = i === plan.shots.length - 1;
    if (!isLast && hole.fairway && hole.fairway.length > 0) {
      const onFairway = hole.fairway.some(poly => pointInPolygon(expectedLanding, poly));
      const onGreen = hole.green ? pointInPolygon(expectedLanding, hole.green) : false;
      if (!onFairway && !onGreen) {
        issues.push(`Shot ${i + 1} (${shot.clubDist.clubName}) lands off fairway`);
      }
    }

    // Check landing slope
    const landingDist = haversineYards(tee, expectedLanding);
    const slope = getProfileSlope(elevProfile, landingDist);
    if (Math.abs(slope) > STEEP_SLOPE_THRESHOLD) {
      issues.push(`Shot ${i + 1} lands on steep slope (${(Math.abs(slope) * 100).toFixed(0)}% grade)`);
    }

    currentPos = expectedLanding;
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Single-Shot Simulation (shared physics for policy + greedy loops)
// ---------------------------------------------------------------------------

interface ShotSimResult {
  landing: { lat: number; lng: number };
  /** Extra strokes from tree hits (0.5), OB (1), and hazard drops */
  extraStrokes: number;
  hitTree: boolean;
}

function simulateSingleShot(
  currentPos: { lat: number; lng: number },
  club: ClubDistribution,
  shotBearing: number,
  lieMultiplier: number,
  centerLine: { lat: number; lng: number }[],
  tee: { lat: number; lng: number },
  heading: number,
  elevProfile: ElevationProfile,
  hole: CourseHole,
): ShotSimResult {
  const carry = gaussianSample(club.meanCarry, club.stdCarry * lieMultiplier);
  const offline = gaussianSample(club.meanOffline, club.stdOffline * lieMultiplier);

  // Elevation-adjusted ground carry
  const frame = projectToHoleFrame(currentPos, centerLine, tee, heading);
  const distFromTee = Math.max(0, frame.s);
  const currentElev = getProfileElevation(elevProfile, distFromTee);
  const landingDist = distFromTee + carry;
  const landingElev = getProfileElevation(elevProfile, landingDist);
  const elevDelta = landingElev - currentElev;
  const adjCarry = Math.max(0, carry - elevDelta * ELEV_YARDS_PER_METER);

  let landing = projectPoint(currentPos, shotBearing, adjCarry);
  if (Math.abs(offline) > 0.5) {
    landing = projectPoint(landing, shotBearing + 90, offline);
  }

  let extraStrokes = 0;
  let hitTree = false;

  const treeHit = checkTreeTrajectory(currentPos, shotBearing, carry, hole.hazards, club);
  if (treeHit.hitOB) {
    landing = currentPos;
    extraStrokes += 1;
  } else if (treeHit.hitTrees) {
    landing = projectPoint(currentPos, shotBearing, treeHit.hitDistance);
    extraStrokes += 0.5;
    hitTree = true;
  } else {
    const slope = getProfileSlope(elevProfile, landingDist);
    const rollout = computeRollout(carry, club, landing, hole, slope);
    if (rollout > 0.5) landing = projectPoint(landing, shotBearing, rollout);
  }

  if (!treeHit.hitOB) {
    const hazDrop = resolveHazardDrop(currentPos, landing, hole.hazards, hole.fairway, hole.green, HAZARD_DROP_PENALTY);
    extraStrokes += hazDrop.penalty;
    landing = hazDrop.landing;
  }

  return { landing, extraStrokes, hitTree };
}

// ---------------------------------------------------------------------------
// Policy-Following Monte Carlo Simulation
// ---------------------------------------------------------------------------

function simulateWithPolicy(
  plan: NamedStrategyPlan,
  hole: CourseHole,
  distributions: ClubDistribution[],
  anchors: AnchorState[],
  policy: Map<number, PolicyEntry>,
  elevProfile: ElevationProfile,
  centerLine: { lat: number; lng: number }[],
  heading: number,
  trials: number = DEFAULT_TRIALS,
): OptimizedStrategy {
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const minClubCarry = Math.min(...distributions.map((c) => c.meanCarry));
  const chipThreshold = Math.max(HOLE_THRESHOLD, minClubCarry * 0.5);

  const trialScores: number[] = [];
  let fairwayHits = 0;

  for (let t = 0; t < trials; t++) {
    let currentPos = { lat: tee.lat, lng: tee.lng };
    let strokes = 0;
    let currentAnchorId = anchors[0].id;
    let lastHitTree = false;

    for (let shotIdx = 0; shotIdx < MAX_SHOTS_PER_HOLE; shotIdx++) {
      const distToPin = haversineYards(currentPos, pin);
      if (isOnGreen(currentPos, hole.green, hole.pin) || distToPin <= chipThreshold) break;

      const currentAnchor = anchors.find((a) => a.id === currentAnchorId);
      if (!currentAnchor) break;

      let club: ClubDistribution;
      let shotBearing: number;

      const entry = policy.get(currentAnchorId);
      const pinElev = hole.pin.elevation;
      const clubs = entry ? getEligibleClubs(currentAnchor, distributions, pinElev) : [];

      if (entry && entry.clubIdx < clubs.length) {
        club = clubs[entry.clubIdx];
        shotBearing = entry.bearing;
      } else {
        const greedyElevAdj = (pinElev - currentAnchor.elevation) * ELEV_YARDS_PER_METER;
        club = greedyClub(distToPin + greedyElevAdj, distributions);
        shotBearing = bearingBetween(currentPos, pin);
      }

      // Use recovery lie if previous shot hit trees (matches sampleOutcomes classification)
      const effectiveLie = lastHitTree ? 'recovery' as LieClass : currentAnchor.lie;
      const lieMultiplier = LIE_MULTIPLIER[effectiveLie];

      const shot = simulateSingleShot(currentPos, club, shotBearing, lieMultiplier, centerLine, tee, heading, elevProfile, hole);
      strokes += 1 + shot.extraStrokes;
      lastHitTree = shot.hitTree;
      currentPos = shot.landing;

      if (shotIdx === 0 && shot.extraStrokes === 0) {
        fairwayHits++;
      }

      currentAnchorId = findNearestAnchor(currentPos, anchors).id;
    }

    // Greedy approach if still far
    let distToPin = haversineYards(currentPos, pin);
    while (distToPin > chipThreshold && strokes < MAX_SHOTS_PER_HOLE) {
      const greedyFrame = projectToHoleFrame(currentPos, centerLine, tee, heading);
      const greedyDistFromTee = Math.max(0, greedyFrame.s);
      const greedyElev = getProfileElevation(elevProfile, greedyDistFromTee);
      const greedyElevAdj = (hole.pin.elevation - greedyElev) * ELEV_YARDS_PER_METER;
      const club = greedyClub(distToPin + greedyElevAdj, distributions);

      const greedyLie = lastHitTree
        ? 'recovery' as LieClass
        : classifyLie(currentPos, hole.fairway ?? [], hole.green ?? [], hole.hazards);
      const greedyLieMultiplier = LIE_MULTIPLIER[greedyLie];
      const shotBearing = bearingBetween(currentPos, pin);

      const shot = simulateSingleShot(currentPos, club, shotBearing, greedyLieMultiplier, centerLine, tee, heading, elevProfile, hole);
      strokes += 1 + shot.extraStrokes;
      lastHitTree = shot.hitTree;
      currentPos = shot.landing;
      distToPin = haversineYards(currentPos, pin);
    }

    // Putting
    const onGreen = isOnGreen(currentPos, hole.green, hole.pin);
    if (!onGreen && distToPin <= chipThreshold) {
      trialScores.push(strokes + 1 + expectedPutts(3));
    } else {
      trialScores.push(strokes + expectedPutts(distToPin));
    }
  }

  // Compute statistics (filter NaN scores from edge cases)
  const validScores = trialScores.filter((s) => Number.isFinite(s));
  const scoreCount = validScores.length || 1;
  const xS = validScores.length > 0
    ? validScores.reduce((a, b) => a + b, 0) / scoreCount
    : hole.par + 1; // pessimistic fallback
  const variance = validScores.reduce((sum, s) => sum + (s - xS) ** 2, 0) / scoreCount;
  const stdStrokes = Math.sqrt(variance);
  const scoreDist = computeScoreDistribution(validScores, hole.par);
  const blowupRisk = scoreDist.double + scoreDist.worse;

  const aimPoints: AimPoint[] = [];
  let aimFrom = { lat: tee.lat, lng: tee.lng };
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    const bearing = bearingBetween(aimFrom, s.aimPoint);
    const expectedLanding = Math.abs(s.clubDist.meanOffline) > 0.5
      ? projectPoint(s.aimPoint, bearing + 90, s.clubDist.meanOffline)
      : s.aimPoint;
    const isApproach = i === plan.shots.length - 1;
    const displayCarry = s.displayCarry ?? Math.round(s.clubDist.meanCarry);
    aimPoints.push({
      position: expectedLanding,
      clubName: s.clubDist.clubName,
      shotNumber: i + 1,
      carry: displayCarry,
      carryNote: computeCarryNote(aimFrom, s.clubDist.meanCarry, bearing, hole.hazards),
      tip: generateCaddyTip(aimFrom, s.aimPoint, expectedLanding, s.clubDist, hole.hazards, isApproach),
    });
    aimFrom = expectedLanding;
  }

  // Add short game context to last aim point when not on/near pin
  if (aimPoints.length > 0) {
    const distToPin = haversineYards(aimFrom, pin);
    if (distToPin > 1) {
      const lastAp = aimPoints[aimPoints.length - 1];
      lastAp.remainingToPin = Math.round(distToPin);
      lastAp.shortGameStrokes = parseFloat(shortGameValue(distToPin, 'fairway').toFixed(1));
    }
  }

  const label = plan.shots
    .map((s) => `${s.clubDist.clubName} (${s.displayCarry ?? Math.round(s.clubDist.meanCarry)})`)
    .join(' \u2192 ');

  return {
    clubs: plan.shots.map((s) => ({ clubId: s.clubDist.clubId, clubName: s.clubDist.clubName })),
    expectedStrokes: xS,
    stdStrokes,
    label,
    strategyName: plan.name,
    strategyType: plan.type,
    scoreDistribution: scoreDist,
    blowupRisk,
    fairwayRate: fairwayHits / trials,
    aimPoints,
  };
}

// ---------------------------------------------------------------------------
// Top-Level Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run DP optimization for a single hole. Returns one OptimizedStrategy per mode
 * (scoring, safe, aggressive), sorted by expected strokes ascending.
 *
 * The outcome table is built once and shared across all 3 modes.
 */
export function dpOptimizeHole(
  hole: CourseHole,
  teeBox: string,
  distributions: ClubDistribution[],
  constants: StrategyConstants = DEFAULT_STRATEGY_CONSTANTS,
): OptimizedStrategy[] {
  if (distributions.length === 0) return [];

  // Apply configurable constants (dp-optimizer local + strategy-optimizer shared)
  applyConstants(constants);
  applyStrategyConstants(constants);

  // 1. Discretize hole into anchor states (with elevation profile)
  const { anchors, elevProfile, centerLine } = discretizeHole(hole, teeBox);
  if (anchors.length < 2) return [];

  // 2. Build outcome table (shared across modes)
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const heading = bearingBetween(tee, { lat: hole.pin.lat, lng: hole.pin.lng });
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 400;
  const bearingStep = bearingStepForDistance(yardage);
  const initialOutcome = buildOutcomeTable(anchors, distributions, hole, bearingStep, elevProfile, centerLine, tee, heading);
  if (initialOutcome.length === 0) return [];

  // 3. Build spatial index for interpolation
  const spatialIndex = buildSpatialIndex(anchors);

  const modes: ScoringMode[] = ['scoring', 'safe', 'aggressive'];
  const plans: NamedStrategyPlan[] = [];
  const results: OptimizedStrategy[] = [];

  // 4. Value iteration for all modes
  const initialPolicies: Map<number, PolicyEntry>[] = [];
  const initialValues: Map<number, number>[] = [];
  for (const mode of modes) {
    const { policy, values } = valueIteration(anchors, initialOutcome, mode, distributions, spatialIndex);
    initialPolicies.push(policy);
    initialValues.push(values);
  }

  // 4b. Expand tee bearings if all strategies are terrible (no safe landing)
  let outcomeTable = initialOutcome;
  let policies = initialPolicies;
  let allValues = initialValues;

  const teeValue = initialValues[0].get(0) ?? 10;
  if (teeValue > hole.par + 2) {
    const existingBearings = new Set(
      initialOutcome.filter((e) => e.key.anchorId === 0).map((e) => Math.round(e.bearing)),
    );
    const expanded = expandTeeBearings(
      anchors, distributions, hole, existingBearings, elevProfile, centerLine, tee, heading,
    );
    if (expanded.length > 0) {
      outcomeTable = [...initialOutcome, ...expanded];
      const expandedPolicies: Map<number, PolicyEntry>[] = [];
      const expandedValues: Map<number, number>[] = [];
      for (const mode of modes) {
        const { policy, values } = valueIteration(anchors, outcomeTable, mode, distributions, spatialIndex);
        expandedPolicies.push(policy);
        expandedValues.push(values);
      }
      policies = expandedPolicies;
      allValues = expandedValues;
    }
  }

  // 5. Extract initial plans
  for (let i = 0; i < modes.length; i++) {
    if (policies[i].size === 0) {
      const ml = modeLabel(modes[i], hole.holeNumber);
      plans.push({ name: ml.name, type: ml.type, shots: [] });
    } else {
      plans.push(extractPlan(anchors, policies[i], distributions, hole, teeBox, modes[i], elevProfile));
    }
  }

  // 6. Diversity enforcement — ensure unique full club sequences across strategies
  //    Allow shared first clubs; only swap when the entire sequence is identical.
  const planClubKey = (p: NamedStrategyPlan) => p.shots.map((s) => s.clubDist.clubName).join('|');
  const usedKeys = new Set<string>();
  const keyToFirstClub = new Map<string, string>();
  for (let i = 0; i < plans.length; i++) {
    const key = planClubKey(plans[i]);
    if (!plans[i].shots[0]) continue;

    if (usedKeys.has(key)) {
      // Full sequence is identical — exclude first clubs from all already-unique plans
      // to prevent the alternative from duplicating a different existing plan.
      const excludeClubs = new Set<string>(keyToFirstClub.values());
      excludeClubs.add(plans[i].shots[0]?.clubDist.clubName ?? '');
      const alt = findAlternativeTeeAction(
        anchors, outcomeTable, allValues[i], modes[i],
        excludeClubs, spatialIndex,
      );
      if (alt) {
        plans[i] = extractPlan(anchors, policies[i], distributions, hole, teeBox, modes[i], elevProfile, alt);
      }
    }
    const newKey = planClubKey(plans[i]);
    usedKeys.add(newKey);
    keyToFirstClub.set(newKey, plans[i].shots[0]?.clubDist.clubName ?? '');
  }

  // 6b. Post-plan validation (diagnostic — log warnings)
  for (let i = 0; i < plans.length; i++) {
    if (plans[i].shots.length === 0) continue;
    const issues = validatePlan(plans[i], hole, tee, elevProfile);
    if (issues.length > 0) {
      console.warn(
        `[optimizer] Hole ${hole.holeNumber} "${plans[i].name}" plan issues:\n  ${issues.join('\n  ')}`,
      );
    }
  }

  // 7. Run MC simulations
  for (let i = 0; i < plans.length; i++) {
    if (policies[i].size === 0) continue;

    const strategy = simulateWithPolicy(plans[i], hole, distributions, anchors, policies[i], elevProfile, centerLine, heading);
    strategy.strategyName = plans[i].name;
    strategy.strategyType = plans[i].type;
    results.push(strategy);
  }

  // Deduplicate strategies with identical club sequences
  const seenClubKeys = new Set<string>();
  const unique: OptimizedStrategy[] = [];
  for (const r of results) {
    const key = r.clubs.map((c) => c.clubName).join('|');
    if (seenClubKeys.has(key)) continue;
    seenClubKeys.add(key);
    unique.push(r);
  }

  // Sort by expected strokes ascending, with fairway rate as tiebreaker
  unique.sort((a, b) => {
    const strokeDiff = a.expectedStrokes - b.expectedStrokes;
    if (Math.abs(strokeDiff) > 0.3) return strokeDiff;
    const fairwayDiff = b.fairwayRate - a.fairwayRate;
    if (Math.abs(fairwayDiff) > 0.05) return fairwayDiff;
    return strokeDiff;
  });

  return unique;
}

// ---------------------------------------------------------------------------
// Debug: Trace tee anchor Q-values for each action
// ---------------------------------------------------------------------------

export interface TeeActionTrace {
  clubName: string;
  bearing: number;
  meanQ: number;
  pFairway: number;
  pGreen: number;
  outcomeSummary: {
    lie: LieClass;
    distToPin: number;
    penalty: number;
    contV: number;
    q: number;
    usedShortGame: boolean;
  }[];
}

export function debugTeeActions(
  hole: CourseHole,
  teeBox: string,
  distributions: ClubDistribution[],
  constants: StrategyConstants = DEFAULT_STRATEGY_CONSTANTS,
): TeeActionTrace[] {
  if (distributions.length === 0) return [];

  applyConstants(constants);
  applyStrategyConstants(constants);

  const { anchors, elevProfile, centerLine } = discretizeHole(hole, teeBox);
  if (anchors.length < 2) return [];

  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const heading = bearingBetween(tee, { lat: hole.pin.lat, lng: hole.pin.lng });
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 400;
  const bearingStep = bearingStepForDistance(yardage);
  const outcomeTable = buildOutcomeTable(anchors, distributions, hole, bearingStep, elevProfile, centerLine, tee, heading);

  const spatialIndex = buildSpatialIndex(anchors);

  // Run value iteration to get converged values
  const { values: V } = valueIteration(anchors, outcomeTable, 'scoring', distributions, spatialIndex);

  // Now trace all tee anchor (id=0) actions
  const teeAnchor = anchors[0];
  const pinElev = hole.pin.elevation;
  const eligibleClubs = getEligibleClubs(teeAnchor, distributions, pinElev);
  const teeActions = outcomeTable.filter((e) => e.key.anchorId === 0);
  const traces: TeeActionTrace[] = [];

  for (const entry of teeActions) {
    const club = eligibleClubs[entry.key.clubIdx];
    const outcomeSummary: TeeActionTrace['outcomeSummary'] = [];
    let sumQ = 0;

    for (const outcome of entry.outcomes) {
      const usedShortGame = !outcome.isTerminal && outcome.distToPin <= SHORT_GAME_THRESHOLD;
      const contV = evaluateOutcome(outcome, spatialIndex, V);
      const q = 1 + outcome.penalty + contV;
      sumQ += q;
      outcomeSummary.push({
        lie: outcome.lie,
        distToPin: Math.round(outcome.distToPin * 10) / 10,
        penalty: outcome.penalty,
        contV: Math.round(contV * 1000) / 1000,
        q: Math.round(q * 1000) / 1000,
        usedShortGame,
      });
    }

    traces.push({
      clubName: club.clubName,
      bearing: Math.round(entry.bearing * 10) / 10,
      meanQ: Math.round((sumQ / entry.outcomes.length) * 1000) / 1000,
      pFairway: Math.round(entry.pFairway * 1000) / 1000,
      pGreen: Math.round(entry.pGreen * 1000) / 1000,
      outcomeSummary,
    });
  }

  // Sort by meanQ ascending
  traces.sort((a, b) => a.meanQ - b.meanQ);

  return traces;
}
