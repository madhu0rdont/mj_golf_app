import { describe, it, expect } from 'vitest';
import { haversineYards, projectPoint, computeEllipsePoints } from '../geo';

describe('projectPoint', () => {
  const origin = { lat: 33.0, lng: -117.0 };

  it('returns origin when distance is zero', () => {
    const result = projectPoint(origin, 0, 0);
    expect(result.lat).toBeCloseTo(origin.lat, 8);
    expect(result.lng).toBeCloseTo(origin.lng, 8);
  });

  it('projects due north', () => {
    const result = projectPoint(origin, 0, 300);
    expect(result.lat).toBeGreaterThan(origin.lat);
    expect(result.lng).toBeCloseTo(origin.lng, 5);
    // Verify round-trip distance
    expect(haversineYards(origin, result)).toBeCloseTo(300, 0);
  });

  it('projects due east', () => {
    const result = projectPoint(origin, 90, 300);
    expect(result.lat).toBeCloseTo(origin.lat, 4);
    expect(result.lng).toBeGreaterThan(origin.lng);
    expect(haversineYards(origin, result)).toBeCloseTo(300, 0);
  });

  it('projects due south', () => {
    const result = projectPoint(origin, 180, 200);
    expect(result.lat).toBeLessThan(origin.lat);
    expect(haversineYards(origin, result)).toBeCloseTo(200, 0);
  });
});

describe('computeEllipsePoints', () => {
  const center = { lat: 33.0, lng: -117.0 };

  it('returns the requested number of points', () => {
    const pts = computeEllipsePoints(center, 0, 20, 10, 36);
    expect(pts).toHaveLength(36);
  });

  it('returns default 36 points', () => {
    const pts = computeEllipsePoints(center, 0, 20, 10);
    expect(pts).toHaveLength(36);
  });

  it('produces a symmetric shape around center', () => {
    const pts = computeEllipsePoints(center, 0, 30, 15, 36);
    const dists = pts.map((p) => haversineYards(center, p));
    // All points should be between semiMinor and semiMajor distance from center
    for (const d of dists) {
      expect(d).toBeGreaterThanOrEqual(14);
      expect(d).toBeLessThanOrEqual(31);
    }
  });

  it('produces a circle when semiMajor equals semiMinor', () => {
    const radius = 25;
    const pts = computeEllipsePoints(center, 0, radius, radius, 36);
    const dists = pts.map((p) => haversineYards(center, p));
    for (const d of dists) {
      expect(d).toBeCloseTo(radius, 0);
    }
  });

  it('major axis is longer than minor axis', () => {
    const pts = computeEllipsePoints(center, 0, 40, 15, 36);
    const dists = pts.map((p) => haversineYards(center, p));
    const maxDist = Math.max(...dists);
    const minDist = Math.min(...dists);
    expect(maxDist).toBeGreaterThan(minDist + 10);
  });
});
