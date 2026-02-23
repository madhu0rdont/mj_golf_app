import { Router } from 'express';
import { query, toCamel, toSnake } from '../db.js';

const router = Router();

// GET /api/clubs — list all clubs ordered by sort_order
router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM clubs ORDER BY sort_order');
  res.json(rows.map(toCamel));
});

// GET /api/clubs/:id — single club
router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM clubs WHERE id = $1', [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Club not found' });
  res.json(toCamel(rows[0]));
});

// POST /api/clubs — create club
router.post('/', async (req, res) => {
  const now = Date.now();
  const id = crypto.randomUUID();

  // Get max sort_order
  const { rows: maxRows } = await query('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM clubs');
  const sortOrder = maxRows[0].max_order + 1;

  const club = {
    id,
    ...req.body,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };

  const snake = toSnake(club);
  const keys = Object.keys(snake);
  const values = Object.values(snake);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  await query(
    `INSERT INTO clubs (${keys.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  );

  res.status(201).json(club);
});

// PUT /api/clubs/reorder — batch update sort_order
router.put('/reorder', async (req, res) => {
  const orderedIds: string[] = req.body.orderedIds;
  const now = Date.now();

  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE clubs SET sort_order = $1, updated_at = $2 WHERE id = $3',
      [i, now, orderedIds[i]]
    );
  }

  res.json({ ok: true });
});

// PUT /api/clubs/:id — update club
router.put('/:id', async (req, res) => {
  const updates = { ...req.body, updatedAt: Date.now() };
  const snake = toSnake(updates);
  const keys = Object.keys(snake);
  const values = Object.values(snake);

  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
  values.push(req.params.id);

  await query(
    `UPDATE clubs SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
    values
  );

  const { rows } = await query('SELECT * FROM clubs WHERE id = $1', [req.params.id]);
  res.json(toCamel(rows[0]));
});

// DELETE /api/clubs/:id — delete club (cascade sessions+shots)
router.delete('/:id', async (req, res) => {
  // Delete sessions (shots cascade via ON DELETE CASCADE on shots.session_id)
  await query('DELETE FROM sessions WHERE club_id = $1', [req.params.id]);
  await query('DELETE FROM clubs WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
