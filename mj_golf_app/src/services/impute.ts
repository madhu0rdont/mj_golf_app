import type { Club } from '../models/club';
import type { Shot } from '../models/session';
import { mean } from './stats';

interface KnownPoint {
  loft: number;
  value: number;
}

/**
 * Piecewise linear interpolation / extrapolation.
 * Points must be sorted by loft ascending.
 */
function interpolate(points: KnownPoint[], targetLoft: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  // Below range: extrapolate from first two points
  if (targetLoft <= points[0].loft) {
    const [p0, p1] = points;
    const slope = (p1.value - p0.value) / (p1.loft - p0.loft);
    return p0.value + slope * (targetLoft - p0.loft);
  }

  // Above range: extrapolate from last two points
  if (targetLoft >= points[points.length - 1].loft) {
    const p0 = points[points.length - 2];
    const p1 = points[points.length - 1];
    const slope = (p1.value - p0.value) / (p1.loft - p0.loft);
    return p1.value + slope * (targetLoft - p1.loft);
  }

  // Within range: find bracketing segment and interpolate
  for (let i = 0; i < points.length - 1; i++) {
    if (targetLoft >= points[i].loft && targetLoft <= points[i + 1].loft) {
      const t = (targetLoft - points[i].loft) / (points[i + 1].loft - points[i].loft);
      return points[i].value + t * (points[i + 1].value - points[i].value);
    }
  }

  return points[points.length - 1].value;
}

export interface KnownClubAvg {
  loft: number;
  carry: number;
  total: number;
  ballSpeed: number;
  launchAngle: number;
  spinRate: number;
  apexHeight: number;
  descentAngle: number;
}

export interface ImputedMetrics {
  carry: number;
  total: number;
  ballSpeed: number;
  launchAngle: number;
  spinRate: number;
  apexHeight: number;
  descentAngle: number;
}

/** Build sorted (loft, metric) arrays from known clubs and interpolate for a target loft. */
export function imputeClubMetrics(known: KnownClubAvg[], targetLoft: number): ImputedMetrics {
  const sorted = [...known].sort((a, b) => a.loft - b.loft);

  const pts = (key: keyof Omit<KnownClubAvg, 'loft'>): KnownPoint[] =>
    sorted.map((k) => ({ loft: k.loft, value: k[key] }));

  return {
    carry: Math.round(interpolate(pts('carry'), targetLoft)),
    total: Math.round(interpolate(pts('total'), targetLoft)),
    ballSpeed: Math.round(interpolate(pts('ballSpeed'), targetLoft) * 10) / 10,
    launchAngle: Math.round(interpolate(pts('launchAngle'), targetLoft) * 10) / 10,
    spinRate: Math.round(interpolate(pts('spinRate'), targetLoft)),
    apexHeight: Math.round(interpolate(pts('apexHeight'), targetLoft)),
    descentAngle: Math.round(interpolate(pts('descentAngle'), targetLoft) * 10) / 10,
  };
}

/** Compute average metrics for a club's shots, paired with its loft. */
export function buildKnownClubAvg(club: Club, shots: Shot[]): KnownClubAvg | null {
  if (!club.loft || shots.length === 0) return null;

  const vals = (key: keyof Shot) =>
    shots.map((s) => s[key] as number | undefined).filter((v): v is number => v != null);

  const carries = shots.map((s) => s.carryYards);
  const totals = vals('totalYards');
  const speeds = vals('ballSpeed');
  const launches = vals('launchAngle');
  const spins = vals('spinRate');
  const apexes = vals('apexHeight');
  const descents = vals('descentAngle');

  if (totals.length === 0 || speeds.length === 0 || launches.length === 0) return null;

  return {
    loft: club.loft,
    carry: mean(carries),
    total: mean(totals),
    ballSpeed: mean(speeds),
    launchAngle: mean(launches),
    spinRate: spins.length > 0 ? mean(spins) : 0,
    apexHeight: apexes.length > 0 ? mean(apexes) : 0,
    descentAngle: descents.length > 0 ? mean(descents) : 0,
  };
}

/** Create a synthetic Shot from imputed metrics. */
export function syntheticShot(clubId: string, metrics: ImputedMetrics): Shot {
  return {
    id: `imputed-${clubId}`,
    sessionId: '',
    clubId,
    shotNumber: 0,
    carryYards: metrics.carry,
    totalYards: metrics.total,
    ballSpeed: metrics.ballSpeed,
    launchAngle: metrics.launchAngle,
    spinRate: metrics.spinRate,
    apexHeight: metrics.apexHeight,
    descentAngle: metrics.descentAngle,
    timestamp: 0,
  };
}
