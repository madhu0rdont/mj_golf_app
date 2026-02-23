import { Router } from 'express';
import { query, pool, toCamel, toSnake } from '../db.js';

const router = Router();

// Known columns per table — only these will be inserted
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

/** Convert a camelCase object to snake_case, keeping only known columns */
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

// GET /api/backup/export — export all data
router.get('/export', async (_req, res) => {
  const clubs = await query('SELECT * FROM clubs ORDER BY sort_order');
  const sessions = await query('SELECT * FROM sessions ORDER BY date');
  const shots = await query('SELECT * FROM shots ORDER BY session_id, shot_number');

  res.json({
    version: 1,
    exportedAt: new Date().toISOString(),
    clubs: clubs.rows.map(toCamel),
    sessions: sessions.rows.map(toCamel),
    shots: shots.rows.map(toCamel),
  });
});

// POST /api/backup/import — import backup (clear + replace)
router.post('/import', async (req, res) => {
  const { clubs, sessions, shots } = req.body;

  if (!Array.isArray(clubs)) {
    return res.status(400).json({ error: 'Invalid backup format' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear all data
    await client.query('DELETE FROM shots');
    await client.query('DELETE FROM sessions');
    await client.query('DELETE FROM clubs');

    // Insert clubs
    for (const club of clubs) {
      const row = pickColumns(club, CLUB_COLUMNS);
      const q = buildInsert('clubs', row);
      await client.query(q.text, q.values);
    }

    // Insert sessions
    for (const session of (sessions || [])) {
      const row = pickColumns(session, SESSION_COLUMNS);
      const q = buildInsert('sessions', row);
      await client.query(q.text, q.values);
    }

    // Insert shots
    for (const shot of (shots || [])) {
      const row = pickColumns(shot, SHOT_COLUMNS);
      const q = buildInsert('shots', row);
      await client.query(q.text, q.values);
    }

    await client.query('COMMIT');
    console.log(`Imported ${clubs.length} clubs, ${(sessions || []).length} sessions, ${(shots || []).length} shots`);
    res.json({
      clubs: clubs.length,
      sessions: (sessions || []).length,
      shots: (shots || []).length,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Import failed: ${message}` });
  } finally {
    client.release();
  }
});

export default router;
