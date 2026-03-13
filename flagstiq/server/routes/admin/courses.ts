import { Router } from 'express';
import { query, pool, toCamel } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';
import { fetchElevations } from '../../services/elevation.js';
import { playsLikeYards } from '../../services/geo-utils.js';

const router = Router();

// POST /api/admin/courses/:id/refresh-elevation — re-fetch elevations and recompute playsLikeYards
router.post('/courses/:id/refresh-elevation', async (req, res) => {
  try {
    const courseId = req.params.id;

    // 1. Fetch all holes for the course
    const { rows: holeRows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );
    if (holeRows.length === 0) {
      return res.status(404).json({ error: 'Course not found or has no holes' });
    }

    const holes = holeRows.map(toCamel) as {
      id: string;
      holeNumber: number;
      tee: { lat: number; lng: number; elevation: number };
      pin: { lat: number; lng: number; elevation: number };
      targets: { index: number; coordinate: { lat: number; lng: number; elevation: number } }[];
      centerLine: { lat: number; lng: number; elevation: number }[];
      yardages: Record<string, number>;
      playsLikeYards: Record<string, number> | null;
    }[];

    // 2. Collect all coordinates
    const allCoords: { lat: number; lng: number }[] = [];
    for (const h of holes) {
      allCoords.push({ lat: h.tee.lat, lng: h.tee.lng });
      allCoords.push({ lat: h.pin.lat, lng: h.pin.lng });
      for (const t of h.targets) {
        allCoords.push({ lat: t.coordinate.lat, lng: t.coordinate.lng });
      }
      for (const c of h.centerLine) {
        allCoords.push({ lat: c.lat, lng: c.lng });
      }
    }

    // 3. Fetch elevations
    let elevMap: Map<string, number>;
    try {
      const elevations = await fetchElevations(allCoords);
      elevMap = new Map<string, number>();
      for (const e of elevations) {
        elevMap.set(`${e.lat},${e.lng}`, e.elevation);
      }
    } catch (err) {
      logger.error('Elevation fetch failed', { error: String(err) });
      return res.status(502).json({ error: 'Failed to fetch elevation data' });
    }

    const getElev = (coord: { lat: number; lng: number }) =>
      elevMap.get(`${coord.lat},${coord.lng}`) ?? 0;

    // 4. Update each hole
    const comparison: { holeNumber: number; before: Record<string, number> | null; after: Record<string, number> }[] = [];

    for (const h of holes) {
      const beforePlaysLike = h.playsLikeYards;
      const newTeeElev = getElev(h.tee);
      const newPinElev = getElev(h.pin);
      const elevDelta = newPinElev - newTeeElev;

      // Recompute plays-like per tee box
      const newPlaysLike: Record<string, number> = {};
      for (const [color, yards] of Object.entries(h.yardages)) {
        newPlaysLike[color] = playsLikeYards(yards, elevDelta);
      }

      // Update tee, pin elevation and plays_like_yards
      const updatedTee = { ...h.tee, elevation: newTeeElev };
      const updatedPin = { ...h.pin, elevation: newPinElev };
      const updatedTargets = h.targets.map((t) => ({
        ...t,
        coordinate: { ...t.coordinate, elevation: getElev(t.coordinate) },
      }));
      const updatedCenterLine = h.centerLine.map((c) => ({
        ...c,
        elevation: getElev(c),
      }));

      await query(
        `UPDATE course_holes
         SET tee = $1, pin = $2, targets = $3, center_line = $4, plays_like_yards = $5
         WHERE id = $6`,
        [
          JSON.stringify(updatedTee),
          JSON.stringify(updatedPin),
          JSON.stringify(updatedTargets),
          JSON.stringify(updatedCenterLine),
          JSON.stringify(newPlaysLike),
          h.id,
        ],
      );

      comparison.push({
        holeNumber: h.holeNumber,
        before: beforePlaysLike,
        after: newPlaysLike,
      });
    }

    await markPlansStale('Elevation data refreshed', courseId);
    res.json({ holes: comparison });
  } catch (err) {
    logger.error('Refresh elevation failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/courses/:id/scorecard — bulk update scorecard data (yardages, par, handicap)
router.post('/courses/:id/scorecard', async (req, res) => {
  const courseId = req.params.id;
  const { holes: holeData, course: courseMeta } = req.body as {
    holes: { holeNumber: number; yardages: Record<string, number>; par?: number; handicap?: number }[];
    course?: { par?: number; slope?: number; rating?: number; teeSets?: Record<string, { rating: number; slope: number; ratingWomen?: number; slopeWomen?: number }> };
  };

  if (!Array.isArray(holeData) || holeData.length === 0) {
    return res.status(400).json({ error: 'holes array is required' });
  }

  let client: import('pg').PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Update course-level metadata if provided
    if (courseMeta) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (courseMeta.par != null) { vals.push(courseMeta.par); sets.push(`par = $${vals.length}`); }
      if (courseMeta.slope != null) { vals.push(courseMeta.slope); sets.push(`slope = $${vals.length}`); }
      if (courseMeta.rating != null) { vals.push(courseMeta.rating); sets.push(`rating = $${vals.length}`); }
      if (courseMeta.teeSets != null) { vals.push(JSON.stringify(courseMeta.teeSets)); sets.push(`tee_sets = $${vals.length}`); }
      if (sets.length > 0) {
        vals.push(courseId);
        await client.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      }
    }

    // Load all holes once for elevation data (avoid N+1 queries)
    const { rows: allHoleRows } = await client.query(
      'SELECT hole_number, tee, pin FROM course_holes WHERE course_id = $1',
      [courseId],
    );
    const holeElevMap = new Map(allHoleRows.map(r => [r.hole_number as number, r]));

    for (const h of holeData) {
      const sets: string[] = [];
      const vals: unknown[] = [];

      vals.push(JSON.stringify(h.yardages));
      sets.push(`yardages = $${vals.length}`);

      if (h.par != null) {
        vals.push(h.par);
        sets.push(`par = $${vals.length}`);
      }
      if (h.handicap != null) {
        vals.push(h.handicap);
        sets.push(`handicap = $${vals.length}`);
      }

      // Recompute plays_like_yards using elevation delta
      const existingHole = holeElevMap.get(h.holeNumber);
      if (existingHole) {
        const teeData = existingHole.tee;
        const pinData = existingHole.pin;
        const elevDelta = (pinData?.elevation ?? 0) - (teeData?.elevation ?? 0);
        const playsLike: Record<string, number> = {};
        for (const [color, yards] of Object.entries(h.yardages)) {
          playsLike[color] = playsLikeYards(yards, elevDelta);
        }
        vals.push(JSON.stringify(playsLike));
        sets.push(`plays_like_yards = $${vals.length}`);
      }

      vals.push(courseId);
      vals.push(h.holeNumber);
      await client.query(
        `UPDATE course_holes SET ${sets.join(', ')} WHERE course_id = $${vals.length - 1} AND hole_number = $${vals.length}`,
        vals,
      );
    }

    await client.query('COMMIT');

    const { rows } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );
    await markPlansStale('Scorecard updated', courseId);
    res.json({ holes: rows.map(toCamel) });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* rollback best-effort */ }
    }
    logger.error('Scorecard update failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// POST /api/admin/courses/:id/fix-elevations — re-fetch missing elevations for all holes
router.post('/courses/:id/fix-elevations', async (req, res) => {
  try {
    const courseId = req.params.id;
    const { rows } = await query(
      'SELECT id, hole_number, tee, pin FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );

    const coords: { lat: number; lng: number }[] = [];
    const holeMap: { holeId: string; field: 'tee' | 'pin'; idx: number }[] = [];

    for (const row of rows) {
      const tee = row.tee as { lat: number; lng: number; elevation?: number };
      const pin = row.pin as { lat: number; lng: number; elevation?: number };
      if (tee.elevation == null) {
        holeMap.push({ holeId: row.id, field: 'tee', idx: coords.length });
        coords.push({ lat: Number(tee.lat), lng: Number(tee.lng) });
      }
      if (pin.elevation == null) {
        holeMap.push({ holeId: row.id, field: 'pin', idx: coords.length });
        coords.push({ lat: Number(pin.lat), lng: Number(pin.lng) });
      }
    }

    if (coords.length === 0) {
      return res.json({ fixed: 0, message: 'All holes already have elevation data' });
    }

    const elevResults = await fetchElevations(coords);

    for (const entry of holeMap) {
      const elev = elevResults[entry.idx].elevation;
      await query(
        `UPDATE course_holes SET ${entry.field} = jsonb_set(${entry.field}::jsonb, '{elevation}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify(elev), entry.holeId],
      );
    }

    await markPlansStale('Elevation data fixed', courseId);
    res.json({ fixed: coords.length, message: `Fixed elevation for ${coords.length} coordinates` });
  } catch (err) {
    logger.error('Failed to fix elevations', { error: String(err) });
    res.status(500).json({ error: 'Failed to fix elevations' });
  }
});

// PUT /api/admin/courses/:id/logo — upload or clear course logo
router.put('/courses/:id/logo', async (req, res) => {
  const courseId = req.params.id;
  const { logo } = req.body as { logo: string | null };

  // Allow null to clear
  if (logo !== null) {
    if (typeof logo !== 'string' || !logo.startsWith('data:')) {
      return res.status(400).json({ error: 'Logo must be a data URL or null' });
    }
    // Check size (~200KB limit for base64)
    if (logo.length > 300_000) {
      return res.status(400).json({ error: 'Logo too large (max ~200KB)' });
    }
  }

  try {
    const now = Date.now();
    const { rowCount } = await query(
      'UPDATE courses SET logo = $1, updated_at = $2 WHERE id = $3',
      [logo, now, courseId],
    );
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Course not found' });
    }
    const { rows } = await query('SELECT * FROM courses WHERE id = $1', [courseId]);
    res.json(toCamel(rows[0]));
  } catch (err) {
    logger.error('Course logo update failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
