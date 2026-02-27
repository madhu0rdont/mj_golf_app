import { describe, it, expect } from 'vitest';
import { computeLandingZones } from '../useHoleStrategy';
import type { ClubDistribution, ApproachStrategy } from '../../services/monte-carlo';
import { haversineYards } from '../../utils/geo';

const makeDist = (overrides: Partial<ClubDistribution> = {}): ClubDistribution => ({
  clubId: 'driver',
  clubName: 'Driver',
  meanCarry: 275,
  stdCarry: 12,
  meanOffline: 0,
  stdOffline: 8,
  ...overrides,
});

const tee = { lat: 33.0, lng: -117.0 };
const bearing = 0; // due north

describe('computeLandingZones', () => {
  it('returns empty for undefined strategy', () => {
    expect(computeLandingZones(undefined, [makeDist()], tee, bearing)).toEqual([]);
  });

  it('returns empty for empty distributions', () => {
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    expect(computeLandingZones(strategy, [], tee, bearing)).toEqual([]);
  });

  it('computes one zone for single-club strategy', () => {
    const dist = makeDist();
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    expect(zones).toHaveLength(1);
    expect(zones[0].clubName).toBe('Driver');
    expect(zones[0].sigma1).toHaveLength(36);
    expect(zones[0].sigma2).toHaveLength(36);
    // Center should be ~275 yards north of tee
    expect(haversineYards(tee, zones[0].center)).toBeCloseTo(275, -1);
  });

  it('chains two-club strategy so second starts from first landing', () => {
    const driver = makeDist();
    const iron = makeDist({
      clubId: 'iron7',
      clubName: '7 Iron',
      meanCarry: 165,
      stdCarry: 6,
      stdOffline: 5,
    });
    const strategy: ApproachStrategy = {
      clubs: [
        { clubId: 'driver', clubName: 'Driver' },
        { clubId: 'iron7', clubName: '7 Iron' },
      ],
      expectedStrokes: 3.2,
      label: 'Driver (275) → 7 Iron (Full = 165)',
    };
    const zones = computeLandingZones(strategy, [driver, iron], tee, bearing);
    expect(zones).toHaveLength(2);
    // Second zone center should be ~165 yards from first zone center
    expect(haversineYards(zones[0].center, zones[1].center)).toBeCloseTo(165, -1);
    // Total from tee should be ~440 yards
    expect(haversineYards(tee, zones[1].center)).toBeCloseTo(440, -1);
  });

  it('shifts center perpendicular when meanOffline is nonzero', () => {
    const dist = makeDist({ meanOffline: 10 }); // 10 yards right
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    // Center should be shifted east (bearing + 90 = due east for bearing=0)
    expect(zones[0].center.lng).toBeGreaterThan(tee.lng);
  });

  it('2σ ellipse is larger than 1σ ellipse', () => {
    const dist = makeDist();
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    const center = zones[0].center;
    const maxDist1 = Math.max(...zones[0].sigma1.map((p) => haversineYards(center, p)));
    const maxDist2 = Math.max(...zones[0].sigma2.map((p) => haversineYards(center, p)));
    expect(maxDist2).toBeGreaterThan(maxDist1 * 1.5);
  });
});
