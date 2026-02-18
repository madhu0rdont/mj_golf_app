import type { Shot, ShotShape, ShotQuality, SessionSummary } from '../models/session';

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function nonNullValues(shots: Shot[], key: keyof Shot): number[] {
  return shots.map((s) => s[key] as number | undefined).filter((v): v is number => v != null);
}

export function computeSessionSummary(
  shots: Shot[],
  clubName: string,
  sessionId: string,
  clubId: string,
  date: number
): SessionSummary {
  const carries = shots.map((s) => s.carryYards);
  const totals = nonNullValues(shots, 'totalYards');
  const offlines = nonNullValues(shots, 'offlineYards');

  // Shape distribution
  const shapeDistribution: Partial<Record<ShotShape, number>> = {};
  let dominantShape: ShotShape | undefined;
  let maxShapeCount = 0;
  for (const shot of shots) {
    if (shot.shape) {
      shapeDistribution[shot.shape] = (shapeDistribution[shot.shape] || 0) + 1;
      if (shapeDistribution[shot.shape]! > maxShapeCount) {
        maxShapeCount = shapeDistribution[shot.shape]!;
        dominantShape = shot.shape;
      }
    }
  }

  // Quality distribution
  const qualityDistribution: Partial<Record<ShotQuality, number>> = {};
  for (const shot of shots) {
    if (shot.quality) {
      qualityDistribution[shot.quality] = (qualityDistribution[shot.quality] || 0) + 1;
    }
  }
  const pureCount = (qualityDistribution.pure || 0) + (qualityDistribution.good || 0);
  const pureRate = shots.length > 0 ? (pureCount / shots.length) * 100 : 0;

  return {
    sessionId,
    clubId,
    clubName,
    date,
    shotCount: shots.length,
    avgCarry: round(mean(carries)),
    avgTotal: totals.length > 0 ? round(mean(totals)) : undefined,
    medianCarry: round(median(carries)),
    maxCarry: round(Math.max(...carries)),
    minCarry: round(Math.min(...carries)),
    stdDevCarry: round(stddev(carries)),
    dispersionRange: round(Math.max(...carries) - Math.min(...carries)),
    avgBallSpeed: avgOrUndef(shots, 'ballSpeed'),
    avgClubHeadSpeed: avgOrUndef(shots, 'clubHeadSpeed'),
    avgLaunchAngle: avgOrUndef(shots, 'launchAngle'),
    avgSpinRate: avgOrUndef(shots, 'spinRate'),
    avgSpinAxis: avgOrUndef(shots, 'spinAxis'),
    avgApexHeight: avgOrUndef(shots, 'apexHeight'),
    avgOffline: offlines.length > 0 ? round(mean(offlines)) : undefined,
    avgAbsOffline: offlines.length > 0 ? round(mean(offlines.map(Math.abs))) : undefined,
    shapeDistribution,
    dominantShape,
    qualityDistribution,
    pureRate: round(pureRate),
  };
}

function avgOrUndef(shots: Shot[], key: keyof Shot): number | undefined {
  const vals = nonNullValues(shots, key);
  return vals.length > 0 ? round(mean(vals)) : undefined;
}

function round(v: number, decimals: number = 1): number {
  const factor = 10 ** decimals;
  return Math.round(v * factor) / factor;
}

export interface ProgressDelta {
  value: number;
  delta: number;
  direction: 'up' | 'down' | 'neutral';
  improved: boolean;
}

export function computeDelta(
  current: number,
  previous: number,
  higherIsBetter: boolean = true
): ProgressDelta {
  const delta = round(current - previous);
  const direction = Math.abs(delta) < 0.5 ? 'neutral' : delta > 0 ? 'up' : 'down';
  const improved = direction === 'neutral' ? false : higherIsBetter ? delta > 0 : delta < 0;
  return { value: current, delta, direction, improved };
}
