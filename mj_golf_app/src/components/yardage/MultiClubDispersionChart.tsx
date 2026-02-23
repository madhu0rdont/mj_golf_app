import { useMemo } from 'react';
import type { ClubShotGroup } from '../../hooks/useYardageBook';
import type { AxisScale } from '../flight/flight-math';
import { computeLandingDots, computeDispersionEllipse } from '../flight/flight-math';
import { THEME } from '../../theme/colors';

interface MultiClubDispersionChartProps {
  clubs: ClubShotGroup[];
  xScale: AxisScale;
}

const WIDTH = 400;
const HEIGHT = 220;
const MARGIN = { top: 8, right: 10, bottom: 8, left: 10 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function MultiClubDispersionChart({ clubs, xScale }: MultiClubDispersionChartProps) {
  const clubData = useMemo(
    () =>
      clubs.map((c) => {
        const dots = computeLandingDots(c.shots);
        const ellipse = computeDispersionEllipse(dots);
        return { color: c.color, clubName: c.clubName, dots, ellipse };
      }),
    [clubs]
  );

  const maxOffline = useMemo(() => {
    const allAbs = clubData.flatMap((c) => c.dots.map((d) => Math.abs(d.y)));
    return Math.max(...allAbs, 10) * 1.3;
  }, [clubData]);

  const sx = (x: number) =>
    MARGIN.left + ((x - xScale.min) / (xScale.max - xScale.min)) * PLOT_W;
  const sy = (y: number) =>
    MARGIN.top + ((maxOffline - y) / (2 * maxOffline)) * PLOT_H;

  const centerY = sy(0);

  const ticks: number[] = [];
  for (let x = xScale.min + xScale.step; x < xScale.max; x += xScale.step) {
    ticks.push(x);
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      style={{ height: '220px', overflow: 'hidden' }}
      role="img"
      aria-label="Multi-club dispersion chart"
    >
      <rect width={WIDTH} height={HEIGHT} fill={THEME.grass} />

      {/* Grid lines */}
      {ticks.map((x) => (
        <line
          key={x}
          x1={sx(x)} y1={MARGIN.top}
          x2={sx(x)} y2={HEIGHT - MARGIN.bottom}
          stroke={THEME.grassGrid} strokeWidth="0.5"
        />
      ))}

      {/* Target line (center) */}
      <line
        x1={MARGIN.left} y1={centerY}
        x2={WIDTH - MARGIN.right} y2={centerY}
        stroke={THEME.grassCenter} strokeWidth="1" strokeDasharray="4 3"
      />

      {/* L/R labels */}
      <text x={MARGIN.left + 2} y={MARGIN.top + 10} fill={THEME.grassLabel} fontSize="8" fontFamily="system-ui">
        L
      </text>
      <text x={MARGIN.left + 2} y={HEIGHT - MARGIN.bottom - 4} fill={THEME.grassLabel} fontSize="8" fontFamily="system-ui">
        R
      </text>

      {/* Ellipses (render behind dots) */}
      {clubData.map(({ color, clubName, ellipse }) => {
        if (!ellipse) return null;
        const rxPx = (ellipse.rx / (xScale.max - xScale.min)) * PLOT_W;
        const ryPx = (ellipse.ry / (2 * maxOffline)) * PLOT_H;
        return (
          <ellipse
            key={`ell-${clubName}`}
            cx={sx(ellipse.cx)}
            cy={sy(ellipse.cy)}
            rx={Math.max(rxPx, 8)}
            ry={Math.max(ryPx, 4)}
            fill={color}
            fillOpacity={0.08}
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth="1.5"
          />
        );
      })}

      {/* Landing dots */}
      {clubData.map(({ color, clubName, dots }) =>
        dots.map((dot, i) => (
          <circle
            key={`${clubName}-${i}`}
            cx={sx(dot.x)}
            cy={sy(dot.y)}
            r={2.5}
            fill={color}
            fillOpacity={0.7}
          />
        ))
      )}
    </svg>
  );
}
