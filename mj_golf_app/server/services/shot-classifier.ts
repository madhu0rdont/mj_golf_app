type ShotShape = 'straight' | 'draw' | 'fade' | 'hook' | 'slice' | 'pull' | 'push';
type ShotQuality = 'pure' | 'good' | 'acceptable' | 'mishit';
type Handedness = 'left' | 'right';

interface ShotLike {
  carryYards: number;
  spinAxis?: number;
  offlineYards?: number;
  [key: string]: unknown;
}

export function classifyShape(
  spinAxis?: number,
  offlineYards?: number,
  handedness: Handedness = 'right',
): ShotShape | undefined {
  if (spinAxis == null && offlineYards == null) return undefined;

  const flip = handedness === 'left' ? -1 : 1;
  const sa = (spinAxis ?? 0) * flip;
  const ol = (offlineYards ?? 0) * flip;

  if (Math.abs(sa) <= 2 && Math.abs(ol) <= 5) return 'straight';
  if (sa < -8 || (sa < -2 && ol < -15)) return 'hook';
  if (sa > 8 || (sa > 2 && ol > 15)) return 'slice';
  if (sa < -2) return 'draw';
  if (sa > 2) return 'fade';
  if (ol < -10) return 'pull';
  if (ol > 10) return 'push';

  return 'straight';
}

export function classifyQuality(
  carry: number,
  avgCarry: number,
  stdDev: number
): ShotQuality {
  if (stdDev === 0) return 'pure';
  const deviation = Math.abs(carry - avgCarry);
  if (deviation <= 0.5 * stdDev) return 'pure';
  if (deviation <= 1.0 * stdDev) return 'good';
  if (deviation <= 1.5 * stdDev) return 'acceptable';
  return 'mishit';
}

export function classifyAllShots<T extends ShotLike>(
  shots: T[],
  handedness: Handedness = 'right'
): (T & { shape?: ShotShape; quality: ShotQuality })[] {
  if (shots.length === 0) return [];

  const carries = shots.map((s) => s.carryYards);
  const avg = carries.reduce((a, b) => a + b, 0) / carries.length;
  const stdDev = carries.length <= 1
    ? 0
    : Math.sqrt(carries.reduce((sum, c) => sum + (c - avg) ** 2, 0) / (carries.length - 1));

  return shots.map((shot) => ({
    ...shot,
    shape: classifyShape(shot.spinAxis, shot.offlineYards, handedness),
    quality: classifyQuality(shot.carryYards, avg, stdDev),
  }));
}
