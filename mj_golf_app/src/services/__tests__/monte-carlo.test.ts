import {
  buildDistributions,
  findBestApproaches,
  expectedPutts,
  linearPredict,
  estimateDispersion,
  type ClubDistribution,
} from '../monte-carlo';
import type { ClubShotGroup } from '../../hooks/useYardageBook';
import type { Shot } from '../../models/session';

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    sessionId: 'sess-1',
    clubId: 'club-1',
    shotNumber: 1,
    carryYards: 150,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeShotGroup(overrides: Partial<ClubShotGroup> & { clubId: string; clubName: string }): ClubShotGroup {
  return {
    color: '#000',
    shots: [],
    ...overrides,
  };
}

function makeDist(overrides: Partial<ClubDistribution> & { clubId: string; clubName: string }): ClubDistribution {
  return {
    meanCarry: 150,
    stdCarry: 6,
    meanOffline: 0,
    stdOffline: 8,
    ...overrides,
  };
}

// ── expectedPutts ──

describe('expectedPutts', () => {
  it('returns 1.0 for distance <= 1', () => {
    expect(expectedPutts(0.5)).toBe(1.0);
    expect(expectedPutts(1)).toBe(1.0);
  });

  it('returns ~1.46 at 3 yards', () => {
    // 1.0 + 0.42 * ln(3) = 1.0 + 0.42 * 1.0986 ≈ 1.461
    expect(expectedPutts(3)).toBeCloseTo(1.461, 2);
  });

  it('returns ~1.97 at 10 yards', () => {
    // 1.0 + 0.42 * ln(10) = 1.0 + 0.42 * 2.3026 ≈ 1.967
    expect(expectedPutts(10)).toBeCloseTo(1.967, 2);
  });

  it('clamps to 3.0 for very large distances', () => {
    expect(expectedPutts(1000)).toBe(3.0);
  });

  it('increases monotonically with distance', () => {
    const p3 = expectedPutts(3);
    const p5 = expectedPutts(5);
    const p10 = expectedPutts(10);
    const p20 = expectedPutts(20);
    expect(p5).toBeGreaterThan(p3);
    expect(p10).toBeGreaterThan(p5);
    expect(p20).toBeGreaterThan(p10);
  });
});

// ── linearPredict ──

describe('linearPredict', () => {
  it('returns exact y for a single point', () => {
    expect(linearPredict([[10, 5]], 10)).toBeCloseTo(5);
  });

  it('returns mean y for single point at different x', () => {
    // With one point, denom ≈ 0, returns mean(y)
    expect(linearPredict([[10, 5]], 20)).toBeCloseTo(5);
  });

  it('predicts correctly on a linear relationship', () => {
    // y = 2x + 1: points (1,3), (2,5)
    const points: [number, number][] = [[1, 3], [2, 5]];
    expect(linearPredict(points, 3)).toBeCloseTo(7, 5);
    expect(linearPredict(points, 0)).toBeCloseTo(1, 5);
  });

  it('interpolates between points', () => {
    const points: [number, number][] = [[100, 4], [200, 8]];
    expect(linearPredict(points, 150)).toBeCloseTo(6, 5);
  });

  it('extrapolates beyond points', () => {
    const points: [number, number][] = [[100, 4], [200, 8]];
    expect(linearPredict(points, 250)).toBeCloseTo(10, 5);
  });

  it('handles three or more points with best fit', () => {
    // y = x: (1,1), (2,2), (3,3) — perfect linear fit
    const points: [number, number][] = [[1, 1], [2, 2], [3, 3]];
    expect(linearPredict(points, 4)).toBeCloseTo(4, 5);
  });
});

// ── estimateDispersion ──

describe('estimateDispersion', () => {
  it('falls back to default CoV with 0 real clubs', () => {
    const result = estimateDispersion(200, []);
    expect(result.meanOffline).toBe(0);
    expect(result.stdCarry).toBeCloseTo(200 * 0.04, 2);
    expect(result.stdOffline).toBeCloseTo(200 * 0.05, 2);
  });

  it('falls back to default CoV with 1 real club', () => {
    const result = estimateDispersion(200, [
      { meanCarry: 150, meanOffline: -2, stdCarry: 6, stdOffline: 8 },
    ]);
    expect(result.meanOffline).toBe(0);
    expect(result.stdCarry).toBeCloseTo(200 * 0.04, 2);
  });

  it('extrapolates from 2+ real clubs via linear regression', () => {
    const realDists = [
      { meanCarry: 100, meanOffline: -1, stdCarry: 4, stdOffline: 5 },
      { meanCarry: 200, meanOffline: -3, stdCarry: 8, stdOffline: 10 },
    ];
    const result = estimateDispersion(150, realDists);
    // Linear regression: stdCarry at 150 should be midpoint ≈ 6
    expect(result.stdCarry).toBeCloseTo(6, 1);
    expect(result.stdOffline).toBeCloseTo(7.5, 1);
    expect(result.meanOffline).toBeCloseTo(-2, 1);
  });

  it('extrapolates meanOffline trend for long clubs', () => {
    // If right miss gets worse with longer clubs: -1 at 150, -5 at 250
    const realDists = [
      { meanCarry: 150, meanOffline: -1, stdCarry: 5, stdOffline: 7 },
      { meanCarry: 250, meanOffline: -5, stdCarry: 9, stdOffline: 13 },
    ];
    const result = estimateDispersion(300, realDists);
    // Slope = (-5 - -1) / (250 - 150) = -0.04 per yard
    // At 300: -1 + (-0.04 * 150) = -7
    expect(result.meanOffline).toBeCloseTo(-7, 0);
  });

  it('clamps stdCarry and stdOffline to minimum of 2', () => {
    // Two clubs with very tight dispersion
    const realDists = [
      { meanCarry: 100, meanOffline: 0, stdCarry: 0.5, stdOffline: 0.5 },
      { meanCarry: 200, meanOffline: 0, stdCarry: 1.0, stdOffline: 1.0 },
    ];
    const result = estimateDispersion(50, realDists);
    expect(result.stdCarry).toBeGreaterThanOrEqual(2);
    expect(result.stdOffline).toBeGreaterThanOrEqual(2);
  });
});

// ── buildDistributions ──

describe('buildDistributions', () => {
  it('returns empty array for empty groups', () => {
    expect(buildDistributions([])).toEqual([]);
  });

  it('builds distribution from club with 3+ shots', () => {
    const group = makeShotGroup({
      clubId: 'c1',
      clubName: '7 Iron',
      shots: [
        makeShot({ id: 's1', carryYards: 148, offlineYards: -2 }),
        makeShot({ id: 's2', carryYards: 152, offlineYards: 3 }),
        makeShot({ id: 's3', carryYards: 150, offlineYards: -1 }),
      ],
    });
    const dists = buildDistributions([group]);
    expect(dists).toHaveLength(1);
    expect(dists[0].clubId).toBe('c1');
    expect(dists[0].meanCarry).toBeCloseTo(150, 0);
    expect(dists[0].stdCarry).toBeGreaterThan(0);
    expect(dists[0].meanOffline).toBeCloseTo(0, 0);
  });

  it('excludes clubs with fewer than 3 shots (non-imputed)', () => {
    const group = makeShotGroup({
      clubId: 'c1',
      clubName: '7 Iron',
      shots: [
        makeShot({ id: 's1', carryYards: 150 }),
        makeShot({ id: 's2', carryYards: 155 }),
      ],
    });
    const dists = buildDistributions([group]);
    expect(dists).toHaveLength(0);
  });

  it('includes imputed clubs with estimated dispersion', () => {
    const realGroup = makeShotGroup({
      clubId: 'c1',
      clubName: '7 Iron',
      shots: [
        makeShot({ id: 's1', clubId: 'c1', carryYards: 150, offlineYards: -2 }),
        makeShot({ id: 's2', clubId: 'c1', carryYards: 152, offlineYards: 3 }),
        makeShot({ id: 's3', clubId: 'c1', carryYards: 148, offlineYards: -1 }),
      ],
    });
    const imputedGroup = makeShotGroup({
      clubId: 'c2',
      clubName: '5 Iron',
      imputed: true,
      shots: [makeShot({ id: 'imp1', clubId: 'c2', carryYards: 185 })],
    });
    const dists = buildDistributions([realGroup, imputedGroup]);
    expect(dists).toHaveLength(2);
    const imputed = dists.find((d) => d.clubId === 'c2')!;
    expect(imputed.meanCarry).toBe(185);
    expect(imputed.stdCarry).toBeGreaterThan(0);
    expect(imputed.stdOffline).toBeGreaterThan(0);
  });

  it('skips imputed clubs with no shots', () => {
    const imputedGroup = makeShotGroup({
      clubId: 'c2',
      clubName: '5 Iron',
      imputed: true,
      shots: [],
    });
    const dists = buildDistributions([imputedGroup]);
    expect(dists).toHaveLength(0);
  });

  it('skips imputed clubs with zero carry', () => {
    const imputedGroup = makeShotGroup({
      clubId: 'c2',
      clubName: '5 Iron',
      imputed: true,
      shots: [makeShot({ carryYards: 0 })],
    });
    const dists = buildDistributions([imputedGroup]);
    expect(dists).toHaveLength(0);
  });

  it('uses fallback dispersion when fewer than 2 real clubs exist', () => {
    const realGroup = makeShotGroup({
      clubId: 'c1',
      clubName: '7 Iron',
      shots: [
        makeShot({ id: 's1', clubId: 'c1', carryYards: 150, offlineYards: -2 }),
        makeShot({ id: 's2', clubId: 'c1', carryYards: 152, offlineYards: 3 }),
        makeShot({ id: 's3', clubId: 'c1', carryYards: 148, offlineYards: -1 }),
      ],
    });
    const imputedGroup = makeShotGroup({
      clubId: 'c2',
      clubName: '5 Iron',
      imputed: true,
      shots: [makeShot({ id: 'imp1', clubId: 'c2', carryYards: 185 })],
    });
    const dists = buildDistributions([realGroup, imputedGroup]);
    const imputed = dists.find((d) => d.clubId === 'c2')!;
    // Only 1 real club → fallback: 4% CoV carry, 5% CoV offline
    expect(imputed.stdCarry).toBeCloseTo(185 * 0.04, 1);
    expect(imputed.stdOffline).toBeCloseTo(185 * 0.05, 1);
    expect(imputed.meanOffline).toBe(0);
  });

  it('defaults to stdOffline=5 when no offline data present', () => {
    const group = makeShotGroup({
      clubId: 'c1',
      clubName: '7 Iron',
      shots: [
        makeShot({ id: 's1', carryYards: 150 }), // no offlineYards
        makeShot({ id: 's2', carryYards: 152 }),
        makeShot({ id: 's3', carryYards: 148 }),
      ],
    });
    const dists = buildDistributions([group]);
    expect(dists[0].stdOffline).toBe(5);
    expect(dists[0].meanOffline).toBe(0);
  });
});

// ── findBestApproaches ──

describe('findBestApproaches', () => {
  // Use deterministic seed for reproducibility by mocking Math.random
  let originalRandom: () => number;
  let callCount: number;

  beforeEach(() => {
    originalRandom = Math.random;
    callCount = 0;
    // Simple LCG for reproducible "random" numbers
    Math.random = () => {
      callCount++;
      return ((callCount * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    };
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it('returns empty array for no clubs', () => {
    expect(findBestApproaches(200, [])).toEqual([]);
  });

  it('returns 1-club plans for distance <= 225', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: '7 Iron', meanCarry: 155, stdCarry: 5, stdOffline: 8 }),
      makeDist({ clubId: 'c2', clubName: '8 Iron', meanCarry: 140, stdCarry: 4, stdOffline: 7 }),
    ];
    const results = findBestApproaches(150, clubs, 500);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    // Each strategy should have 1 club in its plan
    for (const r of results) {
      expect(r.clubs).toHaveLength(1);
    }
  });

  it('returns 2-club plans for distance 226-425', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: '5 Wood', meanCarry: 220, stdCarry: 8, stdOffline: 12 }),
      makeDist({ clubId: 'c2', clubName: '7 Iron', meanCarry: 155, stdCarry: 5, stdOffline: 8 }),
      makeDist({ clubId: 'c3', clubName: 'SW', meanCarry: 100, stdCarry: 4, stdOffline: 6 }),
    ];
    const results = findBestApproaches(350, clubs, 500);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.clubs.length).toBeGreaterThanOrEqual(1);
      expect(r.clubs.length).toBeLessThanOrEqual(2);
    }
  });

  it('returns 2-club and 3-club plans for distance > 425', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: 'Driver', meanCarry: 260, stdCarry: 10, stdOffline: 15 }),
      makeDist({ clubId: 'c2', clubName: '5 Wood', meanCarry: 220, stdCarry: 8, stdOffline: 12 }),
      makeDist({ clubId: 'c3', clubName: '7 Iron', meanCarry: 155, stdCarry: 5, stdOffline: 8 }),
      makeDist({ clubId: 'c4', clubName: 'SW', meanCarry: 100, stdCarry: 4, stdOffline: 6 }),
    ];
    const results = findBestApproaches(475, clubs, 500);
    expect(results.length).toBeGreaterThan(0);
  });

  it('sorts results by expectedStrokes ascending', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: '7 Iron', meanCarry: 155, stdCarry: 5, stdOffline: 8 }),
      makeDist({ clubId: 'c2', clubName: '8 Iron', meanCarry: 140, stdCarry: 4, stdOffline: 7 }),
      makeDist({ clubId: 'c3', clubName: '6 Iron', meanCarry: 165, stdCarry: 6, stdOffline: 9 }),
    ];
    const results = findBestApproaches(160, clubs, 500);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].expectedStrokes).toBeGreaterThanOrEqual(results[i - 1].expectedStrokes);
    }
  });

  it('returns at most 3 strategies', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: '5W', meanCarry: 220, stdCarry: 8, stdOffline: 12 }),
      makeDist({ clubId: 'c2', clubName: '4H', meanCarry: 200, stdCarry: 7, stdOffline: 10 }),
      makeDist({ clubId: 'c3', clubName: '6I', meanCarry: 165, stdCarry: 6, stdOffline: 9 }),
      makeDist({ clubId: 'c4', clubName: '7I', meanCarry: 155, stdCarry: 5, stdOffline: 8 }),
      makeDist({ clubId: 'c5', clubName: '8I', meanCarry: 140, stdCarry: 4, stdOffline: 7 }),
      makeDist({ clubId: 'c6', clubName: 'PW', meanCarry: 120, stdCarry: 4, stdOffline: 6 }),
      makeDist({ clubId: 'c7', clubName: 'SW', meanCarry: 100, stdCarry: 3, stdOffline: 5 }),
    ];
    const results = findBestApproaches(350, clubs, 500);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('includes grip-down tips when club overshoots target', () => {
    // Single club that overshoots a short distance — should suggest grip-down
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: 'PW', meanCarry: 130, stdCarry: 4, stdOffline: 6 }),
    ];
    const results = findBestApproaches(120, clubs, 500);
    expect(results.length).toBeGreaterThan(0);
    // The PW overshoots by 10 yards → suggest grip 2" down for 120
    const pw = results.find((r) => r.clubs[0].clubName === 'PW');
    if (pw) {
      expect(pw.tip).toBeDefined();
      expect(pw.tip).toMatch(/Grip.*down/i);
    }
  });

  it('expected strokes are reasonable (between 2 and 8)', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: '5W', meanCarry: 220, stdCarry: 8, stdOffline: 12 }),
      makeDist({ clubId: 'c2', clubName: 'SW', meanCarry: 100, stdCarry: 4, stdOffline: 6 }),
    ];
    const results = findBestApproaches(300, clubs, 500);
    for (const r of results) {
      expect(r.expectedStrokes).toBeGreaterThanOrEqual(2);
      expect(r.expectedStrokes).toBeLessThanOrEqual(8);
    }
  });

  it('returns empty when no clubs are within tolerance', () => {
    const clubs: ClubDistribution[] = [
      makeDist({ clubId: 'c1', clubName: 'SW', meanCarry: 100, stdCarry: 4, stdOffline: 6 }),
    ];
    // 200 yards with only a 100-yard club: |100-200| = 100 > 40 tolerance for 1-club
    const results = findBestApproaches(200, clubs, 500);
    expect(results).toEqual([]);
  });
});
