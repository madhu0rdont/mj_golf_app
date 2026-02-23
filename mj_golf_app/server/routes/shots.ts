import { Router } from 'express';
import { query, toCamel } from '../db.js';

const router = Router();

// GET /api/sessions/:sessionId/shots — shots for a session
router.get('/:sessionId/shots', async (req, res) => {
  const { rows } = await query(
    'SELECT * FROM shots WHERE session_id = $1 ORDER BY shot_number',
    [req.params.sessionId]
  );
  res.json(rows.map(toCamel));
});

// GET /api/shots — all shots (for yardage book computation)
router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM shots');
  res.json(rows.map(toCamel));
});

export default router;
