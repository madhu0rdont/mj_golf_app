import type { Club, ClubCategory } from '../models/club';
import { db } from './index';

interface DefaultClub {
  name: string;
  category: ClubCategory;
  loft: number;
  defaultCarry?: number;
}

const DEFAULT_BAG: DefaultClub[] = [
  { name: 'Driver', category: 'driver', loft: 10.5, defaultCarry: 230 },
  { name: '3 Wood', category: 'wood', loft: 15, defaultCarry: 210 },
  { name: '5 Wood', category: 'wood', loft: 18, defaultCarry: 195 },
  { name: '4 Hybrid', category: 'hybrid', loft: 22, defaultCarry: 185 },
  { name: '5 Iron', category: 'iron', loft: 25, defaultCarry: 175 },
  { name: '6 Iron', category: 'iron', loft: 28, defaultCarry: 165 },
  { name: '7 Iron', category: 'iron', loft: 32, defaultCarry: 155 },
  { name: '8 Iron', category: 'iron', loft: 36, defaultCarry: 145 },
  { name: '9 Iron', category: 'iron', loft: 40, defaultCarry: 135 },
  { name: 'PW', category: 'wedge', loft: 44, defaultCarry: 125 },
  { name: '50°', category: 'wedge', loft: 50, defaultCarry: 110 },
  { name: '54°', category: 'wedge', loft: 54, defaultCarry: 95 },
  { name: '58°', category: 'wedge', loft: 58, defaultCarry: 75 },
  { name: 'Putter', category: 'putter', loft: 3 },
];

export async function seedDefaultBag(): Promise<void> {
  await db.transaction('rw', db.clubs, async () => {
    const count = await db.clubs.count();
    if (count > 0) return;

    const now = Date.now();
    const clubs: Club[] = DEFAULT_BAG.map((club, index) => ({
      id: crypto.randomUUID(),
      name: club.name,
      category: club.category,
      loft: club.loft,
      manualCarry: club.defaultCarry,
      sortOrder: index,
      createdAt: now,
      updatedAt: now,
    }));

    await db.clubs.bulkAdd(clubs);
  });
}
