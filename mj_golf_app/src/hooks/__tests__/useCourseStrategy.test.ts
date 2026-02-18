import { getClubRecommendations } from '../useCourseStrategy';
import type { YardageBookEntry } from '../../models/yardage';
import type { DataFreshness } from '../../models/yardage';

function makeEntry(overrides: Partial<YardageBookEntry> = {}): YardageBookEntry {
  return {
    clubId: 'club-1',
    clubName: '7 Iron',
    category: 'iron',
    bookCarry: 155,
    bookTotal: 167,
    confidenceCarry: 155,
    dispersion: 8,
    sessionCount: 3,
    shotCount: 30,
    lastSessionDate: Date.now(),
    freshness: 'fresh' as DataFreshness,
    ...overrides,
  };
}

describe('getClubRecommendations', () => {
  it('returns empty array when entries is empty', () => {
    expect(getClubRecommendations(155, [])).toEqual([]);
  });

  it('returns empty array when targetYardage is 0', () => {
    expect(getClubRecommendations(0, [makeEntry()])).toEqual([]);
  });

  it('returns empty array when targetYardage is negative', () => {
    expect(getClubRecommendations(-10, [makeEntry()])).toEqual([]);
  });

  it('excludes clubs with category "putter"', () => {
    const entries = [
      makeEntry({ clubId: 'c1', clubName: 'Putter', category: 'putter', bookCarry: 155 }),
      makeEntry({ clubId: 'c2', clubName: '7 Iron', category: 'iron', bookCarry: 155 }),
    ];
    const result = getClubRecommendations(155, entries);
    expect(result.every((r) => r.clubName !== 'Putter')).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('excludes clubs with bookCarry=0', () => {
    const entries = [makeEntry({ bookCarry: 0 })];
    const result = getClubRecommendations(155, entries);
    expect(result).toHaveLength(0);
  });

  it('excludes clubs beyond 25 yards of target', () => {
    const entries = [makeEntry({ bookCarry: 200 })];
    const result = getClubRecommendations(155, entries);
    expect(result).toHaveLength(0); // delta=45, > 25
  });

  it('assigns confidence=great when delta<=5, fresh, dispersion<15', () => {
    const entries = [makeEntry({ bookCarry: 157, freshness: 'fresh', dispersion: 8 })];
    const result = getClubRecommendations(155, entries);
    expect(result[0].confidence).toBe('great');
  });

  it('assigns confidence=ok when delta<=10', () => {
    const entries = [makeEntry({ bookCarry: 163, freshness: 'fresh', dispersion: 8 })];
    const result = getClubRecommendations(155, entries);
    expect(result[0].confidence).toBe('ok');
  });

  it('assigns confidence=stretch when delta<=20', () => {
    const entries = [makeEntry({ bookCarry: 170, freshness: 'fresh', dispersion: 8 })];
    const result = getClubRecommendations(155, entries);
    expect(result[0].confidence).toBe('stretch');
  });

  it('downgrades great to ok when freshness is stale', () => {
    const entries = [makeEntry({ bookCarry: 157, freshness: 'stale', dispersion: 8 })];
    const result = getClubRecommendations(155, entries);
    // absDelta=2, but stale → great downgraded to ok
    expect(result[0].confidence).toBe('ok');
  });

  it('downgrades great to ok when dispersion > 20', () => {
    const entries = [makeEntry({ bookCarry: 157, freshness: 'fresh', dispersion: 25 })];
    const result = getClubRecommendations(155, entries);
    expect(result[0].confidence).toBe('ok');
  });

  it('sorts by confidence first (great before ok before stretch)', () => {
    const entries = [
      makeEntry({ clubId: 'c1', clubName: '8 Iron', bookCarry: 170, dispersion: 8 }),   // stretch (delta=15)
      makeEntry({ clubId: 'c2', clubName: '7 Iron', bookCarry: 157, dispersion: 8 }),   // great (delta=2)
      makeEntry({ clubId: 'c3', clubName: '6 Iron', bookCarry: 163, dispersion: 8 }),   // ok (delta=8)
    ];
    const result = getClubRecommendations(155, entries);
    expect(result[0].confidence).toBe('great');
    expect(result[1].confidence).toBe('ok');
    expect(result[2].confidence).toBe('stretch');
  });

  it('sorts by abs(delta) within same confidence level', () => {
    const entries = [
      makeEntry({ clubId: 'c1', clubName: '6 Iron', bookCarry: 163, dispersion: 8 }),  // ok, delta=8
      makeEntry({ clubId: 'c2', clubName: '8 Iron', bookCarry: 148, dispersion: 8 }),  // ok, delta=-7
    ];
    const result = getClubRecommendations(155, entries);
    expect(result[0].clubName).toBe('8 Iron');  // abs(delta)=7 < 8
    expect(result[1].clubName).toBe('6 Iron');
  });

  it('returns at most 3 results', () => {
    const entries = [
      makeEntry({ clubId: 'c1', bookCarry: 155 }),
      makeEntry({ clubId: 'c2', bookCarry: 157 }),
      makeEntry({ clubId: 'c3', bookCarry: 160 }),
      makeEntry({ clubId: 'c4', bookCarry: 163 }),
    ];
    const result = getClubRecommendations(155, entries);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('computes delta correctly (bookCarry - target)', () => {
    const entries = [makeEntry({ bookCarry: 160 })];
    const result = getClubRecommendations(155, entries);
    expect(result[0].delta).toBe(5); // 160 - 155
  });
});
