import { useMemo } from 'react';
import { THEME } from '../../theme/colors';

interface CarryStripChartProps {
  carries: number[];
  avgCarry: number;
  medianCarry: number;
  stdDevCarry: number;
}

const WIDTH = 600;
const HEIGHT = 56;
const MARGIN = { left: 12, right: 12 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const DOT_R = 4;
const BAND_HEIGHT = 24;

export function CarryStripChart({ carries, avgCarry, medianCarry, stdDevCarry }: CarryStripChartProps) {
  const { min, max } = useMemo(() => {
    const lo = Math.min(...carries);
    const hi = Math.max(...carries);
    const pad = Math.max((hi - lo) * 0.15, 5);
    return { min: lo - pad, max: hi + pad };
  }, [carries]);

  const sx = (v: number) => MARGIN.left + ((v - min) / (max - min)) * PLOT_W;

  // Deterministic vertical jitter based on index
  const jitter = (i: number) => {
    const seed = ((i * 7919 + 104729) % 13) / 13; // pseudo-random 0-1
    return HEIGHT / 2 + (seed - 0.5) * BAND_HEIGHT;
  };

  if (carries.length < 3) {
    return (
      <div className="mt-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <div className="flex justify-between text-xs text-text-muted">
          <span>Min: <strong className="text-text-dark">{Math.round(Math.min(...carries))}</strong></span>
          <span>Median: <strong className="text-text-dark">{Math.round(medianCarry)}</strong></span>
          <span>Max: <strong className="text-text-dark">{Math.round(Math.max(...carries))}</strong></span>
        </div>
      </div>
    );
  }

  const sigmaLeft = sx(avgCarry - stdDevCarry);
  const sigmaRight = sx(avgCarry + stdDevCarry);

  return (
    <div className="mt-2 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" style={{ height: '56px' }}>
        {/* 1σ band */}
        <rect
          x={Math.max(MARGIN.left, sigmaLeft)}
          y={(HEIGHT - BAND_HEIGHT) / 2}
          width={Math.min(sigmaRight, WIDTH - MARGIN.right) - Math.max(MARGIN.left, sigmaLeft)}
          height={BAND_HEIGHT}
          fill={THEME.primaryPale}
          opacity={0.35}
          rx={4}
        />

        {/* Median line */}
        <line
          x1={sx(medianCarry)}
          y1={8}
          x2={sx(medianCarry)}
          y2={HEIGHT - 8}
          stroke={THEME.textMuted}
          strokeWidth={1}
          strokeDasharray="2 2"
        />

        {/* Average line */}
        <line
          x1={sx(avgCarry)}
          y1={6}
          x2={sx(avgCarry)}
          y2={HEIGHT - 6}
          stroke={THEME.primary}
          strokeWidth={1.5}
          strokeDasharray="4 2"
        />

        {/* Dots */}
        {carries.map((c, i) => (
          <circle
            key={i}
            cx={sx(c)}
            cy={jitter(i)}
            r={DOT_R}
            fill={THEME.gold}
            fillOpacity={0.7}
            className="strip-dot-animate"
            style={{ animationDelay: `${i * 0.04}s` }}
          />
        ))}

        {/* Labels */}
        <text x={sx(avgCarry)} y={5} textAnchor="middle" fill={THEME.primary} fontSize="7" fontFamily="system-ui" fontWeight="600">
          AVG
        </text>
        <text x={sx(medianCarry)} y={HEIGHT - 1} textAnchor="middle" fill={THEME.textMuted} fontSize="7" fontFamily="system-ui">
          MED
        </text>
      </svg>

      <div className="flex justify-between px-4 pb-2 text-[10px] text-text-muted">
        <span>Min: <strong className="text-text-dark">{Math.round(Math.min(...carries))}</strong></span>
        <span>Median: <strong className="text-text-dark">{Math.round(medianCarry)}</strong></span>
        <span>Max: <strong className="text-text-dark">{Math.round(Math.max(...carries))}</strong></span>
        <span>SD: <strong className="text-text-dark">{stdDevCarry}</strong></span>
      </div>
    </div>
  );
}
