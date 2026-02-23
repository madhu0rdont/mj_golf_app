import type { Club } from '../models/club';
import type { Session, Shot } from '../models/session';
import { db } from './index';
import seedData from './seed-data.json';

/**
 * Seed the database from the exported backup JSON.
 * Only runs when the DB is empty (fresh boot / after clear).
 * Restores all clubs, sessions, and shots exactly as exported.
 */
export async function seedFromBackup(): Promise<void> {
  const clubCount = await db.clubs.count();
  if (clubCount > 0) return;

  await db.transaction('rw', db.clubs, db.sessions, db.shots, async () => {
    if (seedData.clubs.length > 0) {
      await db.clubs.bulkAdd(seedData.clubs as Club[]);
    }
    if (seedData.sessions.length > 0) {
      await db.sessions.bulkAdd(seedData.sessions as Session[]);
    }
    if (seedData.shots.length > 0) {
      await db.shots.bulkAdd(seedData.shots as Shot[]);
    }
  });
}
