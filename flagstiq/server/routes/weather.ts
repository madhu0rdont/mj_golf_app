import { Router } from 'express';
import { fetchCurrentWeather, computeHoleWeatherAdjustments } from '../services/weather.js';
import { loadCourseHoles } from '../services/hole-loader.js';
import { logger } from '../logger.js';

const router = Router();

// GET /api/weather/:courseId?teeBox=blue
router.get('/:courseId', async (req, res) => {
  try {
    const { courseId } = req.params;
    const teeBox = (req.query.teeBox as string) || undefined;

    const holes = await loadCourseHoles(courseId, teeBox);
    if (holes.length === 0) {
      return res.status(404).json({ error: 'Course not found or has no holes' });
    }

    // Use hole 1 tee position as course location
    const courseLat = holes[0].tee.lat;
    const courseLng = holes[0].tee.lng;

    if (courseLat === 0 && courseLng === 0) {
      return res.status(400).json({ error: 'Course has no tee coordinates' });
    }

    const weather = await fetchCurrentWeather(courseLat, courseLng);

    // Determine tee box: use requested or first available
    const effectiveTeeBox = teeBox || Object.keys(holes[0].yardages)[0] || 'blue';
    const adjustments = computeHoleWeatherAdjustments(weather, holes, effectiveTeeBox);

    const courseTotalAdjust = adjustments.reduce((sum, a) => sum + a.carryAdjustYards, 0);

    res.json({ weather, adjustments, courseTotalAdjust });
  } catch (err) {
    logger.error('Weather API error', { error: (err as Error).message });
    res.status(500).json({ error: 'Failed to fetch weather data' });
  }
});

export default router;
