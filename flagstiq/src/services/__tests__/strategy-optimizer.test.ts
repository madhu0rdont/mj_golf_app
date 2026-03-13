import { describe, it, expect } from 'vitest';
import {
  checkHazards,
  computeScoreDistribution,
  ballHeightAtDistance,
} from '../../../server/services/strategy-optimizer';
import type { HazardFeature } from '../../models/course';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
