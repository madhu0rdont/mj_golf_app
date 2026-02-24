import type { InterleavedHole } from '../models/session';

export interface RemainingDistance {
  forwardRemaining: number;
  cumulativeOffline: number;
  trueRemaining: number;
}

export interface HoleScore {
  strokes: number;
  putts: number;
  total: number;
  toPar: number;
  label: string;
  approachMade: boolean;
}

interface ShotData {
  carryYards: number;
  offlineYards: number;
}

export function computeRemaining(holeDistance: number, shots: ShotData[]): RemainingDistance {
  const totalCarry = shots.reduce((sum, s) => sum + s.carryYards, 0);
  const cumulativeOffline = shots.reduce((sum, s) => sum + s.offlineYards, 0);
  const forwardRemaining = Math.max(0, holeDistance - totalCarry);
  const trueRemaining = Math.round(
    Math.sqrt(forwardRemaining ** 2 + cumulativeOffline ** 2) * 10
  ) / 10;
  return { forwardRemaining, cumulativeOffline, trueRemaining };
}

export function checkApproachMilestone(hole: InterleavedHole, shots: ShotData[]): boolean {
  const targetStrokes = hole.par - 2;
  if (targetStrokes <= 0 || shots.length < targetStrokes) return false;
  const shotsToCheck = shots.slice(0, targetStrokes);
  const { trueRemaining } = computeRemaining(hole.distanceYards, shotsToCheck);
  return trueRemaining <= 100;
}

export function getScoreLabel(toPar: number): string {
  if (toPar <= -3) return 'Albatross';
  if (toPar === -2) return 'Eagle';
  if (toPar === -1) return 'Birdie';
  if (toPar === 0) return 'Par';
  if (toPar === 1) return 'Bogey';
  if (toPar === 2) return 'Double';
  if (toPar === 3) return 'Triple';
  return `+${toPar}`;
}

export function computeHoleScore(hole: InterleavedHole, shots: ShotData[]): HoleScore {
  const strokes = shots.length;
  const putts = 2;
  const total = strokes + putts;
  const toPar = total - hole.par;
  return {
    strokes,
    putts,
    total,
    toPar,
    label: getScoreLabel(toPar),
    approachMade: checkApproachMilestone(hole, shots),
  };
}
