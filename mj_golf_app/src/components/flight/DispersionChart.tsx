import { useMemo } from 'react';
import type { Shot } from '../../models/session';
import type { AxisScale } from './flight-math';
import { computeLandingDots, computeDispersionEllipse } from './flight-math';
import { THEME } from '../../theme/colors';

interface DispersionChartProps {
  shots: Shot[];
  highlightedShotId: string | null;
  onShotTap: (shotId: string) => void;
  xScale: AxisScale;
  animated: boolean;
}

const WIDTH = 400;
const HEIGHT = 220;
const MARGIN = { top: 8, right: 10, bottom: 8, left: 10 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function DispersionChart({
  shots,
  highlightedShotId,
  onShotTap,
  xScale,
  animated,
}: DispersionChartProps) {
  const dots = useMemo(() => computeLandingDots(shots), [shots]);
  const ellipse = useMemo(() => computeDispersionEllipse(dots), [dots]);

  // Y scale: symmetric around 0 based on max offline
  const maxOffline = useMemo(() => {
    const absValues = dots.map((d) => Math.abs(d.y));
    return Math.max(...absValues, 10) * 1.3;
  }, [dots]);

  const sx = (x: number) =>
    MARGIN.left + ((x - xScale.min) / (xScale.max - xScale.min)) * PLOT_W;
  const sy = (y: number) =>
    MARGIN.top + ((maxOffline - y) / (2 * maxOffline)) * PLOT_H;

  const centerY = sy(0);

  // X-axis tick positions (same as trajectory)
  const ticks: number[] = [];
  for (let x = xScale.min + xScale.step; x < xScale.max; x += xScale.step) {
    ticks.push(x);
  }

  // Scale ellipse radii from yards to SVG pixels
  const ellipseRxPx = ellipse
    ? (ellipse.rx / (xScale.max - xScale.min)) * PLOT_W
    : 0;
  const ellipseRyPx = ellipse
    ? (ellipse.ry / (2 * maxOffline)) * PLOT_H
    : 0;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      style={{ height: '220px', overflow: 'hidden' }}
      role="img"
      aria-label="Top-down dispersion chart"
    >
      <rect width={WIDTH} height={HEIGHT} fill={THEME.grass} />

      {/* Grid lines */}
      {ticks.map((x) => (
        <line
          key={x}
          x1={sx(x)}
          y1={MARGIN.top}
          x2={sx(x)}
          y2={HEIGHT - MARGIN.bottom}
          stroke={THEME.grassGrid}
          strokeWidth="0.5"
        />
      ))}

      {/* Target line (center) */}
      <line
        x1={MARGIN.left}
        y1={centerY}
        x2={WIDTH - MARGIN.right}
        y2={centerY}
        stroke={THEME.grassCenter}
        strokeWidth="1"
        strokeDasharray="4 3"
      />

      {/* L/R labels — after negation, positive Y = left of target (top), negative Y = right (bottom) */}
      <text x={MARGIN.left + 2} y={MARGIN.top + 10} fill={THEME.grassLabel} fontSize="8" fontFamily="system-ui">
        L
      </text>
      <text x={MARGIN.left + 2} y={HEIGHT - MARGIN.bottom - 4} fill={THEME.grassLabel} fontSize="8" fontFamily="system-ui">
        R
      </text>

      {/* Dispersion ellipse */}
      {ellipse && (
        <ellipse
          cx={sx(ellipse.cx)}
          cy={sy(ellipse.cy)}
          rx={Math.max(ellipseRxPx, 8)}
          ry={Math.max(ellipseRyPx, 4)}
          fill={THEME.gold}
          fillOpacity="0.08"
          stroke={THEME.gold}
          strokeOpacity="0.6"
          strokeWidth="1.5"
          className={animated ? 'ellipse-animate' : ''}
        />
      )}

      {/* Traces from origin to landing */}
      {dots.map((dot) => {
        const isHighlighted = dot.shotId === highlightedShotId;
        return (
          <line
            key={`trace-${dot.shotId}`}
            x1={sx(0)}
            y1={centerY}
            x2={sx(dot.x)}
            y2={sy(dot.y)}
            stroke={THEME.gold}
            strokeOpacity={isHighlighted ? 0.4 : 0.15}
            strokeWidth="0.5"
          />
        );
      })}

      {/* Landing dots */}
      {dots.map((dot, i) => {
        const isHighlighted = dot.shotId === highlightedShotId;
        return (
          <g key={dot.shotId}>
            {/* Hit area */}
            <circle
              cx={sx(dot.x)}
              cy={sy(dot.y)}
              r="12"
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onClick={() => onShotTap(dot.shotId)}
            />
            {/* Visible dot */}
            <circle
              cx={sx(dot.x)}
              cy={sy(dot.y)}
              r={isHighlighted ? 5 : 3}
              fill={THEME.gold}
              fillOpacity={isHighlighted ? 1 : 0.7}
              className={animated ? 'dot-animate' : ''}
              style={animated ? { animationDelay: `${0.8 + i * 0.08}s` } : undefined}
            />
          </g>
        );
      })}

      {/* Crosshair at average position */}
      {ellipse && (
        <>
          <line
            x1={sx(ellipse.cx) - 6}
            y1={sy(ellipse.cy)}
            x2={sx(ellipse.cx) + 6}
            y2={sy(ellipse.cy)}
            stroke={THEME.gold}
            strokeWidth="1"
          />
          <line
            x1={sx(ellipse.cx)}
            y1={sy(ellipse.cy) - 6}
            x2={sx(ellipse.cx)}
            y2={sy(ellipse.cy) + 6}
            stroke={THEME.gold}
            strokeWidth="1"
          />
        </>
      )}
    </svg>
  );
}
