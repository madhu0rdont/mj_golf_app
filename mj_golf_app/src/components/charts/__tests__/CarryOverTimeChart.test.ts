import { describe, it, expect } from 'vitest';
import { linearRegression } from '../CarryOverTimeChart';

describe('linearRegression', () => {
  it('returns [0, value] for a single point', () => {
    const [slope, intercept] = linearRegression([150]);
    expect(slope).toBe(0);
    expect(intercept).toBe(150);
  });

  it('returns [0, 0] for empty array', () => {
    const [slope, intercept] = linearRegression([]);
    expect(slope).toBe(0);
    expect(intercept).toBe(0);
  });

  it('computes positive slope for increasing values', () => {
    const [slope, intercept] = linearRegression([100, 110, 120]);
    expect(slope).toBeCloseTo(10, 5);
    expect(intercept).toBeCloseTo(100, 5);
  });

  it('computes negative slope for decreasing values', () => {
    const [slope, intercept] = linearRegression([200, 190, 180]);
    expect(slope).toBeCloseTo(-10, 5);
    expect(intercept).toBeCloseTo(200, 5);
  });

  it('returns zero slope for constant values', () => {
    const [slope, intercept] = linearRegression([155, 155, 155, 155]);
    expect(slope).toBeCloseTo(0, 5);
    expect(intercept).toBeCloseTo(155, 5);
  });

  it('handles two points exactly', () => {
    const [slope, intercept] = linearRegression([160, 170]);
    expect(slope).toBeCloseTo(10, 5);
    expect(intercept).toBeCloseTo(160, 5);
  });

  it('computes best fit for noisy data', () => {
    // Roughly increasing: 150, 155, 148, 160, 165
    const [slope] = linearRegression([150, 155, 148, 160, 165]);
    // Slope should be positive (upward trend)
    expect(slope).toBeGreaterThan(0);
  });

  it('trend prediction matches endpoints', () => {
    const ys = [100, 120, 140];
    const [slope, intercept] = linearRegression(ys);
    // At index 0: should be 100
    expect(intercept).toBeCloseTo(100, 5);
    // At index 2: should be 140
    expect(intercept + slope * 2).toBeCloseTo(140, 5);
  });
});
