import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkHazards,
  computeScoreDistribution,
  generateNamedStrategies,
  simulateHoleGPS,
  optimizeHole,
  ballHeightAtDistance,
} from '../../../server/services/strategy-optimizer';
import type { ClubDistribution } from '../../../server/services/monte-carlo';
import type { CourseHole, HazardFeature } from '../../models/course';
import { pointInPolygon, distanceToPolygonEdge } from '../../utils/geo';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeDist = (overrides: Partial<ClubDistribution> = {}): ClubDistribution => ({
  clubId: 'iron7',
  clubName: '7 Iron',
  meanCarry: 165,
  stdCarry: 6,
  meanOffline: 0,
  stdOffline: 5,
  ...overrides,
});

const makeHazard = (overrides: Partial<HazardFeature> = {}): HazardFeature => ({
  name: 'Bunker 1',
  type: 'bunker',
  penalty: 1,
  confidence: 'high',
  source: 'manual',
  polygon: [
    { lat: 33.001, lng: -117.001 },
    { lat: 33.001, lng: -116.999 },
    { lat: 33.003, lng: -116.999 },
    { lat: 33.003, lng: -117.001 },
  ],
  ...overrides,
});

function makeHole(par: number, distance: number = 400): CourseHole {
  const tee = { lat: 33.0, lng: -117.0, elevation: 0 };
  // Project pin north (heading ~0) at `distance` yards
  // ~1 degree lat ≈ 121,100 yards (rough), so distance/121100 deg
  const pinLat = 33.0 + (distance / 121100);
  const pin = { lat: pinLat, lng: -117.0, elevation: 0 };

  return {
    id: `hole-${par}`,
    courseId: 'course-1',
    holeNumber: 1,
    par,
    handicap: null,
    yardages: { blue: distance },
    heading: 0,
    tee,
    pin,
    targets: [
      {
        index: 0,
        coordinate: { lat: 33.0 + distance * 0.6 / 121100, lng: -117.0, elevation: 0 },
        fromTee: Math.round(distance * 0.6),
        toPin: Math.round(distance * 0.4),
      },
    ],
    centerLine: [tee, pin],
    hazards: [],
    fairway: [],
    green: [],
    playsLikeYards: null,
    notes: null,
  };
}

function makeDistributions(): ClubDistribution[] {
  return [
    makeDist({ clubId: 'driver', clubName: 'Driver', meanCarry: 275, stdCarry: 12, stdOffline: 8 }),
    makeDist({ clubId: 'wood3', clubName: '3 Wood', meanCarry: 235, stdCarry: 10, stdOffline: 7 }),
    makeDist({ clubId: 'iron5', clubName: '5 Iron', meanCarry: 195, stdCarry: 7, stdOffline: 6 }),
    makeDist({ clubId: 'iron7', clubName: '7 Iron', meanCarry: 165, stdCarry: 6, stdOffline: 5 }),
    makeDist({ clubId: 'iron9', clubName: '9 Iron', meanCarry: 135, stdCarry: 5, stdOffline: 4 }),
    makeDist({ clubId: 'pw', clubName: 'PW', meanCarry: 115, stdCarry: 4, stdOffline: 3 }),
    makeDist({ clubId: 'sw', clubName: 'SW', meanCarry: 85, stdCarry: 3, stdOffline: 3 }),
  ];
}

// Seed Math.random for deterministic tests
beforeEach(() => {
  let seed = 42;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  });
});

// ---------------------------------------------------------------------------
// checkHazards
// ---------------------------------------------------------------------------

describe('checkHazards', () => {
  it('returns no hazard when point is outside all hazards', () => {
    const point = { lat: 33.010, lng: -117.0 };
    const result = checkHazards(point, [makeHazard()]);
    expect(result.inHazard).toBe(false);
    expect(result.penalty).toBe(0);
    expect(result.hazardType).toBeNull();
  });

  it('returns hazard info when point is inside a bunker', () => {
    const point = { lat: 33.002, lng: -117.0 }; // inside the test bunker polygon
    const result = checkHazards(point, [makeHazard()]);
    expect(result.inHazard).toBe(true);
    expect(result.penalty).toBe(1);
    expect(result.hazardType).toBe('bunker');
  });

  it('returns hazard info for water with correct penalty', () => {
    const waterHazard = makeHazard({ type: 'water', penalty: 1, name: 'Lake' });
    const point = { lat: 33.002, lng: -117.0 };
    const result = checkHazards(point, [waterHazard]);
    expect(result.inHazard).toBe(true);
    expect(result.hazardType).toBe('water');
  });

  it('returns no hazard for empty hazard list', () => {
    const result = checkHazards({ lat: 33.002, lng: -117.0 }, []);
    expect(result.inHazard).toBe(false);
  });

  it('skips hazards with fewer than 3 polygon points', () => {
    const smallHazard = makeHazard({
      polygon: [{ lat: 33.0, lng: -117.0 }, { lat: 33.001, lng: -117.0 }],
    });
    const result = checkHazards({ lat: 33.0005, lng: -117.0 }, [smallHazard]);
    expect(result.inHazard).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeScoreDistribution
// ---------------------------------------------------------------------------

describe('computeScoreDistribution', () => {
  it('returns all-par when every score equals par', () => {
    const scores = [4, 4, 4, 4, 4];
    const dist = computeScoreDistribution(scores, 4);
    expect(dist.par).toBeCloseTo(1.0);
    expect(dist.birdie).toBeCloseTo(0);
    expect(dist.bogey).toBeCloseTo(0);
  });

  it('distributes mixed scores correctly', () => {
    // par=4: eagle=2, birdie=3, par=4, bogey=5, double=6, worse=7
    const scores = [2, 3, 4, 5, 6, 7];
    const dist = computeScoreDistribution(scores, 4);
    expect(dist.eagle).toBeCloseTo(1 / 6);
    expect(dist.birdie).toBeCloseTo(1 / 6);
    expect(dist.par).toBeCloseTo(1 / 6);
    expect(dist.bogey).toBeCloseTo(1 / 6);
    expect(dist.double).toBeCloseTo(1 / 6);
    expect(dist.worse).toBeCloseTo(1 / 6);
  });

  it('sums to 1.0', () => {
    const scores = [3, 3, 4, 4, 4, 5, 5, 6, 7, 8];
    const dist = computeScoreDistribution(scores, 4);
    const sum = dist.eagle + dist.birdie + dist.par + dist.bogey + dist.double + dist.worse;
    expect(sum).toBeCloseTo(1.0);
  });

  it('returns zeros for empty scores', () => {
    const dist = computeScoreDistribution([], 4);
    expect(dist.par).toBe(0);
    expect(dist.birdie).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// generateNamedStrategies
// ---------------------------------------------------------------------------

describe('generateNamedStrategies', () => {
  const dists = makeDistributions();

  it('returns empty for empty distributions', () => {
    const hole = makeHole(4);
    expect(generateNamedStrategies(hole, 'blue', [])).toEqual([]);
  });

  it('generates 3 strategies for par 3', () => {
    const hole = makeHole(3, 165);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    expect(plans).toHaveLength(3);
    const names = plans.map((p) => p.name);
    expect(names).toContain('Pin Hunting');
    expect(names).toContain('Center Green');
    expect(names).toContain('Bail Out');
  });

  it('Pin Hunting aims at pin', () => {
    const hole = makeHole(3, 165);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const pinHunt = plans.find((p) => p.name === 'Pin Hunting')!;
    expect(pinHunt.shots[0].aimPoint.lat).toBeCloseTo(hole.pin.lat, 4);
    expect(pinHunt.shots[0].aimPoint.lng).toBeCloseTo(hole.pin.lng, 4);
  });

  it('generates 3 strategies for par 4', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    expect(plans).toHaveLength(3);
    const names = plans.map((p) => p.name);
    expect(names).toContain('Conservative');
    expect(names).toContain('Aggressive');
    expect(names).toContain('Layup');
  });

  it('Conservative uses target[0] for aim', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;
    expect(conservative.shots[0].aimPoint.lat).toBeCloseTo(hole.targets[0].coordinate.lat, 4);
  });

  it('Aggressive aims at longest carry along center line', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;
    const aggressive = plans.find((p) => p.name === 'Aggressive')!;
    // Aggressive aim should be closer to pin than conservative (driver carry > target distance)
    const conservDist = Math.abs(conservative.shots[0].aimPoint.lat - hole.pin.lat);
    const aggDist = Math.abs(aggressive.shots[0].aimPoint.lat - hole.pin.lat);
    expect(aggDist).toBeLessThan(conservDist);
  });

  it('Aggressive is deduplicated when too similar to Conservative', () => {
    const hole = makeHole(4, 400);
    hole.targets = []; // force center-line fallback → both use longest carry
    const plans = generateNamedStrategies(hole, 'blue', dists);
    // Without targets, both aim at longest carry → Aggressive is dropped
    const names = plans.map((p) => p.name);
    expect(names).not.toContain('Aggressive');
    expect(plans.length).toBeGreaterThanOrEqual(2);
  });

  it('Aggressive nudges away from hazards with a smaller buffer than Conservative', () => {
    const hole2 = makeHole(4, 400);
    const hazardLat = 33.0 + 275 / 121100;
    hole2.hazards = [
      makeHazard({
        type: 'fairway_bunker',
        penalty: 0.3,
        polygon: [
          { lat: hazardLat - 0.0003, lng: -117.00005 },
          { lat: hazardLat - 0.0003, lng: -116.99995 },
          { lat: hazardLat + 0.0003, lng: -116.99995 },
          { lat: hazardLat + 0.0003, lng: -117.00005 },
        ],
      }),
    ];
    const plans = generateNamedStrategies(hole2, 'blue', dists);
    const aggressive = plans.find((p) => p.name === 'Aggressive');
    if (aggressive) {
      // Aggressive aim should be nudged away from hazard (lng shifted from -117.0)
      expect(aggressive.shots[0].aimPoint.lng).not.toBeCloseTo(-117.0, 4);
    }
  });

  it('generates 3 strategies for par 5', () => {
    const hole = makeHole(5, 540);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    expect(plans).toHaveLength(3);
    const names = plans.map((p) => p.name);
    expect(names).toContain('Conservative 3-Shot');
    expect(names).toContain('Go-For-It');
    expect(names).toContain('Safe Layup');
  });

  it('Go-For-It has 2 shots for par 5', () => {
    const hole = makeHole(5, 540);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const goForIt = plans.find((p) => p.name === 'Go-For-It')!;
    expect(goForIt.shots).toHaveLength(2);
  });

  it('Conservative 3-Shot has 3 shots for par 5', () => {
    const hole = makeHole(5, 540);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const c3 = plans.find((p) => p.name === 'Conservative 3-Shot')!;
    expect(c3.shots).toHaveLength(3);
  });

  it('gracefully falls back when no targets exist', () => {
    const hole = makeHole(4, 400);
    hole.targets = [];
    const plans = generateNamedStrategies(hole, 'blue', dists);
    expect(plans.length).toBeGreaterThanOrEqual(2);
  });

  it('plan targets stay on center line regardless of bias', () => {
    // Plan targets are landing ZONES (where the ball should end up).
    // Bias compensation is applied to OUTPUT aimPoints in simulateHoleGPS.
    const biasedDists = makeDistributions().map((d) => ({
      ...d,
      meanOffline: 10,
    }));
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', biasedDists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;

    // Plan targets are on the center line (lng ≈ -117.0)
    expect(conservative.shots[0].aimPoint.lng).toBeCloseTo(-117.0, 4);
    expect(conservative.shots[1].aimPoint.lng).toBeCloseTo(-117.0, 4);
  });

  it('plan targets unchanged regardless of meanOffline', () => {
    const biasedDists = makeDistributions().map((d) => ({ ...d, meanOffline: 15 }));
    const zeroBiasDists = makeDistributions();
    const hole = makeHole(4, 400);

    const biasedPlans = generateNamedStrategies(hole, 'blue', biasedDists);
    const zeroBiasPlans = generateNamedStrategies(hole, 'blue', zeroBiasDists);

    const biasedConserv = biasedPlans.find((p) => p.name === 'Conservative')!;
    const zeroConserv = zeroBiasPlans.find((p) => p.name === 'Conservative')!;

    // Shot 2 target is always the pin regardless of bias
    expect(biasedConserv.shots[1].aimPoint.lat).toBeCloseTo(zeroConserv.shots[1].aimPoint.lat, 6);
    expect(biasedConserv.shots[1].aimPoint.lng).toBeCloseTo(zeroConserv.shots[1].aimPoint.lng, 6);
  });

  it('output aim points are shifted to compensate for lateral bias', () => {
    // All clubs miss 15 yards right (positive meanOffline).
    // Output aimPoints should be shifted LEFT to compensate.
    const biasedDists = makeDistributions().map((d) => ({
      ...d,
      meanOffline: 15,
    }));
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', biasedDists);
    const result = simulateHoleGPS(plans[0], hole, biasedDists, 500);

    // Heading ≈ 0° (due north), so "right" is east (positive lng).
    // CompensateForBias shifts aim WEST (more negative lng).
    expect(result.aimPoints[0].position.lng).toBeLessThan(-117.0);
  });

  it('output aim points match targets when no bias', () => {
    // With zero meanOffline, aim points = targets (no compensation needed)
    const zeroBiasDists = makeDistributions(); // meanOffline = 0
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', zeroBiasDists);
    const result = simulateHoleGPS(plans[0], hole, zeroBiasDists, 500);

    // No bias → aim point should be at target (lng ≈ -117.0)
    expect(result.aimPoints[0].position.lng).toBeCloseTo(-117.0, 4);
  });

  it('findSafeLanding shifts target away from hazards', () => {
    const hole = makeHole(4, 400);
    // Place a hazard right where the conservative target would land (~275y = driver carry)
    const hazardLat = 33.0 + 275 / 121100;
    // Narrow bunker (~10y wide) straddling the center line at 275y
    hole.hazards = [
      makeHazard({
        type: 'fairway_bunker',
        penalty: 0.3,
        polygon: [
          { lat: hazardLat - 0.0003, lng: -117.00005 },
          { lat: hazardLat - 0.0003, lng: -116.99995 },
          { lat: hazardLat + 0.0003, lng: -116.99995 },
          { lat: hazardLat + 0.0003, lng: -117.00005 },
        ],
      }),
    ];
    hole.targets = []; // force center-line fallback

    const plans = generateNamedStrategies(hole, 'blue', makeDistributions());
    const conservative = plans.find((p) => p.name === 'Conservative')!;

    // Target should have been nudged away from the bunker (lng ≠ -117.0)
    expect(Math.abs(conservative.shots[0].aimPoint.lng - (-117.0))).toBeGreaterThan(0.00005);
  });

  it('heading uses bearingBetween not hole.heading', () => {
    // Create a hole where hole.heading is intentionally wrong (90° = due east)
    // but tee-to-pin is due north (bearing ~0°)
    const hole = makeHole(4, 400);
    hole.heading = 90; // intentionally wrong — points east

    const plans = generateNamedStrategies(hole, 'blue', dists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;

    // If heading=90 were used, aim points would shift east (higher lng).
    // Since bearingBetween(tee, pin) ≈ 0° (due north), aim points should stay
    // on the tee-to-pin line, meaning lng ≈ -117.0.
    expect(conservative.shots[0].aimPoint.lng).toBeCloseTo(-117.0, 3);
    // And lat should be north of tee (higher lat)
    expect(conservative.shots[0].aimPoint.lat).toBeGreaterThan(33.0);
  });
});

// ---------------------------------------------------------------------------
// simulateHoleGPS
// ---------------------------------------------------------------------------

describe('simulateHoleGPS', () => {
  const dists = makeDistributions();

  it('returns a valid OptimizedStrategy', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    expect(result.strategyName).toBe(plans[0].name);
    expect(result.expectedStrokes).toBeGreaterThan(0);
    expect(result.blowupRisk).toBeGreaterThanOrEqual(0);
    expect(result.blowupRisk).toBeLessThanOrEqual(1);
    expect(result.clubs.length).toBeGreaterThan(0);
    expect(result.label).toBeTruthy();
  });

  it('score distribution sums to ~1.0', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    const d = result.scoreDistribution;
    const sum = d.eagle + d.birdie + d.par + d.bogey + d.double + d.worse;
    expect(sum).toBeCloseTo(1.0);
  });

  it('blowup risk equals double + worse', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    expect(result.blowupRisk).toBeCloseTo(
      result.scoreDistribution.double + result.scoreDistribution.worse,
    );
  });

  it('aim points are numbered correctly', () => {
    const hole = makeHole(5, 540);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const c3 = plans.find((p) => p.name === 'Conservative 3-Shot')!;
    const result = simulateHoleGPS(c3, hole, dists, 500);

    expect(result.aimPoints).toHaveLength(3);
    expect(result.aimPoints[0].shotNumber).toBe(1);
    expect(result.aimPoints[1].shotNumber).toBe(2);
    expect(result.aimPoints[2].shotNumber).toBe(3);
  });

  it('aim points include carry distance', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    for (const ap of result.aimPoints) {
      expect(ap.carry).toBeGreaterThan(0);
      expect(typeof ap.carry).toBe('number');
      expect(Number.isInteger(ap.carry)).toBe(true);
    }
  });

  it('aim points include caddy tips', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    for (const ap of result.aimPoints) {
      expect(typeof ap.tip).toBe('string');
      expect(ap.tip.length).toBeGreaterThan(0);
    }
  });

  it('aim points have carryNote when hazards are along path', () => {
    const hole = makeHole(4, 400);
    // Place a bunker at 250y (shorter than driver carry of 275y)
    const hazardLat = 33.0 + 250 / 121100;
    hole.hazards = [
      makeHazard({
        type: 'fairway_bunker',
        penalty: 0.3,
        name: 'Fairway Bunker',
        polygon: [
          { lat: hazardLat - 0.0002, lng: -117.0003 },
          { lat: hazardLat - 0.0002, lng: -116.9997 },
          { lat: hazardLat + 0.0002, lng: -116.9997 },
          { lat: hazardLat + 0.0002, lng: -117.0003 },
        ],
      }),
    ];
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const result = simulateHoleGPS(plans[0], hole, dists, 500);

    // First shot should have a carryNote about the bunker
    expect(result.aimPoints[0].carryNote).toBeTruthy();
    expect(result.aimPoints[0].carryNote).toContain('bunker');
  });

  it('hazard penalties increase expected strokes', () => {
    const hole = makeHole(4, 400);
    // Place a water hazard right where shots land (~275y from tee)
    const hazardLat = 33.0 + 275 / 121100;
    hole.hazards = [
      makeHazard({
        type: 'water',
        penalty: 1,
        polygon: [
          { lat: hazardLat - 0.0005, lng: -117.002 },
          { lat: hazardLat - 0.0005, lng: -116.998 },
          { lat: hazardLat + 0.0005, lng: -116.998 },
          { lat: hazardLat + 0.0005, lng: -117.002 },
        ],
      }),
    ];

    const plans = generateNamedStrategies(hole, 'blue', dists);
    const withHazard = simulateHoleGPS(plans[0], hole, dists, 500);

    // Without hazard
    hole.hazards = [];
    const plans2 = generateNamedStrategies(hole, 'blue', dists);
    const withoutHazard = simulateHoleGPS(plans2[0], hole, dists, 500);

    expect(withHazard.expectedStrokes).toBeGreaterThan(withoutHazard.expectedStrokes);
  });
});

// ---------------------------------------------------------------------------
// optimizeHole
// ---------------------------------------------------------------------------

describe('optimizeHole', () => {
  const dists = makeDistributions();

  it('returns empty for empty distributions', () => {
    const hole = makeHole(4);
    expect(optimizeHole(hole, 'blue', [], undefined, undefined)).toEqual([]);
  });

  it('returns strategies sorted by expected strokes', () => {
    const hole = makeHole(4, 400);
    const results = optimizeHole(hole, 'blue', dists, 500, undefined);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].expectedStrokes).toBeGreaterThanOrEqual(results[i - 1].expectedStrokes);
    }
  });

  it('all results have strategy names', () => {
    const hole = makeHole(4, 400);
    const results = optimizeHole(hole, 'blue', dists, 500, undefined);
    for (const r of results) {
      expect(r.strategyName).toBeTruthy();
    }
  });

  it('par 3 results have single-shot aim points', () => {
    const hole = makeHole(3, 165);
    const results = optimizeHole(hole, 'blue', dists, 500, undefined);
    for (const r of results) {
      expect(r.aimPoints.length).toBe(1);
    }
  });

  it('par 4 with left-side trees: no strategy aims into the trees', () => {
    // Regression test modeled after the screenshot hole:
    // ~365 yard par 4 with a tree line running along the left side at ~250-290y
    const hole = makeHole(4, 365);

    // Tree hazard: long narrow polygon along the left side at ~250-290y from tee
    const treeSouth = 33.0 + 250 / 121100;
    const treeNorth = 33.0 + 290 / 121100;
    // Trees span from lng -117.0005 to -117.00015 (left of center line at -117.0)
    hole.hazards = [
      makeHazard({
        type: 'trees',
        name: 'Left Trees',
        penalty: 0.5,
        polygon: [
          { lat: treeSouth, lng: -117.0005 },
          { lat: treeSouth, lng: -117.00015 },
          { lat: treeNorth, lng: -117.00015 },
          { lat: treeNorth, lng: -117.0005 },
        ],
      }),
    ];

    // Use distributions matching the screenshot: Mini Driver ~250, 4 Hybrid ~215
    const screenshotDists = [
      makeDist({ clubId: 'mini-driver', clubName: 'Mini Driver', meanCarry: 250, stdCarry: 10, stdOffline: 8 }),
      makeDist({ clubId: '4hybrid', clubName: '4 Hybrid', meanCarry: 215, stdCarry: 8, stdOffline: 7 }),
      makeDist({ clubId: '7iron', clubName: '7 Iron', meanCarry: 165, stdCarry: 6, stdOffline: 5 }),
      makeDist({ clubId: '9iron', clubName: '9 Iron', meanCarry: 144, stdCarry: 5, stdOffline: 4 }),
      makeDist({ clubId: 'gw', clubName: 'GW', meanCarry: 115, stdCarry: 4, stdOffline: 3 }),
      makeDist({ clubId: 'sw', clubName: 'SW', meanCarry: 85, stdCarry: 3, stdOffline: 3 }),
    ];

    const results = optimizeHole(hole, 'blue', screenshotDists, 500, undefined);
    expect(results.length).toBeGreaterThanOrEqual(2);

    const treePoly = hole.hazards[0].polygon;

    for (const strategy of results) {
      for (const ap of strategy.aimPoints) {
        // No aim point should be inside the tree polygon
        expect(pointInPolygon(ap.position, treePoly)).toBe(false);

        // No aim point should be within 8y of the tree polygon edge (even aggressive uses 8y buffer)
        const edgeDist = distanceToPolygonEdge(ap.position, treePoly);
        expect(edgeDist).toBeGreaterThanOrEqual(7); // 8y buffer minus 1y tolerance

        // Caddy tips should not say "Start at the left trees" or "at the trees"
        if (ap.tip) {
          expect(ap.tip).not.toMatch(/start at the.*trees/i);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ballHeightAtDistance
// ---------------------------------------------------------------------------

describe('ballHeightAtDistance', () => {
  // --- Fallback symmetric parabola (no apex/descent data) ---
  it('returns 0 at launch (d=0)', () => {
    expect(ballHeightAtDistance(0, 275)).toBe(0);
  });

  it('returns 0 at landing (d=carry)', () => {
    expect(ballHeightAtDistance(275, 275)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(ballHeightAtDistance(-10, 275)).toBe(0);
  });

  it('returns 0 for distance beyond carry', () => {
    expect(ballHeightAtDistance(300, 275)).toBe(0);
  });

  it('peaks at midpoint with apex = 28y (fallback)', () => {
    const mid = ballHeightAtDistance(137.5, 275);
    expect(mid).toBeCloseTo(28, 0); // 4 * 28 * 0.5 * 0.5 = 28
  });

  it('ball is low near landing zone (260y of 275y carry)', () => {
    const height = ballHeightAtDistance(260, 275);
    expect(height).toBeLessThan(15); // Below tree height
  });

  it('ball is high at mid-flight (150y of 275y carry)', () => {
    const height = ballHeightAtDistance(150, 275);
    expect(height).toBeGreaterThan(15); // Above tree height
  });

  // --- Asymmetric model (with real apex + descent angle) ---
  it('asymmetric model: peaks at measured apex height', () => {
    // Driver: 32y apex, 42° descent, 275y carry
    // dApex = 275 - 32/tan(42°) ≈ 275 - 35.5 ≈ 239.5
    const atApex = ballHeightAtDistance(240, 275, 32, 42);
    expect(atApex).toBeGreaterThan(30);
    expect(atApex).toBeLessThanOrEqual(32);
  });

  it('asymmetric model: apex is forward-shifted (not at midpoint)', () => {
    // With steep descent (42°), apex should be past the midpoint
    const atMid = ballHeightAtDistance(137.5, 275, 32, 42);
    const atForward = ballHeightAtDistance(220, 275, 32, 42);
    expect(atForward).toBeGreaterThan(atMid); // Still climbing at midpoint, higher later
  });

  it('asymmetric model: ball descends steeply near landing', () => {
    // Driver: 32y apex, 42° descent, 275y carry
    const at260 = ballHeightAtDistance(260, 275, 32, 42);
    const at250 = ballHeightAtDistance(250, 275, 32, 42);
    expect(at260).toBeLessThan(at250); // Descending
    expect(at260).toBeLessThan(15); // Below tree height
  });

  it('asymmetric model: returns 0 at edges', () => {
    expect(ballHeightAtDistance(0, 275, 32, 42)).toBe(0);
    expect(ballHeightAtDistance(275, 275, 32, 42)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tree trajectory collision in simulation
// ---------------------------------------------------------------------------

describe('tree trajectory collision', () => {
  const dists = makeDistributions();

  it('trees near landing zone increase expected strokes (ball descending, below canopy)', () => {
    // Trees at 260y — driver carry is 275y, ball height at 260y ≈ 6.4y < 15y tree height
    const hole = makeHole(4, 400);
    const treeLat = 33.0 + 260 / 121100;
    hole.hazards = [
      makeHazard({
        type: 'trees',
        name: 'Right Trees',
        penalty: 0.5,
        polygon: [
          { lat: treeLat - 0.0003, lng: -117.0003 },
          { lat: treeLat - 0.0003, lng: -116.9997 },
          { lat: treeLat + 0.0003, lng: -116.9997 },
          { lat: treeLat + 0.0003, lng: -117.0003 },
        ],
      }),
    ];

    const plans = generateNamedStrategies(hole, 'blue', dists);
    const withTrees = simulateHoleGPS(plans[0], hole, dists, 500);

    // Without trees
    hole.hazards = [];
    const plans2 = generateNamedStrategies(hole, 'blue', dists);
    const withoutTrees = simulateHoleGPS(plans2[0], hole, dists, 500);

    expect(withTrees.expectedStrokes).toBeGreaterThan(withoutTrees.expectedStrokes);
  });

  it('trees at mid-flight do not increase expected strokes (ball above canopy)', () => {
    // Trees at 150y — driver carry is 275y, ball height at 150y ≈ 22y > 15y tree height
    const hole = makeHole(4, 400);
    const treeLat = 33.0 + 150 / 121100;
    hole.hazards = [
      makeHazard({
        type: 'trees',
        name: 'Mid Trees',
        penalty: 0.5,
        // Narrow strip across the fairway at 150y
        polygon: [
          { lat: treeLat - 0.00005, lng: -117.0003 },
          { lat: treeLat - 0.00005, lng: -116.9997 },
          { lat: treeLat + 0.00005, lng: -116.9997 },
          { lat: treeLat + 0.00005, lng: -117.0003 },
        ],
      }),
    ];

    const plans = generateNamedStrategies(hole, 'blue', dists);
    const withTrees = simulateHoleGPS(plans[0], hole, dists, 500);

    // Without trees
    hole.hazards = [];
    const plans2 = generateNamedStrategies(hole, 'blue', dists);
    const withoutTrees = simulateHoleGPS(plans2[0], hole, dists, 500);

    // Should be similar — ball flies over mid-flight trees
    expect(Math.abs(withTrees.expectedStrokes - withoutTrees.expectedStrokes)).toBeLessThan(0.3);
  });

  it('bunker hazards are not affected by trajectory check (only trees)', () => {
    // Bunker at 260y — should NOT trigger trajectory collision even though ball is low
    const hole = makeHole(4, 400);
    const bunkerLat = 33.0 + 260 / 121100;
    hole.hazards = [
      makeHazard({
        type: 'fairway_bunker',
        name: 'Fairway Bunker',
        penalty: 0.3,
        polygon: [
          { lat: bunkerLat - 0.0003, lng: -117.0003 },
          { lat: bunkerLat - 0.0003, lng: -116.9997 },
          { lat: bunkerLat + 0.0003, lng: -116.9997 },
          { lat: bunkerLat + 0.0003, lng: -117.0003 },
        ],
      }),
    ];

    const plans = generateNamedStrategies(hole, 'blue', dists);
    const withBunker = simulateHoleGPS(plans[0], hole, dists, 500);

    // Without bunker
    hole.hazards = [];
    const plans2 = generateNamedStrategies(hole, 'blue', dists);
    const withoutBunker = simulateHoleGPS(plans2[0], hole, dists, 500);

    // Bunker only penalizes landing, not trajectory — difference should be small
    // (the bunker is at 260y but the aim is shifted away by findSafeLanding, so few shots land in it)
    expect(Math.abs(withBunker.expectedStrokes - withoutBunker.expectedStrokes)).toBeLessThan(0.5);
  });
});
