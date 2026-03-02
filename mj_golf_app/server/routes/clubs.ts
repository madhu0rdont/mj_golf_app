import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel, withTransaction } from '../db.js';
import { logger } from '../logger.js';
import { pickColumns, buildInsert, CLUB_COLUMNS } from '../utils/db-columns.js';
import { markPlansStale } from './game-plans.js';

const createClubSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  loft: z.number().optional(),
  carryYards: z.number().optional(),
  totalYards: z.number().optional(),
  shaftFlex: z.string().optional(),
});

const updateClubSchema = createClubSchema.partial();

const router = Router();

// GET /api/clubs — list user's clubs ordered by sort_order
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { rows } = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to list clubs', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clubs/:id — single club (owned by user)
router.get('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { rows } = await query('SELECT * FROM clubs WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Club not found' });
    res.json(toCamel(rows[0]));
  } catch (err) {
    logger.error('Failed to get club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clubs — create club
router.post('/', async (req, res) => {
  try {
    const parsed = createClubSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }

    const userId = req.session.userId!;
    const now = Date.now();
    const id = crypto.randomUUID();

    // Get max sort_order for this user
    const { rows: maxRows } = await query(
      'SELECT COALESCE(MAX(sort_order), -1) as max_order FROM clubs WHERE user_id = $1',
      [userId],
    );
    const sortOrder = maxRows[0].max_order + 1;

    const filtered = pickColumns({ ...req.body, id, userId, sortOrder, createdAt: now, updatedAt: now }, CLUB_COLUMNS);
    const q = buildInsert('clubs', filtered);
    await query(q.text, q.values);

    res.status(201).json(toCamel(filtered));

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club bag changed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to create club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clubs/reorder — batch update sort_order
router.put('/reorder', async (req, res) => {
  try {
    const orderedIds = req.body.orderedIds;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    const userId = req.session.userId!;
    const now = Date.now();

    await withTransaction(async (client) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await client.query(
          'UPDATE clubs SET sort_order = $1, updated_at = $2 WHERE id = $3 AND user_id = $4',
          [i, now, orderedIds[i], userId]
        );
      }
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to reorder clubs', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clubs/:id — update club
router.put('/:id', async (req, res) => {
  try {
    const parsed = updateClubSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }

    const userId = req.session.userId!;
    const filtered = pickColumns({ ...req.body, updatedAt: Date.now() }, CLUB_COLUMNS);
    // Remove user_id from update payload — shouldn't be changeable
    delete filtered.user_id;
    const keys = Object.keys(filtered);
    const values = Object.values(filtered);

    if (keys.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
    values.push(req.params.id, userId);

    await query(
      `UPDATE clubs SET ${setClauses.join(', ')} WHERE id = $${values.length - 1} AND user_id = $${values.length}`,
      values
    );

    const { rows } = await query('SELECT * FROM clubs WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Club not found' });
    res.json(toCamel(rows[0]));

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club settings changed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to update club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clubs/:id — delete club (cascade sessions+shots)
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.session.userId!;
    await withTransaction(async (client) => {
      // Delete sessions (shots cascade via ON DELETE CASCADE on shots.session_id)
      await client.query('DELETE FROM sessions WHERE club_id = $1 AND user_id = $2', [req.params.id, userId]);
      await client.query('DELETE FROM clubs WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
    });

    res.json({ ok: true });

    // Fire-and-forget: mark game plans stale for this user
    markPlansStale('Club removed', undefined, userId).catch(err => logger.error('markPlansStale failed', { error: String(err) }));
  } catch (err) {
    logger.error('Failed to delete club', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
