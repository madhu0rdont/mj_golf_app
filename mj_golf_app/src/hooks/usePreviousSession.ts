import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index';
import { computeSessionSummary } from '../services/stats';
import type { SessionSummary } from '../models/session';

export function usePreviousSessionSummary(
  clubId: string | undefined,
  currentSessionDate: number | undefined
): SessionSummary | null | undefined {
  return useLiveQuery(
    async () => {
      if (!clubId || !currentSessionDate) return null;

      const prevSession = await db.sessions
        .where('[clubId+date]')
        .between([clubId, 0], [clubId, currentSessionDate], true, false)
        .reverse()
        .first();

      if (!prevSession) return null;

      const shots = await db.shots
        .where('sessionId')
        .equals(prevSession.id)
        .sortBy('shotNumber');

      if (shots.length === 0) return null;

      const club = await db.clubs.get(clubId);
      if (!club) return null;

      return computeSessionSummary(
        shots,
        club.name,
        prevSession.id,
        clubId,
        prevSession.date
      );
    },
    [clubId, currentSessionDate]
  );
}
