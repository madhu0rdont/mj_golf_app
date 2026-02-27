import { Router } from 'express';
import multer from 'multer';
import { query, pool, toCamel, toSnake } from '../db.js';
import { parseKml, type ParsedHole } from '../services/kml-parser.js';
import { fetchElevations } from '../services/elevation.js';
import {
  haversineYards,
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
    console.error('Import confirm failed:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Import failed: ${message}` });
  } finally {
    client.release();
  }
});

// PATCH /api/courses/:id/holes/:number — update hole fields
router.patch('/:id/holes/:number', async (req, res) => {
  const ALLOWED_FIELDS = ['hazards', 'fairway', 'notes', 'targets', 'plays_like_yards'];
  const updates = toSnake(req.body);

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (!ALLOWED_FIELDS.includes(key)) continue;
    values.push(key === 'notes' ? val : JSON.stringify(val));
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
  res.json(toCamel(rows[0]));
});

export default router;
