/**
 * Web Mercator projection utilities for converting between
 * GPS coordinates and pixel positions on Google Static Maps images.
 */

const TILE_SIZE = 256;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Convert lat/lng to absolute pixel coordinates at a given zoom level. */
export function latLngToPixel(
  lat: number,
  lng: number,
  zoom: number,
): { x: number; y: number } {
  const scale = Math.pow(2, zoom) * TILE_SIZE;
  const x = ((lng + 180) / 360) * scale;
  const sinLat = Math.sin(toRad(lat));
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** Convert absolute pixel coordinates back to lat/lng at a given zoom level. */
export function pixelToLatLng(
  x: number,
  y: number,
  zoom: number,
): { lat: number; lng: number } {
  const scale = Math.pow(2, zoom) * TILE_SIZE;
  const lng = (x / scale) * 360 - 180;
  const lat = toDeg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / scale))));
  return { lat, lng };
}

/**
 * Compute the best zoom level so that the given bounds fit within imageSize pixels.
 * Returns an integer zoom level.
 */
export function computeZoom(
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  imageSize: number,
): number {
  for (let zoom = 20; zoom >= 0; zoom--) {
    const topLeft = latLngToPixel(bounds.maxLat, bounds.minLng, zoom);
    const bottomRight = latLngToPixel(bounds.minLat, bounds.maxLng, zoom);
    const width = Math.abs(bottomRight.x - topLeft.x);
    const height = Math.abs(bottomRight.y - topLeft.y);
    if (width <= imageSize && height <= imageSize) {
      return zoom;
    }
  }
  return 0;
}

/**
 * Convert a GPS coordinate to a pixel position within a Static Maps image.
 * The image is centered at (centerLat, centerLng) at the given zoom level.
 * Returns pixel coordinates where (0,0) is top-left of the image.
 */
export function latLngToImagePixel(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const targetPx = latLngToPixel(lat, lng, zoom);
  const centerPx = latLngToPixel(centerLat, centerLng, zoom);
  return {
    x: Math.round(targetPx.x - centerPx.x + width / 2),
    y: Math.round(targetPx.y - centerPx.y + height / 2),
  };
}

/**
 * Convert a pixel position within a Static Maps image back to GPS coordinates.
 * The image is centered at (centerLat, centerLng) at the given zoom level.
 */
export function imagePixelToLatLng(
  x: number,
  y: number,
  centerLat: number,
  centerLng: number,
  zoom: number,
  width: number,
  height: number,
): { lat: number; lng: number } {
  const centerPx = latLngToPixel(centerLat, centerLng, zoom);
  const absPx = {
    x: centerPx.x + (x - width / 2),
    y: centerPx.y + (y - height / 2),
  };
  return pixelToLatLng(absPx.x, absPx.y, zoom);
}
