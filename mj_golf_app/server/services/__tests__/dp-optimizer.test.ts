// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { discretizeHole, dpOptimizeHole } from '../dp-optimizer';
import type { ClubDistribution } from '../monte-carlo';
import type { CourseHole, HazardFeature } from '../../models/types';

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
  name: 'Hazard',
  type: 'water',
  penalty: 1,
  confidence: 'high',
  source: 'manual',
  polygon: [],
  ...overrides,
});

/** Lightweight bag — keeps transition table small so tests don't OOM. */
function makeLightDistributions(): ClubDistribution[] {
  return [
    makeDist({ clubId: 'iron5', clubName: '5 Iron', meanCarry: 195, stdCarry: 7, stdOffline: 6 }),
    makeDist({ clubId: 'iron9', clubName: '9 Iron', meanCarry: 135, stdCarry: 5, stdOffline: 4 }),
    makeDist({ clubId: 'sw', clubName: 'SW', meanCarry: 85, stdCarry: 3, stdOffline: 3 }),
  ];
}

/** Full bag for diversity tests only. */
function makeFullDistributions(): ClubDistribution[] {
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

/** Straight hole going due north from tee. */
function makeStraightHole(par: number, distance: number): CourseHole {
  const tee = { lat: 33.0, lng: -117.0, elevation: 0 };
  const pinLat = 33.0 + distance / 121100;
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
    targets: [],
    centerLine: [tee, pin],
    hazards: [],
    fairway: [],
    green: [],
    playsLikeYards: null,
    notes: null,
  };
}

/**
 * Dogleg left: tee → waypoint (left turn) → pin.
 * Fairway polygon wraps the dogleg. Water hazard across the straight tee→pin line.
 * CenterLine is intentionally EMPTY to trigger synthesizeCenterLine.
 */
function makeDoglegHole(): CourseHole {
  const tee = { lat: 33.0, lng: -117.0, elevation: 0 };
  const waypoint = { lat: 33.0 + 200 / 121100, lng: -117.001 };
  const pinLat = 33.0 + 350 / 121100;
  const pin = { lat: pinLat, lng: -117.0015, elevation: 0 };

  const fairway = [[
    { lat: 33.0, lng: -117.0005 },
    { lat: 33.0, lng: -116.9995 },
    { lat: waypoint.lat, lng: waypoint.lng + 0.0005 },
    { lat: waypoint.lat, lng: waypoint.lng - 0.0005 },
    { lat: pin.lat, lng: pin.lng + 0.0005 },
    { lat: pin.lat, lng: pin.lng - 0.0005 },
  ]];

  const midLat = (tee.lat + pin.lat) / 2;
  const waterHazard = makeHazard({
    name: 'Water',
    type: 'water',
    polygon: [
      { lat: midLat - 0.0002, lng: -117.0008 },
      { lat: midLat - 0.0002, lng: -117.0002 },
      { lat: midLat + 0.0002, lng: -117.0002 },
      { lat: midLat + 0.0002, lng: -117.0008 },
    ],
  });

  return {
    id: 'dogleg-1',
    courseId: 'course-1',
    holeNumber: 1,
    par: 4,
    handicap: null,
    yardages: { blue: 376 },
    heading: 0,
    tee,
    pin,
    targets: [],
    centerLine: [],
    hazards: [waterHazard],
    fairway,
    green: [],
    playsLikeYards: null,
    notes: null,
  };
}

function seedRandom() {
  let seed = 42;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  });
}

// ---------------------------------------------------------------------------
// discretizeHole (fast — no MC sampling)
// ---------------------------------------------------------------------------

describe('discretizeHole', () => {
  it('returns empty array when yardage is 0', () => {
    const hole = makeStraightHole(4, 0);
    expect(discretizeHole(hole, 'blue')).toEqual([]);
  });

  it('returns tee + green for very short hole', () => {
    const hole = makeStraightHole(3, 30);
    const zones = discretizeHole(hole, 'blue');
    expect(zones.length).toBe(2);
    expect(zones[0].lie).toBe('fairway');
    expect(zones[0].isTerminal).toBe(false);
    expect(zones[zones.length - 1].isTerminal).toBe(true);
    expect(zones[zones.length - 1].lie).toBe('green');
  });

  it('creates zones along centerline with correct structure', () => {
    const hole = makeStraightHole(4, 200);
    const zones = discretizeHole(hole, 'blue');

    expect(zones.length).toBeGreaterThan(2);
    expect(zones[0].id).toBe(0);
    expect(zones[0].distToPin).toBeCloseTo(200, -1);

    const green = zones[zones.length - 1];
    expect(green.isTerminal).toBe(true);
    expect(green.distToPin).toBe(0);

    // Interior zones come in triples (center, left, right)
    const interior = zones.length - 2;
    expect(interior % 3).toBe(0);
  });

  it('center zones have decreasing distToPin', () => {
    const hole = makeStraightHole(4, 200);
    const zones = discretizeHole(hole, 'blue');

    const centerZones = [zones[0]];
    for (let i = 1; i < zones.length - 1; i += 3) {
      centerZones.push(zones[i]);
    }
    centerZones.push(zones[zones.length - 1]);

    for (let i = 1; i < centerZones.length; i++) {
      expect(centerZones[i].distToPin).toBeLessThan(centerZones[i - 1].distToPin);
    }
  });

  it('uses playsLikeYards when available', () => {
    const hole = makeStraightHole(4, 200);
    hole.playsLikeYards = { blue: 220 };
    const zones = discretizeHole(hole, 'blue');
    expect(zones[0].distToPin).toBeCloseTo(220, -1);
  });

  it('synthesizes centerLine for dogleg when centerLine is empty', () => {
    const hole = makeDoglegHole();
    const zones = discretizeHole(hole, 'blue');

    expect(zones.length).toBeGreaterThan(2);
    expect(zones[0].isTerminal).toBe(false);
    expect(zones[zones.length - 1].isTerminal).toBe(true);
  });

  it('synthetic centerLine avoids water hazard on dogleg', () => {
    const hole = makeDoglegHole();
    const zones = discretizeHole(hole, 'blue');
    const waterPoly = hole.hazards[0].polygon;

    const waterMinLat = Math.min(...waterPoly.map((p) => p.lat));
    const waterMaxLat = Math.max(...waterPoly.map((p) => p.lat));
    const waterMinLng = Math.min(...waterPoly.map((p) => p.lng));
    const waterMaxLng = Math.max(...waterPoly.map((p) => p.lng));

    const centerZones = [];
    for (let i = 1; i < zones.length - 1; i += 3) {
      centerZones.push(zones[i]);
    }

    const zonesInWater = centerZones.filter(
      (z) =>
        z.position.lat >= waterMinLat &&
        z.position.lat <= waterMaxLat &&
        z.position.lng >= waterMinLng &&
        z.position.lng <= waterMaxLng,
    );

    expect(zonesInWater.length).toBeLessThanOrEqual(1);
  });

  it('falls back to straight line with no fairway and no centerLine', () => {
    const hole = makeStraightHole(4, 200);
    hole.centerLine = [];
    hole.fairway = [];
    const zones = discretizeHole(hole, 'blue');
    expect(zones.length).toBeGreaterThan(2);
  });
});

// ---------------------------------------------------------------------------
// dpOptimizeHole — par 3 (lightest: short hole, few zones)
// Run once in beforeAll to avoid repeated expensive computation.
// ---------------------------------------------------------------------------

describe('dpOptimizeHole — par 3', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();
  const hole = makeStraightHole(3, 150);

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('returns strategies', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are reasonable', () => {
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThan(2);
      expect(r.expectedStrokes).toBeLessThan(5);
    }
  });

  it('strategies have required fields', () => {
    for (const r of results) {
      expect(r.clubs.length).toBeGreaterThan(0);
      expect(typeof r.expectedStrokes).toBe('number');
      expect(typeof r.stdStrokes).toBe('number');
      expect(r.label.length).toBeGreaterThan(0);
      expect(['scoring', 'safe', 'balanced']).toContain(r.strategyType);
      expect(r.scoreDistribution).toBeDefined();
      expect(typeof r.blowupRisk).toBe('number');
      expect(r.aimPoints.length).toBeGreaterThan(0);
    }
  });

  it('aim points have sequential shot numbers', () => {
    for (const r of results) {
      for (let i = 0; i < r.aimPoints.length; i++) {
        expect(r.aimPoints[i].shotNumber).toBe(i + 1);
      }
    }
  });

  it('labels contain all club names', () => {
    for (const r of results) {
      for (const club of r.clubs) {
        expect(r.label).toContain(club.clubName);
      }
    }
  });

  it('score distribution sums to ~1', () => {
    for (const r of results) {
      const sd = r.scoreDistribution;
      const sum = sd.eagle + sd.birdie + sd.par + sd.bogey + sd.double + sd.worse;
      expect(sum).toBeCloseTo(1.0, 1);
    }
  });

  it('results are sorted by expected strokes ascending', () => {
    for (let i = 1; i < results.length; i++) {
      expect(results[i].expectedStrokes).toBeGreaterThanOrEqual(results[i - 1].expectedStrokes);
    }
  });
});

// ---------------------------------------------------------------------------
// dpOptimizeHole — par 4 (short 260y to keep zones manageable)
// ---------------------------------------------------------------------------

describe('dpOptimizeHole — par 4', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();
  const hole = makeStraightHole(4, 260);

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('returns 3 strategies', () => {
    expect(results.length).toBe(3);
  });

  it('strategy names cover all 3 modes', () => {
    const names = new Set(results.map((r) => r.strategyName));
    expect(names.has('Optimal Scoring')).toBe(true);
    expect(names.has('Risk-Averse')).toBe(true);
    expect(names.has('Birdie Hunt')).toBe(true);
  });

  it('expected strokes are reasonable for a par 4', () => {
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThan(3);
      expect(r.expectedStrokes).toBeLessThan(7);
    }
  });

  it('plans have at least 2 shots', () => {
    for (const r of results) {
      expect(r.aimPoints.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('total club carries cover the distance to within approach range', () => {
    const swCarry = 85; // shortest club carry
    for (const r of results) {
      const totalCarry = r.clubs.reduce((sum, c) => {
        const dist = dists.find((d) => d.clubId === c.clubId);
        return sum + (dist?.meanCarry ?? 0);
      }, 0);
      expect(totalCarry).toBeGreaterThanOrEqual(260 - swCarry);
    }
  });
});

// ---------------------------------------------------------------------------
// extractPlan approach threshold (via dpOptimizeHole on a short hole)
// ---------------------------------------------------------------------------

describe('extractPlan — approach threshold', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();
  // 200y hole: 5 Iron (195y) lands ~5y from pin → on green → 1 shot plan
  // 9 Iron (135y) lands 65y away → within SW (85y) range → approach added
  const hole = makeStraightHole(4, 200);

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('produces strategies', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('plans end with approach when landing within wedge range', () => {
    // At least one plan should have 2+ shots (layup + approach)
    const multiShot = results.filter((r) => r.aimPoints.length >= 2);
    expect(multiShot.length).toBeGreaterThan(0);
  });

  it('last aim point carry is positive', () => {
    for (const r of results) {
      const lastAim = r.aimPoints[r.aimPoints.length - 1];
      expect(lastAim.carry).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Dogleg integration (synthesizeCenterLine → dpOptimizeHole)
// ---------------------------------------------------------------------------

describe('dogleg optimization', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();
  const hole = makeDoglegHole();

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('produces strategies for empty centerLine dogleg', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are reasonable for 376y dogleg par 4', () => {
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThan(3);
      expect(r.expectedStrokes).toBeLessThan(7);
    }
  });

  it('plans have multi-shot approaches', () => {
    for (const r of results) {
      expect(r.aimPoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('returns empty array with no distributions', () => {
    const hole = makeStraightHole(4, 200);
    expect(dpOptimizeHole(hole, 'blue', [])).toEqual([]);
  });

  it('handles a single club distribution', () => {
    seedRandom();
    const hole = makeStraightHole(3, 165);
    const dists = [makeDist({ clubId: 'iron7', clubName: '7 Iron', meanCarry: 165 })];
    const results = dpOptimizeHole(hole, 'blue', dists);
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('handles missing tee box gracefully', () => {
    seedRandom();
    const hole = makeStraightHole(3, 150);
    const dists = makeLightDistributions();
    // 'gold' tee doesn't exist → falls back to first available yardage
    const results = dpOptimizeHole(hole, 'gold', dists);
    expect(results.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Diversity enforcement (needs full bag to have enough club options)
// ---------------------------------------------------------------------------

describe('strategy diversity', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  beforeAll(() => {
    seedRandom();
    // Short par 4 with full bag to test club diversity
    const hole = makeStraightHole(4, 200);
    const dists = makeFullDistributions();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('produces 3 strategies', () => {
    expect(results.length).toBe(3);
  });

  it('at least 2 strategies use different first clubs', () => {
    if (results.length >= 2) {
      const firstClubs = results.map((r) => r.clubs[0]?.clubName);
      const uniqueClubs = new Set(firstClubs);
      expect(uniqueClubs.size).toBeGreaterThanOrEqual(2);
    }
  });
});
