import { describe, it, expect } from 'vitest';
import { haversineYards, projectPoint, computeEllipsePoints, pointInPolygon, bearingBetween } from '../geo';

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

describe('pointInPolygon', () => {
  // Simple square: corners at (0,0), (0,1), (1,1), (1,0)
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];

  it('returns true for a point inside a square', () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
  });

  it('returns false for a point outside a square', () => {
    expect(pointInPolygon({ lat: 2, lng: 2 }, square)).toBe(false);
  });

  it('returns false for a point far away', () => {
    expect(pointInPolygon({ lat: 50, lng: 50 }, square)).toBe(false);
  });

  it('returns true for a point inside a triangle', () => {
    const triangle = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 1 },
    ];
    expect(pointInPolygon({ lat: 0.5, lng: 0.8 }, triangle)).toBe(true);
  });

  it('returns false for a point outside a triangle', () => {
    const triangle = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 1 },
    ];
    // Point (1.5, 0.2) is to the left of the triangle edge
    expect(pointInPolygon({ lat: 1.5, lng: 0.2 }, triangle)).toBe(false);
  });

  it('returns false for empty polygon', () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, [])).toBe(false);
  });

  it('returns false for polygon with fewer than 3 points', () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }])).toBe(false);
  });
});

describe('bearingBetween', () => {
  const origin = { lat: 33.0, lng: -117.0 };

  it('returns ~0 for due north', () => {
    const north = { lat: 34.0, lng: -117.0 };
    expect(bearingBetween(origin, north)).toBeCloseTo(0, 0);
  });

  it('returns ~90 for due east', () => {
    const east = { lat: 33.0, lng: -116.0 };
    expect(bearingBetween(origin, east)).toBeCloseTo(90, 0);
  });

  it('returns ~180 for due south', () => {
    const south = { lat: 32.0, lng: -117.0 };
    expect(bearingBetween(origin, south)).toBeCloseTo(180, 0);
  });

  it('returns ~270 for due west', () => {
    const west = { lat: 33.0, lng: -118.0 };
    expect(bearingBetween(origin, west)).toBeCloseTo(270, 0);
  });

  it('reverse bearing differs by ~180 degrees', () => {
    const target = { lat: 33.5, lng: -116.5 };
    const forward = bearingBetween(origin, target);
    const reverse = bearingBetween(target, origin);
    const diff = Math.abs(forward - reverse);
    expect(Math.min(diff, 360 - diff)).toBeCloseTo(180, 0);
  });
});
