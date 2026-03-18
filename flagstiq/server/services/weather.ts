import { logApiUsage } from './usage.js';
import type { CourseHole } from '../models/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WeatherConditions {
  temperature: number;       // Fahrenheit
  feelsLike: number;         // Fahrenheit
  humidity: number;          // 0-100%
  windSpeed: number;         // mph
  windGust: number;          // mph
  windDirection: number;     // compass degrees (meteorological: where wind comes FROM)
  windCardinal: string;      // "NNW", "SE", etc.
  pressure: number;          // millibars
  description: string;       // "Partly cloudy"
  fetchedAt: number;         // Date.now()
}

export interface HoleWeatherAdjustment {
  holeNumber: number;
  par: number;
  yardage: number;
  heading: number;
  headwindMph: number;       // positive = headwind, negative = tailwind
  crosswindMph: number;      // positive = left-to-right
  windCarryPct: number;      // wind carry adjustment as fraction (e.g. 0.10 = 10% longer)
  tempAdjustYards: number;   // temperature adjustment in yards
  carryAdjustYards: number;  // net carry adjustment (wind + temp)
  playsLikeYardage: number;  // yardage + carryAdjust
}

// ---------------------------------------------------------------------------
// In-memory cache (15-minute TTL)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry {
  data: WeatherConditions;
  expiresAt: number;
}

const weatherCache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Google Weather API client
// ---------------------------------------------------------------------------

const WEATHER_URL = 'https://weather.googleapis.com/v1/currentConditions:lookup';

// Map Google's cardinal strings to short labels
const CARDINAL_MAP: Record<string, string> = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTH_EAST: 'NE', NORTH_WEST: 'NW', SOUTH_EAST: 'SE', SOUTH_WEST: 'SW',
  NORTH_NORTHEAST: 'NNE', NORTH_NORTHWEST: 'NNW',
  SOUTH_SOUTHEAST: 'SSE', SOUTH_SOUTHWEST: 'SSW',
  EAST_NORTHEAST: 'ENE', EAST_SOUTHEAST: 'ESE',
  WEST_NORTHWEST: 'WNW', WEST_SOUTHWEST: 'WSW',
};

export async function fetchCurrentWeather(
  lat: number,
  lng: number,
): Promise<WeatherConditions> {
  // Check cache
  const key = cacheKey(lat, lng);
  const cached = weatherCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const apiKey = process.env.GOOGLE_WEATHER_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_WEATHER_API_KEY (or GOOGLE_MAPS_API_KEY) environment variable is not set');
  }

  const url = `${WEATHER_URL}?key=${apiKey}&location.latitude=${lat}&location.longitude=${lng}&unitsSystem=IMPERIAL`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();

  const conditions: WeatherConditions = {
    temperature: data.temperature?.degrees ?? 70,
    feelsLike: data.feelsLikeTemperature?.degrees ?? 70,
    humidity: data.relativeHumidity ?? 50,
    windSpeed: data.wind?.speed?.value ?? 0,
    windGust: data.wind?.gust?.value ?? 0,
    windDirection: data.wind?.direction?.degrees ?? 0,
    windCardinal: CARDINAL_MAP[data.wind?.direction?.cardinal] ?? 'N',
    pressure: data.airPressure?.meanSeaLevelMillibars ?? 1013,
    description: data.weatherCondition?.description?.text ?? 'Unknown',
    fetchedAt: Date.now(),
  };

  // Cache result
  weatherCache.set(key, { data: conditions, expiresAt: Date.now() + CACHE_TTL_MS });

  logApiUsage({
    service: 'google_weather',
    endpoint: 'currentConditions',
    items: 1,
    apiCalls: 1,
    estimatedCost: 0.004,
  });

  return conditions;
}

// ---------------------------------------------------------------------------
// Per-hole weather adjustments
// ---------------------------------------------------------------------------

const DEG_TO_RAD = Math.PI / 180;
const BASELINE_TEMP_F = 70;
const TEMP_YARDS_PER_DEGREE = 0.15; // ~1.5 yards per 10F

/**
 * Decompose wind into headwind/crosswind per hole and compute carry adjustments.
 *
 * Wind direction convention (meteorological): direction wind comes FROM.
 * A north wind (direction=0) blows from north to south.
 *
 * For a northbound hole (heading=0), a north wind is a headwind.
 * headwind = windSpeed * cos(windDirection - heading)
 *   cos(0) = 1 → headwind (positive)
 * crosswind = windSpeed * sin(windDirection - heading)
 *   sin(0) = 0 → no crosswind
 *
 * Carry adjustment:
 *   Headwind: plays longer by 1% per mph
 *   Tailwind: plays shorter by 0.5% per mph
 *   Temperature: ~1.5 yards per 10F from 70F baseline (warmer = farther = plays shorter)
 */
export function computeHoleWeatherAdjustments(
  weather: WeatherConditions,
  holes: CourseHole[],
  teeBox: string,
): HoleWeatherAdjustment[] {
  return holes.map((hole) => {
    const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
    const heading = hole.heading;

    // Wind decomposition
    const angleRad = (weather.windDirection - heading) * DEG_TO_RAD;
    const headwindMph = weather.windSpeed * Math.cos(angleRad);
    const crosswindMph = weather.windSpeed * Math.sin(angleRad);

    // Wind carry adjustment (as fraction of distance)
    let windCarryPct: number;
    if (headwindMph > 0) {
      // Headwind: +1% per mph (plays longer)
      windCarryPct = headwindMph * 0.01;
    } else {
      // Tailwind: -0.5% per mph (plays shorter)
      windCarryPct = headwindMph * 0.005;
    }

    // Temperature adjustment: warmer → ball goes farther → plays shorter
    const tempAdjustYards = -(weather.temperature - BASELINE_TEMP_F) * TEMP_YARDS_PER_DEGREE;

    // Combined: positive = plays longer, negative = plays shorter
    const windAdjustYards = yardage * windCarryPct;
    const carryAdjustYards = Math.round(windAdjustYards + tempAdjustYards);
    const playsLikeYardage = Math.round(yardage + carryAdjustYards);

    return {
      holeNumber: hole.holeNumber,
      par: hole.par,
      yardage,
      heading,
      headwindMph: Math.round(headwindMph * 10) / 10,
      crosswindMph: Math.round(crosswindMph * 10) / 10,
      windCarryPct,
      tempAdjustYards: Math.round(tempAdjustYards),
      carryAdjustYards,
      playsLikeYardage,
    };
  });
}
