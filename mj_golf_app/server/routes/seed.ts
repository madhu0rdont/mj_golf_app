import { Router } from 'express';
import { seed } from '../seed.js';

const router = Router();

// POST /api/seed — re-seed database if empty
router.post('/', async (_req, res) => {
  try {
    await seed();
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to seed database:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
