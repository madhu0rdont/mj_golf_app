import { db } from '../../db/index';
import { addClub, updateClub, deleteClub, reorderClubs } from '../useClubs';

beforeEach(async () => {
  await db.clubs.clear();
  await db.sessions.clear();
  await db.shots.clear();
});

describe('addClub', () => {
  it('adds a club with auto-generated id, sortOrder, and timestamps', async () => {
    await addClub({ name: '7 Iron', category: 'iron' });
    const clubs = await db.clubs.toArray();
    expect(clubs).toHaveLength(1);
    expect(clubs[0].id).toBeDefined();
    expect(clubs[0].name).toBe('7 Iron');
    expect(clubs[0].sortOrder).toBe(0);
    expect(clubs[0].createdAt).toBeGreaterThan(0);
    expect(clubs[0].updatedAt).toBeGreaterThan(0);
  });

  it('assigns sortOrder as one more than the highest existing', async () => {
    await addClub({ name: 'Driver', category: 'driver' });
    await addClub({ name: '7 Iron', category: 'iron' });
    const clubs = await db.clubs.orderBy('sortOrder').toArray();
    expect(clubs[0].sortOrder).toBe(0);
    expect(clubs[1].sortOrder).toBe(1);
  });

  it('assigns sortOrder=0 when database is empty', async () => {
    await addClub({ name: 'Driver', category: 'driver' });
    const club = await db.clubs.toArray();
    expect(club[0].sortOrder).toBe(0);
  });
});

describe('updateClub', () => {
  it('updates specified fields and sets updatedAt', async () => {
    await addClub({ name: 'Old Name', category: 'iron' });
    const clubs = await db.clubs.toArray();
    const id = clubs[0].id;
    const oldUpdatedAt = clubs[0].updatedAt;

    // Small delay to ensure timestamp difference
    await new Promise((r) => setTimeout(r, 10));
    await updateClub(id, { name: 'New Name' });

    const updated = await db.clubs.get(id);
    expect(updated!.name).toBe('New Name');
    expect(updated!.updatedAt).toBeGreaterThan(oldUpdatedAt);
  });

  it('preserves unmodified fields', async () => {
    await addClub({ name: 'Driver', category: 'driver', loft: 10.5 });
    const clubs = await db.clubs.toArray();
    const id = clubs[0].id;

    await updateClub(id, { name: 'New Driver' });
    const updated = await db.clubs.get(id);
    expect(updated!.category).toBe('driver');
    expect(updated!.loft).toBe(10.5);
  });
});

describe('deleteClub', () => {
  it('removes the club from the database', async () => {
    await addClub({ name: 'Driver', category: 'driver' });
    const clubs = await db.clubs.toArray();
    await deleteClub(clubs[0].id);
    expect(await db.clubs.count()).toBe(0);
  });
});

describe('reorderClubs', () => {
  it('updates sortOrder for all clubs based on array position', async () => {
    await addClub({ name: 'A', category: 'iron' });
    await addClub({ name: 'B', category: 'iron' });
    await addClub({ name: 'C', category: 'iron' });
    const clubs = await db.clubs.orderBy('sortOrder').toArray();

    // Reverse order
    const reversed = [clubs[2].id, clubs[1].id, clubs[0].id];
    await reorderClubs(reversed);

    const reordered = await db.clubs.orderBy('sortOrder').toArray();
    expect(reordered[0].name).toBe('C');
    expect(reordered[1].name).toBe('B');
    expect(reordered[2].name).toBe('A');
  });
});
