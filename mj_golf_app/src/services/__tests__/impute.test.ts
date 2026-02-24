import {
  imputeFromCarryAndLoft,
  imputeClubMetrics,
  buildKnownClubAvg,
  syntheticShot,
} from '../impute';
import type { KnownClubAvg } from '../impute';
import type { Club } from '../../models/club';
import type { Shot } from '../../models/session';

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 'club-1',
    name: '7 Iron',
    category: 'iron',
    loft: 33,
    sortOrder: 7,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    sessionId: 'sess-1',
    clubId: 'club-1',
    shotNumber: 1,
    carryYards: 172,
    totalYards: 177,
    ballSpeed: 120,
    launchAngle: 16.3,
    spinRate: 7097,
    apexHeight: 30,
    descentAngle: 50,
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeKnown(overrides: Partial<KnownClubAvg> = {}): KnownClubAvg {
  return {
    loft: 33,
    carry: 172,
    total: 177,
    ballSpeed: 120,
    launchAngle: 16.3,
    spinRate: 7097,
    apexHeight: 30,
    descentAngle: 50,
    ...overrides,
  };
}

// ── imputeFromCarryAndLoft ───────────────────────────────────────────────────

describe('imputeFromCarryAndLoft', () => {
  it('returns correct carry (round-trip)', () => {
    const m = imputeFromCarryAndLoft(172, 33);
    expect(m.carry).toBe(172);
  });

  it('scales ball speed proportionally to carry ratio', () => {
    // Tour ref at loft 33: carry=172, ballSpeed=120
    // scale=1 → ballSpeed=120
    const m1 = imputeFromCarryAndLoft(172, 33);
    expect(m1.ballSpeed).toBeCloseTo(120, 0);

    // scale=0.5 → ballSpeed=60
    const m2 = imputeFromCarryAndLoft(86, 33);
    expect(m2.ballSpeed).toBeCloseTo(60, 0);
  });

  it('derives launch angle from loft only (not carry)', () => {
    // Tour ref at loft 33: launchAngle=16.3
    const m1 = imputeFromCarryAndLoft(172, 33);
    const m2 = imputeFromCarryAndLoft(100, 33);
    expect(m1.launchAngle).toBe(m2.launchAngle);
  });

  it('computes spin rate with 0.7 + 0.3*scale formula', () => {
    // Tour ref at loft 33: spinRate=7097
    // scale=1 → 7097 * (0.7 + 0.3) = 7097
    const m1 = imputeFromCarryAndLoft(172, 33);
    expect(m1.spinRate).toBe(7097);

    // scale=0.5 → 7097 * (0.7 + 0.15) = 7097 * 0.85 = 6032.45 → 6032
    const m2 = imputeFromCarryAndLoft(86, 33);
    expect(m2.spinRate).toBeCloseTo(6032, 0);
  });

  it('scales apex height by carry ratio', () => {
    // Tour ref at loft 33: apexHeight=30
    // scale=1 → 30, scale=0.5 → 15
    const m1 = imputeFromCarryAndLoft(172, 33);
    expect(m1.apexHeight).toBe(30);

    const m2 = imputeFromCarryAndLoft(86, 33);
    expect(m2.apexHeight).toBe(15);
  });

  it('computes total via rollout formula', () => {
    // loft=33: rolloutFrac = max(0, 0.12 * exp(-0.05 * 33)) = 0.12 * exp(-1.65) ≈ 0.02304
    // total = 172 * 1.02304 ≈ 176
    const m = imputeFromCarryAndLoft(172, 33);
    expect(m.total).toBe(176);
  });

  it('handles high loft (60°) with minimal rollout', () => {
    // loft=60: rolloutFrac = 0.12 * exp(-3) ≈ 0.00597
    // total = 83 * 1.00597 ≈ 83.5 → 84
    const m = imputeFromCarryAndLoft(83, 60);
    expect(m.total).toBeCloseTo(83, 0);
  });

  it('rounds all output values correctly', () => {
    const m = imputeFromCarryAndLoft(172, 33);
    expect(m.carry).toBe(Math.round(m.carry));
    expect(m.total).toBe(Math.round(m.total));
    expect(m.spinRate).toBe(Math.round(m.spinRate));
    expect(m.apexHeight).toBe(Math.round(m.apexHeight));
    // ballSpeed and launchAngle rounded to 1 decimal
    expect(m.ballSpeed).toBe(Math.round(m.ballSpeed * 10) / 10);
    expect(m.launchAngle).toBe(Math.round(m.launchAngle * 10) / 10);
    expect(m.descentAngle).toBe(Math.round(m.descentAngle * 10) / 10);
  });
});

// ── imputeClubMetrics ────────────────────────────────────────────────────────

describe('imputeClubMetrics', () => {
  it('returns single known club values when only one known', () => {
    const known = [makeKnown({ loft: 33, carry: 172, total: 177 })];
    const m = imputeClubMetrics(known, 33);
    expect(m.carry).toBe(172);
    expect(m.total).toBe(177);
  });

  it('interpolates between two known clubs', () => {
    const known = [
      makeKnown({ loft: 27, carry: 194 }),
      makeKnown({ loft: 33, carry: 172 }),
    ];
    // targetLoft=30: carry = 194 + (30-27)/(33-27) * (172-194) = 194 + 0.5*(-22) = 183
    const m = imputeClubMetrics(known, 30);
    expect(m.carry).toBe(183);
  });

  it('extrapolates below range', () => {
    const known = [
      makeKnown({ loft: 30, carry: 183 }),
      makeKnown({ loft: 33, carry: 172 }),
    ];
    // targetLoft=27: slope = (172-183)/(33-30) = -11/3 ≈ -3.667
    // carry = 183 + (-3.667)*(27-30) = 183 + 11 = 194
    const m = imputeClubMetrics(known, 27);
    expect(m.carry).toBe(194);
  });

  it('extrapolates above range', () => {
    const known = [
      makeKnown({ loft: 30, carry: 183 }),
      makeKnown({ loft: 33, carry: 172 }),
    ];
    // targetLoft=36: slope = -11/3 ≈ -3.667
    // carry = 172 + (-3.667)*(36-33) = 172 - 11 = 161
    const m = imputeClubMetrics(known, 36);
    expect(m.carry).toBe(161);
  });

  it('returns all zeros for empty known array', () => {
    const m = imputeClubMetrics([], 33);
    expect(m.carry).toBe(0);
    expect(m.total).toBe(0);
    expect(m.ballSpeed).toBe(0);
  });
});

// ── buildKnownClubAvg ────────────────────────────────────────────────────────

describe('buildKnownClubAvg', () => {
  it('returns null when club has no loft', () => {
    expect(buildKnownClubAvg(makeClub({ loft: undefined }), [makeShot()])).toBeNull();
  });

  it('returns null when shots array is empty', () => {
    expect(buildKnownClubAvg(makeClub(), [])).toBeNull();
  });

  it('returns null when shots lack required metrics', () => {
    const shot = makeShot({ totalYards: undefined, ballSpeed: undefined, launchAngle: undefined });
    expect(buildKnownClubAvg(makeClub(), [shot])).toBeNull();
  });

  it('computes averages from valid shot metrics', () => {
    const shots = [
      makeShot({ id: 's1', carryYards: 170, totalYards: 175, ballSpeed: 118, launchAngle: 16 }),
      makeShot({ id: 's2', carryYards: 174, totalYards: 179, ballSpeed: 122, launchAngle: 17 }),
    ];
    const avg = buildKnownClubAvg(makeClub({ loft: 33 }), shots);
    expect(avg).not.toBeNull();
    expect(avg!.loft).toBe(33);
    expect(avg!.carry).toBe(172);
    expect(avg!.total).toBe(177);
    expect(avg!.ballSpeed).toBe(120);
    expect(avg!.launchAngle).toBe(16.5);
  });

  it('handles shots where some optional metrics are missing', () => {
    const shots = [
      makeShot({ id: 's1', spinRate: 7000, apexHeight: undefined }),
      makeShot({ id: 's2', spinRate: undefined, apexHeight: undefined }),
    ];
    const avg = buildKnownClubAvg(makeClub(), shots);
    expect(avg).not.toBeNull();
    expect(avg!.spinRate).toBe(7000); // only one has spinRate
    expect(avg!.apexHeight).toBe(0); // none have apexHeight → default 0
  });

  it('uses the club loft, not shot data', () => {
    const avg = buildKnownClubAvg(makeClub({ loft: 28 }), [makeShot()]);
    expect(avg!.loft).toBe(28);
  });
});

// ── syntheticShot ────────────────────────────────────────────────────────────

describe('syntheticShot', () => {
  const metrics = {
    carry: 172,
    total: 177,
    ballSpeed: 120,
    launchAngle: 16.3,
    spinRate: 7097,
    apexHeight: 30,
    descentAngle: 50,
  };

  it('creates a Shot with correct clubId and metrics', () => {
    const shot = syntheticShot('club-7i', metrics);
    expect(shot.clubId).toBe('club-7i');
    expect(shot.carryYards).toBe(172);
    expect(shot.totalYards).toBe(177);
    expect(shot.ballSpeed).toBe(120);
    expect(shot.launchAngle).toBe(16.3);
    expect(shot.spinRate).toBe(7097);
    expect(shot.apexHeight).toBe(30);
    expect(shot.descentAngle).toBe(50);
  });

  it('sets placeholder fields correctly', () => {
    const shot = syntheticShot('abc', metrics);
    expect(shot.sessionId).toBe('');
    expect(shot.shotNumber).toBe(0);
    expect(shot.timestamp).toBe(0);
  });

  it('sets id to imputed-{clubId}', () => {
    expect(syntheticShot('abc', metrics).id).toBe('imputed-abc');
  });
});
