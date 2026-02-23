import type { Shot } from '../../models/session';

export interface FlightPoint {
  x: number;
  y: number;
}

export interface FlightArc {
  shotId: string;
  points: FlightPoint[];
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

  const min = 0;
  const max = Math.ceil(maxCarry / 50) * 50 + 50;

  return { min, max, step: 50 };
}

const NUM_POINTS = 60;

/**
 * Evaluate a cubic bezier at parameter t.
 */
function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/**
 * Generate sampled points for a ball flight arc.
 * Returns null if the shot lacks launchAngle or apexHeight.
 * Points are in data space (yards, Y up).
 */
export function computeFlightArc(shot: Shot): FlightArc | null {
  if (shot.launchAngle == null || shot.apexHeight == null) return null;

  const carry = shot.carryYards;
  const apex = shot.apexHeight;
  const launchAngle = shot.launchAngle;
  const descentAngle = shot.descentAngle ?? 42;

  if (carry <= 0 || apex <= 0) return null;

  const apexX = carry * 0.55;
  const launchRad = (launchAngle * Math.PI) / 180;
  const descentRad = (descentAngle * Math.PI) / 180;

  // Segment 1: ground (0,0) → apex (apexX, apex)
  const cp1x = apexX * 0.4;
  const cp1y = cp1x * Math.tan(launchRad);
  const cp2x = apexX * 0.7;
  const cp2y = apex;

  // Segment 2: apex (apexX, apex) → landing (carry, 0)
  const tailLen = carry - apexX;
  const cp3x = apexX + tailLen * 0.3;
  const cp3y = apex;
  const cp4x = carry - tailLen * 0.15;
  const cp4y = tailLen * 0.15 * Math.tan(descentRad);

  const half = Math.floor(NUM_POINTS / 2);
  const points: FlightPoint[] = [];

  // Sample segment 1
  for (let i = 0; i <= half; i++) {
    const t = i / half;
    points.push({
      x: cubicBezier(0, cp1x, cp2x, apexX, t),
      y: cubicBezier(0, cp1y, cp2y, apex, t),
    });
  }

  // Sample segment 2 (skip t=0 to avoid duplicate apex point)
  for (let i = 1; i <= half; i++) {
    const t = i / half;
    points.push({
      x: cubicBezier(apexX, cp3x, cp4x, carry, t),
      y: cubicBezier(apex, cp3y, cp4y, 0, t),
    });
  }

  return { shotId: shot.id, points, landingX: carry, apexY: apex };
}

/**
 * Convert flight arc points to an SVG polyline points string.
 * Clips points to the visible x range and interpolates the entry edge.
 */
export function flightArcToPolyline(
  arc: FlightArc,
  sx: (x: number) => number,
  sy: (y: number) => number,
  xMin: number = 0
): string {
  const clipped: FlightPoint[] = [];
  for (let i = 0; i < arc.points.length; i++) {
    const p = arc.points[i];
    if (p.x >= xMin) {
      // Interpolate entry point at the clipping edge
      if (clipped.length === 0 && i > 0) {
        const prev = arc.points[i - 1];
        const frac = (xMin - prev.x) / (p.x - prev.x);
        clipped.push({ x: xMin, y: prev.y + frac * (p.y - prev.y) });
      }
      clipped.push(p);
    }
  }
  return clipped.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ');
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
 * Sized to contain all dots with a small padding.
 * Returns null if fewer than 3 dots.
 */
export function computeDispersionEllipse(dots: LandingDot[]): DispersionEllipse | null {
  if (dots.length < 3) return null;

  const xs = dots.map((d) => d.x);
  const ys = dots.map((d) => d.y);

  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;

  // Use max distance from center so the ellipse contains every dot
  const rx = Math.max(...xs.map((x) => Math.abs(x - cx))) * 1.15;
  const ry = Math.max(...ys.map((y) => Math.abs(y - cy))) * 1.15;

  return { cx, cy, rx: Math.max(rx, 3), ry: Math.max(ry, 2) };
}
