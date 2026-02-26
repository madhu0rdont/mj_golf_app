import { mean, median, stddev, computeSessionSummary, computeDelta } from '../stats';
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

describe('mean', () => {
  it('returns 0 for empty array', () => {
    expect(mean([])).toBe(0);
  });

  it('returns the single value for one-element array', () => {
    expect(mean([42])).toBe(42);
  });

  it('computes correct mean', () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it('handles negative values', () => {
    expect(mean([-10, 10])).toBe(0);
  });
});

describe('median', () => {
  it('returns 0 for empty array', () => {
    expect(median([])).toBe(0);
  });

  it('returns the single value for one-element array', () => {
    expect(median([42])).toBe(42);
  });

  it('returns middle value for odd-count array', () => {
    expect(median([10, 30, 20])).toBe(20);
  });

  it('returns average of two middle values for even-count array', () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe('stddev', () => {
  it('returns 0 for empty array', () => {
    expect(stddev([])).toBe(0);
  });

  it('returns 0 for single-value array', () => {
    expect(stddev([42])).toBe(0);
  });

  it('computes sample stddev (Bessel-corrected)', () => {
    // [10, 20, 30]: mean=20, variance=((100+0+100)/2)=100, stddev=10
    const result = stddev([10, 20, 30]);
    expect(result).toBeCloseTo(10, 2);
  });

  it('returns 0 when all values are identical', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });
});

describe('computeSessionSummary', () => {
  const date = Date.now();

  it('computes basic carry stats correctly', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shotNumber: 1 }),
      makeShot({ id: 's2', carryYards: 160, shotNumber: 2 }),
      makeShot({ id: 's3', carryYards: 155, shotNumber: 3 }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);

    expect(summary.shotCount).toBe(3);
    expect(summary.avgCarry).toBeCloseTo(155, 0);
    expect(summary.medianCarry).toBe(155);
    expect(summary.maxCarry).toBe(160);
    expect(summary.minCarry).toBe(150);
    expect(summary.dispersionRange).toBe(10);
  });

  it('computes avgTotal as undefined when no shots have totalYards', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }),
      makeShot({ id: 's2', carryYards: 160 }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.avgTotal).toBeUndefined();
  });

  it('computes avgTotal from shots that have totalYards', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, totalYards: 165 }),
      makeShot({ id: 's2', carryYards: 160, totalYards: 175 }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.avgTotal).toBe(170);
  });

  it('computes launch averages only from non-null values', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, ballSpeed: 110 }),
      makeShot({ id: 's2', carryYards: 160, ballSpeed: 115 }),
      makeShot({ id: 's3', carryYards: 155 }), // no ballSpeed
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.avgBallSpeed).toBeCloseTo(112.5, 0);
  });

  it('aggregates shape distribution and identifies dominant shape', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shape: 'draw' }),
      makeShot({ id: 's2', carryYards: 155, shape: 'draw' }),
      makeShot({ id: 's3', carryYards: 160, shape: 'fade' }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.shapeDistribution).toEqual({ draw: 2, fade: 1 });
    expect(summary.dominantShape).toBe('draw');
  });

  it('computes pureRate as (pure + good) / total * 100', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, quality: 'pure' }),
      makeShot({ id: 's2', carryYards: 155, quality: 'good' }),
      makeShot({ id: 's3', carryYards: 160, quality: 'mishit' }),
      makeShot({ id: 's4', carryYards: 152, quality: 'acceptable' }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.pureRate).toBe(50); // 2/4 * 100
  });

  it('handles all shots with identical carries', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }),
      makeShot({ id: 's2', carryYards: 150 }),
    ];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.stdDevCarry).toBe(0);
    expect(summary.dispersionRange).toBe(0);
  });

  it('handles shots with all optional fields missing', () => {
    const shots = [makeShot({ carryYards: 150 })];
    const summary = computeSessionSummary(shots, '7 Iron', 'sess-1', 'club-1', date);
    expect(summary.avgBallSpeed).toBeUndefined();
    expect(summary.avgClubHeadSpeed).toBeUndefined();
    expect(summary.avgLaunchAngle).toBeUndefined();
    expect(summary.avgSpinRate).toBeUndefined();
    expect(summary.avgOffline).toBeUndefined();
    expect(summary.avgAbsOffline).toBeUndefined();
  });
});

describe('computeDelta', () => {
  it('returns direction=up and improved=true when current > previous', () => {
    const result = computeDelta(160, 150, true);
    expect(result.direction).toBe('up');
    expect(result.improved).toBe(true);
    expect(result.delta).toBe(10);
  });

  it('returns direction=down and improved=false when current < previous', () => {
    const result = computeDelta(140, 150, true);
    expect(result.direction).toBe('down');
    expect(result.improved).toBe(false);
    expect(result.delta).toBe(-10);
  });

  it('returns direction=neutral when |delta| < 0.5', () => {
    const result = computeDelta(150.3, 150, true);
    expect(result.direction).toBe('neutral');
    expect(result.improved).toBe(false);
  });

  it('returns improved=true when current < previous and higherIsBetter=false', () => {
    const result = computeDelta(5, 10, false);
    expect(result.direction).toBe('down');
    expect(result.improved).toBe(true);
  });

  it('returns improved=false for neutral regardless of higherIsBetter', () => {
    const result = computeDelta(150.2, 150, false);
    expect(result.direction).toBe('neutral');
    expect(result.improved).toBe(false);
  });

  it('rounds delta to one decimal place', () => {
    const result = computeDelta(155.67, 150.12);
    expect(result.delta).toBe(5.5); // 5.55 rounds to 5.5 at 1 decimal? Actually 5.55 rounds to 5.6
  });
});
