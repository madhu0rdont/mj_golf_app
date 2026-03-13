import { Router } from 'express';
import { query, toSnake } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';
import { fetchElevations } from '../../services/elevation.js';
import { loadSingleHole } from '../../services/hole-loader.js';

const router = Router();

// PATCH /api/admin/:id/holes/:number — update hole fields
router.patch('/:id/holes/:number', async (req, res) => {
  try {
    const courseId = req.params.id;
    const holeNumber = parseInt(req.params.number);
    const updates = toSnake(req.body);

    // Find the hole
    const { rows: holeRows } = await query(
      'SELECT id FROM holes WHERE course_id = $1 AND hole_number = $2',
      [courseId, holeNumber],
    );
    if (holeRows.length === 0) return res.status(404).json({ error: 'Hole not found' });
    const holeId = holeRows[0].id as string;

    // Validate that at least one allowed field is present
    const ALL_ALLOWED = new Set(['notes', 'handicap', 'par', 'heading', 'fairway', 'green', 'targets', 'center_line', 'tee', 'pin', 'yardages', 'plays_like_yards', 'hazards']);
    if (!Object.keys(updates).some(k => ALL_ALLOWED.has(k))) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // 1. Update holes table fields (scalar + geometry)
    const HOLES_FIELDS = ['notes', 'handicap', 'par', 'heading', 'fairway', 'green', 'targets', 'center_line'];
    const HOLES_SCALAR = ['notes', 'handicap', 'par', 'heading'];
    const holeSets: string[] = [];
    const holeVals: unknown[] = [];
    for (const [key, val] of Object.entries(updates)) {
      if (!HOLES_FIELDS.includes(key)) continue;
      holeVals.push(HOLES_SCALAR.includes(key) ? val : JSON.stringify(val));
      holeSets.push(`${key} = $${holeVals.length}`);
    }
    if (holeSets.length > 0) {
      holeVals.push(holeId);
      await query(`UPDATE holes SET ${holeSets.join(', ')} WHERE id = $${holeVals.length}`, holeVals);
    }

    // 2. Update tee position (all tee boxes share a position until per-box editing is added)
    if (updates.tee) {
      const { rows: existingTees } = await query(
        'SELECT id, lat, lng, elevation FROM hole_tees WHERE hole_id = $1',
        [holeId],
      );
      const existing = existingTees[0] ?? { lat: 0, lng: 0, elevation: 0 };
      const teeObj = { lat: existing.lat, lng: existing.lng, elevation: existing.elevation, ...(updates.tee as object) };

      try {
        const elevResults = await fetchElevations([{ lat: Number(teeObj.lat), lng: Number(teeObj.lng) }]);
        teeObj.elevation = elevResults[0].elevation;
      } catch (err) {
        logger.error('Failed to fetch tee elevation', { error: String(err) });
      }

      for (const tee of existingTees) {
        await query(
          'UPDATE hole_tees SET lat = $1, lng = $2, elevation = $3 WHERE id = $4',
          [teeObj.lat, teeObj.lng, teeObj.elevation, tee.id],
        );
      }
    }

    // 3. Update pin position
    if (updates.pin) {
      const { rows: existingPins } = await query(
        'SELECT lat, lng, elevation FROM hole_pins WHERE hole_id = $1 AND is_default = true',
        [holeId],
      );
      const existing = existingPins[0] ?? { lat: 0, lng: 0, elevation: 0 };
      const pinObj = { lat: existing.lat, lng: existing.lng, elevation: existing.elevation, ...(updates.pin as object) };

      try {
        const elevResults = await fetchElevations([{ lat: Number(pinObj.lat), lng: Number(pinObj.lng) }]);
        pinObj.elevation = elevResults[0].elevation;
      } catch (err) {
        logger.error('Failed to fetch pin elevation', { error: String(err) });
      }

      await query(
        'UPDATE hole_pins SET lat = $1, lng = $2, elevation = $3 WHERE hole_id = $4 AND is_default = true',
        [pinObj.lat, pinObj.lng, pinObj.elevation, holeId],
      );
    }

    // 4. Update yardages (upsert hole_tees rows)
    if (updates.yardages) {
      const yardages = updates.yardages as Record<string, number>;
      const { rows: existingTees } = await query(
        'SELECT lat, lng, elevation FROM hole_tees WHERE hole_id = $1 LIMIT 1',
        [holeId],
      );
      const pos = existingTees[0] ?? { lat: 0, lng: 0, elevation: 0 };
      for (const [teeName, yardage] of Object.entries(yardages)) {
        await query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, elevation, yardage)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = $6`,
          [holeId, teeName, pos.lat, pos.lng, pos.elevation, yardage],
        );
      }
    }

    // 5. Update plays_like_yards
    if (updates.plays_like_yards) {
      const playsLike = updates.plays_like_yards as Record<string, number>;
      for (const [teeName, ply] of Object.entries(playsLike)) {
        await query(
          'UPDATE hole_tees SET plays_like_yardage = $1 WHERE hole_id = $2 AND tee_name = $3',
          [ply, holeId, teeName],
        );
      }
    }

    // 6. Update hazards (replace all)
    if (updates.hazards) {
      await query('DELETE FROM hole_hazards WHERE hole_id = $1', [holeId]);
      const hazards = updates.hazards as { type: string; name?: string; penalty: number; confidence?: string; source?: string; polygon: unknown[]; status?: string }[];
      for (const h of hazards) {
        await query(
          `INSERT INTO hole_hazards (id, hole_id, hazard_type, name, penalty, confidence, source, polygon, status)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8)`,
          [holeId, h.type, h.name ?? null, h.penalty, h.confidence ?? 'high', h.source ?? 'manual', JSON.stringify(h.polygon), h.status ?? 'accepted'],
        );
      }
    }

    // Return updated hole
    const hole = await loadSingleHole(courseId, holeNumber);
    await markPlansStale('Hole data edited', courseId);
    res.json(hole);
  } catch (err) {
    logger.error('Admin hole update failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/:id/holes/geofence — batch-clear geofence data for a range of holes
router.delete('/:id/holes/geofence', async (req, res) => {
  try {
    const from = parseInt(req.query.from as string);
    const to = parseInt(req.query.to as string);
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
      return res.status(400).json({ error: 'Provide valid ?from=N&to=M query params' });
    }
    const courseId = req.params.id;

    // Clear geometry from holes table
    const { rowCount } = await query(
      `UPDATE holes SET fairway = '[]'::jsonb, green = '[]'::jsonb,
              targets = '[]'::jsonb, center_line = '[]'::jsonb
       WHERE course_id = $1 AND hole_number >= $2 AND hole_number <= $3`,
      [courseId, from, to],
    );

    // Delete all hazards for these holes
    await query(
      `DELETE FROM hole_hazards WHERE hole_id IN (
         SELECT id FROM holes WHERE course_id = $1 AND hole_number >= $2 AND hole_number <= $3
       )`,
      [courseId, from, to],
    );

    await markPlansStale('Geofence data cleared', courseId);
    logger.info('Cleared geofence data', { courseId, from, to, rowCount });
    res.json({ cleared: rowCount });
  } catch (err) {
    logger.error('Failed to clear geofence data', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
