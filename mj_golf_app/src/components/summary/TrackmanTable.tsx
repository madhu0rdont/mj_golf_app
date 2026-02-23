import { useMemo } from 'react';
import type { Shot } from '../../models/session';
import { mean, stddev } from '../../services/stats';

interface TrackmanTableProps {
  shots: Shot[];
}

const COLUMNS = [
  { key: 'ballSpeed' as const, label: 'Ball Speed', unit: 'mph', decimals: 0 },
  { key: 'launchAngle' as const, label: 'Launch', unit: '°', decimals: 1 },
  { key: 'spinRate' as const, label: 'Total Spin', unit: 'rpm', decimals: 0 },
  { key: 'spinAxis' as const, label: 'Side Angle', unit: '°', decimals: 1 },
  { key: 'carryYards' as const, label: 'Carry', unit: 'yds', decimals: 0 },
  { key: 'totalYards' as const, label: 'Total', unit: 'yds', decimals: 0 },
];

type ColKey = (typeof COLUMNS)[number]['key'];

function formatVal(value: number | undefined, decimals: number, locale = false): string {
  if (value == null) return '\u2014';
  if (decimals > 0) return value.toFixed(decimals);
  const rounded = Math.round(value);
  return locale ? rounded.toLocaleString() : rounded.toString();
}

export function TrackmanTable({ shots }: TrackmanTableProps) {
  const stats = useMemo(() => {
    const result: Record<ColKey, { avg: number | undefined; sd: number | undefined }> = {} as any;
    for (const col of COLUMNS) {
      const vals = shots
        .map((s) => s[col.key] as number | undefined)
        .filter((v): v is number => v != null);
      result[col.key] = {
        avg: vals.length > 0 ? mean(vals) : undefined,
        sd: vals.length > 1 ? stddev(vals) : undefined,
      };
    }
    return result;
  }, [shots]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-xs">
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
            </tr>
          </thead>
          <tbody>
            {shots.map((shot, i) => (
              <tr
                key={shot.shotNumber}
                className={`border-b border-border-light last:border-0 ${
                  i % 2 === 1 ? 'bg-surface/50' : ''
                }`}
              >
                <td className="sticky left-0 z-5 bg-card px-2 py-1.5 font-mono text-text-muted">
                  {shot.shotNumber}
                </td>
                {COLUMNS.map((col) => (
                  <td
                    key={col.key}
                    className="px-2 py-1.5 text-right font-mono text-text-dark"
                  >
                    {formatVal(
                      shot[col.key] as number | undefined,
                      col.decimals,
                      col.key === 'spinRate'
                    )}
                  </td>
                ))}
              </tr>
            ))}
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
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
