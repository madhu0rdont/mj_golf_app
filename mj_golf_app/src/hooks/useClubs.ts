import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index';
import type { Club } from '../models/club';

export function useAllClubs() {
  return useLiveQuery(() => db.clubs.orderBy('sortOrder').toArray(), []);
}

export function useClub(id: string | undefined) {
  return useLiveQuery(() => (id ? db.clubs.get(id) : undefined), [id]);
}

export function useClubsByCategory() {
  return useLiveQuery(async () => {
    const clubs = await db.clubs.orderBy('sortOrder').toArray();
    const grouped: Record<string, Club[]> = {};
    for (const club of clubs) {
      if (!grouped[club.category]) grouped[club.category] = [];
      grouped[club.category].push(club);
    }
    return grouped;
  }, []);
}

export async function addClub(data: Omit<Club, 'id' | 'createdAt' | 'updatedAt' | 'sortOrder'>) {
  const maxOrder = await db.clubs.orderBy('sortOrder').last();
  const sortOrder = (maxOrder?.sortOrder ?? -1) + 1;
  const now = Date.now();
  return db.clubs.add({
    ...data,
    id: crypto.randomUUID(),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateClub(id: string, data: Partial<Club>) {
  return db.clubs.update(id, { ...data, updatedAt: Date.now() });
}

export async function deleteClub(id: string) {
  return db.clubs.delete(id);
}

export async function reorderClubs(orderedIds: string[]) {
  return db.transaction('rw', db.clubs, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.clubs.update(orderedIds[i], { sortOrder: i, updatedAt: Date.now() });
    }
  });
}
