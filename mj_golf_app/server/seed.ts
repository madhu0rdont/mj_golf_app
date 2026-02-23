import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { query, pool, toSnake } from './db.js';

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
      const snake = toSnake(club);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO clubs (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    for (const session of data.sessions) {
      const snake = toSnake(session);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO sessions (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    for (const shot of data.shots) {
      const snake = toSnake(shot);
      const keys = Object.keys(snake);
      const values = Object.values(snake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO shots (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
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
