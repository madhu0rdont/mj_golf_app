import { Router } from 'express';
import { query, toCamel } from '../db.js';

const router = Router();

// GET /api/wedge-overrides — all overrides
router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM wedge_overrides');
  res.json(rows.map(toCamel));
});

// PUT /api/wedge-overrides — upsert one override
router.put('/', async (req, res) => {
  const { clubId, position, carry } = req.body;
  await query(
    `INSERT INTO wedge_overrides (club_id, position, carry)
     VALUES ($1, $2, $3)
     ON CONFLICT (club_id, position)
     DO UPDATE SET carry = $3`,
    [clubId, position, carry]
  );
  res.json({ ok: true });
});

// DELETE /api/wedge-overrides/:clubId/:position — remove override
router.delete('/:clubId/:position', async (req, res) => {
  await query(
    'DELETE FROM wedge_overrides WHERE club_id = $1 AND position = $2',
    [req.params.clubId, req.params.position]
  );
  res.json({ ok: true });
});

export default router;
