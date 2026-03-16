const EARTH_RADIUS_M = 6_371_000;
const METERS_TO_YARDS = 1.09361;
const YARDS_TO_METERS = 1 / METERS_TO_YARDS;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Haversine distance in yards between two lat/lng coordinates */
export function haversineYards(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  const meters = 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
  return Math.round(meters * METERS_TO_YARDS);
}

/** Forward geodetic projection — project a point X yards from origin along a compass bearing */
export function projectPoint(
  origin: { lat: number; lng: number },
  bearingDeg: number,
  distanceYards: number,
): { lat: number; lng: number } {
  const d = distanceYards * YARDS_TO_METERS / EARTH_RADIUS_M; // angular distance
  const brng = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lng1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: toDeg(lat2), lng: toDeg(lng2) };
}

/** Ray-casting point-in-polygon test.
 *  Returns true if `point` lies inside the given polygon (array of {lat, lng}). */
export function pointInPolygon(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[],
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const intersect =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Initial compass bearing (0-360) from point A to point B */
export function bearingBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/** Generate points along a quadratic bezier curve for map rendering.
 *  p0 = start, p1 = control point (e.g. aim direction), p2 = end (landing). */
export function bezierPath(
  p0: { lat: number; lng: number },
  p1: { lat: number; lng: number },
  p2: { lat: number; lng: number },
  numPoints = 20,
): { lat: number; lng: number }[] {
  const pts: { lat: number; lng: number }[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    const u = 1 - t;
    pts.push({
      lat: u * u * p0.lat + 2 * u * t * p1.lat + t * t * p2.lat,
      lng: u * u * p0.lng + 2 * u * t * p1.lng + t * t * p2.lng,
    });
  }
  return pts;
}

/** Minimum distance in yards from a point to the nearest edge of a polygon.
 *  Returns 0 if the point is inside the polygon. */
export function distanceToPolygonEdge(
  point: { lat: number; lng: number },
  polygon: { lat: number; lng: number }[],
): number {
  if (polygon.length < 3) return Infinity;
  if (pointInPolygon(point, polygon)) return 0;

  // Approximate: find the minimum distance from the point to each polygon edge segment.
  // Uses flat-earth approximation (accurate within a few yards at golf-course scale).
  const px = point.lng;
  const py = point.lat;
  const cosLat = Math.cos(toRad(point.lat));

  let minDistSq = Infinity;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j].lng, ay = polygon[j].lat;
    const bx = polygon[i].lng, by = polygon[i].lat;

    // Vector AB
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    // Project point onto segment, clamped to [0, 1]
    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    }

    // Nearest point on segment
    const nx = ax + t * dx;
    const ny = ay + t * dy;

    // Distance in degrees, scaled by cosLat for longitude
    const eLng = (px - nx) * cosLat;
    const eLat = py - ny;
    minDistSq = Math.min(minDistSq, eLng * eLng + eLat * eLat);
  }

  // Convert degree distance to meters then yards
  const degDist = Math.sqrt(minDistSq);
  const meters = degDist * (Math.PI / 180) * EARTH_RADIUS_M;
  return meters * METERS_TO_YARDS;
}

/** Generate polygon boundary for a rotated ellipse on the earth's surface.
 *  Semi-major axis aligned along bearingDeg (carry direction), semi-minor perpendicular. */
export function computeEllipsePoints(
  center: { lat: number; lng: number },
  bearingDeg: number,
  semiMajorYards: number,
  semiMinorYards: number,
  numPoints = 36,
): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  for (let i = 0; i < numPoints; i++) {
    const theta = (2 * Math.PI * i) / numPoints;
    // Ellipse in local frame: major along bearing, minor perpendicular
    const dx = semiMajorYards * Math.cos(theta); // along bearing
    const dy = semiMinorYards * Math.sin(theta); // perpendicular
    // Convert to distance + bearing
    const dist = Math.sqrt(dx * dx + dy * dy);
    const localAngle = Math.atan2(dy, dx); // 0 = along bearing
    const absoluteBearing = bearingDeg + toDeg(localAngle);
    points.push(projectPoint(center, absoluteBearing, dist));
  }
  return points;
}

/** Arithmetic mean centroid of a polygon */
export function polygonCentroid(poly: { lat: number; lng: number }[]): { lat: number; lng: number } {
  if (poly.length === 0) return { lat: 0, lng: 0 };
  let lat = 0, lng = 0;
  for (const p of poly) { lat += p.lat; lng += p.lng; }
  return { lat: lat / poly.length, lng: lng / poly.length };
}
