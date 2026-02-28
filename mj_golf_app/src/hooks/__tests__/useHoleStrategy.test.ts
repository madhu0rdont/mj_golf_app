import { describe, it, expect } from 'vitest';
import { computeLandingZones, computeLandingZonesFromAimPoints } from '../useHoleStrategy';
import type { ClubDistribution, ApproachStrategy } from '../../services/monte-carlo';
import type { OptimizedStrategy } from '../../services/strategy-optimizer';
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

  it('outer ellipse extends ~3σ along carry axis', () => {
    const dist = makeDist({ stdCarry: 12, stdOffline: 8 });
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    const center = zones[0].center;
    // Outer ellipse semi-major = carryAxis * 3 = max(12, 8*1.5) * 3 = 12 * 3 = 36
    // The max distance from center in the carry direction should be ~36 yards.
    const maxDist2 = Math.max(...zones[0].sigma2.map((p) => haversineYards(center, p)));
    expect(maxDist2).toBeCloseTo(36, -1); // within ~10 yards
  });

  it('minimum aspect ratio enforced when offline > carry std', () => {
    // stdCarry=5, stdOffline=8 — offline is larger than carry
    // carryAxis = max(5, 8 * 1.5) = max(5, 12) = 12
    // So inner carry semi = 12 * 1.5 = 18, inner offline semi = 8 * 1.5 = 12
    const dist = makeDist({ stdCarry: 5, stdOffline: 8 });
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    const center = zones[0].center;

    // Measure distances of sigma1 ellipse points along bearing (carry direction = north)
    // and perpendicular (offline direction = east/west)
    const carryDistances = zones[0].sigma1.map((p) => {
      // Along-bearing distance: difference in lat (bearing=0 is due north)
      return Math.abs(haversineYards(center, { lat: p.lat, lng: center.lng }));
    });
    const offlineDistances = zones[0].sigma1.map((p) => {
      return Math.abs(haversineYards(center, { lat: center.lat, lng: p.lng }));
    });

    const maxCarry = Math.max(...carryDistances);
    const maxOffline = Math.max(...offlineDistances);

    // The carry axis should be larger than the offline axis (enforced 1.5x ratio)
    expect(maxCarry).toBeGreaterThan(maxOffline);
    // Inner carry semi should be ~18 yards (12 * 1.5)
    expect(maxCarry).toBeCloseTo(18, -1);
    // Inner offline semi should be ~12 yards (8 * 1.5)
    expect(maxOffline).toBeCloseTo(12, -1);
  });

  it('outer ellipse is 2× inner in max distance', () => {
    const dist = makeDist({ stdCarry: 12, stdOffline: 8 });
    const strategy: ApproachStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
    };
    const zones = computeLandingZones(strategy, [dist], tee, bearing);
    const center = zones[0].center;
    const maxDist1 = Math.max(...zones[0].sigma1.map((p) => haversineYards(center, p)));
    const maxDist2 = Math.max(...zones[0].sigma2.map((p) => haversineYards(center, p)));
    // Outer = 3σ, Inner = 1.5σ → ratio should be 2:1
    const ratio = maxDist2 / maxDist1;
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});

describe('computeLandingZonesFromAimPoints', () => {
  const driverDist = makeDist();
  const ironDist = makeDist({
    clubId: 'iron7',
    clubName: '7 Iron',
    meanCarry: 165,
    stdCarry: 6,
    stdOffline: 5,
  });

  it('creates zones centered on aim points', () => {
    const aimPos = { lat: 33.0025, lng: -117.0 };
    const strategy: OptimizedStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
      strategyName: 'Test',
      strategyType: 'scoring',
      scoreDistribution: { eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0, worse: 0 },
      blowupRisk: 0,
      stdStrokes: 0.8,
      aimPoints: [{ position: aimPos, clubName: 'Driver', shotNumber: 1, carry: 275, carryNote: null, tip: 'Down the center' }],
    };

    const zones = computeLandingZonesFromAimPoints(strategy, [driverDist], 0);
    expect(zones).toHaveLength(1);
    expect(zones[0].center.lat).toBeCloseTo(aimPos.lat, 6);
    expect(zones[0].center.lng).toBeCloseTo(aimPos.lng, 6);
  });

  it('creates multiple zones for multi-shot strategy', () => {
    const aim1 = { lat: 33.0025, lng: -117.0 };
    const aim2 = { lat: 33.004, lng: -117.0 };
    const strategy: OptimizedStrategy = {
      clubs: [
        { clubId: 'driver', clubName: 'Driver' },
        { clubId: 'iron7', clubName: '7 Iron' },
      ],
      expectedStrokes: 3.2,
      label: 'Driver (275) → 7 Iron (165)',
      strategyName: 'Test 2-Shot',
      strategyType: 'balanced',
      scoreDistribution: { eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0, worse: 0 },
      blowupRisk: 0,
      stdStrokes: 0.8,
      aimPoints: [
        { position: aim1, clubName: 'Driver', shotNumber: 1, carry: 275, carryNote: null, tip: 'Down the center' },
        { position: aim2, clubName: '7 Iron', shotNumber: 2, carry: 165, carryNote: null, tip: 'Down the center' },
      ],
    };

    const zones = computeLandingZonesFromAimPoints(strategy, [driverDist, ironDist], 0);
    expect(zones).toHaveLength(2);
    expect(zones[0].clubName).toBe('Driver');
    expect(zones[1].clubName).toBe('7 Iron');
  });

  it('each zone has sigma1 and sigma2 ellipses', () => {
    const strategy: OptimizedStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
      strategyName: 'Test',
      strategyType: 'scoring',
      scoreDistribution: { eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0, worse: 0 },
      blowupRisk: 0,
      stdStrokes: 0.8,
      aimPoints: [{ position: { lat: 33.0025, lng: -117.0 }, clubName: 'Driver', shotNumber: 1, carry: 275, carryNote: null, tip: 'Down the center' }],
    };

    const zones = computeLandingZonesFromAimPoints(strategy, [driverDist], 0);
    expect(zones[0].sigma1).toHaveLength(36);
    expect(zones[0].sigma2).toHaveLength(36);
  });

  it('aim-point zones enforce minimum aspect ratio', () => {
    // stdCarry=5, stdOffline=8 → carryAxis = max(5, 8*1.5) = 12
    const narrowDist = makeDist({
      clubId: 'driver',
      clubName: 'Driver',
      stdCarry: 5,
      stdOffline: 8,
    });
    const aimPos = { lat: 33.0025, lng: -117.0 };
    const strategy: OptimizedStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
      strategyName: 'Test',
      strategyType: 'scoring',
      scoreDistribution: { eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0, worse: 0 },
      blowupRisk: 0,
      stdStrokes: 0.8,
      aimPoints: [{ position: aimPos, clubName: 'Driver', shotNumber: 1, carry: 275, carryNote: null, tip: 'Down the center' }],
    };

    const zones = computeLandingZonesFromAimPoints(strategy, [narrowDist], 0);
    const center = zones[0].center;

    // Measure along-bearing (carry, north) and perpendicular (offline) distances
    const carryDistances = zones[0].sigma1.map((p) =>
      Math.abs(haversineYards(center, { lat: p.lat, lng: center.lng })),
    );
    const offlineDistances = zones[0].sigma1.map((p) =>
      Math.abs(haversineYards(center, { lat: center.lat, lng: p.lng })),
    );

    const maxCarry = Math.max(...carryDistances);
    const maxOffline = Math.max(...offlineDistances);

    // Carry axis forced to 12 (1.5 * 8), inner = 12 * 1.5 = 18
    // Offline axis stays at 8, inner = 8 * 1.5 = 12
    // The ellipse should be elongated along bearing (carry > offline)
    expect(maxCarry).toBeGreaterThan(maxOffline);
  });

  it('aim-point zone outer ellipse is 2× inner', () => {
    const aimPos = { lat: 33.0025, lng: -117.0 };
    const strategy: OptimizedStrategy = {
      clubs: [{ clubId: 'driver', clubName: 'Driver' }],
      expectedStrokes: 3.5,
      label: 'Driver (275)',
      strategyName: 'Test',
      strategyType: 'scoring',
      scoreDistribution: { eagle: 0, birdie: 0, par: 1, bogey: 0, double: 0, worse: 0 },
      blowupRisk: 0,
      stdStrokes: 0.8,
      aimPoints: [{ position: aimPos, clubName: 'Driver', shotNumber: 1, carry: 275, carryNote: null, tip: 'Down the center' }],
    };

    const zones = computeLandingZonesFromAimPoints(strategy, [driverDist], 0);
    const center = zones[0].center;
    const maxDist1 = Math.max(...zones[0].sigma1.map((p) => haversineYards(center, p)));
    const maxDist2 = Math.max(...zones[0].sigma2.map((p) => haversineYards(center, p)));
    // 3σ / 1.5σ = 2:1
    const ratio = maxDist2 / maxDist1;
    expect(ratio).toBeCloseTo(2.0, 1);
  });
});
