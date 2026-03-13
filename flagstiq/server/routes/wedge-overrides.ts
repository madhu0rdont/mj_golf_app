import { Router } from 'express';
import { z } from 'zod';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

const wedgeOverrideSchema = z.object({
  clubId: z.string().uuid(),
  position: z.string().min(1),
  carry: z.number().positive(),
});

// GET /api/wedge-overrides — user's overrides
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { rows } = await query('SELECT * FROM wedge_overrides WHERE user_id = $1', [userId]);
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to list wedge overrides', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/wedge-overrides — upsert one override
router.put('/', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const parsed = wedgeOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors });
    }
    const { clubId, position, carry } = parsed.data;

    await query(
      `INSERT INTO wedge_overrides (club_id, position, carry, user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, club_id, position)
       DO UPDATE SET carry = EXCLUDED.carry`,
      [clubId, position, carry, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to upsert wedge override', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/wedge-overrides/:clubId/:position — remove override
router.delete('/:clubId/:position', async (req, res) => {
  try {
    const userId = req.session.userId!;
    await query(
      'DELETE FROM wedge_overrides WHERE club_id = $1 AND position = $2 AND user_id = $3',
      [req.params.clubId, req.params.position, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete wedge override', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
