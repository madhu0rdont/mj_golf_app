import {
  computeYardageBook,
  computeClubShotGroups,
} from '../useYardageBook';
import type { Club } from '../../models/club';
import type { Session, Shot } from '../../models/session';

function makeClub(overrides: Partial<Club> = {}): Club {
  return {
    id: 'club-1',
    name: '7 Iron',
    category: 'iron',
    sortOrder: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess-1',
    clubId: 'club-1',
    type: 'block',
    date: Date.now(),
    source: 'manual',
    shotCount: 5,
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
    carryYards: 155,
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── computeYardageBook ──

describe('computeYardageBook', () => {
  it('returns empty array when no clubs', () => {
    const result = computeYardageBook([], [], [], false);
    expect(result).toEqual([]);
  });

  it('returns empty array when clubs exist but no sessions', () => {
    const clubs = [makeClub()];
    const result = computeYardageBook(clubs, [], [], false);
    expect(result).toEqual([]);
  });

  it('builds entries for clubs with block session data', () => {
    const clubs = [makeClub()];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }),
      makeShot({ id: 's2', carryYards: 160 }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(1);
    expect(result[0].clubId).toBe('club-1');
    expect(result[0].bookCarry).toBeCloseTo(155, 0);
    expect(result[0].shotCount).toBe(2);
  });

  it('excludes mishits when excludeMishits is true', () => {
    const clubs = [makeClub()];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }),
      makeShot({ id: 's2', carryYards: 100, quality: 'mishit' }),
      makeShot({ id: 's3', carryYards: 160 }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, true);
    expect(result).toHaveLength(1);
    expect(result[0].shotCount).toBe(2); // mishit excluded
    expect(result[0].bookCarry).toBeCloseTo(155, 0); // average of 150 and 160
  });

  it('includes mishits when excludeMishits is false', () => {
    const clubs = [makeClub()];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }),
      makeShot({ id: 's2', carryYards: 100, quality: 'mishit' }),
      makeShot({ id: 's3', carryYards: 160 }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result[0].shotCount).toBe(3);
  });

  it('groups interleaved full shots by clubId', () => {
    const clubs = [
      makeClub({ id: 'c1', name: '7 Iron' }),
      makeClub({ id: 'c2', name: 'PW' }),
    ];
    const sessions = [
      makeSession({ id: 'il-1', type: 'interleaved', clubId: undefined as any }),
    ];
    const shots = [
      makeShot({ id: 's1', sessionId: 'il-1', clubId: 'c1', carryYards: 155, position: 'full' }),
      makeShot({ id: 's2', sessionId: 'il-1', clubId: 'c1', carryYards: 160, position: 'full' }),
      makeShot({ id: 's3', sessionId: 'il-1', clubId: 'c2', carryYards: 120, position: 'full' }),
      makeShot({ id: 's4', sessionId: 'il-1', clubId: 'c2', carryYards: 80 }), // NOT full — excluded
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(2);
    const iron = result.find((e) => e.clubId === 'c1')!;
    const pw = result.find((e) => e.clubId === 'c2')!;
    expect(iron.shotCount).toBe(2);
    expect(iron.bookCarry).toBeCloseTo(157.5, 0);
    expect(pw.shotCount).toBe(1);
    expect(pw.bookCarry).toBeCloseTo(120, 0);
  });

  it('ignores non-full shots from interleaved sessions', () => {
    const clubs = [makeClub({ id: 'c1' })];
    const sessions = [
      makeSession({ id: 'il-1', type: 'interleaved', clubId: undefined as any }),
    ];
    const shots = [
      makeShot({ id: 's1', sessionId: 'il-1', clubId: 'c1', carryYards: 155 }), // no position
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(0);
  });

  it('combines block and interleaved full shots for the same club', () => {
    const clubs = [makeClub({ id: 'c1' })];
    const sessions = [
      makeSession({ id: 'block-1', clubId: 'c1', type: 'block' }),
      makeSession({ id: 'il-1', type: 'interleaved', clubId: undefined as any }),
    ];
    const shots = [
      makeShot({ id: 's1', sessionId: 'block-1', clubId: 'c1', carryYards: 150 }),
      makeShot({ id: 's2', sessionId: 'il-1', clubId: 'c1', carryYards: 160, position: 'full' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(1);
    expect(result[0].sessionCount).toBe(2);
  });

  it('filters shots by club preferredShape', () => {
    const clubs = [makeClub({ preferredShape: 'draw' })];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shape: 'draw' }),
      makeShot({ id: 's2', carryYards: 160, shape: 'straight' }),
      makeShot({ id: 's3', carryYards: 155, shape: 'draw' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(1);
    expect(result[0].shotCount).toBe(2); // only draw shots
    expect(result[0].bookCarry).toBeCloseTo(152.5, 0);
  });

  it('returns no entries when no shots match club preferredShape', () => {
    const clubs = [makeClub({ preferredShape: 'draw' })];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shape: 'fade' }),
      makeShot({ id: 's2', carryYards: 160, shape: 'fade' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(0);
  });

  it('returns all shots when club has no preferredShape', () => {
    const clubs = [makeClub()]; // no preferredShape
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shape: 'draw' }),
      makeShot({ id: 's2', carryYards: 160, shape: 'straight' }),
      makeShot({ id: 's3', carryYards: 155, shape: 'fade' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result).toHaveLength(1);
    expect(result[0].shotCount).toBe(3);
  });

  it('combines preferredShape with excludeMishits', () => {
    const clubs = [makeClub({ preferredShape: 'draw' })];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150, shape: 'draw', quality: 'good' }),
      makeShot({ id: 's2', carryYards: 100, shape: 'draw', quality: 'mishit' }),
      makeShot({ id: 's3', carryYards: 160, shape: 'straight', quality: 'good' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, true);
    expect(result).toHaveLength(1);
    expect(result[0].shotCount).toBe(1); // only draw + non-mishit
    expect(result[0].bookCarry).toBeCloseTo(150, 0);
  });

  it('applies different preferredShape per club', () => {
    const clubs = [
      makeClub({ id: 'c1', name: '7 Iron', preferredShape: 'draw' }),
      makeClub({ id: 'c2', name: 'PW', preferredShape: 'straight' }),
    ];
    const sessions = [
      makeSession({ id: 'sess-1', clubId: 'c1' }),
      makeSession({ id: 'sess-2', clubId: 'c2' }),
    ];
    const shots = [
      makeShot({ id: 's1', sessionId: 'sess-1', clubId: 'c1', carryYards: 155, shape: 'draw' }),
      makeShot({ id: 's2', sessionId: 'sess-1', clubId: 'c1', carryYards: 150, shape: 'straight' }),
      makeShot({ id: 's3', sessionId: 'sess-2', clubId: 'c2', carryYards: 120, shape: 'straight' }),
      makeShot({ id: 's4', sessionId: 'sess-2', clubId: 'c2', carryYards: 125, shape: 'draw' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    const iron = result.find((e) => e.clubId === 'c1')!;
    const pw = result.find((e) => e.clubId === 'c2')!;
    expect(iron.shotCount).toBe(1); // only draw
    expect(iron.bookCarry).toBeCloseTo(155, 0);
    expect(pw.shotCount).toBe(1); // only straight
    expect(pw.bookCarry).toBeCloseTo(120, 0);
  });

  it('includes shots without shape when club has no preferredShape', () => {
    const clubs = [makeClub()];
    const sessions = [makeSession()];
    const shots = [
      makeShot({ id: 's1', carryYards: 150 }), // no shape
      makeShot({ id: 's2', carryYards: 160, shape: 'draw' }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result[0].shotCount).toBe(2);
  });

  it('sorts sessions by date descending for each club', () => {
    const now = Date.now();
    const DAY = 86400000;
    const clubs = [makeClub({ id: 'c1' })];
    const sessions = [
      makeSession({ id: 'old', clubId: 'c1', date: now - 30 * DAY }),
      makeSession({ id: 'new', clubId: 'c1', date: now }),
    ];
    const shots = [
      makeShot({ id: 's1', sessionId: 'old', clubId: 'c1', carryYards: 140 }),
      makeShot({ id: 's2', sessionId: 'new', clubId: 'c1', carryYards: 160 }),
    ];
    const result = computeYardageBook(clubs, sessions, shots, false);
    expect(result[0].lastSessionDate).toBe(now);
  });
});

// ── computeClubShotGroups ──

describe('computeClubShotGroups', () => {
  it('returns empty array for no clubs', () => {
    expect(computeClubShotGroups([], [])).toEqual([]);
  });

  it('creates a group for a club with shots', () => {
    const clubs = [makeClub({ id: 'c1', name: '7 Iron' })];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 155 }),
      makeShot({ id: 's2', clubId: 'c1', carryYards: 160 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    expect(groups).toHaveLength(1);
    expect(groups[0].clubId).toBe('c1');
    expect(groups[0].clubName).toBe('7 Iron');
    expect(groups[0].shots).toHaveLength(2);
    expect(groups[0].imputed).toBeUndefined();
  });

  it('creates imputed group for club with manualCarry and loft', () => {
    const clubs = [makeClub({ id: 'c1', name: '5 Iron', category: 'iron', loft: 25, manualCarry: 185 })];
    const groups = computeClubShotGroups(clubs, []);
    expect(groups).toHaveLength(1);
    expect(groups[0].imputed).toBe(true);
    expect(groups[0].shots).toHaveLength(1);
    expect(groups[0].shots[0].carryYards).toBe(185);
  });

  it('skips putters even if they have loft', () => {
    const clubs = [makeClub({ id: 'c1', name: 'Putter', category: 'putter', loft: 4 })];
    const groups = computeClubShotGroups(clubs, []);
    expect(groups).toHaveLength(0);
  });

  it('creates interpolated group when 2+ known avgs exist', () => {
    const clubs = [
      makeClub({ id: 'c1', name: '7 Iron', category: 'iron', loft: 32 }),
      makeClub({ id: 'c2', name: '9 Iron', category: 'iron', loft: 40 }),
      makeClub({ id: 'c3', name: '8 Iron', category: 'iron', loft: 36 }), // no shots, no manual carry
    ];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 155, totalYards: 165, ballSpeed: 120, launchAngle: 20, spinRate: 6500, apexHeight: 28, descentAngle: 45 }),
      makeShot({ id: 's2', clubId: 'c1', carryYards: 158, totalYards: 168, ballSpeed: 122, launchAngle: 20.5, spinRate: 6600, apexHeight: 29, descentAngle: 45.5 }),
      makeShot({ id: 's3', clubId: 'c2', carryYards: 135, totalYards: 140, ballSpeed: 108, launchAngle: 24, spinRate: 8500, apexHeight: 26, descentAngle: 48 }),
      makeShot({ id: 's4', clubId: 'c2', carryYards: 132, totalYards: 138, ballSpeed: 106, launchAngle: 24.5, spinRate: 8600, apexHeight: 25, descentAngle: 48.5 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    expect(groups).toHaveLength(3);
    const imputed = groups.find((g) => g.clubId === 'c3')!;
    expect(imputed.imputed).toBe(true);
    // Interpolated carry should be between 7I and 9I
    expect(imputed.shots[0].carryYards).toBeGreaterThan(132);
    expect(imputed.shots[0].carryYards).toBeLessThan(158);
  });

  it('does not create interpolated group with fewer than 2 known avgs', () => {
    const clubs = [
      makeClub({ id: 'c1', name: '7 Iron', category: 'iron', loft: 32 }),
      makeClub({ id: 'c2', name: '8 Iron', category: 'iron', loft: 36 }), // no shots, no carry
    ];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 155 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    // Only 1 known avg (c1) — not enough to interpolate for c2
    expect(groups).toHaveLength(1);
    expect(groups[0].clubId).toBe('c1');
  });

  it('prefers real shots over imputed for the same club', () => {
    const clubs = [makeClub({ id: 'c1', name: '7 Iron', loft: 32, manualCarry: 155 })];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 160 }),
      makeShot({ id: 's2', clubId: 'c1', carryYards: 162 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    expect(groups).toHaveLength(1);
    expect(groups[0].imputed).toBeUndefined(); // real shots used, not imputed
    expect(groups[0].shots).toHaveLength(2);
  });

  it('assigns incrementing colors to clubs', () => {
    const clubs = [
      makeClub({ id: 'c1', name: '7 Iron' }),
      makeClub({ id: 'c2', name: '8 Iron' }),
    ];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 155 }),
      makeShot({ id: 's2', clubId: 'c2', carryYards: 140 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    expect(groups).toHaveLength(2);
    expect(groups[0].color).not.toBe(groups[1].color);
  });

  it('includes manualCarry clubs as known anchor points for interpolation', () => {
    // c1 has shots, c2 has manual carry (no shots), c3 needs interpolation
    const clubs = [
      makeClub({ id: 'c1', name: '9 Iron', category: 'iron', loft: 40 }),
      makeClub({ id: 'c2', name: '7 Iron', category: 'iron', loft: 32, manualCarry: 155 }),
      makeClub({ id: 'c3', name: '8 Iron', category: 'iron', loft: 36 }), // no shots, no manual
    ];
    const shots = [
      makeShot({ id: 's1', clubId: 'c1', carryYards: 135, totalYards: 140, ballSpeed: 108, launchAngle: 24, spinRate: 8500, apexHeight: 26, descentAngle: 48 }),
      makeShot({ id: 's2', clubId: 'c1', carryYards: 133, totalYards: 138, ballSpeed: 106, launchAngle: 24.5, spinRate: 8600, apexHeight: 25, descentAngle: 48.5 }),
    ];
    const groups = computeClubShotGroups(clubs, shots);
    // c1 (real), c2 (manual carry → imputed), c3 (interpolated from c1+c2 known avgs)
    expect(groups).toHaveLength(3);
    const c3 = groups.find((g) => g.clubId === 'c3')!;
    expect(c3.imputed).toBe(true);
    // Should be between 9I (135) and 7I (155) — roughly 145
    expect(c3.shots[0].carryYards).toBeGreaterThan(130);
    expect(c3.shots[0].carryYards).toBeLessThan(160);
  });
});
