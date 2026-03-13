import { Router } from 'express';
import { query, toCamel } from '../db.js';
import { logger } from '../logger.js';
import { loadCourseHoles, loadSingleHole } from '../services/hole-loader.js';

const router = Router();

// GET /api/courses — list all courses
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT id, name, par, slope, rating, tee_sets, designers, created_at, updated_at FROM courses ORDER BY name');
    res.json(rows.map(toCamel));
  } catch (err) {
    logger.error('Failed to list courses', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/courses/:id — single course with all holes
router.get('/:id', async (req, res) => {
  try {
    const { rows: courseRows } = await query(
      'SELECT * FROM courses WHERE id = $1',
      [req.params.id],
    );
    if (courseRows.length === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }

    const holes = await loadCourseHoles(req.params.id);

    res.json({
      ...toCamel(courseRows[0]),
      holes,
    });
  } catch (err) {
    logger.error('Failed to get course', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/courses/:id/holes/:number — single hole
router.get('/:id/holes/:number', async (req, res) => {
  try {
    const holeNumber = parseInt(req.params.number);
    if (isNaN(holeNumber)) {
      return res.status(400).json({ error: 'Hole number must be a valid number' });
    }

    const hole = await loadSingleHole(req.params.id, holeNumber);
    if (!hole) {
      return res.status(404).json({ error: 'Hole not found' });
    }
    res.json(hole);
  } catch (err) {
    logger.error('Failed to get hole', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
