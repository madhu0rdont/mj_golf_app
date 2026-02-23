import type { Club, ClubCategory } from '../models/club';
import type { Session, Shot } from '../models/session';
import { db } from './index';
import { classifyAllShots } from '../services/shot-classifier';
import { mean } from '../services/stats';

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
  { name: '3 Iron', category: 'iron', loft: 20, defaultCarry: 195 },
  { name: '4 Iron', category: 'iron', loft: 23, defaultCarry: 185 },
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

// Spreadsheet club name → DB club name mapping
const CLUB_NAME_MAP: Record<string, string> = {
  PW: 'PW',
  '9i': '9 Iron',
  '8i': '8 Iron',
  '7i': '7 Iron',
  '6i': '6 Iron',
  '5i': '5 Iron',
  '4i': '4 Iron',
  '3i': '3 Iron',
};

interface RawShotRow {
  club: string;
  shotNumber: number;
  ballSpeed: number;
  launchAngle: number;
  sideAngle: number;
  totalSpin: number;
  spinAxis: number;
  descentAngle: number;
  offlineYards: number;
  peak: number;
  carry: number;
  total: number;
}

// Hard-coded simulator data from the spreadsheet
const SIMULATOR_DATA: RawShotRow[] = [
  // PW
  { club:'PW', shotNumber:1, ballSpeed:93.4, launchAngle:27.6, sideAngle:1.5, totalSpin:6770, spinAxis:3.8, descentAngle:49.9, offlineYards:7.2, peak:30, carry:121, total:128 },
  { club:'PW', shotNumber:2, ballSpeed:85.9, launchAngle:28.1, sideAngle:0.1, totalSpin:6804, spinAxis:0.3, descentAngle:48.2, offlineYards:0.5, peak:25, carry:109, total:116 },
  { club:'PW', shotNumber:3, ballSpeed:99.7, launchAngle:25, sideAngle:0.4, totalSpin:8769, spinAxis:0.6, descentAngle:50.4, offlineYards:1.7, peak:31, carry:128, total:134 },
  { club:'PW', shotNumber:4, ballSpeed:100.2, launchAngle:19.9, sideAngle:1.6, totalSpin:8069, spinAxis:4.8, descentAngle:45.2, offlineYards:9.7, peak:25, carry:132, total:139 },
  { club:'PW', shotNumber:5, ballSpeed:108, launchAngle:27.7, sideAngle:2.7, totalSpin:7890, spinAxis:5.9, descentAngle:53.9, offlineYards:14.7, peak:40, carry:139, total:146 },
  // 9i
  { club:'9i', shotNumber:1, ballSpeed:101.1, launchAngle:19.8, sideAngle:1.6, totalSpin:7190, spinAxis:10.9, descentAngle:44.5, offlineYards:17, peak:25, carry:134, total:143 },
  { club:'9i', shotNumber:2, ballSpeed:106.7, launchAngle:20.6, sideAngle:2.1, totalSpin:7319, spinAxis:5.3, descentAngle:47.4, offlineYards:12.9, peak:29, carry:144, total:152 },
  { club:'9i', shotNumber:3, ballSpeed:107.1, launchAngle:27.4, sideAngle:2.9, totalSpin:7075, spinAxis:5, descentAngle:53.2, offlineYards:14.3, peak:39, carry:141, total:148 },
  { club:'9i', shotNumber:4, ballSpeed:112.9, launchAngle:28.1, sideAngle:3.3, totalSpin:6770, spinAxis:9.7, descentAngle:54.5, offlineYards:23.6, peak:44, carry:149, total:157 },
  { club:'9i', shotNumber:5, ballSpeed:109.6, launchAngle:27.4, sideAngle:0, totalSpin:6609, spinAxis:4.9, descentAngle:53.3, offlineYards:7, peak:41, carry:146, total:154 },
  { club:'9i', shotNumber:6, ballSpeed:111.1, launchAngle:25.5, sideAngle:6.4, totalSpin:7264, spinAxis:6.9, descentAngle:52.7, offlineYards:27.2, peak:39, carry:148, total:155 },
  // 8i
  { club:'8i', shotNumber:1, ballSpeed:118.9, launchAngle:24.1, sideAngle:0.4, totalSpin:6740, spinAxis:7.3, descentAngle:52.9, offlineYards:11.2, peak:43, carry:161, total:170 },
  { club:'8i', shotNumber:2, ballSpeed:115.7, launchAngle:23.3, sideAngle:1.6, totalSpin:5959, spinAxis:0.6, descentAngle:51.1, offlineYards:5.8, peak:39, carry:161, total:170 },
  { club:'8i', shotNumber:3, ballSpeed:116.4, launchAngle:24.8, sideAngle:0.9, totalSpin:6690, spinAxis:8.8, descentAngle:52.7, offlineYards:16.7, peak:42, carry:158, total:166 },
  { club:'8i', shotNumber:4, ballSpeed:113.9, launchAngle:26.9, sideAngle:1.7, totalSpin:5375, spinAxis:5.6, descentAngle:53.1, offlineYards:3.7, peak:43, carry:158, total:168 },
  { club:'8i', shotNumber:5, ballSpeed:117.8, launchAngle:26, sideAngle:2.1, totalSpin:6110, spinAxis:4.6, descentAngle:53.6, offlineYards:1.4, peak:45, carry:161, total:170 },
  // 7i
  { club:'7i', shotNumber:1, ballSpeed:112, launchAngle:15.3, sideAngle:1, totalSpin:4924, spinAxis:11.8, descentAngle:39.7, offlineYards:19.8, peak:23, carry:158, total:172 },
  { club:'7i', shotNumber:2, ballSpeed:110.1, launchAngle:15.3, sideAngle:5.5, totalSpin:3989, spinAxis:29.7, descentAngle:35, offlineYards:51, peak:19, carry:152, total:167 },
  { club:'7i', shotNumber:3, ballSpeed:118.1, launchAngle:21, sideAngle:4.1, totalSpin:6229, spinAxis:14, descentAngle:49.8, offlineYards:35.4, peak:36, carry:164, total:174 },
  { club:'7i', shotNumber:4, ballSpeed:121.4, launchAngle:23.4, sideAngle:10.3, totalSpin:6235, spinAxis:2.9, descentAngle:52.5, offlineYards:36.7, peak:44, carry:168, total:177 },
  { club:'7i', shotNumber:5, ballSpeed:124.1, launchAngle:18.5, sideAngle:1, totalSpin:4119, spinAxis:8.2, descentAngle:46.2, offlineYards:18.6, peak:35, carry:188, total:202 },
  { club:'7i', shotNumber:6, ballSpeed:127, launchAngle:18, sideAngle:5.7, totalSpin:4899, spinAxis:16.6, descentAngle:47.5, offlineYards:11.5, peak:36, carry:186, total:198 },
  { club:'7i', shotNumber:7, ballSpeed:115.5, launchAngle:9.2, sideAngle:5.1, totalSpin:4594, spinAxis:24, descentAngle:27.4, offlineYards:44.1, peak:13, carry:151, total:168 },
  // 6i
  { club:'6i', shotNumber:1, ballSpeed:120.8, launchAngle:14.3, sideAngle:4.7, totalSpin:4640, spinAxis:9.3, descentAngle:40.9, offlineYards:31.2, peak:26, carry:176, total:191 },
  { club:'6i', shotNumber:2, ballSpeed:124.2, launchAngle:16.8, sideAngle:2.2, totalSpin:4075, spinAxis:16, descentAngle:43.8, offlineYards:20.5, peak:31, carry:187, total:201 },
  { club:'6i', shotNumber:3, ballSpeed:126.3, launchAngle:15.1, sideAngle:4.8, totalSpin:4060, spinAxis:3.5, descentAngle:42.8, offlineYards:10.7, peak:30, carry:192, total:207 },
  { club:'6i', shotNumber:4, ballSpeed:126.5, launchAngle:16.7, sideAngle:0.1, totalSpin:3475, spinAxis:15.7, descentAngle:42.8, offlineYards:28.5, peak:32, carry:196, total:213 },
  { club:'6i', shotNumber:5, ballSpeed:123.7, launchAngle:14.7, sideAngle:0.4, totalSpin:4629, spinAxis:3.4, descentAngle:42.5, offlineYards:4.6, peak:29, carry:183, total:197 },
  { club:'6i', shotNumber:6, ballSpeed:129.5, launchAngle:14, sideAngle:3.8, totalSpin:4249, spinAxis:14.1, descentAngle:41.9, offlineYards:40.1, peak:29, carry:194, total:208 },
  { club:'6i', shotNumber:7, ballSpeed:129.8, launchAngle:16.9, sideAngle:0.8, totalSpin:3959, spinAxis:13, descentAngle:45.4, offlineYards:22.4, peak:35, carry:199, total:213 },
  { club:'6i', shotNumber:8, ballSpeed:125.7, launchAngle:14.3, sideAngle:3.4, totalSpin:3669, spinAxis:12.6, descentAngle:39.8, offlineYards:10.1, peak:27, carry:192, total:208 },
  { club:'6i', shotNumber:9, ballSpeed:119.8, launchAngle:17.8, sideAngle:6.5, totalSpin:4900, spinAxis:0.9, descentAngle:45.7, offlineYards:22.8, peak:32, carry:175, total:188 },
  // 5i
  { club:'5i', shotNumber:1, ballSpeed:118.3, launchAngle:15.7, sideAngle:7.7, totalSpin:3374, spinAxis:14, descentAngle:38.7, offlineYards:4.2, peak:25, carry:179, total:198 },
  { club:'5i', shotNumber:2, ballSpeed:137.3, launchAngle:10.7, sideAngle:3.1, totalSpin:4119, spinAxis:17, descentAngle:38.3, offlineYards:46.1, peak:25, carry:206, total:222 },
  { club:'5i', shotNumber:3, ballSpeed:138.1, launchAngle:12.7, sideAngle:2.4, totalSpin:4499, spinAxis:28.5, descentAngle:41.1, offlineYards:47.1, peak:28, carry:201, total:216 },
  { club:'5i', shotNumber:4, ballSpeed:138.8, launchAngle:9.4, sideAngle:0.1, totalSpin:4390, spinAxis:19.5, descentAngle:36.8, offlineYards:38, peak:23, carry:203, total:218 },
  { club:'5i', shotNumber:5, ballSpeed:116.7, launchAngle:14.9, sideAngle:3.5, totalSpin:4399, spinAxis:15.8, descentAngle:39.5, offlineYards:35.2, peak:24, carry:169, total:184 },
  { club:'5i', shotNumber:6, ballSpeed:131.6, launchAngle:9.7, sideAngle:1.3, totalSpin:4400, spinAxis:19.9, descentAngle:35.1, offlineYards:40.5, peak:21, carry:189, total:207 },
  { club:'5i', shotNumber:7, ballSpeed:127.8, launchAngle:13.7, sideAngle:1, totalSpin:2259, spinAxis:26, descentAngle:31.6, offlineYards:43.4, peak:21, carry:200, total:222 },
  { club:'5i', shotNumber:8, ballSpeed:131.3, launchAngle:16.5, sideAngle:4.7, totalSpin:3520, spinAxis:7.7, descentAngle:44.3, offlineYards:2.9, peak:35, carry:207, total:222 },
  { club:'5i', shotNumber:9, ballSpeed:136.5, launchAngle:13.5, sideAngle:2.7, totalSpin:3590, spinAxis:18.3, descentAngle:41, offlineYards:26.9, peak:30, carry:212, total:229 },
  { club:'5i', shotNumber:10, ballSpeed:133.3, launchAngle:12, sideAngle:2, totalSpin:4599, spinAxis:9.5, descentAngle:41.3, offlineYards:26.3, peak:28, carry:188, total:213 },
  // 4i
  { club:'4i', shotNumber:1, ballSpeed:104.9, launchAngle:16.7, sideAngle:3, totalSpin:3159, spinAxis:25.9, descentAngle:34, offlineYards:19.5, peak:18, carry:148, total:165 },
  { club:'4i', shotNumber:2, ballSpeed:116, launchAngle:17.7, sideAngle:0.4, totalSpin:4774, spinAxis:9.5, descentAngle:44.2, offlineYards:16.4, peak:29, carry:168, total:181 },
  { club:'4i', shotNumber:3, ballSpeed:123.7, launchAngle:19.1, sideAngle:1, totalSpin:4579, spinAxis:1.4, descentAngle:47.7, offlineYards:0.7, peak:37, carry:184, total:197 },
  { club:'4i', shotNumber:4, ballSpeed:113.2, launchAngle:14.9, sideAngle:1.1, totalSpin:4574, spinAxis:18.9, descentAngle:38.2, offlineYards:22.9, peak:22, carry:160, total:173 },
  { club:'4i', shotNumber:5, ballSpeed:119.9, launchAngle:18.8, sideAngle:0.7, totalSpin:4734, spinAxis:2.5, descentAngle:46.7, offlineYards:2.1, peak:34, carry:176, total:189 },
  { club:'4i', shotNumber:6, ballSpeed:127.9, launchAngle:16.3, sideAngle:0.7, totalSpin:4675, spinAxis:11.8, descentAngle:45.5, offlineYards:25, peak:33, carry:190, total:203 },
  { club:'4i', shotNumber:7, ballSpeed:114.1, launchAngle:19.6, sideAngle:0.6, totalSpin:4460, spinAxis:8.4, descentAngle:45.4, offlineYards:11.3, peak:31, carry:167, total:180 },
  { club:'4i', shotNumber:8, ballSpeed:124.9, launchAngle:20, sideAngle:5.9, totalSpin:5280, spinAxis:2.2, descentAngle:49.7, offlineYards:23.7, peak:40, carry:181, total:192 },
  { club:'4i', shotNumber:9, ballSpeed:117.3, launchAngle:17.2, sideAngle:3.1, totalSpin:4389, spinAxis:8.5, descentAngle:43.3, offlineYards:23.7, peak:29, carry:173, total:187 },
  { club:'4i', shotNumber:10, ballSpeed:113.4, launchAngle:17.5, sideAngle:2.3, totalSpin:5564, spinAxis:0.6, descentAngle:44.4, offlineYards:7.9, peak:28, carry:160, total:172 },
  { club:'4i', shotNumber:11, ballSpeed:119.1, launchAngle:9.7, sideAngle:5.5, totalSpin:4769, spinAxis:5.8, descentAngle:31.6, offlineYards:25.5, peak:16, carry:160, total:172 },
  // 3i
  { club:'3i', shotNumber:1, ballSpeed:133.1, launchAngle:15.8, sideAngle:2.8, totalSpin:3634, spinAxis:3.9, descentAngle:44.3, offlineYards:3.1, peak:35, carry:209, total:225 },
  { club:'3i', shotNumber:2, ballSpeed:127.6, launchAngle:12.1, sideAngle:6.6, totalSpin:2674, spinAxis:32.4, descentAngle:29.2, offlineYards:69.4, peak:18, carry:187, total:209 },
  { club:'3i', shotNumber:3, ballSpeed:129.6, launchAngle:12.5, sideAngle:2.9, totalSpin:3035, spinAxis:30.2, descentAngle:32.9, offlineYards:58, peak:21, carry:193, total:212 },
  { club:'3i', shotNumber:4, ballSpeed:131, launchAngle:13.7, sideAngle:5.8, totalSpin:3459, spinAxis:15.2, descentAngle:39.8, offlineYards:6.8, peak:28, carry:203, total:221 },
  { club:'3i', shotNumber:5, ballSpeed:109.7, launchAngle:16, sideAngle:7.8, totalSpin:1769, spinAxis:3, descentAngle:29.9, offlineYards:23, peak:19, carry:169, total:194 },
  { club:'3i', shotNumber:6, ballSpeed:121.8, launchAngle:14, sideAngle:0.6, totalSpin:2174, spinAxis:29.7, descentAngle:29.5, offlineYards:37.5, peak:19, carry:184, total:209 },
];

const SIMULATOR_SEEDED_KEY = 'mj-golf-simulator-seeded';

/**
 * Seed the database with simulator shot data.
 * Creates one session per club with all shots, classifies shots (left-handed),
 * and updates club computed carry/total distances.
 * Uses localStorage flag to run exactly once, cleans up any partial previous attempts.
 */
export async function seedSimulatorData(): Promise<void> {
  if (localStorage.getItem(SIMULATOR_SEEDED_KEY)) return;

  // Clean up any partial previous attempts
  const oldSimSessions = await db.sessions.filter((s) => s.location === 'Simulator').toArray();
  if (oldSimSessions.length > 0) {
    const oldIds = oldSimSessions.map((s) => s.id);
    await db.shots.where('sessionId').anyOf(oldIds).delete();
    await db.sessions.bulkDelete(oldIds);
  }

  // Ensure missing clubs (3 Iron, 4 Iron) exist in the bag
  const now = Date.now();
  const existingClubs = await db.clubs.toArray();
  if (existingClubs.length === 0) return;
  const existingNames = new Set(existingClubs.map((c) => c.name));
  const missingClubs = DEFAULT_BAG.filter((c) => !existingNames.has(c.name));
  if (missingClubs.length > 0) {
    const maxSort = Math.max(...existingClubs.map((c) => c.sortOrder));
    const newClubs: Club[] = missingClubs.map((club, i) => ({
      id: crypto.randomUUID(),
      name: club.name,
      category: club.category,
      loft: club.loft,
      manualCarry: club.defaultCarry,
      sortOrder: maxSort + 1 + i,
      createdAt: now,
      updatedAt: now,
    }));
    await db.clubs.bulkAdd(newClubs);
  }

  const clubs = await db.clubs.toArray();
  const clubByName = new Map(clubs.map((c) => [c.name, c]));

  // Group raw data by club
  const grouped = new Map<string, RawShotRow[]>();
  for (const row of SIMULATOR_DATA) {
    const clubName = CLUB_NAME_MAP[row.club];
    if (!clubName) continue;
    if (!grouped.has(clubName)) grouped.set(clubName, []);
    grouped.get(clubName)!.push(row);
  }

  // Spread sessions across recent days
  const baseDate = new Date('2026-02-20T12:00:00').getTime();
  let dayOffset = 0;

  const sessions: Session[] = [];
  let allShots: Shot[] = [];

  for (const [clubName, rows] of grouped) {
    const club = clubByName.get(clubName);
    if (!club) continue;

    const sessionId = crypto.randomUUID();
    const sessionDate = baseDate - dayOffset * 24 * 60 * 60 * 1000;
    dayOffset++;

    sessions.push({
      id: sessionId,
      clubId: club.id,
      date: sessionDate,
      location: 'Simulator',
      source: 'csv',
      shotCount: rows.length,
      createdAt: now,
      updatedAt: now,
    });

    const rawShots: Shot[] = rows.map((row) => ({
      id: crypto.randomUUID(),
      sessionId,
      clubId: club.id,
      shotNumber: row.shotNumber,
      carryYards: row.carry,
      totalYards: row.total,
      ballSpeed: row.ballSpeed,
      launchAngle: row.launchAngle,
      spinRate: row.totalSpin,
      spinAxis: row.spinAxis,
      descentAngle: row.descentAngle,
      offlineYards: row.offlineYards,
      apexHeight: row.peak,
      timestamp: sessionDate + row.shotNumber * 60_000,
    }));

    // Classify shapes and quality (left-handed)
    const classified = classifyAllShots(rawShots, 'left');
    allShots = allShots.concat(classified);

    // Update club computed distances
    const carries = rows.map((r) => r.carry);
    const totals = rows.map((r) => r.total);
    await db.clubs.update(club.id, {
      computedCarry: Math.round(mean(carries)),
      computedTotal: Math.round(mean(totals)),
      updatedAt: now,
    });
  }

  await db.sessions.bulkAdd(sessions);
  await db.shots.bulkAdd(allShots);

  localStorage.setItem(SIMULATOR_SEEDED_KEY, '1');
}

const RECLASSIFY_KEY = 'mj-golf-shots-reclassified-left';

/**
 * Re-classify all existing shots with left-handed handedness.
 * Runs once to fix any shots that were originally classified as right-handed.
 */
export async function reclassifyShotsLeftHanded(): Promise<void> {
  if (localStorage.getItem(RECLASSIFY_KEY)) return;

  const sessions = await db.sessions.toArray();
  for (const session of sessions) {
    const shots = await db.shots.where('sessionId').equals(session.id).toArray();
    if (shots.length === 0) continue;
    const reclassified = classifyAllShots(shots, 'left');
    await db.shots.bulkPut(reclassified);
  }

  localStorage.setItem(RECLASSIFY_KEY, '1');
}
