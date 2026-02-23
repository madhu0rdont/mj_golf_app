import { useMemo } from 'react';
import type { ClubShotGroup } from '../../hooks/useYardageBook';
import type { AxisScale, FlightArc } from '../flight/flight-math';
import { computeFlightArc, flightArcToPolyline } from '../flight/flight-math';
import { mean } from '../../services/stats';
import { THEME } from '../../theme/colors';
import type { Shot } from '../../models/session';

interface MultiClubTrajectoryChartProps {
  clubs: ClubShotGroup[];
  xScale: AxisScale;
}

const WIDTH = 600;
const HEIGHT = 220;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 10 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

/** Build a synthetic "average" shot for a club, then compute its flight arc. */
function averageArc(shots: Shot[]): FlightArc | null {
  const withData = shots.filter(
    (s) => s.launchAngle != null && s.apexHeight != null && s.carryYards > 0 && s.apexHeight! > 0
  );
  if (withData.length === 0) return null;

  const avgShot: Shot = {
    id: 'avg',
    sessionId: '',
    clubId: '',
    shotNumber: 0,
    carryYards: mean(withData.map((s) => s.carryYards)),
    launchAngle: mean(withData.map((s) => s.launchAngle!)),
    apexHeight: mean(withData.map((s) => s.apexHeight!)),
    descentAngle: mean(
      withData.filter((s) => s.descentAngle != null).map((s) => s.descentAngle!)
    ) || 42,
    timestamp: 0,
  };

  return computeFlightArc(avgShot);
}

export function MultiClubTrajectoryChart({ clubs, xScale }: MultiClubTrajectoryChartProps) {
  const clubArcs = useMemo(
    () =>
      clubs
        .map((c) => ({ color: c.color, clubName: c.clubName, arc: averageArc(c.shots) }))
        .filter((c): c is { color: string; clubName: string; arc: FlightArc } => c.arc != null),
    [clubs]
  );

  const maxApex = useMemo(
    () => Math.max(...clubArcs.map((c) => c.arc.apexY), 20) * 1.15,
    [clubArcs]
  );

  const sx = (x: number) =>
    MARGIN.left + ((x - xScale.min) / (xScale.max - xScale.min)) * PLOT_W;
  const sy = (y: number) =>
    MARGIN.top + (1 - y / maxApex) * PLOT_H;

  const xTicks: number[] = [];
  for (let x = xScale.min + xScale.step; x < xScale.max; x += xScale.step) {
    xTicks.push(x);
  }

  const yStep = maxApex > 40 ? 20 : 10;
  const yTicks: number[] = [];
  for (let y = yStep; y < maxApex; y += yStep) {
    yTicks.push(y);
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      style={{ height: '220px', overflow: 'hidden' }}
      role="img"
      aria-label="Multi-club trajectory chart"
    >
      <rect width={WIDTH} height={HEIGHT} fill={THEME.sky} />

      {/* Vertical grid lines */}
      {xTicks.map((x) => (
        <line
          key={x}
          x1={sx(x)} y1={MARGIN.top}
          x2={sx(x)} y2={HEIGHT - MARGIN.bottom}
          stroke={THEME.skyGrid} strokeWidth="0.5"
        />
      ))}

      {/* Horizontal grid lines */}
      {yTicks.map((y) => (
        <line
          key={`h-${y}`}
          x1={MARGIN.left} y1={sy(y)}
          x2={WIDTH - MARGIN.right} y2={sy(y)}
          stroke={THEME.skyGrid} strokeWidth="0.5"
        />
      ))}

      {/* Ground line */}
      <line
        x1={MARGIN.left} y1={sy(0)}
        x2={WIDTH - MARGIN.right} y2={sy(0)}
        stroke={THEME.skyGround} strokeWidth="1"
      />

      {/* X-axis labels */}
      {xTicks.map((x) => (
        <text
          key={`label-${x}`}
          x={sx(x)} y={HEIGHT - 6}
          textAnchor="middle"
          fill={THEME.skyLabel} fontSize="10" fontFamily="system-ui"
        >
          {x}
        </text>
      ))}

      {/* Club arcs */}
      {clubArcs.map(({ color, clubName, arc }) => {
        const polyPoints = flightArcToPolyline(arc, sx, sy, xScale.min);
        return (
          <g key={clubName}>
            <polyline
              points={polyPoints}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeOpacity={0.85}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle
              cx={sx(arc.landingX)}
              cy={sy(0)}
              r={3}
              fill={color}
              fillOpacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}
