import { Router } from 'express';
import { query, pool, toCamel, toSnake } from '../db.js';
import { classifyAllShots } from '../services/shot-classifier.js';

const router = Router();

// GET /api/sessions — list sessions with optional filters
// ?clubId=xxx — sessions for a specific club
// ?limit=10 — recent sessions (default: no limit)
// ?all=true — all sessions sorted by date desc
router.get('/', async (req, res) => {
  const { clubId, limit, all } = req.query;

  let sql = 'SELECT * FROM sessions';
  const params: unknown[] = [];

  if (clubId) {
    params.push(clubId);
    sql += ` WHERE club_id = $${params.length}`;
  }

  sql += ' ORDER BY date DESC';

  if (limit && !all) {
    params.push(parseInt(limit as string));
    sql += ` LIMIT $${params.length}`;
  }

  const { rows } = await query(sql, params);
  res.json(rows.map(toCamel));
});

// GET /api/sessions/:id — single session
router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Session not found' });
  res.json(toCamel(rows[0]));
});

// POST /api/sessions — create session with shots
// Body: { clubId, date, location?, notes?, source, shots: [...] }
router.post('/', async (req, res) => {
  const { clubId, date, location, notes, source, shots: rawShots } = req.body;
  const sessionId = crypto.randomUUID();
  const now = Date.now();

  // Build shot objects
  const shotsWithIds = rawShots.map((s: Record<string, unknown>, i: number) => ({
    ...s,
    id: crypto.randomUUID(),
    sessionId,
    clubId,
    shotNumber: s.shotNumber ?? i + 1,
    timestamp: now,
  }));

  // Classify shots (left-handed)
  const classifiedShots = classifyAllShots(shotsWithIds, 'left');

  const session = {
    id: sessionId,
    clubId,
    date,
    location: location || null,
    notes: notes || null,
    source,
    shotCount: classifiedShots.length,
    createdAt: now,
    updatedAt: now,
  };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert session
    const sessionSnake = toSnake(session);
    const sKeys = Object.keys(sessionSnake);
    const sValues = Object.values(sessionSnake);
    const sPlaceholders = sKeys.map((_, i) => `$${i + 1}`);
    await client.query(
      `INSERT INTO sessions (${sKeys.join(', ')}) VALUES (${sPlaceholders.join(', ')})`,
      sValues
    );

    // Insert shots
    for (const shot of classifiedShots) {
      const shotSnake = toSnake(shot);
      const keys = Object.keys(shotSnake);
      const values = Object.values(shotSnake);
      const placeholders = keys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO shots (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
    }

    await client.query('COMMIT');
    res.status(201).json(session);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// PUT /api/sessions/:id — update session
router.put('/:id', async (req, res) => {
  const { clubId, date } = req.body;
  const now = Date.now();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updates: string[] = [];
    const values: unknown[] = [];

    if (clubId !== undefined) {
      values.push(clubId);
      updates.push(`club_id = $${values.length}`);
    }
    if (date !== undefined) {
      values.push(date);
      updates.push(`date = $${values.length}`);
    }
    values.push(now);
    updates.push(`updated_at = $${values.length}`);
    values.push(req.params.id);

    await client.query(
      `UPDATE sessions SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    // If clubId changed, update shots too
    if (clubId !== undefined) {
      await client.query(
        'UPDATE shots SET club_id = $1 WHERE session_id = $2',
        [clubId, req.params.id]
      );
    }

    await client.query('COMMIT');

    const { rows } = await query('SELECT * FROM sessions WHERE id = $1', [req.params.id]);
    res.json(toCamel(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// GET /api/sessions/:id/shots — shots for a session
router.get('/:id/shots', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM shots WHERE session_id = $1 ORDER BY shot_number',
    [req.params.id]
  );
  res.json(rows.map(toCamel));
});

// DELETE /api/sessions/:id — delete session (shots cascade)
router.delete('/:id', async (_req, res) => {
  await query('DELETE FROM sessions WHERE id = $1', [_req.params.id]);
  res.json({ ok: true });
});

export default router;
