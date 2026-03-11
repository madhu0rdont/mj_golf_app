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

import { requireAdmin } from '../middleware/auth.js';

const router = Router();
router.use(requireAdmin);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/vnd.google-earth.kml+xml', 'application/xml', 'text/xml'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.kml')) {
      cb(null, true);
    } else {
      cb(new Error('Only KML files are allowed'));
    }
  },
});

// --- Types ---

interface ConfirmBody {
  course: {
    name: string;
    par?: number;
    slope?: number;
    rating?: number;
    designers?: string[];
    teeSets?: Record<string, { rating: number; slope: number; ratingWomen?: number; slopeWomen?: number }>;
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
    res.status(400).json({ error: `KML parse error: ${message}` });
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
    logger.error('Elevation fetch failed', { error: String(err) });
    return res.status(502).json({ error: 'Failed to fetch elevation data' });
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
    res.status(500).json({ error: 'Course import failed' });
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

    // 1. Batch upsert all penalties in one query
    if (penalties.length > 0) {
      const placeholders = penalties.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
      const values = penalties.flatMap(({ type, penalty }) => [type, penalty, now]);
      await client.query(
        `INSERT INTO hazard_penalties (type, penalty, updated_at) VALUES ${placeholders.join(', ')}
         ON CONFLICT (type) DO UPDATE SET penalty = EXCLUDED.penalty, updated_at = EXCLUDED.updated_at`,
        values,
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
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// PATCH /api/courses/:id/holes/:number — update hole fields
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

// GET /api/admin/usage — API usage and spend dashboard data
router.get('/usage', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days as string) || 30));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    // Summary by service
    const { rows: summaryRows } = await query(
      `SELECT service,
              COUNT(*)::int AS calls,
              COALESCE(SUM(estimated_cost), 0) AS total_cost,
              COALESCE(SUM(input_tokens), 0)::int AS input_tokens,
              COALESCE(SUM(output_tokens), 0)::int AS output_tokens,
              COALESCE(SUM(items), 0)::int AS total_items,
              COALESCE(SUM(api_calls), 0)::int AS total_api_calls
       FROM api_usage
       WHERE created_at >= $1
       GROUP BY service`,
      [since],
    );

    const summary: Record<string, unknown> = {};
    let totalCost = 0;
    for (const row of summaryRows) {
      summary[row.service] = {
        calls: row.calls,
        totalCost: parseFloat(row.total_cost),
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        totalItems: row.total_items,
        totalApiCalls: row.total_api_calls,
      };
      totalCost += parseFloat(row.total_cost);
    }

    // Daily breakdown
    const { rows: dailyRows } = await query(
      `SELECT
         TO_CHAR(TO_TIMESTAMP(created_at / 1000), 'YYYY-MM-DD') AS date,
         service,
         COALESCE(SUM(estimated_cost), 0) AS cost
       FROM api_usage
       WHERE created_at >= $1
       GROUP BY date, service
       ORDER BY date`,
      [since],
    );

    // Pivot daily rows into { date, claude, google_elevation, resend }
    const dailyMap = new Map<string, Record<string, number>>();
    for (const row of dailyRows) {
      if (!dailyMap.has(row.date)) dailyMap.set(row.date, { claude: 0, google_elevation: 0, resend: 0 });
      dailyMap.get(row.date)![row.service] = parseFloat(row.cost);
    }
    const daily = Array.from(dailyMap.entries()).map(([date, costs]) => ({ date, ...costs }));

    // Recent entries
    const { rows: recentRows } = await query(
      `SELECT u.id, u.service, u.endpoint, u.user_id,
              us.username, u.input_tokens, u.output_tokens,
              u.items, u.api_calls, u.estimated_cost, u.created_at
       FROM api_usage u
       LEFT JOIN users us ON us.id = u.user_id
       WHERE u.created_at >= $1
       ORDER BY u.created_at DESC
       LIMIT 50`,
      [since],
    );

    res.json({
      summary: { ...summary, totalCost },
      daily,
      recent: recentRows.map(toCamel),
    });
  } catch (err) {
    logger.error('Failed to fetch usage data', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/admin/railway-usage — estimated Railway spend for current billing cycle
const RAILWAY_PROJECT_ID = '7fd20f07-7e08-43d4-aa1e-065a955a91d6';
const RAILWAY_GQL = 'https://backboard.railway.com/graphql/v2';
// Per-unit rates from Railway pricing (https://docs.railway.com/pricing)
const RAILWAY_RATES: Record<string, number> = {
  CPU_USAGE: 20 / 43200,        // $20/vCPU-month, usage in vCPU-minutes
  MEMORY_USAGE_GB: 10 / 43200,  // $10/GB-month, usage in GB-minutes
  DISK_USAGE_GB: 0.15 / 720,    // $0.15/GB-month, usage in GB-hours
  NETWORK_TX_GB: 0.05,          // $0.05/GB
};

let railwayCache: { data: unknown; ts: number } | null = null;
const RAILWAY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/railway-usage', async (_req, res) => {
  const token = process.env.RAILWAY_API_TOKEN;
  if (!token) {
    return res.json({ estimatedCost: null });
  }

  // Return cached result if fresh
  if (railwayCache && Date.now() - railwayCache.ts < RAILWAY_CACHE_TTL) {
    return res.json(railwayCache.data);
  }

  try {
    const measurements = Object.keys(RAILWAY_RATES);
    const resp = await fetch(RAILWAY_GQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `{ estimatedUsage(projectId: "${RAILWAY_PROJECT_ID}", measurements: [${measurements.join(', ')}]) { measurement estimatedValue } }`,
      }),
    });

    const json = await resp.json() as { data?: { estimatedUsage: { measurement: string; estimatedValue: number }[] }; errors?: unknown[] };
    if (json.errors || !json.data) {
      logger.error('Railway API error', { errors: json.errors });
      return res.json({ estimatedCost: null });
    }

    const breakdown: Record<string, number> = {};
    let estimatedCost = 0;
    for (const entry of json.data.estimatedUsage) {
      const rate = RAILWAY_RATES[entry.measurement];
      if (rate != null) {
        const cost = entry.estimatedValue * rate;
        const key = entry.measurement.replace(/_USAGE|_GB/g, '').toLowerCase();
        breakdown[key] = (breakdown[key] ?? 0) + cost;
        estimatedCost += cost;
      }
    }

    const result = { estimatedCost, breakdown };
    railwayCache = { data: result, ts: Date.now() };
    res.json(result);
  } catch (err) {
    logger.error('Failed to fetch Railway usage', { error: String(err) });
    res.json({ estimatedCost: null });
  }
});

export default router;
