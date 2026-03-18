import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { dpOptimizeHole } from '../services/dp-optimizer.js';
import type { WindAdjustment } from '../services/dp-optimizer.js';
import { loadStrategyConstants } from '../services/strategy-optimizer.js';
import { computeClubShotGroups } from '../services/club-shot-groups.js';
import { buildDistributions } from '../services/monte-carlo.js';
import { loadSingleHole, loadCourseHoles } from '../services/hole-loader.js';
import { loadUserClubs } from '../services/club-loader.js';
import { fetchCurrentWeather, computeHoleWeatherAdjustments } from '../services/weather.js';
import type { Club, Shot } from '../models/types.js';

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
    const hole = await loadSingleHole(courseId, holeNumber, teeBox);
    if (!hole) {
      return res.status(404).json({ error: 'Hole not found' });
    }

    // Build distributions from user's shot data (deterministic — always computed fresh)
    const clubs = await loadUserClubs(userId);

    const { rows: shotRows } = await query('SELECT * FROM shots WHERE user_id = $1', [userId]);
    const shots = shotRows.map(toCamel<Shot>);

    const groups = computeClubShotGroups(clubs, shots);
    const distributions = buildDistributions(groups);

    if (distributions.length === 0) {
      return res.status(400).json({ error: 'No shot data to build distributions' });
    }

    // Try to use cached strategies from game plan (ensures consistency with game plan view)
    const { rows: cacheRows } = await query(
      `SELECT plan FROM game_plan_cache WHERE course_id = $1 AND mode = 'scoring' AND user_id = $2 AND stale = FALSE`,
      [courseId, userId],
    );

    if (cacheRows.length > 0) {
      const cachedPlan = typeof cacheRows[0].plan === 'string'
        ? JSON.parse(cacheRows[0].plan)
        : cacheRows[0].plan;
      const holePlan = cachedPlan?.holes?.find((h: { holeNumber: number }) => h.holeNumber === holeNumber);
      if (holePlan?.allStrategies?.length > 0) {
        return res.json({ strategies: holePlan.allStrategies, distributions });
      }
    }

    // No cache or no allStrategies — compute fresh
    const constants = await loadStrategyConstants();

    // Fetch wind adjustment for this hole
    let wind: WindAdjustment | undefined;
    try {
      const allHoles = await loadCourseHoles(courseId, teeBox);
      if (allHoles.length > 0) {
        const weather = await fetchCurrentWeather(allHoles[0].tee.lat, allHoles[0].tee.lng);
        const adjustments = computeHoleWeatherAdjustments(weather, allHoles, teeBox);
        const holeAdj = adjustments.find((a) => a.holeNumber === holeNumber);
        if (holeAdj) {
          wind = {
            windCarryPct: holeAdj.windCarryPct,
            crosswindMph: holeAdj.crosswindMph,
            tempAdjustYards: holeAdj.tempAdjustYards,
          };
        }
      }
    } catch (err) {
      logger.warn('Could not fetch weather for strategy, proceeding without wind', { error: String(err) });
    }

    const strategies = dpOptimizeHole(hole, teeBox, distributions, constants, wind);

    res.json({ strategies, distributions });
  } catch (err) {
    logger.error('Failed to compute hole strategy', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
