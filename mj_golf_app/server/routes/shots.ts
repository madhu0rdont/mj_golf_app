import { Router } from 'express';
import { query, toCamel } from '../db.js';

const router = Router();

// GET /api/shots — all shots (for yardage book computation)
router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM shots');
  res.json(rows.map(toCamel));
});

export default router;
