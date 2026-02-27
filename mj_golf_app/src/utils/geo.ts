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
