import { db } from '../index';
import { seedFromBackup } from '../seed';

beforeEach(async () => {
  await db.clubs.clear();
  await db.sessions.clear();
  await db.shots.clear();
});

describe('seedFromBackup', () => {
  it('seeds clubs, sessions, and shots when database is empty', async () => {
    await seedFromBackup();
    const clubs = await db.clubs.count();
    const sessions = await db.sessions.count();
    const shots = await db.shots.count();
    expect(clubs).toBeGreaterThan(0);
    expect(sessions).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0);
  });

  it('does not overwrite when clubs already exist (idempotent)', async () => {
    await seedFromBackup();
    const countBefore = await db.clubs.count();
    await seedFromBackup(); // second call
    const countAfter = await db.clubs.count();
    expect(countAfter).toBe(countBefore);
  });
});
