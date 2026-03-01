import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/wedge-overrides — all overrides
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM wedge_overrides');
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to list wedge overrides', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/wedge-overrides — upsert one override
router.put('/', async (req, res) => {
  try {
    const { clubId, position, carry } = req.body;

    if (!clubId) {
      return res.status(400).json({ error: 'clubId is required' });
    }
    if (!position) {
      return res.status(400).json({ error: 'position is required' });
    }
    if (carry == null || typeof carry !== 'number' || carry <= 0) {
      return res.status(400).json({ error: 'carry must be a positive number' });
    }

    await query(
      `INSERT INTO wedge_overrides (club_id, position, carry)
       VALUES ($1, $2, $3)
       ON CONFLICT (club_id, position)
       DO UPDATE SET carry = $3`,
      [clubId, position, carry]
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
    await query(
      'DELETE FROM wedge_overrides WHERE club_id = $1 AND position = $2',
      [req.params.clubId, req.params.position]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to delete wedge override', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
