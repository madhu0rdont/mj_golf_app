import { Router } from 'express';
import { query, pool, toCamel } from '../../db.js';
import { logger } from '../../logger.js';
import { markPlansStale } from '../game-plans.js';
import { fetchElevations } from '../../services/elevation.js';
import { playsLikeYards } from '../../services/geo-utils.js';
import { loadCourseHoles } from '../../services/hole-loader.js';

const router = Router();

// POST /api/admin/courses/:id/refresh-elevation — re-fetch elevations and recompute playsLikeYards
router.post('/courses/:id/refresh-elevation', async (req, res) => {
  try {
    const courseId = req.params.id;

    // 1. Load holes (for targets + center_line) and tees/pins (for positions)
    const { rows: holeRows } = await query(
      'SELECT id, hole_number, targets, center_line FROM holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );
    if (holeRows.length === 0) {
      return res.status(404).json({ error: 'Course not found or has no holes' });
    }

    const holeIds = holeRows.map((r: { id: string }) => r.id);
    const { rows: teeRows } = await query(
      'SELECT id, hole_id, tee_name, lat, lng, elevation, yardage, plays_like_yardage FROM hole_tees WHERE hole_id = ANY($1)',
      [holeIds],
    );
    const { rows: pinRows } = await query(
      'SELECT id, hole_id, lat, lng, elevation FROM hole_pins WHERE hole_id = ANY($1) AND is_default = true',
      [holeIds],
    );

    // Group by hole_id
    const teesByHole = new Map<string, typeof teeRows>();
    for (const t of teeRows) {
      const list = teesByHole.get(t.hole_id as string) || [];
      list.push(t);
      teesByHole.set(t.hole_id as string, list);
    }
    const pinByHole = new Map<string, (typeof pinRows)[0]>();
    for (const p of pinRows) pinByHole.set(p.hole_id as string, p);

    // 2. Collect all coordinates for elevation lookup
    const allCoords: { lat: number; lng: number }[] = [];
    for (const h of holeRows) {
      // Tee positions (use first tee per hole for coordinate — all tees currently share position)
      const tees = teesByHole.get(h.id as string) || [];
      if (tees.length > 0) allCoords.push({ lat: Number(tees[0].lat), lng: Number(tees[0].lng) });

      // Pin position
      const pin = pinByHole.get(h.id as string);
      if (pin) allCoords.push({ lat: Number(pin.lat), lng: Number(pin.lng) });

      // Targets
      const targets = h.targets as { index: number; coordinate: { lat: number; lng: number } }[] ?? [];
      for (const t of targets) allCoords.push({ lat: t.coordinate.lat, lng: t.coordinate.lng });

      // Center line
      const centerLine = h.center_line as { lat: number; lng: number }[] ?? [];
      for (const c of centerLine) allCoords.push({ lat: c.lat, lng: c.lng });
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

    // 4. Update each hole's data
    const comparison: { holeNumber: number; before: Record<string, number> | null; after: Record<string, number> }[] = [];

    for (const h of holeRows) {
      const holeId = h.id as string;
      const tees = teesByHole.get(holeId) || [];
      const pin = pinByHole.get(holeId);

      // Build before playsLike
      const beforePlaysLike: Record<string, number> = {};
      for (const t of tees) {
        if (t.plays_like_yardage != null) beforePlaysLike[t.tee_name as string] = t.plays_like_yardage as number;
      }

      // New elevations
      const newTeeElev = tees.length > 0 ? getElev({ lat: Number(tees[0].lat), lng: Number(tees[0].lng) }) : 0;
      const newPinElev = pin ? getElev({ lat: Number(pin.lat), lng: Number(pin.lng) }) : 0;
      const elevDelta = newPinElev - newTeeElev;

      // Update tee elevation + recompute plays_like per tee
      const newPlaysLike: Record<string, number> = {};
      for (const t of tees) {
        const ply = playsLikeYards(t.yardage as number, elevDelta);
        newPlaysLike[t.tee_name as string] = ply;
        await query(
          'UPDATE hole_tees SET elevation = $1, plays_like_yardage = $2 WHERE id = $3',
          [newTeeElev, ply, t.id],
        );
      }

      // Update pin elevation
      if (pin) {
        await query('UPDATE hole_pins SET elevation = $1 WHERE id = $2', [newPinElev, pin.id]);
      }

      // Update targets + center_line with new elevations
      const targets = h.targets as { index: number; coordinate: { lat: number; lng: number; elevation: number } }[] ?? [];
      const updatedTargets = targets.map((t) => ({
        ...t,
        coordinate: { ...t.coordinate, elevation: getElev(t.coordinate) },
      }));
      const centerLine = h.center_line as { lat: number; lng: number; elevation: number }[] ?? [];
      const updatedCenterLine = centerLine.map((c) => ({
        ...c,
        elevation: getElev(c),
      }));

      await query(
        'UPDATE holes SET targets = $1, center_line = $2 WHERE id = $3',
        [JSON.stringify(updatedTargets), JSON.stringify(updatedCenterLine), holeId],
      );

      comparison.push({
        holeNumber: h.hole_number as number,
        before: Object.keys(beforePlaysLike).length > 0 ? beforePlaysLike : null,
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

    // Load holes and tees for elevation data
    const { rows: allHoleRows } = await client.query(
      'SELECT id, hole_number FROM holes WHERE course_id = $1',
      [courseId],
    );
    const holeIdMap = new Map(allHoleRows.map(r => [r.hole_number as number, r.id as string]));
    const holeIds = allHoleRows.map(r => r.id as string);

    // Load tee + pin elevations for plays_like_yards calculation
    const { rows: teeElevRows } = await client.query(
      'SELECT hole_id, elevation FROM hole_tees WHERE hole_id = ANY($1) LIMIT 1',
      [holeIds],
    );
    const { rows: pinElevRows } = await client.query(
      'SELECT hole_id, elevation FROM hole_pins WHERE hole_id = ANY($1) AND is_default = true',
      [holeIds],
    );
    const teeElevByHole = new Map(teeElevRows.map(r => [r.hole_id as string, (r.elevation as number) ?? 0]));
    const pinElevByHole = new Map(pinElevRows.map(r => [r.hole_id as string, (r.elevation as number) ?? 0]));

    for (const h of holeData) {
      const holeId = holeIdMap.get(h.holeNumber);
      if (!holeId) continue;

      // Update holes table (par, handicap)
      const holeSets: string[] = [];
      const holeVals: unknown[] = [];
      if (h.par != null) {
        holeVals.push(h.par);
        holeSets.push(`par = $${holeVals.length}`);
      }
      if (h.handicap != null) {
        holeVals.push(h.handicap);
        holeSets.push(`handicap = $${holeVals.length}`);
      }
      if (holeSets.length > 0) {
        holeVals.push(holeId);
        await client.query(`UPDATE holes SET ${holeSets.join(', ')} WHERE id = $${holeVals.length}`, holeVals);
      }

      // Compute elevation delta for plays_like
      const teeElev = teeElevByHole.get(holeId) ?? 0;
      const pinElev = pinElevByHole.get(holeId) ?? 0;
      const elevDelta = pinElev - teeElev;

      // Upsert hole_tees (one per tee box)
      // Get existing tee position for new entries
      const { rows: existingTees } = await client.query(
        'SELECT lat, lng, elevation FROM hole_tees WHERE hole_id = $1 LIMIT 1',
        [holeId],
      );
      const pos = existingTees[0] ?? { lat: 0, lng: 0, elevation: 0 };

      for (const [teeName, yards] of Object.entries(h.yardages)) {
        const ply = playsLikeYards(yards, elevDelta);
        await client.query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, elevation, yardage, plays_like_yardage)
           VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (hole_id, tee_name) DO UPDATE SET yardage = $6, plays_like_yardage = $7`,
          [holeId, teeName, pos.lat, pos.lng, pos.elevation, yards, ply],
        );
      }
    }

    await client.query('COMMIT');

    const holes = await loadCourseHoles(courseId);
    await markPlansStale('Scorecard updated', courseId);
    res.json({ holes });
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

    // Find tees and pins missing elevation
    const { rows: holeRows } = await query(
      'SELECT id FROM holes WHERE course_id = $1',
      [courseId],
    );
    if (holeRows.length === 0) {
      return res.status(404).json({ error: 'Course not found or has no holes' });
    }
    const holeIds = holeRows.map(r => r.id as string);

    const { rows: teeRows } = await query(
      'SELECT id, lat, lng FROM hole_tees WHERE hole_id = ANY($1) AND (elevation IS NULL OR elevation = 0)',
      [holeIds],
    );
    const { rows: pinRows } = await query(
      'SELECT id, lat, lng FROM hole_pins WHERE hole_id = ANY($1) AND (elevation IS NULL OR elevation = 0)',
      [holeIds],
    );

    const coords: { lat: number; lng: number }[] = [];
    const updateMap: { id: string; table: string; idx: number }[] = [];
    for (const row of teeRows) {
      updateMap.push({ id: row.id as string, table: 'hole_tees', idx: coords.length });
      coords.push({ lat: Number(row.lat), lng: Number(row.lng) });
    }
    for (const row of pinRows) {
      updateMap.push({ id: row.id as string, table: 'hole_pins', idx: coords.length });
      coords.push({ lat: Number(row.lat), lng: Number(row.lng) });
    }

    if (coords.length === 0) {
      return res.json({ fixed: 0, message: 'All holes already have elevation data' });
    }

    const elevResults = await fetchElevations(coords);

    for (const entry of updateMap) {
      const elev = elevResults[entry.idx].elevation;
      await query(
        `UPDATE ${entry.table} SET elevation = $1 WHERE id = $2`,
        [elev, entry.id],
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
