// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { haversineYards, playsLikeYards, computeTargetDistances } from '../geo-utils';

describe('haversineYards', () => {
  it('returns 0 for the same point', () => {
    const p = { lat: 33.0, lng: -117.0 };
    expect(haversineYards(p, p)).toBe(0);
  });

  it('computes distance between two known points', () => {
    // ~1 degree of latitude ≈ 69 miles ≈ 121,440 yards
    const a = { lat: 33.0, lng: -117.0 };
    const b = { lat: 34.0, lng: -117.0 };
    const dist = haversineYards(a, b);
    expect(dist).toBeGreaterThan(120_000);
    expect(dist).toBeLessThan(123_000);
  });

  it('is symmetric', () => {
    const a = { lat: 33.45, lng: -117.6 };
    const b = { lat: 33.46, lng: -117.61 };
    expect(haversineYards(a, b)).toBe(haversineYards(b, a));
  });

  it('handles short golf-distance range', () => {
    // Two points ~300 yards apart (roughly 0.0025 degrees lat)
    const tee = { lat: 33.0, lng: -117.0 };
    const pin = { lat: 33.0025, lng: -117.0 };
    const dist = haversineYards(tee, pin);
    expect(dist).toBeGreaterThan(280);
    expect(dist).toBeLessThan(320);
  });
});

describe('playsLikeYards', () => {
  it('returns scorecard yardage when elevation delta is 0', () => {
    expect(playsLikeYards(400, 0)).toBe(400);
  });

  it('adds yards for uphill (positive delta)', () => {
    // 10 meters uphill → ~11 yards added
    expect(playsLikeYards(400, 10)).toBe(411);
  });

  it('subtracts yards for downhill (negative delta)', () => {
    // 10 meters downhill → ~11 yards subtracted
    expect(playsLikeYards(400, -10)).toBe(389);
  });

  it('rounds to nearest yard', () => {
    // 3 meters = 3.27 yards → rounds to 3
    expect(playsLikeYards(150, 3)).toBe(153);
  });
});

describe('computeTargetDistances', () => {
  const tee = { lat: 33.0, lng: -117.0 };
  const pin = { lat: 33.004, lng: -117.0 };

  it('returns empty array for no targets', () => {
    expect(computeTargetDistances(tee, pin, [])).toEqual([]);
  });

  it('computes fromTee and toPin for a single target', () => {
    const mid = { lat: 33.002, lng: -117.0, elevation: 50 };
    const result = computeTargetDistances(tee, pin, [{ index: 1, coordinate: mid }]);
    expect(result).toHaveLength(1);
    expect(result[0].index).toBe(1);
    expect(result[0].fromTee).toBeGreaterThan(0);
    expect(result[0].toPin).toBeGreaterThan(0);
    // fromTee + toPin ≈ total distance (collinear points)
    const total = haversineYards(tee, pin);
    expect(result[0].fromTee + result[0].toPin).toBeCloseTo(total, -1);
  });

  it('preserves coordinate and index in output', () => {
    const coord = { lat: 33.001, lng: -117.001, elevation: 42 };
    const result = computeTargetDistances(tee, pin, [{ index: 3, coordinate: coord }]);
    expect(result[0].coordinate).toEqual(coord);
    expect(result[0].index).toBe(3);
  });

  it('handles multiple targets', () => {
    const targets = [
      { index: 1, coordinate: { lat: 33.001, lng: -117.0, elevation: 30 } },
      { index: 2, coordinate: { lat: 33.002, lng: -117.0, elevation: 40 } },
      { index: 3, coordinate: { lat: 33.003, lng: -117.0, elevation: 50 } },
    ];
    const result = computeTargetDistances(tee, pin, targets);
    expect(result).toHaveLength(3);
    // Targets are progressively further from tee
    expect(result[0].fromTee).toBeLessThan(result[1].fromTee);
    expect(result[1].fromTee).toBeLessThan(result[2].fromTee);
    // And progressively closer to pin
    expect(result[0].toPin).toBeGreaterThan(result[1].toPin);
    expect(result[1].toPin).toBeGreaterThan(result[2].toPin);
  });
});
