import { expectedPutts } from './monte-carlo.js';
import type { ClubDistribution } from './monte-carlo.js';
import type { CourseHole, HazardFeature } from '../models/types.js';
import { projectPoint, haversineYards, pointInPolygon, bearingBetween } from './geo.js';
import {
  gaussianSample,
  greedyClub,
  resolveHazardDrop,
  checkTreeTrajectory,
  compensateForBias,
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

const ZONE_INTERVAL = 20;        // yards between anchor markers along centerline
const LATERAL_OFFSET = 20;       // yards left/right of centerline
const BEARING_RANGE = 30;        // ±degrees from pin bearing
const TEE_LOOK_AHEAD = 200;     // yards — center tee bearing fan on driver landing zone
const SAMPLES_BASE = 100;       // minimum samples for safe anchors
const SAMPLES_HAZARD = 250;     // anchors with hazards in play
const SAMPLES_HIGH_RISK = 350;  // anchors with OB or water in play
const GREEN_RADIUS = 10;         // yards — used for anchor discretization near pin
const MAX_VALUE_ITERATIONS = 50;
const CONVERGENCE_THRESHOLD = 0.001;
const MIN_CARRY_RATIO = 0.5;     // club carry must be ≥ 50% of dist to pin
const MAX_CARRY_RATIO = 1.10;    // club carry must be ≤ 110% of dist to pin
const CHIP_RANGE = 30;           // within this distance, treat as near-green (chip/putt)
const HAZARD_DROP_PENALTY = 0.3; // penalty passed to resolveHazardDrop

// Interpolation constants
const K_NEIGHBORS = 6;
const KERNEL_H_S = 25;           // yards, s-direction bandwidth
const KERNEL_H_U = 20;           // yards, u-direction bandwidth
const SHORT_GAME_THRESHOLD = 60; // yards from pin — bypass interpolation

// Per-lie dispersion multiplier (replaces binary ROUGH_LIE_MULTIPLIER)
const LIE_MULTIPLIER: Record<LieClass, number> = {
  fairway: 1.0,
  rough: 1.15,
  green: 1.0,
  fairway_bunker: 1.25,
  greenside_bunker: 1.20,
  trees: 1.40,
  recovery: 1.60,
};

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
      perpDist = dAP;
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

    for (const lateralDir of [0, -1, 1]) {
      const pos = lateralDir === 0
        ? centerPos
        : projectPoint(centerPos, localBearing + 90, lateralDir * LATERAL_OFFSET);

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
): number {
  let bestId = 0;
  let bestDist = Infinity;
  for (const a of anchors) {
    const d = haversineYards(point, a.position);
    if (d < bestDist) {
      bestDist = d;
      bestId = a.id;
    }
  }
  return bestId;
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
  if (yardage < 180) return 4;
  if (yardage <= 350) return 3;
  return 2;
}

function getAimBearings(
  anchor: AnchorState,
  _pin: { lat: number; lng: number },
  bearingStep: number,
): number[] {
  const center = anchor.localBearing;
  const bearings: number[] = [];
  for (let offset = -BEARING_RANGE; offset <= BEARING_RANGE; offset += bearingStep) {
    bearings.push((center + offset + 360) % 360);
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
    const adjustedCarry = carry - elevDelta * ELEV_YARDS_PER_METER;

    let landing = projectPoint(anchor.position, bearing, adjustedCarry);
    if (Math.abs(offline) > 0.5) {
      landing = projectPoint(landing, bearing + 90, offline);
    }

    let penalty = 0;
    let hitTree = false;

    // Tree collision
    const treeHit = checkTreeTrajectory(anchor.position, bearing, carry, hole.hazards, club);
    if (treeHit.hitTrees) {
      landing = projectPoint(anchor.position, bearing, treeHit.hitDistance);
      penalty += 0.5;
      hitTree = true;
    } else {
      // Apply rollout (slope-adjusted)
      const slope = getProfileSlope(elevProfile, landingDistFromTee);
      const rollout = computeRollout(carry, club, landing, hole, slope);
      if (rollout > 0.5) landing = projectPoint(landing, bearing, rollout);
    }

    // Hazard check
    const hazDrop = resolveHazardDrop(anchor.position, landing, hole.hazards, hole.fairway, hole.green, HAZARD_DROP_PENALTY);
    penalty += hazDrop.penalty;
    landing = hazDrop.landing;

    const distToPin = haversineYards(landing, hole.pin);
    const onGreen = isOnGreen(landing, hole.green, hole.pin);

    // Classify lie at landing
    let lie: LieClass;
    if (onGreen) {
      lie = 'green';
      greenCount++;
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
    const bearings = getAimBearings(anchor, pin, bearingStep);
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
): { anchor: AnchorState; weight: number }[] {
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
  const scored: { anchor: AnchorState; dist: number; weight: number }[] = [];
  const scanRadius = Math.max(K_NEIGHBORS * 3, 20);
  const startIdx = Math.max(0, lo - scanRadius);
  const endIdx = Math.min(candidates.length, lo + scanRadius);

  for (let i = startIdx; i < endIdx; i++) {
    const a = candidates[i];
    const ds = a.s - s;
    const du = a.u - u;
    if (Math.abs(ds) > KERNEL_H_S * 3 && scored.length >= K_NEIGHBORS) continue;

    const dist = Math.sqrt(ds * ds + du * du);
    const weight = Math.exp(-(ds * ds) / (2 * KERNEL_H_S * KERNEL_H_S) - (du * du) / (2 * KERNEL_H_U * KERNEL_H_U));
    scored.push({ anchor: a, dist, weight });
  }

  // Sort by distance and take k nearest
  scored.sort((a, b) => a.dist - b.dist);
  const selected = scored.slice(0, K_NEIGHBORS);

  if (selected.length === 0) return [];

  // Normalize weights
  const totalWeight = selected.reduce((acc, item) => acc + item.weight, 0);
  if (totalWeight < 1e-10) {
    // All weights near zero — use uniform over nearest
    const uniform = 1 / selected.length;
    return selected.map(item => ({ anchor: item.anchor, weight: uniform }));
  }

  return selected.map(item => ({ anchor: item.anchor, weight: item.weight / totalWeight }));
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
  _par: number,
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
          modeValue = meanQ;
        } else if (mode === 'safe') {
          modeValue = meanQ + 1.0 * Math.sqrt(Math.max(0, variance));
        } else {
          // aggressive — reward green attainment
          modeValue = meanQ - 0.6 * entry.pGreen;
        }

        if (modeValue < bestModeValue) {
          bestModeValue = modeValue;
          bestMeanQ = meanQ;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        const oldV = V.get(anchor.id) ?? 10;
        // V stores actual expected strokes (meanQ), not mode-adjusted
        maxDelta = Math.max(maxDelta, Math.abs(bestMeanQ - oldV));
        V.set(anchor.id, bestMeanQ);

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
  _par: number,
  excludeClubs: Set<string>,
  _distributions: ClubDistribution[],
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
      modeValue = meanQ;
    } else if (mode === 'safe') {
      modeValue = meanQ + 1.0 * Math.sqrt(Math.max(0, variance));
    } else {
      modeValue = meanQ - 0.6 * entry.pGreen;
    }

    if (modeValue < bestValue) {
      bestValue = modeValue;
      bestAction = { clubIdx: entry.key.clubIdx, bearing: entry.bearing };
    }
  }

  return bestAction;
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
    const rawLanding = projectPoint(currentAnchor.position, bearing, adjustedTotalDist);

    const hazDrop = resolveHazardDrop(
      currentAnchor.position, rawLanding,
      hole.hazards ?? [], hole.fairway ?? [], hole.green ?? [], HAZARD_DROP_PENALTY,
    );
    const landing = hazDrop.landing;
    const aimPoint = hazDrop.penalty > 0 ? landing : rawLanding;

    shots.push({ clubDist: club, aimPoint });

    const landingDist = haversineYards(landing, pin);

    if (isOnGreen(landing, hole.green, hole.pin)) break;

    if (landingDist < CHIP_RANGE) break;

    if (landingDist <= approachThreshold) {
      const nextAnchorForElev = anchors.find((a) => a.id === findNearestAnchor(landing, anchors));
      const approachElevAdj = nextAnchorForElev
        ? (pinElev - nextAnchorForElev.elevation) * ELEV_YARDS_PER_METER
        : 0;
      const approachClub = greedyClub(landingDist + approachElevAdj, distributions);
      shots.push({
        clubDist: { ...approachClub, meanCarry: landingDist },
        aimPoint: pin,
      });
      break;
    }

    const nextAnchorId = findNearestAnchor(landing, anchors);
    const nextAnchor = anchors.find((a) => a.id === nextAnchorId);
    if (!nextAnchor || nextAnchor.isTerminal) break;

    currentAnchor = nextAnchor;
  }

  // Post-loop: if last shot lands within approach range but we didn't add approach yet
  if (shots.length > 0) {
    const lastShot = shots[shots.length - 1];
    const lastLandingDist = haversineYards(lastShot.aimPoint, pin);
    if (lastLandingDist >= CHIP_RANGE && lastLandingDist <= approachThreshold) {
      const postAnchorForElev = anchors.find((a) => a.id === findNearestAnchor(lastShot.aimPoint, anchors));
      const postElevAdj = postAnchorForElev
        ? (pinElev - postAnchorForElev.elevation) * ELEV_YARDS_PER_METER
        : 0;
      const approachClub = greedyClub(lastLandingDist + postElevAdj, distributions);
      shots.push({
        clubDist: { ...approachClub, meanCarry: lastLandingDist },
        aimPoint: pin,
      });
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
// Policy-Following Monte Carlo Simulation
// ---------------------------------------------------------------------------

function simulateWithPolicy(
  plan: NamedStrategyPlan,
  hole: CourseHole,
  distributions: ClubDistribution[],
  anchors: AnchorState[],
  policy: Map<number, PolicyEntry>,
  elevProfile: ElevationProfile,
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
        const aimPoint = projectPoint(currentAnchor.position, entry.bearing, club.meanCarry);
        shotBearing = bearingBetween(currentPos, aimPoint);
      } else {
        const greedyElevAdj = (pinElev - currentAnchor.elevation) * ELEV_YARDS_PER_METER;
        club = greedyClub(distToPin + greedyElevAdj, distributions);
        const rawBearing = bearingBetween(currentPos, pin);
        const compensatedAim = compensateForBias(pin, rawBearing, club);
        shotBearing = bearingBetween(currentPos, compensatedAim);
      }

      const lieMultiplier = LIE_MULTIPLIER[currentAnchor.lie];

      const carry = gaussianSample(club.meanCarry, club.stdCarry * lieMultiplier);
      const offline = gaussianSample(club.meanOffline, club.stdOffline * lieMultiplier);

      // Elevation-adjusted ground carry
      const policyLandingDist = currentAnchor.distFromTee + carry;
      const policyLandingElev = getProfileElevation(elevProfile, policyLandingDist);
      const policyElevDelta = policyLandingElev - currentAnchor.elevation;
      const policyAdjCarry = carry - policyElevDelta * ELEV_YARDS_PER_METER;

      let landing = projectPoint(currentPos, shotBearing, policyAdjCarry);
      if (Math.abs(offline) > 0.5) {
        landing = projectPoint(landing, shotBearing + 90, offline);
      }

      strokes++;

      const treeHit = checkTreeTrajectory(currentPos, shotBearing, carry, hole.hazards, club);
      if (treeHit.hitTrees) {
        landing = projectPoint(currentPos, shotBearing, treeHit.hitDistance);
        strokes += 0.5;
      } else {
        const policySlope = getProfileSlope(elevProfile, policyLandingDist);
        const rollout = computeRollout(carry, club, landing, hole, policySlope);
        if (rollout > 0.5) landing = projectPoint(landing, shotBearing, rollout);
      }

      const hazDrop = resolveHazardDrop(currentPos, landing, hole.hazards, hole.fairway, hole.green, HAZARD_DROP_PENALTY);
      strokes += hazDrop.penalty;
      landing = hazDrop.landing;

      if (shotIdx === 0 && hazDrop.penalty === 0) {
        fairwayHits++;
      }

      currentPos = landing;
      currentAnchorId = findNearestAnchor(landing, anchors);
    }

    // Greedy approach if still far
    let distToPin = haversineYards(currentPos, pin);
    while (distToPin > chipThreshold && strokes < MAX_SHOTS_PER_HOLE) {
      const greedyDistFromTee = elevProfile.totalDist - distToPin;
      const greedyElev = getProfileElevation(elevProfile, Math.max(0, greedyDistFromTee));
      const greedyElevAdj = (hole.pin.elevation - greedyElev) * ELEV_YARDS_PER_METER;
      const playsLikeDist = distToPin + greedyElevAdj;
      const club = greedyClub(playsLikeDist, distributions);

      const carry = gaussianSample(club.meanCarry, club.stdCarry);
      const offline = gaussianSample(club.meanOffline, club.stdOffline);
      const greedyBearing = bearingBetween(currentPos, pin);
      const compensatedGreedyAim = compensateForBias(pin, greedyBearing, club);
      const shotBearing = bearingBetween(currentPos, compensatedGreedyAim);

      const greedyLandingDist = Math.max(0, greedyDistFromTee) + carry;
      const greedyLandingElev = getProfileElevation(elevProfile, greedyLandingDist);
      const greedyCarryElevDelta = greedyLandingElev - greedyElev;
      const greedyAdjCarry = carry - greedyCarryElevDelta * ELEV_YARDS_PER_METER;

      let landing = projectPoint(currentPos, shotBearing, greedyAdjCarry);
      if (Math.abs(offline) > 0.5) {
        landing = projectPoint(landing, shotBearing + 90, offline);
      }

      strokes++;

      const greedyTreeHit = checkTreeTrajectory(currentPos, shotBearing, carry, hole.hazards, club);
      if (greedyTreeHit.hitTrees) {
        landing = projectPoint(currentPos, shotBearing, greedyTreeHit.hitDistance);
        strokes += 0.5;
      } else {
        const greedySlope = getProfileSlope(elevProfile, greedyLandingDist);
        const rollout = computeRollout(carry, club, landing, hole, greedySlope);
        if (rollout > 0.5) landing = projectPoint(landing, shotBearing, rollout);
      }

      const hazDrop = resolveHazardDrop(currentPos, landing, hole.hazards, hole.fairway, hole.green, HAZARD_DROP_PENALTY);
      strokes += hazDrop.penalty;
      landing = hazDrop.landing;

      currentPos = landing;
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
  const scoreDist = computeScoreDistribution(trialScores, hole.par);
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
    aimPoints.push({
      position: s.aimPoint,
      clubName: s.clubDist.clubName,
      shotNumber: i + 1,
      carry: Math.round(s.clubDist.meanCarry),
      carryNote: computeCarryNote(aimFrom, s.clubDist.meanCarry, bearing, hole.hazards),
      tip: generateCaddyTip(aimFrom, s.aimPoint, expectedLanding, s.clubDist, hole.hazards, isApproach),
    });
    aimFrom = expectedLanding;
  }

  const label = plan.shots
    .map((s) => `${s.clubDist.clubName} (${Math.round(s.clubDist.meanCarry)})`)
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
  _roughPenalty: number = 0.3,
): OptimizedStrategy[] {
  if (distributions.length === 0) return [];

  // 1. Discretize hole into anchor states (with elevation profile)
  const { anchors, elevProfile, centerLine } = discretizeHole(hole, teeBox);
  if (anchors.length < 2) return [];

  // 2. Build outcome table (shared across modes)
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const heading = bearingBetween(tee, { lat: hole.pin.lat, lng: hole.pin.lng });
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 400;
  const bearingStep = bearingStepForDistance(yardage);
  const outcomeTable = buildOutcomeTable(anchors, distributions, hole, bearingStep, elevProfile, centerLine, tee, heading);
  if (outcomeTable.length === 0) return [];

  // 3. Build spatial index for interpolation
  const spatialIndex = buildSpatialIndex(anchors);

  const modes: ScoringMode[] = ['scoring', 'safe', 'aggressive'];
  const policies: Map<number, PolicyEntry>[] = [];
  const allValues: Map<number, number>[] = [];
  const plans: NamedStrategyPlan[] = [];
  const results: OptimizedStrategy[] = [];

  // 4. Value iteration for all modes
  for (const mode of modes) {
    const { policy, values } = valueIteration(anchors, outcomeTable, mode, hole.par, distributions, spatialIndex);
    policies.push(policy);
    allValues.push(values);
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
  const usedFirstClubs = new Set<string>();
  for (let i = 0; i < plans.length; i++) {
    const key = planClubKey(plans[i]);
    if (!plans[i].shots[0]) continue;

    if (usedKeys.has(key)) {
      // Full sequence is identical — try alternative tee club
      const alt = findAlternativeTeeAction(
        anchors, outcomeTable, allValues[i], modes[i], hole.par,
        usedFirstClubs, distributions, spatialIndex,
      );
      if (alt) {
        plans[i] = extractPlan(anchors, policies[i], distributions, hole, teeBox, modes[i], elevProfile, alt);
      }
    }
    usedKeys.add(planClubKey(plans[i]));
    usedFirstClubs.add(plans[i].shots[0]?.clubDist.clubName ?? '');
  }

  // 7. Run MC simulations
  for (let i = 0; i < plans.length; i++) {
    if (policies[i].size === 0) continue;

    const strategy = simulateWithPolicy(plans[i], hole, distributions, anchors, policies[i], elevProfile);
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
