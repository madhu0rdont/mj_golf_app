import type { Shot } from '../../../models/session';
import {
  computeFlightArc,
  computeXScale,
  computeLandingDots,
  computeDispersionEllipse,
  flightPathToSvg,
} from '../flight-math';

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    sessionId: 'sess-1',
    clubId: 'club-1',
    shotNumber: 1,
    carryYards: 155,
    launchAngle: 17,
    apexHeight: 28,
    descentAngle: 42,
    offlineYards: 3,
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('computeFlightArc', () => {
  it('returns null when launchAngle is missing', () => {
    const shot = makeShot({ launchAngle: undefined });
    expect(computeFlightArc(shot)).toBeNull();
  });

  it('returns null when apexHeight is missing', () => {
    const shot = makeShot({ apexHeight: undefined });
    expect(computeFlightArc(shot)).toBeNull();
  });

  it('returns null when carry is 0', () => {
    const shot = makeShot({ carryYards: 0 });
    expect(computeFlightArc(shot)).toBeNull();
  });

  it('returns arc with correct landing and apex values', () => {
    const shot = makeShot({ carryYards: 155, apexHeight: 28 });
    const arc = computeFlightArc(shot);
    expect(arc).not.toBeNull();
    expect(arc!.landingX).toBe(155);
    expect(arc!.apexY).toBe(28);
    expect(arc!.shotId).toBe('shot-1');
  });

  it('path starts at (0,0) and ends at (carry, 0)', () => {
    const shot = makeShot({ carryYards: 200, apexHeight: 35 });
    const arc = computeFlightArc(shot)!;
    expect(arc.path).toMatch(/^M 0 0/);
    expect(arc.path).toMatch(/200 0$/);
  });

  it('uses default descentAngle of 42 when not provided', () => {
    const withDescent = makeShot({ descentAngle: 42 });
    const withoutDescent = makeShot({ descentAngle: undefined });
    const arc1 = computeFlightArc(withDescent)!;
    const arc2 = computeFlightArc(withoutDescent)!;
    expect(arc1.path).toBe(arc2.path);
  });
});

describe('flightPathToSvg', () => {
  it('transforms data-space path to SVG coordinates', () => {
    const arc = computeFlightArc(makeShot())!;
    const sx = (x: number) => x * 2;
    const sy = (y: number) => 100 - y * 2;
    const svgPath = flightPathToSvg(arc, sx, sy);
    expect(svgPath).toMatch(/^M 0 100/);
    expect(svgPath).toContain('C ');
  });
});

describe('computeXScale', () => {
  it('returns default scale for empty shots', () => {
    const scale = computeXScale([]);
    expect(scale).toEqual({ min: 0, max: 200, step: 50 });
  });

  it('rounds min down and max up to nearest 50 with padding', () => {
    const shots = [makeShot({ carryYards: 148 }), makeShot({ carryYards: 162 })];
    const scale = computeXScale(shots);
    expect(scale.min).toBeLessThanOrEqual(100);
    expect(scale.max).toBeGreaterThanOrEqual(200);
    expect(scale.step).toBe(50);
  });

  it('handles single shot', () => {
    const shots = [makeShot({ carryYards: 155 })];
    const scale = computeXScale(shots);
    expect(scale.min).toBeLessThan(155);
    expect(scale.max).toBeGreaterThan(155);
  });
});

describe('computeLandingDots', () => {
  it('maps shots to carry/offline coordinates', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 150, offlineYards: 5 }),
      makeShot({ id: 's2', carryYards: 160, offlineYards: -3 }),
    ];
    const dots = computeLandingDots(shots);
    expect(dots).toHaveLength(2);
    expect(dots[0]).toEqual({ shotId: 's1', x: 150, y: 5 });
    expect(dots[1]).toEqual({ shotId: 's2', x: 160, y: -3 });
  });

  it('defaults offline to 0 when missing', () => {
    const shots = [makeShot({ offlineYards: undefined })];
    const dots = computeLandingDots(shots);
    expect(dots[0].y).toBe(0);
  });
});

describe('computeDispersionEllipse', () => {
  it('returns null for fewer than 3 dots', () => {
    expect(computeDispersionEllipse([])).toBeNull();
    expect(computeDispersionEllipse([{ shotId: 's1', x: 150, y: 0 }])).toBeNull();
    expect(computeDispersionEllipse([
      { shotId: 's1', x: 150, y: 0 },
      { shotId: 's2', x: 160, y: 5 },
    ])).toBeNull();
  });

  it('center is at mean of carry and offline', () => {
    const dots = [
      { shotId: 's1', x: 150, y: -3 },
      { shotId: 's2', x: 160, y: 3 },
      { shotId: 's3', x: 155, y: 0 },
    ];
    const ellipse = computeDispersionEllipse(dots)!;
    expect(ellipse.cx).toBeCloseTo(155, 0);
    expect(ellipse.cy).toBeCloseTo(0, 0);
  });

  it('rx and ry are based on standard deviation', () => {
    const dots = [
      { shotId: 's1', x: 140, y: -10 },
      { shotId: 's2', x: 160, y: 10 },
      { shotId: 's3', x: 150, y: 0 },
    ];
    const ellipse = computeDispersionEllipse(dots)!;
    expect(ellipse.rx).toBeGreaterThan(0);
    expect(ellipse.ry).toBeGreaterThan(0);
  });
});
