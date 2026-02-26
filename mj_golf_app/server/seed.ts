import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query, pool } from './db.js';
import { CLUB_COLUMNS, SESSION_COLUMNS, SHOT_COLUMNS, pickColumns, buildInsert } from './utils/db-columns.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeedData {
  clubs: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  shots: Record<string, unknown>[];
}

export async function seed() {
  const { rows } = await query('SELECT count(*) FROM clubs');
  if (parseInt(rows[0].count) > 0) {
    console.log('Database already seeded, skipping');
    return;
  }

  const raw = readFileSync(join(__dirname, 'seed-data.json'), 'utf-8');
  const data: SeedData = JSON.parse(raw);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const club of data.clubs) {
      const row = pickColumns(club, CLUB_COLUMNS);
      const q = buildInsert('clubs', row);
      await client.query(q.text, q.values);
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
    console.log(`Seeded ${data.clubs.length} clubs, ${data.sessions.length} sessions, ${data.shots.length} shots`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
