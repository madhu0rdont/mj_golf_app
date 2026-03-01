import type { Club, Shot } from '../models/types.js';
import { mean } from './stats.js';

interface KnownPoint {
  loft: number;
  value: number;
}

function interpolate(points: KnownPoint[], targetLoft: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].value;

  if (targetLoft <= points[0].loft) {
    const [p0, p1] = points;
    const slope = (p1.value - p0.value) / (p1.loft - p0.loft);
    return p0.value + slope * (targetLoft - p0.loft);
  }

  if (targetLoft >= points[points.length - 1].loft) {
    const p0 = points[points.length - 2];
    const p1 = points[points.length - 1];
    const slope = (p1.value - p0.value) / (p1.loft - p0.loft);
    return p1.value + slope * (targetLoft - p1.loft);
  }

  for (let i = 0; i < points.length - 1; i++) {
    if (targetLoft >= points[i].loft && targetLoft <= points[i + 1].loft) {
      const t = (targetLoft - points[i].loft) / (points[i + 1].loft - points[i].loft);
      return points[i].value + t * (points[i + 1].value - points[i].value);
    }
  }

  return points[points.length - 1].value;
}

interface TourReference {
  loft: number;
  carry: number;
  total: number;
  ballSpeed: number;
  launchAngle: number;
  spinRate: number;
  apexHeight: number;
  descentAngle: number;
}

const TOUR_REF: TourReference[] = [
  { loft: 10.5, carry: 275, total: 299, ballSpeed: 167, launchAngle: 10.9, spinRate: 2686,  apexHeight: 32, descentAngle: 38 },
  { loft: 15,   carry: 245, total: 264, ballSpeed: 158, launchAngle: 11.2, spinRate: 3655,  apexHeight: 30, descentAngle: 43 },
  { loft: 19,   carry: 230, total: 246, ballSpeed: 152, launchAngle: 12.5, spinRate: 4350,  apexHeight: 31, descentAngle: 47 },
  { loft: 21,   carry: 212, total: 220, ballSpeed: 142, launchAngle: 10.4, spinRate: 4630,  apexHeight: 27, descentAngle: 46 },
  { loft: 24,   carry: 203, total: 210, ballSpeed: 137, launchAngle: 11.0, spinRate: 4836,  apexHeight: 28, descentAngle: 48 },
  { loft: 27,   carry: 194, total: 200, ballSpeed: 132, launchAngle: 12.1, spinRate: 5361,  apexHeight: 31, descentAngle: 49 },
  { loft: 30,   carry: 183, total: 189, ballSpeed: 127, launchAngle: 14.1, spinRate: 6231,  apexHeight: 30, descentAngle: 50 },
  { loft: 33,   carry: 172, total: 177, ballSpeed: 120, launchAngle: 16.3, spinRate: 7097,  apexHeight: 30, descentAngle: 50 },
  { loft: 37,   carry: 160, total: 164, ballSpeed: 115, launchAngle: 18.1, spinRate: 7998,  apexHeight: 30, descentAngle: 50 },
  { loft: 41,   carry: 148, total: 150, ballSpeed: 109, launchAngle: 20.4, spinRate: 8647,  apexHeight: 30, descentAngle: 51 },
  { loft: 46,   carry: 136, total: 137, ballSpeed: 102, launchAngle: 24.2, spinRate: 9304,  apexHeight: 29, descentAngle: 52 },
  { loft: 51,   carry: 115, total: 115, ballSpeed: 97,  launchAngle: 27.0, spinRate: 9800,  apexHeight: 29, descentAngle: 53 },
  { loft: 56,   carry: 97,  total: 97,  ballSpeed: 92,  launchAngle: 30.0, spinRate: 10200, apexHeight: 28, descentAngle: 54 },
  { loft: 60,   carry: 83,  total: 83,  ballSpeed: 86,  launchAngle: 33.0, spinRate: 10500, apexHeight: 28, descentAngle: 55 },
];

const TOUR_PTS = {
  carry:        TOUR_REF.map((r) => ({ loft: r.loft, value: r.carry })),
  total:        TOUR_REF.map((r) => ({ loft: r.loft, value: r.total })),
  ballSpeed:    TOUR_REF.map((r) => ({ loft: r.loft, value: r.ballSpeed })),
  launchAngle:  TOUR_REF.map((r) => ({ loft: r.loft, value: r.launchAngle })),
  spinRate:     TOUR_REF.map((r) => ({ loft: r.loft, value: r.spinRate })),
  apexHeight:   TOUR_REF.map((r) => ({ loft: r.loft, value: r.apexHeight })),
  descentAngle: TOUR_REF.map((r) => ({ loft: r.loft, value: r.descentAngle })),
};

export interface ImputedMetrics {
  carry: number;
  total: number;
  ballSpeed: number;
  launchAngle: number;
  spinRate: number;
  apexHeight: number;
  descentAngle: number;
}

export function imputeFromCarryAndLoft(carry: number, loft: number): ImputedMetrics {
  const tourCarry = interpolate(TOUR_PTS.carry, loft);
  const scale = tourCarry > 0 ? carry / tourCarry : 1;

  const ballSpeed = interpolate(TOUR_PTS.ballSpeed, loft) * scale;
  const launchAngle = interpolate(TOUR_PTS.launchAngle, loft);
  const descentAngle = interpolate(TOUR_PTS.descentAngle, loft);
  const tourSpin = interpolate(TOUR_PTS.spinRate, loft);
  const spinRate = tourSpin * (0.7 + 0.3 * scale);
  const apexHeight = interpolate(TOUR_PTS.apexHeight, loft) * scale;
  const rolloutFrac = Math.max(0, 0.12 * Math.exp(-0.05 * loft));
  const total = carry * (1 + rolloutFrac);

  return {
    carry: Math.round(carry),
    total: Math.round(total),
    ballSpeed: Math.round(ballSpeed * 10) / 10,
    launchAngle: Math.round(launchAngle * 10) / 10,
    spinRate: Math.round(spinRate),
    apexHeight: Math.round(apexHeight),
    descentAngle: Math.round(descentAngle * 10) / 10,
  };
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
