import { Router } from 'express';
import { query, toCamel } from '../db.js';

const router = Router();

// GET /api/sessions/:clubId/previous?before=<timestamp>
// Returns the most recent session for a club before the given date, plus its shots
router.get('/:clubId/previous', async (req, res) => {
  const { clubId } = req.params;
  const before = parseInt(req.query.before as string);

  if (!before || isNaN(before)) {
    return res.status(400).json({ error: 'Missing or invalid "before" query param' });
  }

  // Find previous session using composite index
  const { rows: sessionRows } = await query(
    'SELECT * FROM sessions WHERE club_id = $1 AND date < $2 ORDER BY date DESC LIMIT 1',
    [clubId, before]
  );

  if (sessionRows.length === 0) {
    return res.json(null);
  }

  const session = toCamel(sessionRows[0]) as Record<string, unknown>;

  // Get shots for that session
  const { rows: shotRows } = await query(
    'SELECT * FROM shots WHERE session_id = $1 ORDER BY shot_number',
    [session.id]
  );

  // Get club name
  const { rows: clubRows } = await query(
    'SELECT name FROM clubs WHERE id = $1',
    [clubId]
  );

  res.json({
    session,
    shots: shotRows.map(toCamel),
    clubName: clubRows[0]?.name ?? 'Unknown',
  });
});

export default router;
