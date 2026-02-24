import type { InterleavedHole } from '../models/session';

export interface RemainingDistance {
  forwardRemaining: number;
  cumulativeOffline: number;
  trueRemaining: number;
}

export interface ScoringZone {
  target: number;       // par - 2: strokes to reach within 100 yds
  actual: number;       // how many strokes it actually took (Infinity if never reached before holing out)
  delta: number;        // actual - target (negative = ahead, positive = behind)
  applicable: boolean;  // false for par 3s where hole distance ≤ 100
}

export interface HoleScore {
  strokes: number;
  putts: number;
  total: number;
  toPar: number;
  label: string;
  approachMade: boolean;
  scoringZone: ScoringZone;
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

export function computeScoringZone(hole: InterleavedHole, shots: ShotData[]): ScoringZone {
  const target = hole.par - 2;

  // Not applicable if the hole itself starts within 100 yards
  if (hole.distanceYards <= 100) {
    return { target, actual: 0, delta: 0, applicable: false };
  }

  // Find the first shot index where true remaining drops to ≤ 100
  let actual = shots.length; // default: never reached (used all strokes)
  for (let i = 1; i <= shots.length; i++) {
    const { trueRemaining } = computeRemaining(hole.distanceYards, shots.slice(0, i));
    if (trueRemaining <= 100) {
      actual = i;
      break;
    }
  }

  return { target, actual, delta: actual - target, applicable: true };
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
    scoringZone: computeScoringZone(hole, shots),
  };
}
