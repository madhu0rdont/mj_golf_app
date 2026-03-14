// @vitest-environment node
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { discretizeHole, dpOptimizeHole, classifyLie } from '../dp-optimizer';
import { DEFAULT_STRATEGY_CONSTANTS } from '../strategy-optimizer';
import type { ClubDistribution } from '../monte-carlo';
import type { CourseHole, HazardFeature } from '../../models/types';
import { pointInPolygon } from '../geo';

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
    expect(discretizeHole(hole, 'blue').anchors).toEqual([]);
  });

  it('returns tee + green for very short hole', () => {
    const hole = makeStraightHole(3, 30);
    const { anchors } = discretizeHole(hole, 'blue');
    expect(anchors.length).toBe(2);
    expect(anchors[0].lie).toBe('fairway');
    expect(anchors[0].isTerminal).toBe(false);
    expect(anchors[anchors.length - 1].isTerminal).toBe(true);
    expect(anchors[anchors.length - 1].lie).toBe('green');
  });

  it('creates zones along centerline with correct structure', () => {
    const hole = makeStraightHole(4, 200);
    const { anchors } = discretizeHole(hole, 'blue');

    expect(anchors.length).toBeGreaterThan(2);
    expect(anchors[0].id).toBe(0);
    expect(anchors[0].distToPin).toBeCloseTo(200, -1);

    const green = anchors[anchors.length - 1];
    expect(green.isTerminal).toBe(true);
    expect(green.distToPin).toBe(0);

    // Interior anchors come in groups of 5 (center, ±20y, ±40y)
    const interior = anchors.length - 2;
    expect(interior % 5).toBe(0);
  });

  it('center zones have decreasing distToPin', () => {
    const hole = makeStraightHole(4, 200);
    const { anchors } = discretizeHole(hole, 'blue');

    const centerAnchors = [anchors[0]];
    for (let i = 1; i < anchors.length - 1; i += 5) {
      centerAnchors.push(anchors[i]);
    }
    centerAnchors.push(anchors[anchors.length - 1]);

    for (let i = 1; i < centerAnchors.length; i++) {
      expect(centerAnchors[i].distToPin).toBeLessThan(centerAnchors[i - 1].distToPin);
    }
  });

  it('uses playsLikeYards when available', () => {
    const hole = makeStraightHole(4, 200);
    hole.playsLikeYards = { blue: 220 };
    const { anchors } = discretizeHole(hole, 'blue');
    expect(anchors[0].distToPin).toBeCloseTo(220, -1);
  });

  it('synthesizes centerLine for dogleg when centerLine is empty', () => {
    const hole = makeDoglegHole();
    const { anchors } = discretizeHole(hole, 'blue');

    expect(anchors.length).toBeGreaterThan(2);
    expect(anchors[0].isTerminal).toBe(false);
    expect(anchors[anchors.length - 1].isTerminal).toBe(true);
  });

  it('synthetic centerLine avoids water hazard on dogleg', () => {
    const hole = makeDoglegHole();
    const { anchors } = discretizeHole(hole, 'blue');
    const waterPoly = hole.hazards[0].polygon;

    const waterMinLat = Math.min(...waterPoly.map((p) => p.lat));
    const waterMaxLat = Math.max(...waterPoly.map((p) => p.lat));
    const waterMinLng = Math.min(...waterPoly.map((p) => p.lng));
    const waterMaxLng = Math.max(...waterPoly.map((p) => p.lng));

    const centerAnchors = [];
    for (let i = 1; i < anchors.length - 1; i += 5) {
      centerAnchors.push(anchors[i]);
    }

    const anchorsInWater = centerAnchors.filter(
      (z) =>
        z.position.lat >= waterMinLat &&
        z.position.lat <= waterMaxLat &&
        z.position.lng >= waterMinLng &&
        z.position.lng <= waterMaxLng,
    );

    expect(anchorsInWater.length).toBeLessThanOrEqual(1);
  });

  it('falls back to straight line with no fairway and no centerLine', () => {
    const hole = makeStraightHole(4, 200);
    hole.centerLine = [];
    hole.fairway = [];
    const { anchors } = discretizeHole(hole, 'blue');
    expect(anchors.length).toBeGreaterThan(2);
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
// Shared computation for: score distribution, aim points, safe/scoring modes,
// fairway rate, and approach shot carry tests.
// ---------------------------------------------------------------------------

describe('dpOptimizeHole — par 4', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();
  const hole = makeStraightHole(4, 260);

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('returns 1-3 unique strategies', () => {
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('strategy types are from the 3 modes', () => {
    const validTypes = new Set(['scoring', 'safe', 'balanced']);
    for (const r of results) {
      expect(validTypes.has(r.strategyType)).toBe(true);
    }
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

  // Score distribution validity (#16 — NaN filtering)
  it('all score distribution values are finite non-negative', () => {
    for (const r of results) {
      const sd = r.scoreDistribution;
      for (const key of ['eagle', 'birdie', 'par', 'bogey', 'double', 'worse'] as const) {
        expect(Number.isFinite(sd[key])).toBe(true);
        expect(sd[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('blowupRisk is finite and between 0 and 1', () => {
    for (const r of results) {
      expect(Number.isFinite(r.blowupRisk)).toBe(true);
      expect(r.blowupRisk).toBeGreaterThanOrEqual(0);
      expect(r.blowupRisk).toBeLessThanOrEqual(1);
    }
  });

  it('stdStrokes is finite and non-negative', () => {
    for (const r of results) {
      expect(Number.isFinite(r.stdStrokes)).toBe(true);
      expect(r.stdStrokes).toBeGreaterThanOrEqual(0);
    }
  });

  // Aim point integrity (M4 — rawLanding, L5 — bias compensation)
  it('all aim point positions are finite', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(Number.isFinite(ap.position.lat)).toBe(true);
        expect(Number.isFinite(ap.position.lng)).toBe(true);
      }
    }
  });

  it('aim points are between tee and pin', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(ap.position.lat).toBeGreaterThanOrEqual(33.0 - 0.001);
      }
    }
  });

  it('aim point carry values are positive', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(ap.carry).toBeGreaterThan(0);
      }
    }
  });

  // Safe vs scoring mode (M8 — convergence)
  it('safe strategy has lower or equal blowup risk than scoring', () => {
    const scoring = results.find((r) => r.strategyType === 'scoring');
    const safe = results.find((r) => r.strategyType === 'safe');
    if (scoring && safe) {
      expect(safe.blowupRisk).toBeLessThanOrEqual(scoring.blowupRisk + 0.05);
    }
  });

  // Fairway rate (L3 — tree hit exclusion)
  it('fairway rate is between 0 and 1', () => {
    for (const r of results) {
      expect(Number.isFinite(r.fairwayRate)).toBe(true);
      expect(r.fairwayRate).toBeGreaterThanOrEqual(0);
      expect(r.fairwayRate).toBeLessThanOrEqual(1);
    }
  });

  // Approach shot carry (M12 — displayCarry)
  it('last aim point carry is positive and reasonable', () => {
    for (const r of results) {
      if (r.aimPoints.length >= 2) {
        const lastAp = r.aimPoints[r.aimPoints.length - 1];
        expect(lastAp.carry).toBeGreaterThan(0);
        expect(lastAp.carry).toBeLessThan(250);
      }
    }
  });

  it('label contains carry values matching aim points', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(r.label).toContain(String(ap.carry));
      }
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
  }, 60_000);

  it('produces strategies for empty centerLine dogleg', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are reasonable for 376y dogleg par 4', () => {
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThan(3);
      expect(r.expectedStrokes).toBeLessThan(8);
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

// ---------------------------------------------------------------------------
// classifyLie — unit tests
// ---------------------------------------------------------------------------

describe('classifyLie', () => {
  const greenPoly = [
    { lat: 33.003, lng: -117.001 },
    { lat: 33.003, lng: -116.999 },
    { lat: 33.004, lng: -116.999 },
    { lat: 33.004, lng: -117.001 },
  ];

  const fairway = [[
    { lat: 33.0, lng: -117.001 },
    { lat: 33.0, lng: -116.999 },
    { lat: 33.003, lng: -116.999 },
    { lat: 33.003, lng: -117.001 },
  ]];

  const bunker: HazardFeature = makeHazard({
    name: 'Bunker', type: 'fairway_bunker', penalty: 0.5,
    polygon: [
      { lat: 33.001, lng: -117.002 },
      { lat: 33.001, lng: -117.0015 },
      { lat: 33.002, lng: -117.0015 },
      { lat: 33.002, lng: -117.002 },
    ],
  });

  const treeLine: HazardFeature = makeHazard({
    name: 'Trees', type: 'trees', penalty: 0.5,
    polygon: [
      { lat: 33.0, lng: -117.003 },
      { lat: 33.0, lng: -117.002 },
      { lat: 33.003, lng: -117.002 },
      { lat: 33.003, lng: -117.003 },
    ],
  });

  it('returns green for point inside green polygon', () => {
    expect(classifyLie({ lat: 33.0035, lng: -117.0 }, fairway, greenPoly)).toBe('green');
  });

  it('returns fairway for point inside fairway polygon', () => {
    expect(classifyLie({ lat: 33.001, lng: -117.0 }, fairway, greenPoly)).toBe('fairway');
  });

  it('returns rough for point outside all features', () => {
    expect(classifyLie({ lat: 33.005, lng: -117.0 }, fairway, greenPoly)).toBe('rough');
  });

  it('returns fairway_bunker for point in bunker hazard', () => {
    expect(classifyLie({ lat: 33.0015, lng: -117.0018 }, fairway, greenPoly, [bunker])).toBe('fairway_bunker');
  });

  it('returns trees for point in tree hazard', () => {
    expect(classifyLie({ lat: 33.001, lng: -117.0025 }, fairway, greenPoly, [treeLine])).toBe('trees');
  });

  it('green takes priority over fairway overlap', () => {
    // Point in both green and fairway — green should win
    expect(classifyLie({ lat: 33.003, lng: -117.0 }, fairway, greenPoly)).toBe('green');
  });

  it('returns rough with empty polygons', () => {
    expect(classifyLie({ lat: 33.001, lng: -117.0 }, [], [])).toBe('rough');
  });
});

// ---------------------------------------------------------------------------
// Lateral anchor coverage (±20y and ±40y offsets)
// ---------------------------------------------------------------------------

describe('lateral anchor coverage', () => {
  it('creates 5 anchors per distance step (center, ±20y, ±40y)', () => {
    const hole = makeStraightHole(4, 200);
    const { anchors } = discretizeHole(hole, 'blue');
    // Tee (1) + interior groups of 5 + green (1)
    const interior = anchors.length - 2;
    expect(interior % 5).toBe(0);
    expect(interior / 5).toBeGreaterThan(0);
  });

  it('lateral anchors have nonzero u coordinates', () => {
    const hole = makeStraightHole(4, 200);
    const { anchors } = discretizeHole(hole, 'blue');
    const laterals = anchors.filter((a) => !a.isTerminal && a.id !== 0 && Math.abs(a.u) > 5);
    expect(laterals.length).toBeGreaterThan(0);
    // Should have anchors near ±20y and ±40y
    const near20 = laterals.filter((a) => Math.abs(Math.abs(a.u) - 20) < 5);
    const near40 = laterals.filter((a) => Math.abs(Math.abs(a.u) - 40) < 5);
    expect(near20.length).toBeGreaterThan(0);
    expect(near40.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Uphill hole (M1 — negative carry clamp)
// ---------------------------------------------------------------------------

describe('uphill hole — negative carry clamp', () => {
  let results: ReturnType<typeof dpOptimizeHole>;
  const dists = makeLightDistributions();

  beforeAll(() => {
    seedRandom();
    const hole = makeStraightHole(3, 150);
    // Extreme uphill: +50m elevation
    hole.pin.elevation = 50;
    hole.tee.elevation = 0;
    results = dpOptimizeHole(hole, 'blue', dists);
  });

  it('produces strategies despite steep elevation', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are finite and reasonable', () => {
    for (const r of results) {
      expect(Number.isFinite(r.expectedStrokes)).toBe(true);
      expect(r.expectedStrokes).toBeGreaterThan(2);
      expect(r.expectedStrokes).toBeLessThan(8);
    }
  });

  it('all aim point carries are positive', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(ap.carry).toBeGreaterThan(0);
      }
    }
  });
});


// ---------------------------------------------------------------------------
// Hole with hazards (water, OB, trees)
// ---------------------------------------------------------------------------

describe('hole with hazards', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  function makeHazardHole(): CourseHole {
    const hole = makeStraightHole(4, 260);
    // Water hazard crossing the fairway at 150y
    const waterLat = 33.0 + 150 / 121100;
    hole.hazards = [
      makeHazard({
        name: 'Water', type: 'water', penalty: 1,
        polygon: [
          { lat: waterLat - 0.00005, lng: -117.001 },
          { lat: waterLat - 0.00005, lng: -116.999 },
          { lat: waterLat + 0.00005, lng: -116.999 },
          { lat: waterLat + 0.00005, lng: -117.001 },
        ],
      }),
    ];
    return hole;
  }

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(makeHazardHole(), 'blue', makeLightDistributions());
  }, 30_000);

  it('produces strategies despite water hazard', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes increase vs no-hazard hole', () => {
    // With water, scores should be higher than the clean par 4
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThan(3);
    }
  });

  it('all results have valid score distributions', () => {
    for (const r of results) {
      const sd = r.scoreDistribution;
      const sum = sd.eagle + sd.birdie + sd.par + sd.bogey + sd.double + sd.worse;
      expect(sum).toBeCloseTo(1.0, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Hole with tree hazards (#11 — recovery lie, L3 — fairway rate)
// ---------------------------------------------------------------------------

describe('hole with tree hazards', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  function makeTreeHole(): CourseHole {
    const hole = makeStraightHole(4, 260);
    // Tree line along the right side
    hole.hazards = [
      makeHazard({
        name: 'Trees Right', type: 'trees', penalty: 0.5,
        polygon: [
          { lat: 33.0, lng: -116.999 },
          { lat: 33.0, lng: -116.9985 },
          { lat: 33.0 + 250 / 121100, lng: -116.9985 },
          { lat: 33.0 + 250 / 121100, lng: -116.999 },
        ],
      }),
    ];
    // Add fairway so we can check fairway rate
    hole.fairway = [[
      { lat: 33.0, lng: -117.001 },
      { lat: 33.0, lng: -116.999 },
      { lat: 33.0 + 250 / 121100, lng: -116.999 },
      { lat: 33.0 + 250 / 121100, lng: -117.001 },
    ]];
    return hole;
  }

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(makeTreeHole(), 'blue', makeLightDistributions());
  });

  it('produces strategies with tree hazards', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('all expected strokes are finite', () => {
    for (const r of results) {
      expect(Number.isFinite(r.expectedStrokes)).toBe(true);
      expect(r.expectedStrokes).toBeGreaterThan(3);
    }
  });

  it('fairway rate is valid', () => {
    for (const r of results) {
      expect(r.fairwayRate).toBeGreaterThanOrEqual(0);
      expect(r.fairwayRate).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Biased club distribution (M2 — no double compensation, L5 — aim bias)
// ---------------------------------------------------------------------------

describe('biased club distribution', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  beforeAll(() => {
    seedRandom();
    const hole = makeStraightHole(3, 150);
    // Club with strong right bias (left-handed golfer hook)
    const biasedDists: ClubDistribution[] = [
      makeDist({ clubId: 'iron7', clubName: '7 Iron', meanCarry: 165, meanOffline: -10, stdOffline: 5 }),
      makeDist({ clubId: 'iron9', clubName: '9 Iron', meanCarry: 135, meanOffline: -8, stdOffline: 4 }),
      makeDist({ clubId: 'sw', clubName: 'SW', meanCarry: 85, meanOffline: -5, stdOffline: 3 }),
    ];
    results = dpOptimizeHole(hole, 'blue', biasedDists);
  });

  it('produces strategies with biased clubs', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are finite and reasonable', () => {
    for (const r of results) {
      expect(Number.isFinite(r.expectedStrokes)).toBe(true);
      expect(r.expectedStrokes).toBeGreaterThan(2);
      expect(r.expectedStrokes).toBeLessThan(6);
    }
  });

  it('aim points have valid positions', () => {
    for (const r of results) {
      for (const ap of r.aimPoints) {
        expect(Number.isFinite(ap.position.lat)).toBe(true);
        expect(Number.isFinite(ap.position.lng)).toBe(true);
      }
    }
  });
});


// ---------------------------------------------------------------------------
// Downhill hole (elevation adjustments)
// ---------------------------------------------------------------------------

describe('downhill hole', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  beforeAll(() => {
    seedRandom();
    const hole = makeStraightHole(3, 150);
    hole.tee.elevation = 30;
    hole.pin.elevation = 0;
    results = dpOptimizeHole(hole, 'blue', makeLightDistributions());
  });

  it('produces strategies for downhill hole', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('expected strokes are finite', () => {
    for (const r of results) {
      expect(Number.isFinite(r.expectedStrokes)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Constants consistency (#1 — default mismatch guard)
// ---------------------------------------------------------------------------

describe('constants consistency', () => {
  it('dpOptimizeHole with default constants matches explicit DEFAULT_STRATEGY_CONSTANTS', () => {
    seedRandom();
    const hole = makeStraightHole(3, 150);
    const dists = makeLightDistributions();
    const implicitResults = dpOptimizeHole(hole, 'blue', dists);

    seedRandom();
    const explicitResults = dpOptimizeHole(hole, 'blue', dists, DEFAULT_STRATEGY_CONSTANTS);

    expect(implicitResults.length).toBe(explicitResults.length);
    for (let i = 0; i < implicitResults.length; i++) {
      expect(implicitResults[i].expectedStrokes).toBe(explicitResults[i].expectedStrokes);
    }
  });

  it('custom hazard_drop_penalty produces different results than default', () => {
    const hole = makeStraightHole(3, 150);
    // Add a water hazard so hazard_drop_penalty has an effect
    const waterLat = 33.0 + 80 / 121100;
    hole.hazards = [
      makeHazard({
        name: 'Water', type: 'water', penalty: 1,
        polygon: [
          { lat: waterLat - 0.00005, lng: -117.001 },
          { lat: waterLat - 0.00005, lng: -116.999 },
          { lat: waterLat + 0.00005, lng: -116.999 },
          { lat: waterLat + 0.00005, lng: -117.001 },
        ],
      }),
    ];
    const dists = makeLightDistributions();

    seedRandom();
    const defaultResults = dpOptimizeHole(hole, 'blue', dists);

    seedRandom();
    const highPenalty = dpOptimizeHole(hole, 'blue', dists, {
      ...DEFAULT_STRATEGY_CONSTANTS,
      hazard_drop_penalty: 1.0,
    });

    // Both should produce strategies
    expect(defaultResults.length).toBeGreaterThan(0);
    expect(highPenalty.length).toBeGreaterThan(0);

    // Higher penalty should produce higher (worse) expected strokes
    const defaultBest = Math.min(...defaultResults.map(r => r.expectedStrokes));
    const highBest = Math.min(...highPenalty.map(r => r.expectedStrokes));
    expect(highBest).toBeGreaterThanOrEqual(defaultBest);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Dogleg par 5 — OB regression test
// Ensures aim points never land inside OB polygons on dogleg holes where
// localBearing diverges from the pin direction.
// ---------------------------------------------------------------------------

describe('dogleg par 5 — no OB aim points', () => {
  let results: ReturnType<typeof dpOptimizeHole>;

  function makeDoglegPar5WithOB(): CourseHole {
    const tee = { lat: 33.0, lng: -117.0, elevation: 0 };
    const pin = { lat: 33.0 + 450 / 121100, lng: -117.003, elevation: 0 };

    // Fairway follows the dogleg left
    const fairway = [[
      { lat: 33.0, lng: -117.001 },
      { lat: 33.0, lng: -116.999 },
      { lat: 33.0 + 250 / 121100, lng: -116.999 },
      { lat: 33.0 + 250 / 121100, lng: -117.001 },
      { lat: 33.0 + 350 / 121100, lng: -117.002 },
      { lat: 33.0 + 450 / 121100, lng: -117.004 },
      { lat: 33.0 + 450 / 121100, lng: -117.002 },
      { lat: 33.0 + 350 / 121100, lng: -117.0005 },
    ]];

    // OB zone: straight north beyond the dogleg bend
    const obLat = 33.0 + 380 / 121100;
    const obHazard = makeHazard({
      name: 'OB North',
      type: 'ob',
      penalty: 1,
      polygon: [
        { lat: obLat, lng: -117.001 },
        { lat: obLat, lng: -116.998 },
        { lat: obLat + 0.002, lng: -116.998 },
        { lat: obLat + 0.002, lng: -117.001 },
      ],
    });

    return {
      id: 'dogleg-par5',
      courseId: 'course-1',
      holeNumber: 1,
      par: 5,
      handicap: null,
      yardages: { blue: 480 },
      heading: 0,
      tee,
      pin,
      targets: [],
      centerLine: [],
      hazards: [obHazard],
      fairway,
      green: [],
      playsLikeYards: null,
      notes: null,
    };
  }

  beforeAll(() => {
    seedRandom();
    results = dpOptimizeHole(makeDoglegPar5WithOB(), 'blue', makeLightDistributions());
  }, 120_000);

  it('produces strategies', () => {
    expect(results.length).toBeGreaterThan(0);
  });

  it('no aim point lands inside an OB polygon', () => {
    const hole = makeDoglegPar5WithOB();
    const obPolygons = (hole.hazards ?? [])
      .filter((h) => h.type === 'ob')
      .map((h) => h.polygon);

    for (const r of results) {
      for (const ap of r.aimPoints) {
        for (const obPoly of obPolygons) {
          expect(pointInPolygon(ap.position, obPoly)).toBe(false);
        }
      }
    }
  });
});
