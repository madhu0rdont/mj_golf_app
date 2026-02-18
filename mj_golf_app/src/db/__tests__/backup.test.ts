import { db } from '../index';
import { importAllData, clearAllData } from '../backup';

beforeEach(async () => {
  await db.clubs.clear();
  await db.sessions.clear();
  await db.shots.clear();
});

function makeBackupFile(data: Record<string, unknown>): File {
  return new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' });
}

describe('importAllData', () => {
  it('imports clubs, sessions, and shots from a valid backup', async () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs: [
        { id: 'c1', name: 'Driver', category: 'driver', sortOrder: 0, createdAt: 1, updatedAt: 1 },
      ],
      sessions: [
        { id: 's1', clubId: 'c1', date: Date.now(), source: 'manual', shotCount: 1, createdAt: 1, updatedAt: 1 },
      ],
      shots: [
        { id: 'sh1', sessionId: 's1', clubId: 'c1', shotNumber: 1, carryYards: 230, timestamp: 1 },
      ],
    };

    const result = await importAllData(makeBackupFile(backup));
    expect(result).toEqual({ clubs: 1, sessions: 1, shots: 1 });

    const clubs = await db.clubs.toArray();
    expect(clubs).toHaveLength(1);
    expect(clubs[0].name).toBe('Driver');
  });

  it('clears existing data before importing', async () => {
    // Add some existing data
    await db.clubs.add({
      id: 'existing', name: 'Old Club', category: 'iron', sortOrder: 0, createdAt: 1, updatedAt: 1,
    } as never);

    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs: [
        { id: 'new', name: 'New Club', category: 'iron', sortOrder: 0, createdAt: 1, updatedAt: 1 },
      ],
      sessions: [],
      shots: [],
    };

    await importAllData(makeBackupFile(backup));
    const clubs = await db.clubs.toArray();
    expect(clubs).toHaveLength(1);
    expect(clubs[0].id).toBe('new');
  });

  it('throws on invalid backup format (missing version)', async () => {
    const badBackup = { clubs: [] };
    await expect(importAllData(makeBackupFile(badBackup))).rejects.toThrow('Invalid backup file format');
  });

  it('returns correct counts', async () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      clubs: [
        { id: 'c1', name: 'A', category: 'iron', sortOrder: 0, createdAt: 1, updatedAt: 1 },
        { id: 'c2', name: 'B', category: 'iron', sortOrder: 1, createdAt: 1, updatedAt: 1 },
      ],
      sessions: [],
      shots: [],
    };
    const result = await importAllData(makeBackupFile(backup));
    expect(result.clubs).toBe(2);
    expect(result.sessions).toBe(0);
    expect(result.shots).toBe(0);
  });
});

describe('clearAllData', () => {
  it('clears all tables', async () => {
    await db.clubs.add({
      id: 'c1', name: 'Driver', category: 'driver', sortOrder: 0, createdAt: 1, updatedAt: 1,
    } as never);

    await clearAllData();
    expect(await db.clubs.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.shots.count()).toBe(0);
  });

  it('succeeds when tables are already empty', async () => {
    await expect(clearAllData()).resolves.toBeUndefined();
  });
});
