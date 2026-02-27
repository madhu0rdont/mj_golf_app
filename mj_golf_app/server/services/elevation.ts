const ELEVATION_URL = 'https://maps.googleapis.com/maps/api/elevation/json';
const BATCH_SIZE = 512;

export interface ElevationResult {
  lat: number;
  lng: number;
  elevation: number; // meters
}

/**
 * Fetch elevations from Google Elevation API for a list of coordinates.
 * Batches requests to stay within the 512-location-per-request limit.
 */
export async function fetchElevations(
  coordinates: { lat: number; lng: number }[],
): Promise<ElevationResult[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY environment variable is not set');
  }

  if (coordinates.length === 0) return [];

  const results: ElevationResult[] = [];

  for (let i = 0; i < coordinates.length; i += BATCH_SIZE) {
    const batch = coordinates.slice(i, i + BATCH_SIZE);
    const locations = batch.map((c) => `${c.lat},${c.lng}`).join('|');
    const url = `${ELEVATION_URL}?locations=${encodeURIComponent(locations)}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Elevation API HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    if (data.status !== 'OK') {
      throw new Error(`Elevation API error: ${data.status} — ${data.error_message || ''}`);
    }

    for (let j = 0; j < batch.length; j++) {
      results.push({
        lat: batch[j].lat,
        lng: batch[j].lng,
        elevation: data.results[j].elevation,
      });
    }
  }

  return results;
}
