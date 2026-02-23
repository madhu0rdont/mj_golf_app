import { Router } from 'express';
import { seed } from '../seed.js';

const router = Router();

// POST /api/seed — re-seed database if empty
router.post('/', async (_req, res) => {
  await seed();
  res.json({ ok: true });
});

export default router;
