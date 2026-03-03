import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { dpOptimizeHole } from '../services/dp-optimizer.js';
import { getRoughPenalty } from '../services/strategy-optimizer.js';
import { computeClubShotGroups } from '../services/club-shot-groups.js';
import { buildDistributions } from '../services/monte-carlo.js';
import type { Club, Shot, CourseHole } from '../models/types.js';

const router = Router();

// POST /api/strategy/hole — compute per-hole strategies (all 3 modes)
router.post('/hole', async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { courseId, holeNumber, teeBox } = req.body;

    if (!courseId || holeNumber == null || !teeBox) {
      return res.status(400).json({ error: 'courseId, holeNumber, and teeBox are required' });
    }

    // Load hole data
    const { rows: holeRows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [courseId, holeNumber],
    );
    if (holeRows.length === 0) {
      return res.status(404).json({ error: 'Hole not found' });
    }
    const hole = toCamel<CourseHole>(holeRows[0]);

    // Build distributions from user's shot data
    const { rows: clubRows } = await query('SELECT * FROM clubs WHERE user_id = $1 ORDER BY sort_order', [userId]);
    const clubs = clubRows.map(toCamel<Club>);

    const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
    const shots = shotRows.map(toCamel<Shot>);

    const groups = computeClubShotGroups(clubs, shots);
    const distributions = buildDistributions(groups);

    if (distributions.length === 0) {
      return res.status(400).json({ error: 'No shot data to build distributions' });
    }

    // Run DP optimizer
    const roughPenalty = await getRoughPenalty();
    const strategies = dpOptimizeHole(hole, teeBox, distributions, roughPenalty);

    res.json({ strategies, distributions });
  } catch (err) {
    logger.error('Failed to compute hole strategy', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
