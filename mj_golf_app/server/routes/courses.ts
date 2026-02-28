import { Router } from 'express';
import { query, toCamel } from '../db.js';

const router = Router();

// GET /api/courses — list all courses
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM courses ORDER BY name');
    res.json(rows.map(toCamel));
  } catch (err) {
    console.error('Failed to list courses:', err);
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

    const { rows: holeRows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [req.params.id],
    );

    res.json({
      ...toCamel(courseRows[0]),
      holes: holeRows.map(toCamel),
    });
  } catch (err) {
    console.error('Failed to get course:', err);
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

    const { rows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [req.params.id, holeNumber],
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Hole not found' });
    }
    res.json(toCamel(rows[0]));
  } catch (err) {
    console.error('Failed to get hole:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
