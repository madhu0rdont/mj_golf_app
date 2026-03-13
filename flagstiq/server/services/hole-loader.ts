import { query } from '../db.js';
import type { CourseHole, HazardFeature, Coordinate, Target } from '../models/types.js';

interface HoleRow {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  handicap: number | null;
  heading: number | null;
  notes: string | null;
  center_line: Coordinate[];
  targets: Target[];
  fairway: { lat: number; lng: number }[][];
  green: { lat: number; lng: number }[];
}

interface TeeRow {
  hole_id: string;
  tee_name: string;
  lat: number;
  lng: number;
  elevation: number;
  yardage: number;
  plays_like_yardage: number | null;
}

interface PinRow {
  hole_id: string;
  lat: number;
  lng: number;
  elevation: number;
}

interface HazardRow {
  hole_id: string;
  hazard_type: string;
  name: string | null;
  penalty: number;
  confidence: string;
  source: string;
  polygon: { lat: number; lng: number }[];
  status: string | null;
}

/**
 * Load all holes for a course from the normalized tables, returning the same
 * CourseHole[] shape used by the optimizer, API routes, and client.
 *
 * If `teeBox` is provided, `tee` will use that tee box's position.
 * Otherwise falls back to the first available tee.
 */
export async function loadCourseHoles(courseId: string, teeBox?: string): Promise<CourseHole[]> {
  const { rows: holeRows } = await query(
    'SELECT * FROM holes WHERE course_id = $1 ORDER BY hole_number',
    [courseId],
  );

  if (holeRows.length === 0) return [];

  const holeIds = holeRows.map((r: HoleRow) => r.id);

  // Batch-fetch related data
  const [teeResult, pinResult, hazardResult] = await Promise.all([
    query('SELECT * FROM hole_tees WHERE hole_id = ANY($1)', [holeIds]),
    query('SELECT * FROM hole_pins WHERE hole_id = ANY($1) AND is_default = true', [holeIds]),
    query('SELECT * FROM hole_hazards WHERE hole_id = ANY($1)', [holeIds]),
  ]);

  // Group by hole_id
  const teesByHole = new Map<string, TeeRow[]>();
  for (const row of teeResult.rows as TeeRow[]) {
    const list = teesByHole.get(row.hole_id) || [];
    list.push(row);
    teesByHole.set(row.hole_id, list);
  }

  const pinByHole = new Map<string, PinRow>();
  for (const row of pinResult.rows as PinRow[]) {
    pinByHole.set(row.hole_id, row);
  }

  const hazardsByHole = new Map<string, HazardRow[]>();
  for (const row of hazardResult.rows as HazardRow[]) {
    const list = hazardsByHole.get(row.hole_id) || [];
    list.push(row);
    hazardsByHole.set(row.hole_id, list);
  }

  return holeRows.map((hole: HoleRow): CourseHole => {
    const tees = teesByHole.get(hole.id) || [];
    const pin = pinByHole.get(hole.id);
    const hazards = hazardsByHole.get(hole.id) || [];

    // Select tee position: prefer requested teeBox, fall back to first
    const selectedTee = (teeBox ? tees.find(t => t.tee_name === teeBox) : undefined) || tees[0];

    // Build yardages and playsLikeYards maps from all tee rows
    const yardages: Record<string, number> = {};
    const playsLikeYards: Record<string, number> = {};
    let hasPlaysLike = false;
    for (const t of tees) {
      yardages[t.tee_name] = t.yardage;
      if (t.plays_like_yardage != null) {
        playsLikeYards[t.tee_name] = t.plays_like_yardage;
        hasPlaysLike = true;
      }
    }

    const teeCoord: Coordinate = selectedTee
      ? { lat: selectedTee.lat, lng: selectedTee.lng, elevation: selectedTee.elevation }
      : { lat: 0, lng: 0, elevation: 0 };

    const pinCoord: Coordinate = pin
      ? { lat: pin.lat, lng: pin.lng, elevation: pin.elevation }
      : { lat: 0, lng: 0, elevation: 0 };

    return {
      id: hole.id,
      courseId: hole.course_id,
      holeNumber: hole.hole_number,
      par: hole.par,
      handicap: hole.handicap,
      yardages,
      heading: hole.heading ?? 0,
      tee: teeCoord,
      pin: pinCoord,
      targets: hole.targets || [],
      centerLine: hole.center_line || [],
      hazards: hazards.map((h): HazardFeature => ({
        type: h.hazard_type as HazardFeature['type'],
        name: h.name || '',
        penalty: h.penalty,
        confidence: (h.confidence || 'high') as HazardFeature['confidence'],
        source: (h.source || 'manual') as HazardFeature['source'],
        polygon: h.polygon || [],
        status: (h.status || 'accepted') as HazardFeature['status'],
      })),
      fairway: hole.fairway || [],
      green: hole.green || [],
      playsLikeYards: hasPlaysLike ? playsLikeYards : null,
      notes: hole.notes,
    };
  });
}

/**
 * Load a single hole by course ID and hole number.
 */
export async function loadSingleHole(
  courseId: string,
  holeNumber: number,
  teeBox?: string,
): Promise<CourseHole | null> {
  const { rows: holeRows } = await query(
    'SELECT * FROM holes WHERE course_id = $1 AND hole_number = $2',
    [courseId, holeNumber],
  );

  if (holeRows.length === 0) return null;

  const hole = holeRows[0] as HoleRow;

  const [teeResult, pinResult, hazardResult] = await Promise.all([
    query('SELECT * FROM hole_tees WHERE hole_id = $1', [hole.id]),
    query('SELECT * FROM hole_pins WHERE hole_id = $1 AND is_default = true', [hole.id]),
    query('SELECT * FROM hole_hazards WHERE hole_id = $1', [hole.id]),
  ]);

  const tees = teeResult.rows as TeeRow[];
  const pin = (pinResult.rows as PinRow[])[0];
  const hazards = hazardResult.rows as HazardRow[];

  const selectedTee = (teeBox ? tees.find(t => t.tee_name === teeBox) : undefined) || tees[0];

  const yardages: Record<string, number> = {};
  const playsLikeYards: Record<string, number> = {};
  let hasPlaysLike = false;
  for (const t of tees) {
    yardages[t.tee_name] = t.yardage;
    if (t.plays_like_yardage != null) {
      playsLikeYards[t.tee_name] = t.plays_like_yardage;
      hasPlaysLike = true;
    }
  }

  const teeCoord: Coordinate = selectedTee
    ? { lat: selectedTee.lat, lng: selectedTee.lng, elevation: selectedTee.elevation }
    : { lat: 0, lng: 0, elevation: 0 };

  const pinCoord: Coordinate = pin
    ? { lat: pin.lat, lng: pin.lng, elevation: pin.elevation }
    : { lat: 0, lng: 0, elevation: 0 };

  return {
    id: hole.id,
    courseId: hole.course_id,
    holeNumber: hole.hole_number,
    par: hole.par,
    handicap: hole.handicap,
    yardages,
    heading: hole.heading ?? 0,
    tee: teeCoord,
    pin: pinCoord,
    targets: hole.targets || [],
    centerLine: hole.center_line || [],
    hazards: hazards.map((h): HazardFeature => ({
      type: h.hazard_type as HazardFeature['type'],
      name: h.name || '',
      penalty: h.penalty,
      confidence: (h.confidence || 'high') as HazardFeature['confidence'],
      source: (h.source || 'manual') as HazardFeature['source'],
      polygon: h.polygon || [],
      status: (h.status || 'accepted') as HazardFeature['status'],
    })),
    fairway: hole.fairway || [],
    green: hole.green || [],
    playsLikeYards: hasPlaysLike ? playsLikeYards : null,
    notes: hole.notes,
  };
}
