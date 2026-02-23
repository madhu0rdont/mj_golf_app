import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index';
import type { Session, Shot, IngestionMethod } from '../models/session';
import { classifyAllShots } from '../services/shot-classifier';
import type { Handedness } from '../context/SettingsContext';

export function useSessionsForClub(clubId: string | undefined) {
  return useLiveQuery(
    () =>
      clubId
        ? db.sessions.where('clubId').equals(clubId).reverse().sortBy('date')
        : [],
    [clubId]
  );
}

export function useRecentSessions(limit: number = 10) {
  return useLiveQuery(
    () => db.sessions.orderBy('date').reverse().limit(limit).toArray(),
    [limit]
  );
}

export function useSession(id: string | undefined) {
  return useLiveQuery(() => (id ? db.sessions.get(id) : undefined), [id]);
}

export function useShotsForSession(sessionId: string | undefined) {
  return useLiveQuery(
    () =>
      sessionId
        ? db.shots.where('sessionId').equals(sessionId).sortBy('shotNumber')
        : [],
    [sessionId]
  );
}

export interface CreateSessionInput {
  clubId: string;
  date: number;
  location?: string;
  notes?: string;
  source: IngestionMethod;
  shots: Omit<Shot, 'id' | 'sessionId' | 'clubId' | 'shape' | 'quality' | 'timestamp'>[];
}

export async function createSession(input: CreateSessionInput, handedness: Handedness = 'right'): Promise<string> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  // Classify shots
  const rawShots: Shot[] = input.shots.map((s, i) => ({
    ...s,
    id: crypto.randomUUID(),
    sessionId,
    clubId: input.clubId,
    shotNumber: s.shotNumber ?? i + 1,
    timestamp: now,
  }));

  const classifiedShots = classifyAllShots(rawShots, handedness);

  const session: Session = {
    id: sessionId,
    clubId: input.clubId,
    date: input.date,
    location: input.location,
    notes: input.notes,
    source: input.source,
    shotCount: classifiedShots.length,
    createdAt: now,
    updatedAt: now,
  };

  await db.transaction('rw', db.sessions, db.shots, async () => {
    await db.sessions.add(session);
    await db.shots.bulkAdd(classifiedShots);
  });

  return sessionId;
}

export async function updateSession(
  id: string,
  updates: { clubId?: string; date?: number }
): Promise<void> {
  await db.transaction('rw', db.sessions, db.shots, async () => {
    await db.sessions.update(id, { ...updates, updatedAt: Date.now() });
    if (updates.clubId) {
      const shots = await db.shots.where('sessionId').equals(id).toArray();
      await db.shots.bulkPut(
        shots.map((s) => ({ ...s, clubId: updates.clubId! }))
      );
    }
  });
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.shots, async () => {
    await db.shots.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}
