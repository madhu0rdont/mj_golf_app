import type { ShotShape, ShotQuality, Shot } from '../models/session';
import type { Handedness } from '../context/SettingsContext';

export function classifyShape(
  spinAxis?: number,
  offlineYards?: number,
  handedness: Handedness = 'right',
): ShotShape | undefined {
  if (spinAxis == null && offlineYards == null) return undefined;

  // For left-handed golfers, negate spin axis and offline so the same
  // thresholds produce correctly named shapes (draw/fade/hook/slice flip).
  const flip = handedness === 'left' ? -1 : 1;
  const sa = (spinAxis ?? 0) * flip;
  const ol = (offlineYards ?? 0) * flip;

  // Straight: minimal spin axis and minimal offline
  if (Math.abs(sa) <= 2 && Math.abs(ol) <= 5) return 'straight';

  // Heavy curve: hook or slice
  if (sa < -8 || (sa < -2 && ol < -15)) return 'hook';
  if (sa > 8 || (sa > 2 && ol > 15)) return 'slice';

  // Moderate curve: draw or fade
  if (sa < -2) return 'draw';
  if (sa > 2) return 'fade';

  // Straight spin axis but offline: pull or push
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

export function classifyAllShots(shots: Shot[], handedness: Handedness = 'right'): Shot[] {
  if (shots.length === 0) return shots;

  const carries = shots.map((s) => s.carryYards);
  const avg = carries.reduce((a, b) => a + b, 0) / carries.length;
  const variance = carries.reduce((sum, c) => sum + (c - avg) ** 2, 0) / carries.length;
  const stdDev = Math.sqrt(variance);

  return shots.map((shot) => ({
    ...shot,
    shape: classifyShape(shot.spinAxis, shot.offlineYards, handedness),
    quality: classifyQuality(shot.carryYards, avg, stdDev),
  }));
}
