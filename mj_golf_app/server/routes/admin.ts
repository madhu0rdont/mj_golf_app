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
import {
  computeZoom,
  latLngToImagePixel,
  imagePixelToLatLng,
} from '../services/web-mercator.js';

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

// POST /api/admin/hazard-detect — detect hazards via satellite imagery + Claude Vision
router.post('/hazard-detect', async (req, res) => {
  const { courseId, holeNumber } = req.body;
  if (!courseId || holeNumber == null) {
    return res.status(400).json({ error: 'courseId and holeNumber are required' });
  }

  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
  }
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!mapsKey) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not configured' });
  }

  // 1. Fetch hole data
  const { rows } = await query(
    'SELECT * FROM course_holes WHERE course_id = $1 AND hole_number = $2',
    [courseId, holeNumber],
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Hole not found' });
  }
  const hole = toCamel(rows[0]) as {
    par: number;
    yardages: Record<string, number>;
    heading: number;
    tee: { lat: number; lng: number; elevation: number };
    pin: { lat: number; lng: number; elevation: number };
  };

  // 2. Compute satellite image parameters — tight crop to minimize adjacent hole bleed
  const PADDING_DEG = 0.001; // ~110m — enough for hazards flanking this hole only
  const bounds = {
    minLat: Math.min(hole.tee.lat, hole.pin.lat) - PADDING_DEG,
    maxLat: Math.max(hole.tee.lat, hole.pin.lat) + PADDING_DEG,
    minLng: Math.min(hole.tee.lng, hole.pin.lng) - PADDING_DEG,
    maxLng: Math.max(hole.tee.lng, hole.pin.lng) + PADDING_DEG,
  };
  const IMAGE_SIZE = 640; // scale=2 gives 1280×1280 actual pixels
  const ACTUAL_SIZE = IMAGE_SIZE * 2;
  const zoom = computeZoom(bounds, ACTUAL_SIZE);
  const centerLat = (hole.tee.lat + hole.pin.lat) / 2;
  const centerLng = (hole.tee.lng + hole.pin.lng) / 2;

  // 3. Fetch satellite image from Google Static Maps
  const staticUrl = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=${zoom}&size=${IMAGE_SIZE}x${IMAGE_SIZE}&scale=2&maptype=satellite&key=${mapsKey}`;

  let imageBase64: string;
  try {
    const imgRes = await fetch(staticUrl);
    if (!imgRes.ok) {
      throw new Error(`Static Maps HTTP ${imgRes.status}`);
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    imageBase64 = buffer.toString('base64');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch satellite image';
    return res.status(502).json({ error: message });
  }

  // 4. Convert tee/pin to pixel coordinates
  const teePx = latLngToImagePixel(hole.tee.lat, hole.tee.lng, centerLat, centerLng, zoom, ACTUAL_SIZE, ACTUAL_SIZE);
  const pinPx = latLngToImagePixel(hole.pin.lat, hole.pin.lng, centerLat, centerLng, zoom, ACTUAL_SIZE, ACTUAL_SIZE);

  const firstTee = Object.keys(hole.yardages)[0];
  const yards = firstTee ? hole.yardages[firstTee] : 0;

  // 5. Compute center line pixels for the prompt
  const centerLinePx = (hole as { centerLine?: { lat: number; lng: number }[] }).centerLine
    ?.slice(0, 6)
    .map((c: { lat: number; lng: number }) =>
      latLngToImagePixel(c.lat, c.lng, centerLat, centerLng, zoom, ACTUAL_SIZE, ACTUAL_SIZE),
    ) ?? [];
  const clPixelStr = centerLinePx.map((p: { x: number; y: number }) => `(${p.x},${p.y})`).join(' → ');

  // 5b. Send to Claude Vision
  const systemPrompt = `You are a golf course feature detection assistant analyzing satellite imagery of a SINGLE golf hole.

CRITICAL RULES:
- ONLY detect features that belong to THIS specific hole (tee to pin along the center line).
- Do NOT include bunkers, greens, or features from adjacent/neighboring holes visible in the image.
- Trace each feature's actual boundary tightly — bunkers are typically 5-25 yards across, not 40-50.
- Each bunker should be its own separate polygon. Do not merge nearby bunkers into one large polygon.
- The putting green is the smooth, closely-mowed circular/oval area immediately surrounding the pin.

Return ONLY valid JSON — no markdown fences, no other text.
Use this exact structure:
{
  "hazards": [
    {
      "name": "descriptive name",
      "type": "bunker" or "water" or "ob" or "trees" or "rough" or "green",
      "confidence": "high" or "medium" or "low",
      "polygon": [{"x": number, "y": number}, ...]
    }
  ],
  "fairway": [{"x": number, "y": number}, ...]
}
Coordinates are image pixels where (0,0) is top-left and (${ACTUAL_SIZE},${ACTUAL_SIZE}) is bottom-right.
Each polygon must have at least 4 points and trace the actual outline of the feature tightly.
For "green", trace the putting surface — the distinctly lighter/smoother green area around the pin.
For "rough", trace the thicker/darker grass areas flanking this hole's fairway.
For "trees", trace significant tree lines that border THIS hole only.
For "ob", trace boundaries where the course ends (roads, fences, property lines).
For the fairway, trace the mowed fairway corridor from tee to green for THIS hole only.`;

  const userPrompt = `Analyze this satellite image of hole ${holeNumber}, a par ${hole.par} playing ${yards} yards.
The tee is at pixel (${teePx.x}, ${teePx.y}). The pin is at pixel (${pinPx.x}, ${pinPx.y}).
The hole plays at heading ${Math.round(hole.heading)}°.${clPixelStr ? `\nThe center line runs: ${clPixelStr}` : ''}

IMPORTANT: Only detect features that belong to THIS hole. Other holes may be visible — ignore them.
Trace polygons tightly around each feature's actual boundary. Individual bunkers should be separate polygons.`;

  let claudeResponse: { hazards: { name: string; type: string; confidence: string; polygon: { x: number; y: number }[] }[]; fairway: { x: number; y: number }[] };

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: imageBase64,
                },
              },
              { type: 'text', text: userPrompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let text = data.content?.[0]?.text ?? '';

    // Strip markdown code fences if present
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

    claudeResponse = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claude Vision failed';
    return res.status(502).json({ error: message });
  }

  // 6. Validate and convert pixel polygons to GPS coordinates
  const GREENSIDE_THRESHOLD_YARDS = 40; // bunkers within 40y of pin are greenside
  const allHazards = (claudeResponse.hazards ?? [])
    .filter((h) => Array.isArray(h.polygon) && h.polygon.length >= 3)
    .filter((h) => ['bunker', 'water', 'ob', 'trees', 'rough', 'green'].includes(h.type))
    .map((h) => {
      const polygon = h.polygon
        .filter((p) => p.x >= 0 && p.x <= ACTUAL_SIZE && p.y >= 0 && p.y <= ACTUAL_SIZE)
        .map((p) => imagePixelToLatLng(p.x, p.y, centerLat, centerLng, zoom, ACTUAL_SIZE, ACTUAL_SIZE));

      // Auto-classify bunkers as fairway or greenside based on distance to pin
      let resolvedType = h.type;
      let penalty = ({ water: 1, ob: 1, bunker: 0.4, trees: 0.5, rough: 0.2 } as Record<string, number>)[h.type] ?? 0;
      if (h.type === 'bunker' && polygon.length >= 3) {
        const centroid = {
          lat: polygon.reduce((s, p) => s + p.lat, 0) / polygon.length,
          lng: polygon.reduce((s, p) => s + p.lng, 0) / polygon.length,
        };
        const distToPin = haversineYards(centroid, { lat: hole.pin.lat, lng: hole.pin.lng });
        if (distToPin <= GREENSIDE_THRESHOLD_YARDS) {
          resolvedType = 'greenside_bunker';
          penalty = 0.5;
        } else {
          resolvedType = 'fairway_bunker';
          penalty = 0.3;
        }
      }

      return {
        name: h.name || 'Unknown',
        type: resolvedType as 'bunker' | 'fairway_bunker' | 'greenside_bunker' | 'water' | 'ob' | 'trees' | 'rough' | 'green',
        penalty,
        confidence: (['high', 'medium', 'low'].includes(h.confidence) ? h.confidence : 'medium') as 'high' | 'medium' | 'low',
        source: 'claude-vision' as const,
        status: 'pending' as const,
        polygon,
      };
    })
    .filter((h) => h.polygon.length >= 3);

  // 7. Post-processing: filter out hazards from adjacent holes
  // Keep only hazards whose centroid is within a reasonable corridor around the hole
  const MAX_LATERAL_YARDS = 60; // max distance from tee-to-pin line
  const teeGps = { lat: hole.tee.lat, lng: hole.tee.lng };
  const pinGps = { lat: hole.pin.lat, lng: hole.pin.lng };
  const holeLength = haversineYards(teeGps, pinGps);

  function distanceToHoleCorridor(point: { lat: number; lng: number }): number {
    // Project point onto tee→pin line, clamp, compute perpendicular distance
    const teeToPin = { lat: pinGps.lat - teeGps.lat, lng: pinGps.lng - teeGps.lng };
    const teeToPoint = { lat: point.lat - teeGps.lat, lng: point.lng - teeGps.lng };
    const dot = teeToPin.lat * teeToPoint.lat + teeToPin.lng * teeToPoint.lng;
    const lenSq = teeToPin.lat * teeToPin.lat + teeToPin.lng * teeToPin.lng;
    const t = Math.max(0, Math.min(1, lenSq > 0 ? dot / lenSq : 0));
    const closest = { lat: teeGps.lat + t * teeToPin.lat, lng: teeGps.lng + t * teeToPin.lng };
    return haversineYards(point, closest);
  }

  // OB and trees get wider corridor (they mark boundaries), others are tighter
  const hazards = allHazards.filter((h) => {
    const centroid = {
      lat: h.polygon.reduce((s, p) => s + p.lat, 0) / h.polygon.length,
      lng: h.polygon.reduce((s, p) => s + p.lng, 0) / h.polygon.length,
    };
    const lateralDist = distanceToHoleCorridor(centroid);
    const maxDist = (h.type === 'ob' || h.type === 'trees') ? MAX_LATERAL_YARDS * 2 : MAX_LATERAL_YARDS;
    return lateralDist <= maxDist;
  });

  // 8. Import shared hazards from adjacent holes (OB, trees, water)
  const SHARED_TYPES = ['ob', 'trees', 'water'];
  const { rows: otherHoleRows } = await query(
    'SELECT hazards FROM course_holes WHERE course_id = $1 AND hole_number != $2 AND hazards IS NOT NULL',
    [courseId, holeNumber],
  );
  for (const row of otherHoleRows) {
    const otherHazards = (row.hazards ?? []) as { name: string; type: string; penalty: number; confidence: string; source: string; status: string; polygon: { lat: number; lng: number }[] }[];
    for (const oh of otherHazards) {
      if (!SHARED_TYPES.includes(oh.type) || !Array.isArray(oh.polygon) || oh.polygon.length < 3) continue;
      const centroid = {
        lat: oh.polygon.reduce((s, p) => s + p.lat, 0) / oh.polygon.length,
        lng: oh.polygon.reduce((s, p) => s + p.lng, 0) / oh.polygon.length,
      };
      const lateralDist = distanceToHoleCorridor(centroid);
      const maxDist = (oh.type === 'ob' || oh.type === 'trees') ? MAX_LATERAL_YARDS * 2 : MAX_LATERAL_YARDS;
      if (lateralDist > maxDist) continue;
      // Deduplicate: skip if we already have a same-type hazard with centroid within 15 yards
      const isDuplicate = hazards.some((h) => {
        if (h.type !== oh.type) return false;
        const hc = {
          lat: h.polygon.reduce((s, p) => s + p.lat, 0) / h.polygon.length,
          lng: h.polygon.reduce((s, p) => s + p.lng, 0) / h.polygon.length,
        };
        return haversineYards(hc, centroid) < 15;
      });
      if (isDuplicate) continue;
      hazards.push({
        name: oh.name,
        type: oh.type as 'bunker' | 'fairway_bunker' | 'greenside_bunker' | 'water' | 'ob' | 'trees' | 'rough' | 'green',
        penalty: oh.penalty,
        confidence: 'high' as const,
        source: 'claude-vision' as const,
        status: 'pending' as const,
        polygon: oh.polygon,
      });
    }
  }

  // Extract green from hazards into its own top-level field
  const greenHazard = hazards.find((h) => h.type === 'green');
  const filteredHazards = hazards.filter((h) => h.type !== 'green');

  const fairway = (claudeResponse.fairway ?? [])
    .filter((p) => p.x >= 0 && p.x <= ACTUAL_SIZE && p.y >= 0 && p.y <= ACTUAL_SIZE)
    .map((p) => imagePixelToLatLng(p.x, p.y, centerLat, centerLng, zoom, ACTUAL_SIZE, ACTUAL_SIZE));

  res.json({
    hazards: filteredHazards,
    fairway: fairway.length >= 3 ? fairway : [],
    green: greenHazard ? greenHazard.polygon : [],
    imageParams: { centerLat, centerLng, zoom, width: ACTUAL_SIZE, height: ACTUAL_SIZE },
  });
});

// POST /api/admin/courses/:id/refresh-elevation — re-fetch elevations and recompute playsLikeYards
router.post('/courses/:id/refresh-elevation', async (req, res) => {
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

  res.json({ holes: comparison });
});

// PATCH /api/courses/:id/holes/:number — update hole fields
router.patch('/:id/holes/:number', async (req, res) => {
  const ALLOWED_FIELDS = ['hazards', 'fairway', 'green', 'notes', 'targets', 'plays_like_yards', 'yardages'];
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
