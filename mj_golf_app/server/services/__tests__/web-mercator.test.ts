// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  latLngToPixel,
  pixelToLatLng,
  computeZoom,
  latLngToImagePixel,
  imagePixelToLatLng,
} from '../web-mercator';

describe('latLngToPixel / pixelToLatLng round-trip', () => {
  const testCases = [
    { lat: 0, lng: 0, zoom: 10 },
    { lat: 33.45, lng: -117.6, zoom: 17 },
    { lat: -33.86, lng: 151.2, zoom: 15 },
    { lat: 51.5, lng: -0.12, zoom: 12 },
  ];

  for (const { lat, lng, zoom } of testCases) {
    it(`round-trips (${lat}, ${lng}) at zoom ${zoom}`, () => {
      const px = latLngToPixel(lat, lng, zoom);
      const result = pixelToLatLng(px.x, px.y, zoom);
      expect(result.lat).toBeCloseTo(lat, 5);
      expect(result.lng).toBeCloseTo(lng, 5);
    });
  }
});

describe('latLngToPixel', () => {
  it('places (0, 0) at the center of the world at zoom 0', () => {
    const px = latLngToPixel(0, 0, 0);
    expect(px.x).toBeCloseTo(128, 0);
    expect(px.y).toBeCloseTo(128, 0);
  });

  it('places (0, -180) at the left edge at zoom 0', () => {
    const px = latLngToPixel(0, -180, 0);
    expect(px.x).toBeCloseTo(0, 0);
  });

  it('places (0, 180) at the right edge at zoom 0', () => {
    const px = latLngToPixel(0, 180, 0);
    expect(px.x).toBeCloseTo(256, 0);
  });

  it('higher zoom increases pixel values proportionally', () => {
    const z10 = latLngToPixel(33, -117, 10);
    const z11 = latLngToPixel(33, -117, 11);
    expect(z11.x).toBeCloseTo(z10.x * 2, 0);
    expect(z11.y).toBeCloseTo(z10.y * 2, 0);
  });
});

describe('computeZoom', () => {
  it('returns higher zoom for tighter bounds', () => {
    const tight = { minLat: 33.0, maxLat: 33.002, minLng: -117.002, maxLng: -117.0 };
    const wide = { minLat: 32.0, maxLat: 34.0, minLng: -118.0, maxLng: -116.0 };
    const zoomTight = computeZoom(tight, 640);
    const zoomWide = computeZoom(wide, 640);
    expect(zoomTight).toBeGreaterThan(zoomWide);
  });

  it('returns lower zoom for smaller image size', () => {
    const bounds = { minLat: 33.0, maxLat: 33.01, minLng: -117.01, maxLng: -117.0 };
    const zoomLarge = computeZoom(bounds, 640);
    const zoomSmall = computeZoom(bounds, 320);
    expect(zoomLarge).toBeGreaterThanOrEqual(zoomSmall);
  });

  it('returns 0 for extremely wide bounds', () => {
    const global = { minLat: -85, maxLat: 85, minLng: -180, maxLng: 180 };
    expect(computeZoom(global, 256)).toBe(0);
  });

  it('returns an integer', () => {
    const bounds = { minLat: 33.0, maxLat: 33.005, minLng: -117.005, maxLng: -117.0 };
    const zoom = computeZoom(bounds, 640);
    expect(Number.isInteger(zoom)).toBe(true);
  });
});

describe('latLngToImagePixel / imagePixelToLatLng round-trip', () => {
  const center = { lat: 33.45, lng: -117.6 };
  const zoom = 17;
  const width = 640;
  const height = 640;

  it('places the center at the middle of the image', () => {
    const px = latLngToImagePixel(center.lat, center.lng, center.lat, center.lng, zoom, width, height);
    expect(px.x).toBe(width / 2);
    expect(px.y).toBe(height / 2);
  });

  it('round-trips an offset point', () => {
    const point = { lat: 33.451, lng: -117.599 };
    const px = latLngToImagePixel(point.lat, point.lng, center.lat, center.lng, zoom, width, height);
    const result = imagePixelToLatLng(px.x, px.y, center.lat, center.lng, zoom, width, height);
    // Pixel rounding limits precision, but should be within ~0.0001 degrees
    expect(result.lat).toBeCloseTo(point.lat, 3);
    expect(result.lng).toBeCloseTo(point.lng, 3);
  });

  it('points north of center have smaller y (higher on image)', () => {
    const north = latLngToImagePixel(center.lat + 0.001, center.lng, center.lat, center.lng, zoom, width, height);
    expect(north.y).toBeLessThan(height / 2);
  });

  it('points east of center have larger x', () => {
    const east = latLngToImagePixel(center.lat, center.lng + 0.001, center.lat, center.lng, zoom, width, height);
    expect(east.x).toBeGreaterThan(width / 2);
  });
});
