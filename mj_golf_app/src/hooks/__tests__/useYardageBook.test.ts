import {
  computeWeight,
  getFreshness,
  weightedAvg,
  computeBookEntry,
} from '../useYardageBook';
import type { SessionWithShots } from '../useYardageBook';
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

const DAY_MS = 1000 * 60 * 60 * 24;

describe('computeWeight', () => {
  it('returns 1.0 for daysAgo=0', () => {
    expect(computeWeight(0)).toBe(1.0);
  });

  it('returns 0.5 for daysAgo=30 (one half-life)', () => {
    expect(computeWeight(30)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.25 for daysAgo=60 (two half-lives)', () => {
    expect(computeWeight(60)).toBeCloseTo(0.25, 5);
  });

  it('returns value close to 0 for very large daysAgo', () => {
    expect(computeWeight(300)).toBeLessThan(0.001);
  });
});

describe('getFreshness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns fresh when lastSessionDate is today', () => {
    expect(getFreshness(Date.now())).toBe('fresh');
  });

  it('returns fresh when lastSessionDate is 13 days ago', () => {
    expect(getFreshness(Date.now() - 13 * DAY_MS)).toBe('fresh');
  });

  it('returns aging when lastSessionDate is 14 days ago', () => {
    expect(getFreshness(Date.now() - 14 * DAY_MS)).toBe('aging');
  });

  it('returns aging when lastSessionDate is 44 days ago', () => {
    expect(getFreshness(Date.now() - 44 * DAY_MS)).toBe('aging');
  });

  it('returns stale when lastSessionDate is 45 days ago', () => {
    expect(getFreshness(Date.now() - 45 * DAY_MS)).toBe('stale');
  });
});

describe('weightedAvg', () => {
  it('returns 0 for empty array', () => {
    expect(weightedAvg([])).toBe(0);
  });

  it('returns 0 when total weight is 0', () => {
    expect(weightedAvg([{ value: 100, weight: 0 }])).toBe(0);
  });

  it('returns the value when there is a single entry', () => {
    expect(weightedAvg([{ value: 155, weight: 1.0 }])).toBe(155);
  });

  it('computes weighted average correctly for multiple entries', () => {
    const result = weightedAvg([
      { value: 150, weight: 1.0 },
      { value: 160, weight: 0.5 },
    ]);
    // (150*1.0 + 160*0.5) / (1.0 + 0.5) = 230 / 1.5 = 153.33
    expect(result).toBeCloseTo(153.33, 1);
  });

  it('weights recent sessions more than old sessions', () => {
    const recent = weightedAvg([
      { value: 160, weight: 1.0 },  // recent
      { value: 140, weight: 0.25 }, // old
    ]);
    const even = weightedAvg([
      { value: 160, weight: 1.0 },
      { value: 140, weight: 1.0 },
    ]);
    // Recent-weighted should be closer to 160 than even split
    expect(recent).toBeGreaterThan(even);
  });
});

describe('computeBookEntry', () => {
  it('returns null for empty sessionsWithShots', () => {
    expect(computeBookEntry(makeClub(), [])).toBeNull();
  });

  it('returns a valid YardageBookEntry for a single session', () => {
    const now = Date.now();
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: now }),
        shots: [
          makeShot({ id: 's1', carryYards: 150 }),
          makeShot({ id: 's2', carryYards: 160 }),
        ],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry).not.toBeNull();
    expect(entry!.bookCarry).toBeCloseTo(155, 0);
    expect(entry!.sessionCount).toBe(1);
    expect(entry!.shotCount).toBe(2);
  });

  it('computes bookCarry as weighted average of session-level carry averages', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const now = Date.now();

    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ id: 's1', date: now }),
        shots: [makeShot({ id: 'sh1', carryYards: 160 })],
      },
      {
        session: makeSession({ id: 's2', date: now - 30 * DAY_MS }),
        shots: [makeShot({ id: 'sh2', carryYards: 150 })],
      },
    ];

    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    // weight1=1.0, weight2=0.5
    // weighted avg = (160*1.0 + 150*0.5) / (1.0 + 0.5) = 235/1.5 = 156.67
    expect(entry!.bookCarry).toBeCloseTo(156.7, 0);

    vi.useRealTimers();
  });

  it('returns bookTotal=undefined when no shots have totalYards', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: Date.now() }),
        shots: [makeShot({ carryYards: 150 })],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.bookTotal).toBeUndefined();
  });

  it('computes dispersion as weighted average of session ranges', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: Date.now() }),
        shots: [
          makeShot({ id: 's1', carryYards: 150 }),
          makeShot({ id: 's2', carryYards: 160 }),
          makeShot({ id: 's3', carryYards: 155 }),
        ],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    // range = 160 - 150 = 10
    expect(entry!.dispersion).toBe(10);
  });

  it('skips dispersion for sessions with only 1 shot', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: Date.now() }),
        shots: [makeShot({ carryYards: 150 })],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.dispersion).toBe(0);
  });

  it('identifies the dominant shape from aggregate counts', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: Date.now() }),
        shots: [
          makeShot({ id: 's1', carryYards: 150, shape: 'draw' }),
          makeShot({ id: 's2', carryYards: 155, shape: 'draw' }),
          makeShot({ id: 's3', carryYards: 160, shape: 'fade' }),
        ],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.dominantShape).toBe('draw');
  });

  it('computes freshness based on the latest session date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));

    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ id: 's1', date: Date.now() }),
        shots: [makeShot({ id: 'sh1', carryYards: 150 })],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.freshness).toBe('fresh');

    vi.useRealTimers();
  });

  it('skips sessions with no shots', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ id: 's1', date: Date.now() }),
        shots: [],
      },
      {
        session: makeSession({ id: 's2', date: Date.now() }),
        shots: [makeShot({ carryYards: 155 })],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.shotCount).toBe(1);
  });

  it('includes avgSpinRate when spin data is present', () => {
    const sessionsWithShots: SessionWithShots[] = [
      {
        session: makeSession({ date: Date.now() }),
        shots: [
          makeShot({ id: 's1', carryYards: 150, spinRate: 6800 }),
          makeShot({ id: 's2', carryYards: 155, spinRate: 7200 }),
        ],
      },
    ];
    const entry = computeBookEntry(makeClub(), sessionsWithShots);
    expect(entry!.avgSpinRate).toBe(7000);
  });
});
