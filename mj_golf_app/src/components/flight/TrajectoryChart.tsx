import { useMemo } from 'react';
import type { Shot } from '../../models/session';
import type { AxisScale } from './flight-math';
import { computeFlightArc, flightPathToSvg } from './flight-math';

interface TrajectoryChartProps {
  shots: Shot[];
  highlightedShotId: string | null;
  onShotTap: (shotId: string) => void;
  xScale: AxisScale;
  animated: boolean;
}

const WIDTH = 600;
const HEIGHT = 220;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 10 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function TrajectoryChart({
  shots,
  highlightedShotId,
  onShotTap,
  xScale,
  animated,
}: TrajectoryChartProps) {
  const arcs = useMemo(
    () => shots.map(computeFlightArc).filter((a): a is NonNullable<typeof a> => a != null),
    [shots]
  );

  const maxApex = useMemo(
    () => Math.max(...arcs.map((a) => a.apexY), 20) * 1.15,
    [arcs]
  );

  const sx = (x: number) =>
    MARGIN.left + ((x - xScale.min) / (xScale.max - xScale.min)) * PLOT_W;
  const sy = (y: number) =>
    MARGIN.top + (1 - y / maxApex) * PLOT_H;

  // X-axis tick positions
  const ticks: number[] = [];
  for (let x = xScale.min + xScale.step; x < xScale.max; x += xScale.step) {
    ticks.push(x);
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      style={{ height: '220px' }}
      role="img"
      aria-label="Side-view trajectory chart"
    >
      <rect width={WIDTH} height={HEIGHT} fill="#111" />

      {/* Grid lines */}
      {ticks.map((x) => (
        <line
          key={x}
          x1={sx(x)}
          y1={MARGIN.top}
          x2={sx(x)}
          y2={HEIGHT - MARGIN.bottom}
          stroke="#222"
          strokeWidth="0.5"
        />
      ))}

      {/* Ground line */}
      <line
        x1={MARGIN.left}
        y1={sy(0)}
        x2={WIDTH - MARGIN.right}
        y2={sy(0)}
        stroke="#2a2a2a"
        strokeWidth="1"
      />

      {/* X-axis labels */}
      {ticks.map((x) => (
        <text
          key={`label-${x}`}
          x={sx(x)}
          y={HEIGHT - 6}
          textAnchor="middle"
          fill="#555"
          fontSize="10"
          fontFamily="system-ui"
        >
          {x}
        </text>
      ))}

      {/* Flight arcs */}
      {arcs.map((arc, i) => {
        const isHighlighted = arc.shotId === highlightedShotId;
        const svgPath = flightPathToSvg(arc, sx, sy);
        if (!svgPath) return null;

        return (
          <g key={arc.shotId}>
            {/* Invisible wider hit area */}
            <path
              d={svgPath}
              fill="none"
              stroke="transparent"
              strokeWidth="12"
              style={{ cursor: 'pointer' }}
              onClick={() => onShotTap(arc.shotId)}
            />
            {/* Visible arc */}
            <path
              d={svgPath}
              fill="none"
              stroke={isHighlighted ? '#d4a843' : '#d4a843'}
              strokeWidth={isHighlighted ? 2.5 : 1.5}
              strokeOpacity={isHighlighted ? 1 : 0.35}
              className={animated ? 'flight-arc-animate' : ''}
              style={animated ? { animationDelay: `${0.3 + i * 0.1}s` } : undefined}
            />
            {/* Landing dot */}
            <circle
              cx={sx(arc.landingX)}
              cy={sy(0)}
              r={isHighlighted ? 3 : 2}
              fill={isHighlighted ? '#d4a843' : '#d4a84366'}
            />
          </g>
        );
      })}
    </svg>
  );
}
