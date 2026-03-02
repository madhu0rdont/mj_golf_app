import { Router } from 'express';
import multer from 'multer';
import { query, pool, toCamel, toSnake } from '../db.js';
import { logger } from '../logger.js';
import { markPlansStale } from './game-plans.js';
import { parseKml, type ParsedHole } from '../services/kml-parser.js';
import { fetchElevations } from '../services/elevation.js';
import {
  playsLikeYards,
  computeTargetDistances,
} from '../services/geo-utils.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// --- Types ---

interface ConfirmBody {
  course: {
    name: string;
    par?: number;
    slope?: number;
    rating?: number;
    designers?: string[];
  };
  scorecard: Record<number, Record<string, number>>; // { 1: { blue: 439, white: 427 }, ... }
  holes: ParsedHole[];
}

// --- Routes ---

// POST /api/admin/import-kml — upload and parse KML file
router.post('/import-kml', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const kmlText = req.file.buffer.toString('utf-8');
    const parsed = parseKml(kmlText);
    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse KML';
    res.status(400).json({ error: message });
  }
});

// POST /api/admin/import-kml/confirm — enrich with elevation and save to DB
router.post('/import-kml/confirm', async (req, res) => {
  const { course: courseMeta, scorecard, holes: parsedHoles } = req.body as ConfirmBody;

  if (!courseMeta?.name) {
    return res.status(400).json({ error: 'Course name is required' });
  }
  if (!Array.isArray(parsedHoles) || parsedHoles.length === 0) {
    return res.status(400).json({ error: 'No holes provided' });
  }

  // 1. Collect all unique coordinates for elevation lookup
  const allCoords: { lat: number; lng: number }[] = [];
  for (const h of parsedHoles) {
    allCoords.push({ lat: h.tee.lat, lng: h.tee.lng });
    allCoords.push({ lat: h.pin.lat, lng: h.pin.lng });
    for (const t of h.targets) {
      allCoords.push({ lat: t.coordinate.lat, lng: t.coordinate.lng });
    }
    for (const c of h.centerLine) {
      allCoords.push({ lat: c.lat, lng: c.lng });
    }
  }

  // 2. Fetch elevations from Google
  let elevMap: Map<string, number>;
  try {
    const elevations = await fetchElevations(allCoords);
    elevMap = new Map<string, number>();
    for (const e of elevations) {
      elevMap.set(`${e.lat},${e.lng}`, e.elevation);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Elevation fetch failed';
    return res.status(502).json({ error: message });
  }

  const getElev = (coord: { lat: number; lng: number }) =>
    elevMap.get(`${coord.lat},${coord.lng}`) ?? 0;

  // 3. Insert course and holes in a transaction
  const courseId = crypto.randomUUID();
  const now = Date.now();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert course
    const courseSnake = toSnake({
      id: courseId,
      name: courseMeta.name,
      par: courseMeta.par ?? null,
      slope: courseMeta.slope ?? null,
      rating: courseMeta.rating ?? null,
      designers: courseMeta.designers ?? [],
      createdAt: now,
      updatedAt: now,
    });
    const cKeys = Object.keys(courseSnake);
    const cVals = Object.values(courseSnake);
    const cPlaceholders = cKeys.map((_, i) => `$${i + 1}`);
    await client.query(
      `INSERT INTO courses (${cKeys.join(', ')}) VALUES (${cPlaceholders.join(', ')})`,
      cVals,
    );

    // Insert holes
    for (const h of parsedHoles) {
      const teeElev = getElev(h.tee);
      const pinElev = getElev(h.pin);
      const elevDelta = pinElev - teeElev;

      // Scorecard yardages for this hole (from user input)
      const teeBoxYardages = scorecard?.[h.holeNumber] ?? {};

      // Compute plays-like yardages per tee box
      const playsLike: Record<string, number> = {};
      for (const [color, yards] of Object.entries(teeBoxYardages)) {
        playsLike[color] = playsLikeYards(yards, elevDelta);
      }

      // Enrich targets with elevation and distances
      const enrichedTargets = computeTargetDistances(
        h.tee,
        h.pin,
        h.targets.map((t) => ({
          index: t.index,
          coordinate: {
            lat: t.coordinate.lat,
            lng: t.coordinate.lng,
            elevation: getElev(t.coordinate),
          },
        })),
      );

      // Enrich center line with elevation
      const enrichedCenterLine = h.centerLine.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        elevation: getElev(c),
      }));

      const holeSnake = toSnake({
        id: crypto.randomUUID(),
        courseId,
        holeNumber: h.holeNumber,
        par: h.par,
        heading: h.heading,
        notes: null,
      });

      // JSONB fields must be stringified explicitly
      const allKeys = [
        ...Object.keys(holeSnake),
        'yardages',
        'tee',
        'pin',
        'targets',
        'center_line',
        'hazards',
        'fairway',
        'plays_like_yards',
      ];
      const allVals = [
        ...Object.values(holeSnake),
        JSON.stringify(teeBoxYardages),
        JSON.stringify({ lat: h.tee.lat, lng: h.tee.lng, elevation: teeElev }),
        JSON.stringify({ lat: h.pin.lat, lng: h.pin.lng, elevation: pinElev }),
        JSON.stringify(enrichedTargets),
        JSON.stringify(enrichedCenterLine),
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify(playsLike),
      ];
      const hPlaceholders = allKeys.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO course_holes (${allKeys.join(', ')}) VALUES (${hPlaceholders.join(', ')})`,
        allVals,
      );
    }

    await client.query('COMMIT');

    // Return created course with holes
    const { rows: courseResult } = await query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId],
    );
    const { rows: holeResults } = await query(
      'SELECT * FROM course_holes WHERE course_id = $1 ORDER BY hole_number',
      [courseId],
    );

    res.status(201).json({
      ...toCamel(courseResult[0]),
      holes: holeResults.map(toCamel),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Import confirm failed', { error: String(err) });
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Import failed: ${message}` });
  } finally {
    client.release();
  }
});


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
      const message = err instanceof Error ? err.message : 'Elevation fetch failed';
      return res.status(502).json({ error: message });
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
    course?: { par?: number; slope?: number; rating?: number };
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
      if (sets.length > 0) {
        vals.push(courseId);
        await client.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      }
    }

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
      const { rows: holeRows } = await client.query(
        'SELECT tee, pin FROM course_holes WHERE course_id = $1 AND hole_number = $2',
        [courseId, h.holeNumber],
      );
      if (holeRows.length > 0) {
        const teeData = holeRows[0].tee;
        const pinData = holeRows[0].pin;
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

// GET /api/admin/hazard-penalties — return global hazard penalties
router.get('/hazard-penalties', async (_req, res) => {
  const { rows } = await query('SELECT type, penalty FROM hazard_penalties ORDER BY type');
  res.json(rows);
});

// PUT /api/admin/hazard-penalties — update global hazard penalties
router.put('/hazard-penalties', async (req, res) => {
  const { penalties } = req.body as { penalties: { type: string; penalty: number }[] };
  if (!Array.isArray(penalties) || penalties.length === 0) {
    return res.status(400).json({ error: 'penalties array is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const now = Date.now();

    // 1. Upsert each penalty
    for (const { type, penalty } of penalties) {
      await client.query(
        `INSERT INTO hazard_penalties (type, penalty, updated_at) VALUES ($1, $2, $3)
         ON CONFLICT (type) DO UPDATE SET penalty = $2, updated_at = $3`,
        [type, penalty, now],
      );
    }

    // 2. Build penalty map for bulk-updating course hazards
    const penaltyMap = new Map(penalties.map((p) => [p.type, p.penalty]));

    // 3. Update all course_holes hazard objects with new penalty values
    const { rows: holeRows } = await client.query('SELECT id, hazards FROM course_holes WHERE hazards IS NOT NULL');
    for (const row of holeRows) {
      const hazards = row.hazards as { type: string; penalty: number }[];
      if (!Array.isArray(hazards) || hazards.length === 0) continue;

      let changed = false;
      const updated = hazards.map((h) => {
        const newPenalty = penaltyMap.get(h.type);
        if (newPenalty !== undefined && newPenalty !== h.penalty) {
          changed = true;
          return { ...h, penalty: newPenalty };
        }
        return h;
      });

      if (changed) {
        await client.query('UPDATE course_holes SET hazards = $1 WHERE id = $2', [
          JSON.stringify(updated),
          row.id,
        ]);
      }
    }

    await client.query('COMMIT');

    // 4. Mark all game plans stale
    await markPlansStale('Hazard penalties updated');

    // 5. Return updated penalties
    const { rows: result } = await query('SELECT type, penalty FROM hazard_penalties ORDER BY type');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Hazard penalty update failed', { error: String(err) });
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});

// PATCH /api/courses/:id/holes/:number — update hole fields
router.patch('/:id/holes/:number', async (req, res) => {
  const ALLOWED_FIELDS = ['hazards', 'fairway', 'green', 'notes', 'targets', 'plays_like_yards', 'yardages', 'handicap', 'par'];
  const updates = toSnake(req.body);

  const setClauses: string[] = [];
  const values: unknown[] = [];

  const SCALAR_FIELDS = ['notes', 'handicap', 'par'];
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
