import { validateShotField, validateAllShotFields } from '../validation';

describe('validateShotField', () => {
  it('returns true for unknown field name', () => {
    expect(validateShotField('unknownField', 100)).toBe(true);
  });

  it('returns true for carryYards at min (0)', () => {
    expect(validateShotField('carryYards', 0)).toBe(true);
  });

  it('returns true for carryYards at max (400)', () => {
    expect(validateShotField('carryYards', 400)).toBe(true);
  });

  it('returns false for carryYards below min', () => {
    expect(validateShotField('carryYards', -1)).toBe(false);
  });

  it('returns false for carryYards above max', () => {
    expect(validateShotField('carryYards', 401)).toBe(false);
  });

  it('validates ballSpeed range (50-220)', () => {
    expect(validateShotField('ballSpeed', 50)).toBe(true);
    expect(validateShotField('ballSpeed', 220)).toBe(true);
    expect(validateShotField('ballSpeed', 49)).toBe(false);
    expect(validateShotField('ballSpeed', 221)).toBe(false);
  });

  it('validates launchAngle range (-10 to 60)', () => {
    expect(validateShotField('launchAngle', -10)).toBe(true);
    expect(validateShotField('launchAngle', 60)).toBe(true);
    expect(validateShotField('launchAngle', -11)).toBe(false);
    expect(validateShotField('launchAngle', 61)).toBe(false);
  });

  it('validates spinRate range (0-15000)', () => {
    expect(validateShotField('spinRate', 0)).toBe(true);
    expect(validateShotField('spinRate', 15000)).toBe(true);
    expect(validateShotField('spinRate', -1)).toBe(false);
    expect(validateShotField('spinRate', 15001)).toBe(false);
  });

  it('validates spinAxis range (-45 to 45)', () => {
    expect(validateShotField('spinAxis', -45)).toBe(true);
    expect(validateShotField('spinAxis', 45)).toBe(true);
    expect(validateShotField('spinAxis', -46)).toBe(false);
  });

  it('validates offlineYards range (-100 to 100)', () => {
    expect(validateShotField('offlineYards', -100)).toBe(true);
    expect(validateShotField('offlineYards', 100)).toBe(true);
    expect(validateShotField('offlineYards', -101)).toBe(false);
  });

  it('validates totalYards range (0-450)', () => {
    expect(validateShotField('totalYards', 0)).toBe(true);
    expect(validateShotField('totalYards', 450)).toBe(true);
    expect(validateShotField('totalYards', 451)).toBe(false);
  });

  it('validates clubHeadSpeed range (40-160)', () => {
    expect(validateShotField('clubHeadSpeed', 40)).toBe(true);
    expect(validateShotField('clubHeadSpeed', 160)).toBe(true);
    expect(validateShotField('clubHeadSpeed', 39)).toBe(false);
  });

  it('validates apexHeight range (0-80)', () => {
    expect(validateShotField('apexHeight', 0)).toBe(true);
    expect(validateShotField('apexHeight', 80)).toBe(true);
    expect(validateShotField('apexHeight', 81)).toBe(false);
  });
});

describe('validateAllShotFields', () => {
  it('returns empty errors for valid shot', () => {
    const shot = { carryYards: 150, totalYards: 165, ballSpeed: 112, spinRate: 6500 };
    const errors = validateAllShotFields(shot);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns error for carryYards out of range', () => {
    const shot = { carryYards: 500 };
    const errors = validateAllShotFields(shot);
    expect(errors.carryYards).toBeDefined();
    expect(errors.carryYards).toContain('Carry');
  });

  it('returns multiple errors for multiple invalid fields', () => {
    const shot = { carryYards: 500, ballSpeed: 300, spinRate: -10 };
    const errors = validateAllShotFields(shot);
    expect(Object.keys(errors)).toHaveLength(3);
  });

  it('ignores undefined field values', () => {
    const shot = { carryYards: undefined, ballSpeed: undefined };
    const errors = validateAllShotFields(shot);
    expect(Object.keys(errors)).toHaveLength(0);
  });
});
