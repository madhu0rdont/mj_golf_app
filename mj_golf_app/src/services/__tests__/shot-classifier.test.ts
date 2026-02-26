import { classifyShape, classifyQuality, classifyAllShots } from '../shot-classifier';
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

describe('classifyShape', () => {
  it('returns undefined when both spinAxis and offlineYards are undefined', () => {
    expect(classifyShape(undefined, undefined)).toBeUndefined();
  });

  it('returns straight when spinAxis=0 and offlineYards=0', () => {
    expect(classifyShape(0, 0)).toBe('straight');
  });

  it('returns straight at boundary (spinAxis=2, offlineYards=5)', () => {
    expect(classifyShape(2, 5)).toBe('straight');
  });

  it('returns straight at negative boundary (spinAxis=-2, offlineYards=-5)', () => {
    expect(classifyShape(-2, -5)).toBe('straight');
  });

  it('returns hook when spinAxis < -8', () => {
    expect(classifyShape(-9, 0)).toBe('hook');
  });

  it('returns hook with compound condition (spinAxis < -2 and offlineYards < -15)', () => {
    expect(classifyShape(-3, -16)).toBe('hook');
  });

  it('returns slice when spinAxis > 8', () => {
    expect(classifyShape(9, 0)).toBe('slice');
  });

  it('returns slice with compound condition (spinAxis > 2 and offlineYards > 15)', () => {
    expect(classifyShape(3, 16)).toBe('slice');
  });

  it('returns draw when spinAxis < -2', () => {
    expect(classifyShape(-3, 0)).toBe('draw');
  });

  it('returns fade when spinAxis > 2', () => {
    expect(classifyShape(3, 0)).toBe('fade');
  });

  it('returns pull when spinAxis is neutral and offlineYards < -10', () => {
    expect(classifyShape(0, -11)).toBe('pull');
  });

  it('returns push when spinAxis is neutral and offlineYards > 10', () => {
    expect(classifyShape(0, 11)).toBe('push');
  });

  it('returns straight fallthrough when offlineYards between 5 and 10', () => {
    expect(classifyShape(0, 8)).toBe('straight');
  });

  it('classifies with only spinAxis provided', () => {
    expect(classifyShape(-5, undefined)).toBe('draw');
  });

  it('classifies with only offlineYards provided', () => {
    expect(classifyShape(undefined, -12)).toBe('pull');
  });
});

describe('classifyQuality', () => {
  it('returns pure when stdDev is 0', () => {
    expect(classifyQuality(155, 150, 0)).toBe('pure');
  });

  it('returns pure when deviation is within 0.5 stdDev', () => {
    expect(classifyQuality(152, 150, 10)).toBe('pure'); // deviation=2, 0.5*10=5
  });

  it('returns pure at exactly 0.5 stdDev boundary', () => {
    expect(classifyQuality(155, 150, 10)).toBe('pure'); // deviation=5, 0.5*10=5
  });

  it('returns good when deviation is between 0.5 and 1.0 stdDev', () => {
    expect(classifyQuality(157, 150, 10)).toBe('good'); // deviation=7
  });

  it('returns acceptable when deviation is between 1.0 and 1.5 stdDev', () => {
    expect(classifyQuality(162, 150, 10)).toBe('acceptable'); // deviation=12
  });

  it('returns mishit when deviation exceeds 1.5 stdDev', () => {
    expect(classifyQuality(170, 150, 10)).toBe('mishit'); // deviation=20
  });

  it('returns pure when carry equals avgCarry exactly', () => {
    expect(classifyQuality(150, 150, 10)).toBe('pure'); // deviation=0
  });
});

describe('classifyAllShots', () => {
  it('returns empty array for empty input', () => {
    expect(classifyAllShots([])).toEqual([]);
  });

  it('classifies a single shot as pure (stdDev=0)', () => {
    const shots = [makeShot({ carryYards: 150 })];
    const result = classifyAllShots(shots);
    expect(result[0].quality).toBe('pure');
  });

  it('classifies multiple shots with varying carries', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shotNumber: 1 }),
      makeShot({ id: 's2', carryYards: 160, shotNumber: 2 }),
      makeShot({ id: 's3', carryYards: 170, shotNumber: 3 }),
    ];
    // mean=160, sample stddev=10, deviation of 10 = 1.0*stddev
    const result = classifyAllShots(shots);
    expect(result[1].quality).toBe('pure');   // deviation=0
    expect(result[0].quality).toBe('good');   // deviation=10 = 1.0*stddev
    expect(result[2].quality).toBe('good');   // deviation=10 = 1.0*stddev
  });

  it('assigns shape to each shot based on spinAxis and offlineYards', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, spinAxis: -5, offlineYards: -3 }),
      makeShot({ id: 's2', carryYards: 150, spinAxis: 5, offlineYards: 3 }),
    ];
    const result = classifyAllShots(shots);
    expect(result[0].shape).toBe('draw');
    expect(result[1].shape).toBe('fade');
  });

  it('assigns undefined shape when both spinAxis and offlineYards are missing', () => {
    const shots = [makeShot({ carryYards: 150 })];
    const result = classifyAllShots(shots);
    expect(result[0].shape).toBeUndefined();
  });
});
