import type { Shot } from '../../models/session';

export interface FlightArc {
  shotId: string;
  path: string; // SVG path d attribute
  landingX: number;
  apexY: number;
}

export interface LandingDot {
  shotId: string;
  x: number; // carry yards
  y: number; // offline yards (positive = right)
}

export interface DispersionEllipse {
  cx: number;
  cy: number;
  rx: number; // stddev in carry direction
  ry: number; // stddev in offline direction
}

export interface AxisScale {
  min: number;
  max: number;
  step: number;
}

/**
 * Compute a shared X-axis scale based on carry distances.
 * Rounds min down and max up to nearest 50 yards.
 */
export function computeXScale(shots: Shot[]): AxisScale {
  if (shots.length === 0) return { min: 0, max: 200, step: 50 };

  const carries = shots.map((s) => s.carryYards);
  const minCarry = Math.min(...carries);
  const maxCarry = Math.max(...carries);

  const min = Math.max(0, Math.floor(minCarry / 50) * 50 - 50);
  const max = Math.ceil(maxCarry / 50) * 50 + 50;

  return { min, max, step: 50 };
}

/**
 * Generate an SVG path string for a ball flight arc using two cubic bezier segments.
 * Returns null if the shot lacks launchAngle or apexHeight.
 *
 * The path is in "data space" (yards), not SVG coordinates.
 * The caller is responsible for applying coordinate transforms.
 */
export function computeFlightArc(shot: Shot): FlightArc | null {
  if (shot.launchAngle == null || shot.apexHeight == null) return null;

  const carry = shot.carryYards;
  const apex = shot.apexHeight;
  const launchAngle = shot.launchAngle;
  const descentAngle = shot.descentAngle ?? 42;

  if (carry <= 0 || apex <= 0) return null;

  // Apex is typically at ~55% of carry distance
  const apexX = carry * 0.55;

  const launchRad = (launchAngle * Math.PI) / 180;
  const descentRad = (descentAngle * Math.PI) / 180;

  // Segment 1: ground (0,0) → apex (apexX, apex)
  const cp1x = apexX * 0.4;
  const cp1y = cp1x * Math.tan(launchRad);
  const cp2x = apexX - apexX * 0.3;
  const cp2y = apex;

  // Segment 2: apex (apexX, apex) → landing (carry, 0)
  const tailLen = carry - apexX;
  const cp3x = apexX + tailLen * 0.3;
  const cp3y = apex;
  const cp4x = carry - tailLen * 0.15;
  const cp4y = tailLen * 0.15 * Math.tan(descentRad);

  // Build SVG path in data coordinates (Y up)
  const path =
    `M 0 0 ` +
    `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${apexX} ${apex} ` +
    `C ${cp3x} ${cp3y}, ${cp4x} ${cp4y}, ${carry} 0`;

  return { shotId: shot.id, path, landingX: carry, apexY: apex };
}

/**
 * Convert a flight arc in data coordinates to SVG coordinates.
 * SVG has Y inverted (0 at top).
 */
export function flightPathToSvg(
  arc: FlightArc,
  sx: (x: number) => number,
  sy: (y: number) => number
): string {
  // Parse the data-space path and transform to SVG coordinates
  const { path } = arc;
  // path format: "M 0 0 C cp1x cp1y, cp2x cp2y, ax ay C cp3x cp3y, cp4x cp4y, cx 0"
  const nums = path.match(/-?\d+\.?\d*/g)?.map(Number);
  if (!nums || nums.length !== 14) return '';

  const [, , , c1x, c1y, c2x, c2y, ax, ay, c3x, c3y, c4x, c4y, ex] = nums;

  return (
    `M ${sx(0)} ${sy(0)} ` +
    `C ${sx(c1x)} ${sy(c1y)}, ${sx(c2x)} ${sy(c2y)}, ${sx(ax)} ${sy(ay)} ` +
    `C ${sx(c3x)} ${sy(c3y)}, ${sx(c4x)} ${sy(c4y)}, ${sx(ex)} ${sy(0)}`
  );
}

/**
 * Map shots to landing dot coordinates for the dispersion chart.
 */
export function computeLandingDots(shots: Shot[]): LandingDot[] {
  return shots.map((s) => ({
    shotId: s.id,
    x: s.carryYards,
    y: s.offlineYards ?? 0,
  }));
}

/**
 * Compute dispersion ellipse from landing dots.
 * Returns null if fewer than 3 dots.
 */
export function computeDispersionEllipse(dots: LandingDot[]): DispersionEllipse | null {
  if (dots.length < 3) return null;

  const xs = dots.map((d) => d.x);
  const ys = dots.map((d) => d.y);

  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

  const rx = Math.sqrt(xs.reduce((sum, x) => sum + (x - cx) ** 2, 0) / xs.length);
  const ry = Math.sqrt(ys.reduce((sum, y) => sum + (y - cy) ** 2, 0) / ys.length);

  return { cx, cy, rx: Math.max(rx, 2), ry: Math.max(ry, 1) };
}
