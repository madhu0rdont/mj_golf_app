import { db } from '../index';
import { seedDefaultBag } from '../seed';

beforeEach(async () => {
  await db.clubs.clear();
  await db.sessions.clear();
  await db.shots.clear();
});

describe('seedDefaultBag', () => {
  it('creates 14 default clubs when database is empty', async () => {
    await seedDefaultBag();
    const count = await db.clubs.count();
    expect(count).toBe(14);
  });

  it('does not create clubs when clubs already exist (idempotent)', async () => {
    await seedDefaultBag();
    await seedDefaultBag(); // second call
    const count = await db.clubs.count();
    expect(count).toBe(14);
  });

  it('assigns correct categories', async () => {
    await seedDefaultBag();
    const clubs = await db.clubs.toArray();
    const categories = clubs.map((c) => c.category);
    expect(categories.filter((c) => c === 'driver')).toHaveLength(1);
    expect(categories.filter((c) => c === 'wood')).toHaveLength(2);
    expect(categories.filter((c) => c === 'hybrid')).toHaveLength(1);
    expect(categories.filter((c) => c === 'iron')).toHaveLength(5);
    expect(categories.filter((c) => c === 'wedge')).toHaveLength(4);
    expect(categories.filter((c) => c === 'putter')).toHaveLength(1);
  });

  it('assigns sequential sortOrder starting from 0', async () => {
    await seedDefaultBag();
    const clubs = await db.clubs.orderBy('sortOrder').toArray();
    clubs.forEach((club, index) => {
      expect(club.sortOrder).toBe(index);
    });
  });
});
