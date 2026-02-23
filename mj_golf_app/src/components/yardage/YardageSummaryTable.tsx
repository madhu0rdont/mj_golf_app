import { useMemo } from 'react';
import type { ClubShotGroup } from '../../hooks/useYardageBook';
import { mean, stddev } from '../../services/stats';

interface YardageSummaryTableProps {
  clubs: ClubShotGroup[];
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

interface ClubStats {
  clubName: string;
  color: string;
  shotCount: number;
  avg: Record<ColKey, number | undefined>;
  sd: Record<ColKey, number | undefined>;
  avgCarry: number;
}

function formatVal(value: number | undefined, decimals: number): string {
  if (value == null) return '\u2014';
  if (decimals > 0) return value.toFixed(decimals);
  const rounded = Math.round(value);
  return rounded.toLocaleString();
}

export function YardageSummaryTable({ clubs }: YardageSummaryTableProps) {
  const rows = useMemo(() => {
    const result: ClubStats[] = clubs.map((c) => {
      const avg = {} as Record<ColKey, number | undefined>;
      const sd = {} as Record<ColKey, number | undefined>;

      for (const col of COLUMNS) {
        const vals = c.shots
          .map((s) => s[col.key] as number | undefined)
          .filter((v): v is number => v != null);
        avg[col.key] = vals.length > 0 ? mean(vals) : undefined;
        sd[col.key] = vals.length > 1 ? stddev(vals) : undefined;
      }

      return {
        clubName: c.clubName,
        color: c.color,
        shotCount: c.shots.length,
        avg,
        sd,
        avgCarry: avg.carryYards ?? 0,
      };
    });

    result.sort((a, b) => a.avgCarry - b.avgCarry);
    return result;
  }, [clubs]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Club
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
            {rows.map((row, i) => (
              <tr key={row.clubName} className={i % 2 === 1 ? 'bg-surface/30' : ''}>
                {/* Club name spans 2 visual rows via rowSpan-like layout */}
                <td className="sticky left-0 z-5 bg-card px-3 py-0 align-top" style={i % 2 === 1 ? { background: 'rgba(243,240,235,0.3)' } : undefined}>
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="font-medium text-text-dark">{row.clubName}</span>
                  </div>
                  <div className="pb-1.5 pl-4 text-[10px] text-text-muted">
                    {row.shotCount} shot{row.shotCount !== 1 ? 's' : ''}
                  </div>
                </td>
                {/* Avg + Std Dev stacked in each cell */}
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-1.5 text-right align-top">
                    <div className="font-mono font-semibold text-text-dark">
                      {formatVal(row.avg[col.key], col.decimals)}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted">
                      {row.sd[col.key] != null ? `±${formatVal(row.sd[col.key], col.decimals)}` : ''}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
