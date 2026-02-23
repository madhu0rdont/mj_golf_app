import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index';
import type { Club } from '../models/club';
import type { Session, Shot, ShotShape } from '../models/session';
import type { YardageBookEntry, DataFreshness } from '../models/yardage';
import { CLUB_COLORS } from '../theme/colors';
import { buildKnownClubAvg, imputeClubMetrics, syntheticShot } from '../services/impute';

const HALF_LIFE_DAYS = 30;

export function computeWeight(daysAgo: number): number {
  return Math.pow(0.5, daysAgo / HALF_LIFE_DAYS);
}

export function getFreshness(lastSessionDate: number): DataFreshness {
  const daysAgo = (Date.now() - lastSessionDate) / (1000 * 60 * 60 * 24);
  if (daysAgo < 14) return 'fresh';
  if (daysAgo < 45) return 'aging';
  return 'stale';
}

export function weightedAvg(values: { value: number; weight: number }[]): number {
  if (values.length === 0) return 0;
  const totalWeight = values.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((sum, v) => sum + v.value * v.weight, 0) / totalWeight;
}

export interface SessionWithShots {
  session: Session;
  shots: Shot[];
}

export function computeBookEntry(
  club: Club,
  sessionsWithShots: SessionWithShots[]
): YardageBookEntry | null {
  if (sessionsWithShots.length === 0) return null;

  const now = Date.now();
  const carryValues: { value: number; weight: number }[] = [];
  const totalValues: { value: number; weight: number }[] = [];
  const dispersionValues: { value: number; weight: number }[] = [];
  const spinValues: { value: number; weight: number }[] = [];
  const launchValues: { value: number; weight: number }[] = [];
  const shapeCounts: Partial<Record<ShotShape, number>> = {};
  let totalShotCount = 0;

  for (const { session, shots } of sessionsWithShots) {
    if (shots.length === 0) continue;

    const daysAgo = (now - session.date) / (1000 * 60 * 60 * 24);
    const weight = computeWeight(daysAgo);

    // Session-level averages (prevents sessions with more shots from dominating)
    const carries = shots.map((s) => s.carryYards);
    const avgCarry = carries.reduce((a, b) => a + b, 0) / carries.length;
    carryValues.push({ value: avgCarry, weight });

    const totals = shots.filter((s) => s.totalYards != null).map((s) => s.totalYards!);
    if (totals.length > 0) {
      totalValues.push({ value: totals.reduce((a, b) => a + b, 0) / totals.length, weight });
    }

    // Dispersion as range within session
    const maxCarry = Math.max(...carries);
    const minCarry = Math.min(...carries);
    if (carries.length > 1) {
      dispersionValues.push({ value: maxCarry - minCarry, weight });
    }

    // Spin rate average
    const spins = shots.filter((s) => s.spinRate != null).map((s) => s.spinRate!);
    if (spins.length > 0) {
      spinValues.push({ value: spins.reduce((a, b) => a + b, 0) / spins.length, weight });
    }

    // Launch angle average
    const launches = shots.filter((s) => s.launchAngle != null).map((s) => s.launchAngle!);
    if (launches.length > 0) {
      launchValues.push({ value: launches.reduce((a, b) => a + b, 0) / launches.length, weight });
    }

    // Shape distribution (unweighted count for simplicity)
    for (const shot of shots) {
      if (shot.shape) {
        shapeCounts[shot.shape] = (shapeCounts[shot.shape] || 0) + 1;
      }
    }

    totalShotCount += shots.length;
  }

  const bookCarry = weightedAvg(carryValues);
  const bookTotal = totalValues.length > 0 ? weightedAvg(totalValues) : undefined;
  const dispersion = dispersionValues.length > 0 ? weightedAvg(dispersionValues) : 0;

  // Dominant shape
  let dominantShape: ShotShape | undefined;
  let maxCount = 0;
  for (const [shape, count] of Object.entries(shapeCounts)) {
    if (count! > maxCount) {
      maxCount = count!;
      dominantShape = shape as ShotShape;
    }
  }

  const latestSession = sessionsWithShots[0].session;

  return {
    clubId: club.id,
    clubName: club.name,
    category: club.category,
    bookCarry: Math.round(bookCarry * 10) / 10,
    bookTotal: bookTotal ? Math.round(bookTotal * 10) / 10 : undefined,
    confidenceCarry: Math.round(bookCarry * 10) / 10,
    dispersion: Math.round(dispersion * 10) / 10,
    dominantShape,
    avgSpinRate: spinValues.length > 0 ? Math.round(weightedAvg(spinValues)) : undefined,
    avgLaunchAngle: launchValues.length > 0 ? Math.round(weightedAvg(launchValues) * 10) / 10 : undefined,
    sessionCount: sessionsWithShots.length,
    shotCount: totalShotCount,
    lastSessionDate: latestSession.date,
    freshness: getFreshness(latestSession.date),
  };
}

export function useYardageBook(excludeMishits = false): YardageBookEntry[] | undefined {
  return useLiveQuery(async () => {
    const clubs = await db.clubs.orderBy('sortOrder').toArray();
    const allSessions = await db.sessions.toArray();
    const allShots = await db.shots.toArray();

    // Group shots by sessionId
    const shotsBySession = new Map<string, Shot[]>();
    for (const shot of allShots) {
      if (excludeMishits && shot.quality === 'mishit') continue;
      const list = shotsBySession.get(shot.sessionId) || [];
      list.push(shot);
      shotsBySession.set(shot.sessionId, list);
    }

    // Group sessions by clubId, sorted by date desc
    const sessionsByClub = new Map<string, SessionWithShots[]>();
    for (const session of allSessions) {
      const shots = shotsBySession.get(session.id) || [];
      const list = sessionsByClub.get(session.clubId) || [];
      list.push({ session, shots });
      sessionsByClub.set(session.clubId, list);
    }

    // Sort each club's sessions by date descending
    for (const [, sessions] of sessionsByClub) {
      sessions.sort((a, b) => b.session.date - a.session.date);
    }

    const entries: YardageBookEntry[] = [];
    for (const club of clubs) {
      const sessionsWithShots = sessionsByClub.get(club.id) || [];
      const entry = computeBookEntry(club, sessionsWithShots);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  }, [excludeMishits]);
}

export interface ClubShotGroup {
  clubId: string;
  clubName: string;
  color: string;
  shots: Shot[];
  imputed?: boolean;
}

export function useYardageBookShots(): ClubShotGroup[] | undefined {
  return useLiveQuery(async () => {
    const clubs = await db.clubs.orderBy('sortOrder').toArray();
    const allShots = await db.shots.toArray();

    const shotsByClub = new Map<string, Shot[]>();
    for (const shot of allShots) {
      const list = shotsByClub.get(shot.clubId) || [];
      list.push(shot);
      shotsByClub.set(shot.clubId, list);
    }

    // Build known club averages for imputation
    const knownAvgs = clubs
      .map((club) => buildKnownClubAvg(club, shotsByClub.get(club.id) || []))
      .filter((a): a is NonNullable<typeof a> => a != null);

    const groups: ClubShotGroup[] = [];
    let colorIdx = 0;
    for (const club of clubs) {
      const shots = shotsByClub.get(club.id);
      if (shots && shots.length > 0) {
        groups.push({
          clubId: club.id,
          clubName: club.name,
          color: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
          shots,
        });
        colorIdx++;
      } else if (club.category !== 'putter' && club.loft && knownAvgs.length >= 2) {
        const metrics = imputeClubMetrics(knownAvgs, club.loft);
        if (metrics.carry > 0) {
          groups.push({
            clubId: club.id,
            clubName: club.name,
            color: CLUB_COLORS[colorIdx % CLUB_COLORS.length],
            shots: [syntheticShot(club.id, metrics)],
            imputed: true,
          });
          colorIdx++;
        }
      }
    }

    return groups;
  }, []);
}

export function useClubHistory(clubId: string | undefined) {
  return useLiveQuery(async () => {
    if (!clubId) return [];
    const sessions = await db.sessions.where('clubId').equals(clubId).reverse().sortBy('date');
    const result = [];
    for (const session of sessions) {
      const shots = await db.shots.where('sessionId').equals(session.id).toArray();
      const carries = shots.map((s) => s.carryYards);
      const avgCarry = carries.length > 0 ? carries.reduce((a, b) => a + b, 0) / carries.length : 0;
      const totals = shots.filter((s) => s.totalYards != null).map((s) => s.totalYards!);
      const avgTotal = totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : undefined;
      result.push({
        sessionId: session.id,
        date: session.date,
        shotCount: shots.length,
        avgCarry: Math.round(avgCarry * 10) / 10,
        avgTotal: avgTotal ? Math.round(avgTotal * 10) / 10 : undefined,
        dispersion: carries.length > 1 ? Math.round((Math.max(...carries) - Math.min(...carries)) * 10) / 10 : 0,
      });
    }
    return result;
  }, [clubId]);
}
