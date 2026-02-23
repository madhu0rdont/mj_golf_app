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

const CLUB_COLUMNS = [
  'id', 'name', 'category', 'brand', 'model', 'loft', 'shaft', 'flex',
  'manual_carry', 'manual_total', 'computed_carry', 'computed_total',
  'sort_order', 'created_at', 'updated_at',
];

const SESSION_COLUMNS = [
  'id', 'club_id', 'date', 'location', 'notes', 'source',
  'shot_count', 'created_at', 'updated_at',
];

const SHOT_COLUMNS = [
  'id', 'session_id', 'club_id', 'shot_number', 'carry_yards', 'total_yards',
  'ball_speed', 'club_head_speed', 'launch_angle', 'spin_rate', 'spin_axis',
  'apex_height', 'descent_angle', 'side_spin_rate', 'push_pull', 'offline_yards',
  'shape', 'quality', 'timestamp',
];

function pickColumns(obj: Record<string, unknown>, allowedColumns: string[]): Record<string, unknown> {
  const snake = toSnake(obj);
  const result: Record<string, unknown> = {};
  for (const col of allowedColumns) {
    if (col in snake) {
      result[col] = snake[col];
    }
  }
  return result;
}

function buildInsert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  const values = Object.values(row);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  };
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
