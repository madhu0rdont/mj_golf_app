import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query, pool } from './db.js';
import { logger } from './logger.js';
import { BAG_CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from './utils/db-columns.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedData {
  clubs: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  shots: Record<string, unknown>[];
}

export async function seed() {
  const { rows } = await query('SELECT count(*) FROM bag_clubs');
  if (parseInt(rows[0].count) > 0) {
    logger.info('Database already seeded, skipping');
    return;
  }

  const raw = readFileSync(join(__dirname, 'seed-data.json'), 'utf-8');
  const data: SeedData = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const club of data.clubs) {
      const now = Date.now();
      const row = pickColumns({ ...club, isActive: true }, BAG_CLUB_COLUMNS);
      const q = buildInsert('bag_clubs', row);
      await client.query(q.text, q.values);

      // Create manual profile if carry/total present
      const clubId = club.id as string;
      const manualCarry = club.manual_carry ?? club.manualCarry;
      const manualTotal = club.manual_total ?? club.manualTotal;
      if (manualCarry != null || manualTotal != null) {
        await client.query(
          `INSERT INTO club_profiles (id, bag_club_id, profile_type, carry_mean, total_mean, is_current, effective_from, created_at)
           VALUES (gen_random_uuid()::text, $1, 'manual', $2, $3, TRUE, $4, $4)`,
          [clubId, manualCarry ?? null, manualTotal ?? null, now],
        );
      }
    }

    for (const session of data.sessions) {
      const row = pickColumns(session, SESSION_COLUMNS);
      const q = buildInsert('sessions', row);
      await client.query(q.text, q.values);
    }

    for (const shot of data.shots) {
      const row = pickColumns(shot, SHOT_COLUMNS);
      const q = buildInsert('shots', row);
      await client.query(q.text, q.values);
    }

    await client.query('COMMIT');
    logger.info(`Seeded ${data.clubs.length} clubs, ${data.sessions.length} sessions, ${data.shots.length} shots`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
