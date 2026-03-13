import { Router } from 'express';
import { query, toCamel, toSnake } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';
import { fetchElevations } from '../../services/elevation.js';

const router = Router();

// PATCH /api/admin/:id/holes/:number — update hole fields
router.patch('/:id/holes/:number', async (req, res) => {
  const ALLOWED_FIELDS = ['hazards', 'fairway', 'green', 'notes', 'targets', 'plays_like_yards', 'yardages', 'handicap', 'par', 'tee', 'pin', 'heading', 'center_line'];
  const updates = toSnake(req.body);

  // If tee or pin are being updated, merge with existing data to preserve elevation
  if (updates.tee || updates.pin) {
    const { rows: existingRows } = await query(
      'SELECT tee, pin FROM course_holes WHERE course_id = $1 AND hole_number = $2',
      [req.params.id, parseInt(req.params.number)],
    );
    if (existingRows.length > 0) {
      const existing = existingRows[0];
      if (updates.tee && existing.tee) {
        updates.tee = { ...existing.tee, ...updates.tee };
      }
      if (updates.pin && existing.pin) {
        updates.pin = { ...existing.pin, ...updates.pin };
      }
    }

    // Re-fetch elevation for changed tee/pin positions
    try {
      const teeObj = updates.tee as Record<string, unknown> | undefined;
      const pinObj = updates.pin as Record<string, unknown> | undefined;
      const coords: { lat: number; lng: number }[] = [];
      if (teeObj) coords.push({ lat: Number(teeObj.lat), lng: Number(teeObj.lng) });
      if (pinObj) coords.push({ lat: Number(pinObj.lat), lng: Number(pinObj.lng) });
      const elevResults = await fetchElevations(coords);
      let idx = 0;
      if (teeObj) { teeObj.elevation = elevResults[idx++].elevation; }
      if (pinObj) { pinObj.elevation = elevResults[idx].elevation; }
    } catch (err) {
      logger.error('Failed to fetch elevation for tee/pin update', { error: String(err) });
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];

  const SCALAR_FIELDS = ['notes', 'handicap', 'par', 'heading'];
  for (const [key, val] of Object.entries(updates)) {
    if (!ALLOWED_FIELDS.includes(key)) continue;
    values.push(SCALAR_FIELDS.includes(key) ? val : JSON.stringify(val));
    setClauses.push(`${key} = $${values.length}`);
  }

  if (setClauses.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  values.push(req.params.id);
  values.push(parseInt(req.params.number));

  const { rowCount } = await query(
    `UPDATE course_holes SET ${setClauses.join(', ')} WHERE course_id = $${values.length - 1} AND hole_number = $${values.length}`,
    values,
  );

  if (rowCount === 0) {
    return res.status(404).json({ error: 'Hole not found' });
  }

  const { rows } = await query(
    'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
    [req.params.id, parseInt(req.params.number)],
  );
  await markPlansStale('Hole data edited', req.params.id);
  res.json(toCamel(rows[0]));
});

// DELETE /api/admin/:id/holes/geofence — batch-clear geofence data for a range of holes
router.delete('/:id/holes/geofence', async (req, res) => {
  try {
    const from = parseInt(req.query.from as string);
    const to = parseInt(req.query.to as string);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
      return res.status(400).json({ error: 'Provide valid ?from=N&to=M query params' });
    }
    const { rowCount } = await query(
      `UPDATE course_holes
       SET hazards = '[]'::jsonb, fairway = '[]'::jsonb, green = '[]'::jsonb,
           targets = '[]'::jsonb, center_line = '[]'::jsonb
       WHERE course_id = $1 AND hole_number >= $2 AND hole_number <= $3`,
      [req.params.id, from, to],
    );
    await markPlansStale('Geofence data cleared', req.params.id);
    logger.info('Cleared geofence data', { courseId: req.params.id, from, to, rowCount });
    res.json({ cleared: rowCount });
  } catch (err) {
    logger.error('Failed to clear geofence data', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
