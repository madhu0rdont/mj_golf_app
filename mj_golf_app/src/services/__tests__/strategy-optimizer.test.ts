import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  checkHazards,
  computeScoreDistribution,
  generateNamedStrategies,
  simulateHoleGPS,
  optimizeHole,
} from '../strategy-optimizer';
import type { ClubDistribution } from '../monte-carlo';
import type { CourseHole, HazardFeature } from '../../models/course';

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

  it('Aggressive shifts aim toward pin', () => {
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', dists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;
    const aggressive = plans.find((p) => p.name === 'Aggressive')!;
    // Aggressive aim should be closer to pin than conservative
    const conservDist = Math.abs(conservative.shots[0].aimPoint.lat - hole.pin.lat);
    const aggDist = Math.abs(aggressive.shots[0].aimPoint.lat - hole.pin.lat);
    expect(aggDist).toBeLessThan(conservDist);
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

  it('aim points are at target positions, not shifted by bias', () => {
    // All clubs fade 10 yards right (positive meanOffline)
    const biasedDists = makeDistributions().map((d) => ({
      ...d,
      meanOffline: 10,
    }));
    const hole = makeHole(4, 400);
    const plans = generateNamedStrategies(hole, 'blue', biasedDists);
    const conservative = plans.find((p) => p.name === 'Conservative')!;

    // Aim points should be at the TARGET, not shifted for bias.
    // Bias compensation is applied only in simulateHoleGPS.
    // Shot 1 aim should be at target[0] (lng ≈ -117.0)
    expect(conservative.shots[0].aimPoint.lng).toBeCloseTo(-117.0, 4);
    // Shot 2 aim should be at pin (lng ≈ -117.0)
    expect(conservative.shots[1].aimPoint.lng).toBeCloseTo(-117.0, 4);
  });

  it('aim points unchanged regardless of meanOffline', () => {
    const biasedDists = makeDistributions().map((d) => ({ ...d, meanOffline: 15 }));
    const zeroBiasDists = makeDistributions();
    const hole = makeHole(4, 400);

    const biasedPlans = generateNamedStrategies(hole, 'blue', biasedDists);
    const zeroBiasPlans = generateNamedStrategies(hole, 'blue', zeroBiasDists);

    const biasedConserv = biasedPlans.find((p) => p.name === 'Conservative')!;
    const zeroConserv = zeroBiasPlans.find((p) => p.name === 'Conservative')!;

    // Shot 2 aim is always the pin regardless of bias
    expect(biasedConserv.shots[1].aimPoint.lat).toBeCloseTo(zeroConserv.shots[1].aimPoint.lat, 6);
    expect(biasedConserv.shots[1].aimPoint.lng).toBeCloseTo(zeroConserv.shots[1].aimPoint.lng, 6);
  });

  it('expected landing chains correctly with bias for club selection', () => {
    // All clubs have large rightward bias (50 yards). This shifts where the ball
    // actually lands via expectedLanding, changing the remaining distance.
    // The Layup strategy is most visible because its first aim point is the
    // expectedLanding position, which shifts laterally with bias.
    const largeBiasDists = makeDistributions().map((d) => ({
      ...d,
      meanOffline: 50,
    }));
    const noBiasDists = makeDistributions();

    const hole = makeHole(4, 400);

    const biasedPlans = generateNamedStrategies(hole, 'blue', largeBiasDists);
    const noBiasPlans = generateNamedStrategies(hole, 'blue', noBiasDists);

    const biasedLayup = biasedPlans.find((p) => p.name === 'Layup')!;
    const noBiasLayup = noBiasPlans.find((p) => p.name === 'Layup')!;

    // The Layup first aim point is expectedLanding, which includes lateral bias.
    // With 50y rightward bias (heading=0°, right=east), the aim point shifts east.
    const biasedAim1Lng = biasedLayup.shots[0].aimPoint.lng;
    const noBiasAim1Lng = noBiasLayup.shots[0].aimPoint.lng;

    // Biased landing should be shifted east (higher lng) compared to center-line landing
    expect(biasedAim1Lng).toBeGreaterThan(noBiasAim1Lng);
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
    expect(optimizeHole(hole, 'blue', [], 'scoring')).toEqual([]);
  });

  it('returns strategies sorted by xS in scoring mode', () => {
    const hole = makeHole(4, 400);
    const results = optimizeHole(hole, 'blue', dists, 'scoring', 500);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].expectedStrokes).toBeGreaterThanOrEqual(results[i - 1].expectedStrokes);
    }
  });

  it('returns strategies sorted by blowup risk in safe mode', () => {
    const hole = makeHole(4, 400);
    const results = optimizeHole(hole, 'blue', dists, 'safe', 500);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].blowupRisk).toBeGreaterThanOrEqual(results[i - 1].blowupRisk);
    }
  });

  it('all results have strategy names', () => {
    const hole = makeHole(4, 400);
    const results = optimizeHole(hole, 'blue', dists, 'scoring', 500);
    for (const r of results) {
      expect(r.strategyName).toBeTruthy();
    }
  });

  it('par 3 results have single-shot aim points', () => {
    const hole = makeHole(3, 165);
    const results = optimizeHole(hole, 'blue', dists, 'scoring', 500);
    for (const r of results) {
      expect(r.aimPoints.length).toBe(1);
    }
  });
});
