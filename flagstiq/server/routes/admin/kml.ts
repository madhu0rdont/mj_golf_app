import { Router } from 'express';
import multer from 'multer';
import { query, pool, toCamel, toSnake } from '../../db.js';
import { logger } from '../../logger.js';
import { parseKml, type ParsedHole } from '../../services/kml-parser.js';
import { fetchElevations } from '../../services/elevation.js';
import {
  playsLikeYards,
  computeTargetDistances,
} from '../../services/geo-utils.js';
import { loadCourseHoles } from '../../services/hole-loader.js';

const router = Router();

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

    // Insert holes into normalized tables
    for (const h of parsedHoles) {
      const teeElev = getElev(h.tee);
      const pinElev = getElev(h.pin);
      const elevDelta = pinElev - teeElev;

      // Scorecard yardages for this hole (from user input)
      const teeBoxYardages = scorecard?.[h.holeNumber] ?? {};

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

      // 1. Insert into holes table
      const holeId = crypto.randomUUID();
      await client.query(
        `INSERT INTO holes (id, course_id, hole_number, par, handicap, heading, notes, center_line, targets, fairway, green)
         VALUES ($1, $2, $3, $4, NULL, $5, NULL, $6, $7, '[]'::jsonb, '[]'::jsonb)`,
        [holeId, courseId, h.holeNumber, h.par, h.heading, JSON.stringify(enrichedCenterLine), JSON.stringify(enrichedTargets)],
      );

      // 2. Insert hole_tees (one per tee box from scorecard)
      const entries = Object.entries(teeBoxYardages);
      if (entries.length > 0) {
        for (const [teeName, yards] of entries) {
          const ply = playsLikeYards(yards, elevDelta);
          await client.query(
            `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, elevation, yardage, plays_like_yardage)
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)`,
            [holeId, teeName, h.tee.lat, h.tee.lng, teeElev, yards, ply],
          );
        }
      } else {
        // No scorecard yardages — create a default tee entry
        await client.query(
          `INSERT INTO hole_tees (id, hole_id, tee_name, lat, lng, elevation, yardage)
           VALUES (gen_random_uuid()::text, $1, 'default', $2, $3, $4, 0)`,
          [holeId, h.tee.lat, h.tee.lng, teeElev],
        );
      }

      // 3. Insert default pin
      await client.query(
        `INSERT INTO hole_pins (id, hole_id, pin_name, lat, lng, elevation, is_default)
         VALUES (gen_random_uuid()::text, $1, 'default', $2, $3, $4, true)`,
        [holeId, h.pin.lat, h.pin.lng, pinElev],
      );
    }

    await client.query('COMMIT');

    // Return created course with holes
    const { rows: courseResult } = await query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId],
    );
    const holes = await loadCourseHoles(courseId);

    res.status(201).json({
      ...toCamel(courseResult[0]),
      holes,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Import confirm failed', { error: String(err) });
    res.status(500).json({ error: 'Course import failed' });
  } finally {
    client.release();
  }
});

export default router;
