const EARTH_RADIUS_M = 6_371_000;
const METERS_TO_YARDS = 1.09361;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
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

/**
 * Compute plays-like yardage given scorecard yardage and elevation delta.
 * Rule of thumb: ~1 yard per 3 feet (~1.09 yards per meter) of elevation change.
 */
export function playsLikeYards(
  scorecardYards: number,
  elevationDeltaMeters: number,
): number {
  return scorecardYards + Math.round(elevationDeltaMeters * 1.09);
}

export interface TargetWithDistances {
  index: number;
  coordinate: { lat: number; lng: number; elevation: number };
  fromTee: number;
  toPin: number;
}

/** Compute fromTee and toPin distances for each target */
export function computeTargetDistances(
  tee: { lat: number; lng: number },
  pin: { lat: number; lng: number },
  targets: { index: number; coordinate: { lat: number; lng: number; elevation: number } }[],
): TargetWithDistances[] {
  return targets.map((t) => ({
    index: t.index,
    coordinate: t.coordinate,
    fromTee: haversineYards(tee, t.coordinate),
    toPin: haversineYards(t.coordinate, pin),
  }));
}
