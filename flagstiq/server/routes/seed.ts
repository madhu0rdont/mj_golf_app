import { Router } from 'express';
import { seed } from '../seed.js';
import { logger } from '../logger.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

// POST /api/seed — re-seed database if empty (dev only)
router.post('/', async (_req, res) => {
  if (process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT) {
    return res.status(403).json({ error: 'Seed route disabled in production' });
  }
  try {
    await seed();
    res.json({ ok: true });
  } catch (err) {
    logger.error('Failed to seed database', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
