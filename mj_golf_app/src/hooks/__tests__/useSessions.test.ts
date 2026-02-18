import { db } from '../../db/index';
import { createSession, deleteSession } from '../useSessions';

beforeEach(async () => {
  await db.clubs.clear();
  await db.sessions.clear();
  await db.shots.clear();
});

describe('createSession', () => {
  it('creates a session and shots in the database', async () => {
    const sessionId = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [
        { shotNumber: 1, carryYards: 155 },
        { shotNumber: 2, carryYards: 160 },
      ],
    });

    const session = await db.sessions.get(sessionId);
    expect(session).toBeDefined();
    expect(session!.clubId).toBe('club-1');
    expect(session!.shotCount).toBe(2);

    const shots = await db.shots.where('sessionId').equals(sessionId).toArray();
    expect(shots).toHaveLength(2);
  });

  it('auto-classifies shot shapes and qualities', async () => {
    const sessionId = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [
        { shotNumber: 1, carryYards: 155, spinAxis: -5, offlineYards: -3 },
        { shotNumber: 2, carryYards: 155, spinAxis: 5, offlineYards: 3 },
      ],
    });

    const shots = await db.shots.where('sessionId').equals(sessionId).sortBy('shotNumber');
    expect(shots[0].shape).toBe('draw');
    expect(shots[1].shape).toBe('fade');
    // Both same carry, stdDev=0, so both pure
    expect(shots[0].quality).toBe('pure');
  });

  it('assigns unique IDs to session and each shot', async () => {
    const sessionId = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [
        { shotNumber: 1, carryYards: 155 },
        { shotNumber: 2, carryYards: 160 },
      ],
    });

    const shots = await db.shots.where('sessionId').equals(sessionId).toArray();
    expect(shots[0].id).not.toBe(shots[1].id);
    expect(shots[0].id).not.toBe(sessionId);
  });
});

describe('deleteSession', () => {
  it('deletes the session and all associated shots', async () => {
    const sessionId = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [{ shotNumber: 1, carryYards: 155 }],
    });

    await deleteSession(sessionId);
    expect(await db.sessions.get(sessionId)).toBeUndefined();
    expect(await db.shots.where('sessionId').equals(sessionId).count()).toBe(0);
  });

  it('does not affect shots from other sessions', async () => {
    const session1Id = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [{ shotNumber: 1, carryYards: 155 }],
    });

    const session2Id = await createSession({
      clubId: 'club-1',
      date: Date.now(),
      source: 'manual',
      shots: [{ shotNumber: 1, carryYards: 160 }],
    });

    await deleteSession(session1Id);
    const remainingShots = await db.shots.where('sessionId').equals(session2Id).toArray();
    expect(remainingShots).toHaveLength(1);
    expect(remainingShots[0].carryYards).toBe(160);
  });
});
