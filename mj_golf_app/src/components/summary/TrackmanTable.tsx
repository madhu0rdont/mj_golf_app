import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Shot, ShotShape, ShotQuality } from '../../models/session';
import { mean, stddev } from '../../services/stats';
import { THEME } from '../../theme/colors';

interface TrackmanTableProps {
  shots: Shot[];
  excludeMishits?: boolean;
}

const COLUMNS = [
  { key: 'carryYards' as const, label: 'Carry', unit: 'yds', decimals: 0 },
  { key: 'totalYards' as const, label: 'Total', unit: 'yds', decimals: 0 },
  { key: 'ballSpeed' as const, label: 'Ball Speed', unit: 'mph', decimals: 0 },
  { key: 'launchAngle' as const, label: 'Launch', unit: '°', decimals: 1 },
  { key: 'descentAngle' as const, label: 'Descent', unit: '°', decimals: 1 },
  { key: 'apexHeight' as const, label: 'Max Ht', unit: 'yds', decimals: 0 },
  { key: 'spinRate' as const, label: 'Total Spin', unit: 'rpm', decimals: 0 },
  { key: 'spinAxis' as const, label: 'Side Angle', unit: '°', decimals: 1 },
];

type ColKey = (typeof COLUMNS)[number]['key'];

const SHAPE_LABEL: Record<ShotShape, string> = {
  straight: 'Straight',
  draw: 'Draw',
  fade: 'Fade',
  hook: 'Hook',
  slice: 'Slice',
  pull: 'Pull',
  push: 'Push',
};

const QUALITY_COLOR: Record<ShotQuality, string> = {
  pure: 'text-primary',
  good: 'text-soft-blue',
  acceptable: 'text-gold',
  mishit: 'text-coral',
};

function formatVal(value: number | undefined, decimals: number, locale = false): string {
  if (value == null) return '\u2014';
  if (decimals > 0) return value.toFixed(decimals);
  const rounded = Math.round(value);
  return locale ? rounded.toLocaleString() : rounded.toString();
}

export function TrackmanTable({ shots, excludeMishits = false }: TrackmanTableProps) {
  const stats = useMemo(() => {
    const result = Object.fromEntries(
      COLUMNS.map((col) => {
        const vals = shots
          .map((s) => s[col.key] as number | undefined)
          .filter((v): v is number => v != null);
        return [col.key, {
          avg: vals.length > 0 ? mean(vals) : undefined,
          sd: vals.length > 1 ? stddev(vals) : undefined,
        }];
      })
    ) as Record<ColKey, { avg: number | undefined; sd: number | undefined }>;
    return result;
  }, [shots]);

  const dominantShape = useMemo(() => {
    const counts: Partial<Record<ShotShape, number>> = {};
    for (const s of shots) {
      if (s.shape) counts[s.shape] = (counts[s.shape] || 0) + 1;
    }
    let best: ShotShape | undefined;
    let max = 0;
    for (const [shape, count] of Object.entries(counts) as [ShotShape, number][]) {
      if (count > max) { max = count; best = shape; }
    }
    return best;
  }, [shots]);

  const pureRate = useMemo(() => {
    const graded = shots.filter((s) => s.quality);
    if (graded.length === 0) return undefined;
    const good = graded.filter((s) => s.quality === 'pure' || s.quality === 'good').length;
    return Math.round((good / graded.length) * 100);
  }, [shots]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted w-8">
                #
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-muted"
                >
                  {col.label}
                  <br />
                  <span className="font-normal normal-case tracking-normal text-text-faint">
                    ({col.unit})
                  </span>
                </th>
              ))}
              <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Shape
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Grade
              </th>
            </tr>
          </thead>
          <tbody>
            {shots.map((shot, i) => {
              const isMishit = shot.quality === 'mishit';
              const dimmed = excludeMishits && isMishit;
              return (
              <tr
                key={shot.shotNumber}
                className={`border-b border-border-light last:border-0 ${
                  i % 2 === 1 ? 'bg-surface/50' : ''
                } ${dimmed ? 'opacity-30' : ''}`}
              >
                <td className="sticky left-0 z-5 bg-card px-2 py-1.5 font-mono text-text-muted">
                  {shot.shotNumber}
                </td>
                {COLUMNS.map((col) => {
                  const val = shot[col.key] as number | undefined;
                  const isCheckCol = col.key === 'spinRate' || col.key === 'descentAngle';
                  const colStats = stats[col.key];
                  const withinOneSd =
                    isCheckCol &&
                    val != null &&
                    colStats.avg != null &&
                    colStats.sd != null &&
                    colStats.sd > 0 &&
                    Math.abs(val - colStats.avg) <= colStats.sd;
                  return (
                    <td
                      key={col.key}
                      className="px-2 py-1.5 text-right font-mono text-text-dark"
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {withinOneSd && <Check size={12} className="text-primary" />}
                        {formatVal(val, col.decimals, col.key === 'spinRate')}
                      </span>
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center">
                  {shot.shape ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: THEME.shotShape[shot.shape] }}
                      />
                      <span className="text-text-medium">{SHAPE_LABEL[shot.shape]}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">{'\u2014'}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {shot.quality ? (
                    <span className={`font-medium capitalize ${QUALITY_COLOR[shot.quality]}`}>
                      {shot.quality}
                    </span>
                  ) : (
                    <span className="text-text-faint">{'\u2014'}</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface/30">
              <td className="sticky left-0 z-10 bg-surface/30 px-2 py-1.5 font-semibold text-text-dark">
                Avg
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-2 py-1.5 text-right font-mono font-semibold text-text-dark"
                >
                  {formatVal(stats[col.key].avg, col.decimals, col.key === 'spinRate')}
                </td>
              ))}
              <td className="px-2 py-1.5 text-center font-semibold text-text-dark capitalize">
                {dominantShape ? (
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: THEME.shotShape[dominantShape] }}
                    />
                    {dominantShape}
                  </span>
                ) : '\u2014'}
              </td>
              <td className="px-2 py-1.5 text-center font-semibold text-text-dark">
                {pureRate != null ? `${pureRate}%` : '\u2014'}
              </td>
            </tr>
            <tr className="border-t border-border-light">
              <td className="sticky left-0 z-10 bg-card px-2 py-1.5 text-text-muted">
                Std. Dev.
              </td>
              {COLUMNS.map((col) => (
                <td
                  key={col.key}
                  className="px-2 py-1.5 text-right font-mono text-text-muted"
                >
                  {formatVal(stats[col.key].sd, col.decimals, col.key === 'spinRate')}
                </td>
              ))}
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
