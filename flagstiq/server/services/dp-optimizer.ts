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
} from './strategy-optimizer.js';
import type { OptimizedStrategy, NamedStrategyPlan, AimPoint } from './strategy-optimizer.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScoringMode = 'scoring' | 'safe' | 'aggressive';

interface Zone {
  id: number;
  position: { lat: number; lng: number };
  lie: 'fairway' | 'rough' | 'green';
  distToPin: number;
  isTerminal: boolean;
  localBearing: number;
}

interface PolicyEntry {
  clubIdx: number;    // index into distributions
  bearingIdx: number; // index into aim bearings array
  bearing: number;    // absolute compass bearing
  value: number;
}

interface TransitionResult {
  /** zone id → probability */
  transitions: Map<number, number>;
  expectedPenalty: number;
  penaltyVariance: number;
  /** probability of landing on or near the green in this shot */
  pGreen: number;
  /** probability of landing on the fairway (no penalty, not green) */
  pFairway: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZONE_INTERVAL = 20;        // yards between zone markers along centerline
const LATERAL_OFFSET = 20;       // yards left/right of centerline
const BEARING_RANGE = 30;        // ±degrees from pin bearing
const TEE_LOOK_AHEAD = 200;     // yards — center tee bearing fan on driver landing zone
const SAMPLES_BASE = 100;       // minimum samples for safe zones
const SAMPLES_HAZARD = 250;     // zones with hazards in play
const SAMPLES_HIGH_RISK = 350;  // zones with OB or water in play
const GREEN_RADIUS = 10;         // yards — used for zone discretization near pin
const ROUGH_LIE_MULTIPLIER = 1.15; // rough increases std by 15%
const MAX_VALUE_ITERATIONS = 50;
const CONVERGENCE_THRESHOLD = 0.001;
const MIN_CARRY_RATIO = 0.5;     // club carry must be ≥ 50% of dist to pin
const MAX_CARRY_RATIO = 1.10;    // club carry must be ≤ 110% of dist to pin
const CHIP_RANGE = 30;           // within this distance, treat as near-green (chip/putt)

const MODE_LABELS: Record<ScoringMode, { name: string; type: 'scoring' | 'safe' | 'balanced' }> = {
  scoring: { name: 'Optimal Scoring', type: 'scoring' },
  safe: { name: 'Risk-Averse', type: 'safe' },
  aggressive: { name: 'Birdie Hunt', type: 'balanced' },
};

// ---------------------------------------------------------------------------
// Zone Discretization
// ---------------------------------------------------------------------------

export function discretizeHole(
  hole: CourseHole,
  teeBox: string,
): Zone[] {
  const tee = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const heading = bearingBetween(tee, pin);
  const totalDist = hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  if (totalDist === 0) return [];

  const fairwayPolygons = hole.fairway ?? [];
  let centerLine = hole.centerLine ?? [];
  if (centerLine.length < 2 && fairwayPolygons.length > 0) {
    centerLine = synthesizeCenterLine(tee, pin, totalDist, fairwayPolygons, hole.hazards);
  }
  const greenPoly = hole.green ?? [];
  const zones: Zone[] = [];

  // Tee zone — look ahead to the driver landing zone (~200y), not just 20y.
  // On doglegs, the first 20y is straight; the curve is at 150-250y.
  const teeLookAhead = Math.min(TEE_LOOK_AHEAD, totalDist - GREEN_RADIUS);
  const teeBearing = centerLine.length >= 2
    ? bearingBetween(tee, interpolateCenterLine(centerLine, tee, heading, teeLookAhead))
    : heading;
  zones.push({
    id: 0,
    position: tee,
    lie: 'fairway',
    distToPin: totalDist,
    isTerminal: false,
    localBearing: teeBearing,
  });

  // Walk centerline in intervals
  for (let d = ZONE_INTERVAL; d < totalDist - GREEN_RADIUS; d += ZONE_INTERVAL) {
    const centerPos = interpolateCenterLine(centerLine, tee, heading, d);
    const localBearing = d + ZONE_INTERVAL < totalDist
      ? bearingBetween(centerPos, interpolateCenterLine(centerLine, tee, heading, d + ZONE_INTERVAL))
      : heading;

    for (const lateralDir of [0, -1, 1]) {
      const pos = lateralDir === 0
        ? centerPos
        : projectPoint(centerPos, localBearing + 90, lateralDir * LATERAL_OFFSET);

      const lie = classifyLie(pos, fairwayPolygons, greenPoly);
      const distToPin = haversineYards(pos, pin);

      zones.push({
        id: zones.length,
        position: pos,
        lie,
        distToPin,
        isTerminal: false,
        localBearing,
      });
    }
  }

  // Green zone (terminal) — localBearing from last centerLine point to pin
  const greenBearing = centerLine.length >= 2
    ? bearingBetween(centerLine[centerLine.length - 2], pin)
    : heading;
  zones.push({
    id: zones.length,
    position: pin,
    lie: 'green',
    distToPin: 0,
    isTerminal: true,
    localBearing: greenBearing,
  });

  return zones;
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

function classifyLie(
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
// Synthetic Center Line (for doglegs without centerLine data)
// ---------------------------------------------------------------------------

function scoreCandidatePoint(
  point: { lat: number; lng: number },
  pin: { lat: number; lng: number },
  fairwayPolygons: { lat: number; lng: number }[][],
  hazards: HazardFeature[] | undefined,
): number {
  let score = 0;

  // Reward for being on the fairway
  for (const fw of fairwayPolygons) {
    if (fw.length >= 3 && pointInPolygon(point, fw)) {
      score += 10;
      break;
    }
  }

  // Penalty for being in a hazard
  if (hazards) {
    for (const h of hazards) {
      if (h.polygon.length >= 3 && pointInPolygon(point, h.polygon)) {
        score -= 20;
        break;
      }
    }
  }

  // Small reward for progress toward pin (0–2 range)
  const distToPin = haversineYards(point, pin);
  // Normalize: closer to pin = higher reward, max 2
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
  const stepSize = 20; // yards per step
  let current = tee;

  for (let d = stepSize; d < totalDist - GREEN_RADIUS; d += stepSize) {
    const baseBearing = bearingBetween(current, pin);

    let bestPoint = projectPoint(current, baseBearing, stepSize);
    let bestScore = -Infinity;

    // Fan of bearings: ±75° in 5° increments
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
// Zone Lookup
// ---------------------------------------------------------------------------

function findNearestZone(
  point: { lat: number; lng: number },
  zones: Zone[],
): number {
  let bestId = 0;
  let bestDist = Infinity;
  for (const z of zones) {
    const d = haversineYards(point, z.position);
    if (d < bestDist) {
      bestDist = d;
      bestId = z.id;
    }
  }
  return bestId;
}

// ---------------------------------------------------------------------------
// Action Space
// ---------------------------------------------------------------------------

function getEligibleClubs(
  zone: Zone,
  distributions: ClubDistribution[],
): ClubDistribution[] {
  if (zone.isTerminal) return [];
  const dist = zone.distToPin;
  const isTee = zone.id === 0;
  return distributions.filter((c) => {
    // Drivers can only be hit from the tee
    if (c.category === 'driver' && !isTee) return false;
    return c.meanCarry >= dist * MIN_CARRY_RATIO && c.meanCarry <= dist * MAX_CARRY_RATIO;
  });
}

/** Adaptive bearing step based on hole distance (yards). */
function bearingStepForDistance(yardage: number): number {
  if (yardage < 180) return 4;   // 16 bearings — short holes
  if (yardage <= 350) return 3;  // 21 bearings — mid-length holes
  return 2;                      // 31 bearings — long holes / doglegs
}

function getAimBearings(
  zone: Zone,
  _pin: { lat: number; lng: number },
  bearingStep: number,
): number[] {
  // Center the bearing fan on the local centerLine direction, not the pin.
  // On straight holes localBearing ≈ pinBearing so behavior is unchanged.
  // On doglegs this naturally aims shots down the fairway.
  const center = zone.localBearing;
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

/**
 * Determine how many MC samples a zone needs based on nearby hazard density.
 * Zones with OB/water in the landing area need the most samples for accuracy;
 * zones with only bunkers need moderate samples; safe zones need fewer.
 */
function samplesForZone(zone: Zone, maxCarry: number, hazards: HazardFeature[]): number {
  let hasHighRisk = false;
  let hasPenalty = false;

  for (const h of hazards) {
    if (!PENALTY_TYPES.has(h.type) || h.polygon.length === 0) continue;

    // Check if any vertex of the hazard polygon is within carry range of the zone
    const inRange = h.polygon.some(
      (pt) => haversineYards(zone.position, pt) <= maxCarry * 1.3,
    );
    if (!inRange) continue;

    if (HIGH_RISK_TYPES.has(h.type)) {
      hasHighRisk = true;
      break; // no need to check further
    }
    hasPenalty = true;
  }

  if (hasHighRisk) return SAMPLES_HIGH_RISK;
  if (hasPenalty) return SAMPLES_HAZARD;
  return SAMPLES_BASE;
}

// ---------------------------------------------------------------------------
// Transition Sampling
// ---------------------------------------------------------------------------

function sampleTransitions(
  zone: Zone,
  club: ClubDistribution,
  bearing: number,
  hole: CourseHole,
  zones: Zone[],
  greenZoneId: number,
  roughPenalty: number,
  sampleCount: number,
): TransitionResult {
  const counts = new Map<number, number>();
  let totalPenalty = 0;
  let totalPenaltySq = 0;
  let greenCount = 0;
  let fairwayCount = 0;

  const lieMultiplier = zone.lie === 'rough' ? ROUGH_LIE_MULTIPLIER : 1.0;

  for (let i = 0; i < sampleCount; i++) {
    const carry = gaussianSample(club.meanCarry, club.stdCarry * lieMultiplier);
    const offline = gaussianSample(club.meanOffline, club.stdOffline * lieMultiplier);

    let landing = projectPoint(zone.position, bearing, carry);
    if (Math.abs(offline) > 0.5) {
      landing = projectPoint(landing, bearing + 90, offline);
    }

    let penalty = 0;

    // Tree collision
    const treeHit = checkTreeTrajectory(zone.position, bearing, carry, hole.hazards, club);
    if (treeHit.hitTrees) {
      landing = projectPoint(zone.position, bearing, treeHit.hitDistance);
      penalty += 0.5;
    }

    // Hazard check — OB drops at boundary, bunkers stay in place
    const hazDrop = resolveHazardDrop(zone.position, landing, hole.hazards, hole.fairway, hole.green, roughPenalty);
    penalty += hazDrop.penalty;
    landing = hazDrop.landing;

    totalPenalty += penalty;
    totalPenaltySq += penalty * penalty;

    // Check if landing is on the green (polygon geofence, fallback to 10yd radius)
    const distToPin = haversineYards(landing, hole.pin);
    if (isOnGreen(landing, hole.green, hole.pin)) {
      greenCount++;
      counts.set(greenZoneId, (counts.get(greenZoneId) ?? 0) + 1);
    } else {
      if (penalty === 0) fairwayCount++;
      const zoneId = findNearestZone(landing, zones);
      counts.set(zoneId, (counts.get(zoneId) ?? 0) + 1);
    }
  }

  const transitions = new Map<number, number>();
  for (const [zoneId, count] of counts) {
    transitions.set(zoneId, count / sampleCount);
  }

  const expectedPenaltyVal = totalPenalty / sampleCount;
  const penaltyVariance = totalPenaltySq / sampleCount - expectedPenaltyVal * expectedPenaltyVal;

  return {
    transitions,
    expectedPenalty: expectedPenaltyVal,
    penaltyVariance: Math.max(0, penaltyVariance),
    pGreen: greenCount / sampleCount,
    pFairway: fairwayCount / sampleCount,
  };
}

// ---------------------------------------------------------------------------
// Transition Table (precomputed for all zone-action pairs)
// ---------------------------------------------------------------------------

interface ActionKey {
  zoneId: number;
  clubIdx: number;
  bearingIdx: number;
}

interface TransitionTableEntry {
  key: ActionKey;
  club: ClubDistribution;
  bearing: number;
  result: TransitionResult;
}

function buildTransitionTable(
  zones: Zone[],
  distributions: ClubDistribution[],
  hole: CourseHole,
  roughPenalty: number,
  bearingStep: number,
): TransitionTableEntry[] {
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const greenZoneId = zones[zones.length - 1].id;
  const entries: TransitionTableEntry[] = [];

  // Find max carry across all clubs for hazard proximity check
  const maxCarry = distributions.reduce((m, d) => Math.max(m, d.meanCarry + 2 * d.stdCarry), 0);

  for (const zone of zones) {
    if (zone.isTerminal) continue;

    const clubs = getEligibleClubs(zone, distributions);
    const bearings = getAimBearings(zone, pin, bearingStep);
    const sampleCount = samplesForZone(zone, maxCarry, hole.hazards);

    for (let ci = 0; ci < clubs.length; ci++) {
      for (let bi = 0; bi < bearings.length; bi++) {
        const result = sampleTransitions(zone, clubs[ci], bearings[bi], hole, zones, greenZoneId, roughPenalty, sampleCount);
        entries.push({
          key: { zoneId: zone.id, clubIdx: ci, bearingIdx: bi },
          club: clubs[ci],
          bearing: bearings[bi],
          result,
        });
      }
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Value Iteration
// ---------------------------------------------------------------------------

interface ValueIterationResult {
  policy: Map<number, PolicyEntry>;
  values: Map<number, number>;
}

function valueIteration(
  zones: Zone[],
  table: TransitionTableEntry[],
  mode: ScoringMode,
  par: number,
  distributions: ClubDistribution[],
  roughPenalty: number,
): ValueIterationResult {
  const pin = zones[zones.length - 1].position;

  // Initialize values
  const V = new Map<number, number>();
  for (const z of zones) {
    if (z.isTerminal) {
      V.set(z.id, expectedPutts(0)); // on the green, 0 yards from pin
    } else {
      V.set(z.id, 10); // pessimistic initial
    }
  }

  // Track best action per zone
  const policy = new Map<number, PolicyEntry>();

  // Group table entries by zone for fast lookup
  const byZone = new Map<number, TransitionTableEntry[]>();
  for (const entry of table) {
    const list = byZone.get(entry.key.zoneId) ?? [];
    list.push(entry);
    byZone.set(entry.key.zoneId, list);
  }

  for (let iter = 0; iter < MAX_VALUE_ITERATIONS; iter++) {
    let maxDelta = 0;

    for (const zone of zones) {
      if (zone.isTerminal) continue;

      const actions = byZone.get(zone.id);
      if (!actions || actions.length === 0) {
        // No eligible clubs — estimate strokes-to-hole realistically
        const chipDist = haversineYards(zone.position, pin);
        const minCarry = Math.min(...distributions.map(d => d.meanCarry));
        let chipValue: number;
        if (chipDist <= minCarry) {
          // Within chip/pitch range — can get close to the pin
          chipValue = 1 + expectedPutts(Math.max(3, chipDist * 0.1));
        } else {
          // Full approach shot — use greedyClub to estimate miss distance
          const approachClub = greedyClub(chipDist, distributions);
          const expectedMiss = Math.abs(chipDist - approachClub.meanCarry) + approachClub.stdCarry;
          chipValue = 1 + expectedPutts(expectedMiss);
        }
        V.set(zone.id, chipValue);
        continue;
      }

      let bestValue = Infinity;
      let bestEntry: TransitionTableEntry | undefined;

      for (const entry of actions) {
        const { transitions, expectedPenalty, penaltyVariance, pGreen, pFairway } = entry.result;

        // Compute expected future value
        let ev = 0;
        let evSq = 0;
        for (const [zId, prob] of transitions) {
          const futureV = V.get(zId) ?? 10;
          ev += prob * futureV;
          evSq += prob * futureV * futureV;
        }

        // Lie cascade correction: rough landings inherit optimistic zone V-values
        // that assume fairway lies. Account for cascading rough effects (wider
        // dispersion from ROUGH_LIE_MULTIPLIER leading to more rough on subsequent shots).
        const lieCascade = roughPenalty * (1 - pFairway - pGreen);
        const actionValue = 1 + expectedPenalty + lieCascade + ev;

        let modeValue: number;
        if (mode === 'scoring') {
          // Pure expected strokes minimization
          modeValue = actionValue;
        } else if (mode === 'safe') {
          // Risk-adjusted: penalize variance (strongly prefer low-variance plays)
          const futureVariance = evSq - ev * ev;
          const totalStd = Math.sqrt(Math.max(0, penaltyVariance + futureVariance));
          modeValue = actionValue + 1.0 * totalStd;
        } else {
          // Aggressive: reward birdie potential
          // Strongly reward reaching the green — even at cost of higher variance
          const birdieBonus = pGreen * 0.6;
          modeValue = actionValue - birdieBonus;
        }

        if (modeValue < bestValue) {
          bestValue = modeValue;
          bestEntry = entry;
        }
      }

      if (bestEntry) {
        const oldV = V.get(zone.id) ?? 10;
        // Store expected strokes including lie cascade correction
        let actualEV = 0;
        for (const [zId, prob] of bestEntry.result.transitions) {
          actualEV += prob * (V.get(zId) ?? 10);
        }
        const bestLieCascade = roughPenalty * (1 - bestEntry.result.pFairway - bestEntry.result.pGreen);
        const newV = 1 + bestEntry.result.expectedPenalty + bestLieCascade + actualEV;

        maxDelta = Math.max(maxDelta, Math.abs(newV - oldV));
        V.set(zone.id, newV);

        policy.set(zone.id, {
          clubIdx: bestEntry.key.clubIdx,
          bearingIdx: bestEntry.key.bearingIdx,
          bearing: bestEntry.bearing,
          value: bestValue,
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
  zones: Zone[],
  table: TransitionTableEntry[],
  values: Map<number, number>,
  mode: ScoringMode,
  par: number,
  excludeClubs: Set<string>,
  distributions: ClubDistribution[],
  roughPenalty: number,
): { clubIdx: number; bearing: number } | null {
  const teeZone = zones[0];
  const teeActions = table.filter((e) => e.key.zoneId === teeZone.id);

  let bestValue = Infinity;
  let bestAction: { clubIdx: number; bearing: number } | null = null;

  for (const entry of teeActions) {
    // Skip clubs that are already used by earlier strategies
    if (excludeClubs.has(entry.club.clubName)) continue;

    const { transitions, expectedPenalty, penaltyVariance, pGreen, pFairway } = entry.result;

    // Compute expected future value
    let ev = 0;
    let evSq = 0;
    for (const [zId, prob] of transitions) {
      const futureV = values.get(zId) ?? 10;
      ev += prob * futureV;
      evSq += prob * futureV * futureV;
    }

    const lieCascade = roughPenalty * (1 - pFairway - pGreen);
    const actionValue = 1 + expectedPenalty + lieCascade + ev;

    let modeValue: number;
    if (mode === 'scoring') {
      modeValue = actionValue;
    } else if (mode === 'safe') {
      const futureVariance = evSq - ev * ev;
      const totalStd = Math.sqrt(Math.max(0, penaltyVariance + futureVariance));
      modeValue = actionValue + 1.0 * totalStd;
    } else {
      const birdieBonus = pGreen * 0.6;
      modeValue = actionValue - birdieBonus;
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
  zones: Zone[],
  policy: Map<number, PolicyEntry>,
  distributions: ClubDistribution[],
  hole: CourseHole,
  teeBox: string,
  mode: ScoringMode,
  forcedFirstAction?: { clubIdx: number; bearing: number },
): NamedStrategyPlan {
  const pin = { lat: hole.pin.lat, lng: hole.pin.lng };
  const shots: NamedStrategyPlan['shots'] = [];

  // Under the 58-degree (shortest club) distance → can reach the green every time
  const approachThreshold = Math.min(...distributions.map((d) => d.meanCarry));

  let currentZone = zones[0]; // tee
  const maxShots = hole.par + 1; // reasonable limit for plan extraction

  for (let i = 0; i < maxShots; i++) {
    if (currentZone.isTerminal) break;

    // Use forced first action on the tee shot if provided
    let club: ClubDistribution | undefined;
    let bearing: number;

    if (i === 0 && forcedFirstAction) {
      const clubs = getEligibleClubs(currentZone, distributions);
      club = clubs[forcedFirstAction.clubIdx];
      bearing = forcedFirstAction.bearing;
    } else {
      const entry = policy.get(currentZone.id);
      if (entry) {
        const clubs = getEligibleClubs(currentZone, distributions);
        club = clubs[entry.clubIdx];
        bearing = entry.bearing;
      } else {
        // No policy entry — greedy fallback aimed at pin
        club = undefined;
        bearing = bearingBetween(currentZone.position, pin);
      }
    }

    // If club is undefined (policy miss or index out of range), use greedy club
    if (!club) {
      club = greedyClub(currentZone.distToPin, distributions);
      bearing = bearingBetween(currentZone.position, pin);
    }

    const rawLanding = projectPoint(currentZone.position, bearing, club.meanCarry);

    // Resolve hazards — if ball goes OB/water, landing adjusts to drop point
    const hazDrop = resolveHazardDrop(
      currentZone.position, rawLanding,
      hole.hazards ?? [], hole.fairway ?? [], hole.green ?? [], 0.3,
    );
    const landing = hazDrop.landing;
    const aimPoint = hazDrop.penalty > 0 ? landing : rawLanding;

    shots.push({ clubDist: club, aimPoint });

    const landingDist = haversineYards(landing, pin);

    if (isOnGreen(landing, hole.green, hole.pin)) break;

    // Within chip range — ball is near the green, putting/chipping handles it
    if (landingDist < CHIP_RANGE) break;

    // Within approach threshold — add one final approach to the pin and stop
    // Show the actual approach distance, not the club's full carry
    if (landingDist <= approachThreshold) {
      const approachClub = greedyClub(landingDist, distributions);
      shots.push({
        clubDist: { ...approachClub, meanCarry: landingDist },
        aimPoint: pin,
      });
      break;
    }

    // Find the zone closest to expected landing (uses resolved position)
    const nextZoneId = findNearestZone(landing, zones);
    const nextZone = zones.find((z) => z.id === nextZoneId);
    if (!nextZone || nextZone.isTerminal) break;

    currentZone = nextZone;
  }

  // Post-loop: if last shot lands within approach range but we didn't add approach yet
  if (shots.length > 0) {
    const lastShot = shots[shots.length - 1];
    const lastLandingDist = haversineYards(lastShot.aimPoint, pin);
    if (lastLandingDist >= CHIP_RANGE && lastLandingDist <= approachThreshold) {
      const approachClub = greedyClub(lastLandingDist, distributions);
      shots.push({
        clubDist: { ...approachClub, meanCarry: lastLandingDist },
        aimPoint: pin,
      });
    }
  }

  // If no shots extracted, fallback to a simple approach
  if (shots.length === 0) {
    const dist = hole.playsLikeYards?.[teeBox] ?? hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
    const club = distributions.reduce((best, c) =>
      Math.abs(c.meanCarry - dist) < Math.abs(best.meanCarry - dist) ? c : best,
    );
    shots.push({ clubDist: club, aimPoint: pin });
  }

  const { name, type } = MODE_LABELS[mode];
  return { name, type, shots };
}

// ---------------------------------------------------------------------------
// Policy-Following Monte Carlo Simulation
// ---------------------------------------------------------------------------

function simulateWithPolicy(
  plan: NamedStrategyPlan,
  hole: CourseHole,
  distributions: ClubDistribution[],
  zones: Zone[],
  policy: Map<number, PolicyEntry>,
  roughPenalty: number,
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
    let currentZoneId = zones[0].id;

    for (let shotIdx = 0; shotIdx < MAX_SHOTS_PER_HOLE; shotIdx++) {
      const distToPin = haversineYards(currentPos, pin);
      if (isOnGreen(currentPos, hole.green, hole.pin) || distToPin <= chipThreshold) break;

      const currentZone = zones.find((z) => z.id === currentZoneId);
      if (!currentZone) break;

      // Determine club and bearing — from policy or greedy fallback
      let club: ClubDistribution;
      let shotBearing: number;

      const entry = policy.get(currentZoneId);
      const clubs = entry ? getEligibleClubs(currentZone, distributions) : [];

      if (entry && entry.clubIdx < clubs.length) {
        // Policy hit — use the DP-optimal action.
        // The DP bearing already compensates for lateral bias (transition sampling
        // includes meanOffline). Don't apply compensateForBias — that would double-compensate.
        club = clubs[entry.clubIdx];
        const aimPoint = projectPoint(currentZone.position, entry.bearing, club.meanCarry);
        shotBearing = bearingBetween(currentPos, aimPoint);
      } else {
        // No policy or invalid club index — greedy fallback aimed at pin
        club = greedyClub(distToPin, distributions);
        const rawBearing = bearingBetween(currentPos, pin);
        const compensatedAim = compensateForBias(pin, rawBearing, club);
        shotBearing = bearingBetween(currentPos, compensatedAim);
      }

      const lieMultiplier = currentZone.lie === 'rough' ? ROUGH_LIE_MULTIPLIER : 1.0;

      const carry = gaussianSample(club.meanCarry, club.stdCarry * lieMultiplier);
      const offline = gaussianSample(club.meanOffline, club.stdOffline * lieMultiplier);

      let landing = projectPoint(currentPos, shotBearing, carry);
      if (Math.abs(offline) > 0.5) {
        landing = projectPoint(landing, shotBearing + 90, offline);
      }

      strokes++;

      const treeHit = checkTreeTrajectory(currentPos, shotBearing, carry, hole.hazards, club);
      if (treeHit.hitTrees) {
        landing = projectPoint(currentPos, shotBearing, treeHit.hitDistance);
        strokes += 0.5;
      }

      const hazDrop = resolveHazardDrop(currentPos, landing, hole.hazards, hole.fairway, hole.green, roughPenalty);
      strokes += hazDrop.penalty;
      landing = hazDrop.landing;

      // Track first-shot fairway/green rate
      if (shotIdx === 0 && hazDrop.penalty === 0) {
        fairwayHits++;
      }

      currentPos = landing;
      currentZoneId = findNearestZone(landing, zones);
    }

    // Greedy approach if still far
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

      const greedyTreeHit = checkTreeTrajectory(currentPos, shotBearing, carry, hole.hazards, club);
      if (greedyTreeHit.hitTrees) {
        landing = projectPoint(currentPos, shotBearing, greedyTreeHit.hitDistance);
        strokes += 0.5;
      }

      const hazDrop = resolveHazardDrop(currentPos, landing, hole.hazards, hole.fairway, hole.green, roughPenalty);
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

  // Compute statistics
  const xS = trialScores.reduce((a, b) => a + b, 0) / trialScores.length;
  const variance = trialScores.reduce((sum, s) => sum + (s - xS) ** 2, 0) / trialScores.length;
  const stdStrokes = Math.sqrt(variance);
  const scoreDist = computeScoreDistribution(trialScores, hole.par);
  const blowupRisk = scoreDist.double + scoreDist.worse;

  // Build aim points from plan
  // Note: The DP optimizer already compensates for lateral bias via its transition
  // sampling (meanOffline is included in every sample). The bearing it selects already
  // aims left/right to center landings on the fairway. We must NOT apply
  // compensateForBias() here — that would double-compensate.
  const aimPoints: AimPoint[] = [];
  let aimFrom = { lat: tee.lat, lng: tee.lng };
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i];
    const bearing = bearingBetween(aimFrom, s.aimPoint);
    // The DP aim point IS where to point the club. Compute where the ball
    // actually lands (aim point + meanOffline perpendicular) for the caddy tip.
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
 * The transition table is built once and shared across all 3 modes.
 */
export function dpOptimizeHole(
  hole: CourseHole,
  teeBox: string,
  distributions: ClubDistribution[],
  roughPenalty: number = 0.3,
): OptimizedStrategy[] {
  if (distributions.length === 0) return [];

  // 1. Discretize hole into zones
  const zones = discretizeHole(hole, teeBox);
  if (zones.length < 2) return [];

  // 2. Build transition table (shared across modes)
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 400;
  const bearingStep = bearingStepForDistance(yardage);
  const table = buildTransitionTable(zones, distributions, hole, roughPenalty, bearingStep);
  if (table.length === 0) return [];

  const modes: ScoringMode[] = ['scoring', 'safe', 'aggressive'];
  const policies: Map<number, PolicyEntry>[] = [];
  const allValues: Map<number, number>[] = [];
  const plans: NamedStrategyPlan[] = [];
  const results: OptimizedStrategy[] = [];

  // 3. Value iteration for all modes
  for (const mode of modes) {
    const { policy, values } = valueIteration(zones, table, mode, hole.par, distributions, roughPenalty);
    policies.push(policy);
    allValues.push(values);
  }

  // 4. Extract initial plans
  for (let i = 0; i < modes.length; i++) {
    if (policies[i].size === 0) {
      plans.push({ name: MODE_LABELS[modes[i]].name, type: MODE_LABELS[modes[i]].type, shots: [] });
    } else {
      plans.push(extractPlan(zones, policies[i], distributions, hole, teeBox, modes[i]));
    }
  }

  // 5. Diversity enforcement — ensure unique club sequences across strategies
  const planClubKey = (p: NamedStrategyPlan) => p.shots.map((s) => s.clubDist.clubName).join('|');
  const usedKeys = new Set<string>();
  const usedFirstClubs = new Set<string>();
  for (let i = 0; i < plans.length; i++) {
    const key = planClubKey(plans[i]);
    const firstClub = plans[i].shots[0]?.clubDist.clubName;
    if (!firstClub) continue;

    if (usedKeys.has(key) || usedFirstClubs.has(firstClub)) {
      // Try to find an alternative tee club for this mode
      const alt = findAlternativeTeeAction(
        zones, table, allValues[i], modes[i], hole.par,
        usedFirstClubs, distributions, roughPenalty,
      );
      if (alt) {
        plans[i] = extractPlan(zones, policies[i], distributions, hole, teeBox, modes[i], alt);
      }
    }
    usedKeys.add(planClubKey(plans[i]));
    usedFirstClubs.add(plans[i].shots[0]?.clubDist.clubName ?? '');
  }

  // 6. Run MC simulations
  for (let i = 0; i < plans.length; i++) {
    if (policies[i].size === 0) continue;

    const strategy = simulateWithPolicy(plans[i], hole, distributions, zones, policies[i], roughPenalty);
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
  // When strategies are within 0.3 strokes, prefer the one with higher fairway rate
  unique.sort((a, b) => {
    const strokeDiff = a.expectedStrokes - b.expectedStrokes;
    if (Math.abs(strokeDiff) > 0.3) return strokeDiff;
    // Within 0.3 strokes — prefer higher fairway/green rate
    const fairwayDiff = b.fairwayRate - a.fairwayRate;
    if (Math.abs(fairwayDiff) > 0.05) return fairwayDiff;
    return strokeDiff;
  });

  return unique;
}
