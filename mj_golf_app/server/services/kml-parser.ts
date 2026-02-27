import { XMLParser } from 'fast-xml-parser';

// --- Public types ---

export interface ParsedCoordinate {
  lat: number;
  lng: number;
  alt: number;
}

export interface ParsedTarget {
  index: number;
  coordinate: ParsedCoordinate;
}

export interface ParsedHole {
  holeNumber: number;
  par: number;
  yardage: number;
  heading: number;
  tee: ParsedCoordinate;
  pin: ParsedCoordinate;
  targets: ParsedTarget[];
  centerLine: ParsedCoordinate[];
}

export interface ParsedCourse {
  holes: ParsedHole[];
}

// --- Regex patterns for ProVisualizer naming conventions ---

const TEE_RE = /^Hole\s+(\d+)\s+Tee$/i;
const PIN_RE = /^Hole\s+(\d+)\s+Pin$/i;
const TARGET_RE = /^Hole\s+(\d+)\s+Target\s+(\d+)$/i;
const CENTER_LINE_RE = /^Hole\s+(\d+)\s+Center\s*Line$/i;
const TOUR_RE = /^Hole\s+(\d+)\s*[-–]\s*Par\s+(\d+)\s*[-–]\s*(\d+)\s+yards?$/i;

// --- Coordinate helpers ---

/** KML coordinates are lon,lat,alt — swap to lat,lng,alt */
function parseCoord(str: string): ParsedCoordinate {
  const parts = str.trim().split(',').map(Number);
  return { lat: parts[1], lng: parts[0], alt: parts[2] || 0 };
}

/** LineString coordinates: space-separated lon,lat,alt tuples */
function parseLineCoords(str: string): ParsedCoordinate[] {
  return str
    .trim()
    .split(/\s+/)
    .filter((s) => s.includes(','))
    .map(parseCoord);
}

// --- Main parser ---

export function parseKml(kmlContent: string): ParsedCourse {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    isArray: (_name, jpath) => {
      // Force arrays for elements that may appear once or multiple times
      return (
        jpath === 'kml.Document.Folder.Placemark' ||
        jpath === 'kml.Document.Placemark' ||
        jpath === 'kml.Document.Folder' ||
        jpath === 'kml.Document.Tour' ||
        jpath === 'kml.Document.Folder.Tour'
      );
    },
  });

  const parsed = parser.parse(kmlContent);
  const doc = parsed.kml?.Document;
  if (!doc) throw new Error('Invalid KML: no Document element found');

  // Collect all Placemarks and Tours from Document and Folders
  const placemarks: unknown[] = [];
  const tours: unknown[] = [];

  function collectElements(node: Record<string, unknown>) {
    if (Array.isArray(node.Placemark)) placemarks.push(...node.Placemark);
    if (Array.isArray(node.Tour)) tours.push(...node.Tour);
    if (Array.isArray(node.Folder)) {
      for (const folder of node.Folder) collectElements(folder as Record<string, unknown>);
    }
  }

  collectElements(doc);

  // Build per-hole data
  const holeMap = new Map<
    number,
    {
      tee?: ParsedCoordinate;
      pin?: ParsedCoordinate;
      targets: ParsedTarget[];
      centerLine: ParsedCoordinate[];
      par?: number;
      yardage?: number;
      heading?: number;
    }
  >();

  function getHole(n: number) {
    if (!holeMap.has(n)) {
      holeMap.set(n, { targets: [], centerLine: [] });
    }
    return holeMap.get(n)!;
  }

  // Extract placemarks
  for (const pm of placemarks) {
    const p = pm as Record<string, unknown>;
    const name = (p.name as string)?.trim();
    if (!name) continue;

    let m: RegExpMatchArray | null;

    if ((m = name.match(TEE_RE))) {
      const coords = extractPointCoords(p);
      if (coords) getHole(parseInt(m[1])).tee = coords;
    } else if ((m = name.match(PIN_RE))) {
      const coords = extractPointCoords(p);
      if (coords) getHole(parseInt(m[1])).pin = coords;
    } else if ((m = name.match(TARGET_RE))) {
      const coords = extractPointCoords(p);
      if (coords) {
        getHole(parseInt(m[1])).targets.push({
          index: parseInt(m[2]),
          coordinate: coords,
        });
      }
    } else if ((m = name.match(CENTER_LINE_RE))) {
      const coords = extractLineCoords(p);
      if (coords.length > 0) getHole(parseInt(m[1])).centerLine = coords;
    }
  }

  // Extract tours (par, yardage, heading)
  for (const t of tours) {
    const tour = t as Record<string, unknown>;
    const name = (tour.name as string)?.trim();
    if (!name) continue;

    const m = name.match(TOUR_RE);
    if (!m) continue;

    const hole = getHole(parseInt(m[1]));
    hole.par = parseInt(m[2]);
    hole.yardage = parseInt(m[3]);

    // Extract heading from FlyTo > LookAt > heading
    const heading = extractHeading(tour);
    if (heading !== null) hole.heading = heading;
  }

  // Validate and assemble
  const holes: ParsedHole[] = [];

  for (let i = 1; i <= 18; i++) {
    const h = holeMap.get(i);
    if (!h) throw new Error(`Hole ${i}: not found in KML`);
    if (!h.tee) throw new Error(`Hole ${i}: missing tee placemark`);
    if (!h.pin) throw new Error(`Hole ${i}: missing pin placemark`);
    if (h.par === undefined) throw new Error(`Hole ${i}: missing tour data (par/yardage)`);

    // Sort targets by index
    h.targets.sort((a, b) => a.index - b.index);

    holes.push({
      holeNumber: i,
      par: h.par,
      yardage: h.yardage!,
      heading: h.heading ?? 0,
      tee: h.tee,
      pin: h.pin,
      targets: h.targets,
      centerLine: h.centerLine,
    });
  }

  return { holes };
}

// --- Helpers for extracting coordinates from Placemark structures ---

function extractPointCoords(placemark: Record<string, unknown>): ParsedCoordinate | null {
  // Point > coordinates
  const point = placemark.Point as Record<string, unknown> | undefined;
  if (point?.coordinates) {
    return parseCoord(String(point.coordinates));
  }
  // Sometimes coordinates are directly on the placemark
  if (placemark.coordinates) {
    return parseCoord(String(placemark.coordinates));
  }
  return null;
}

function extractLineCoords(placemark: Record<string, unknown>): ParsedCoordinate[] {
  // LineString > coordinates
  const lineString = placemark.LineString as Record<string, unknown> | undefined;
  if (lineString?.coordinates) {
    return parseLineCoords(String(lineString.coordinates));
  }
  return [];
}

function extractHeading(tour: Record<string, unknown>): number | null {
  // Tour > Playlist > FlyTo (or array of FlyTo) > LookAt > heading
  const playlist = tour.Playlist as Record<string, unknown> | undefined;
  if (!playlist) return null;

  let flyToList = playlist.FlyTo;
  if (!Array.isArray(flyToList)) flyToList = flyToList ? [flyToList] : [];

  for (const ft of flyToList as Record<string, unknown>[]) {
    const lookAt = ft.LookAt as Record<string, unknown> | undefined;
    if (lookAt?.heading !== undefined) {
      return Number(lookAt.heading);
    }
  }
  return null;
}
