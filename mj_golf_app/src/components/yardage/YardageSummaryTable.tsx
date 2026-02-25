import { useMemo } from 'react';
import type { ClubShotGroup } from '../../hooks/useYardageBook';
import type { ShotShape } from '../../models/session';
import { mean, stddev } from '../../services/stats';
import { THEME } from '../../theme/colors';
import type { ClubDistribution } from '../../services/monte-carlo';

interface YardageSummaryTableProps {
  clubs: ClubShotGroup[];
  distributions?: ClubDistribution[];
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

const SHAPE_LABEL: Record<ShotShape, string> = {
  straight: 'Straight',
  draw: 'Draw',
  fade: 'Fade',
  hook: 'Hook',
  slice: 'Slice',
  pull: 'Pull',
  push: 'Push',
};

type ColKey = (typeof COLUMNS)[number]['key'];

interface ClubStats {
  clubName: string;
  clubId: string;
  color: string;
  shotCount: number;
  avg: Record<ColKey, number | undefined>;
  sd: Record<ColKey, number | undefined>;
  avgCarry: number;
  avgOffline: number | undefined;
  sdOffline: number | undefined;
  imputed: boolean;
  dominantShape?: ShotShape;
}

function formatVal(value: number | undefined, decimals: number): string {
  if (value == null) return '\u2014';
  if (decimals > 0) return value.toFixed(decimals);
  const rounded = Math.round(value);
  return rounded.toLocaleString();
}

export function YardageSummaryTable({ clubs, distributions }: YardageSummaryTableProps) {
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

      // Offline stats
      let avgOffline: number | undefined;
      let sdOffline: number | undefined;
      if (!c.imputed) {
        const offlines = c.shots
          .map((s) => s.offlineYards)
          .filter((v): v is number => v != null);
        avgOffline = offlines.length > 0 ? mean(offlines) : undefined;
        sdOffline = offlines.length > 1 ? stddev(offlines) : undefined;
      } else {
        const dist = distributions?.find((d) => d.clubId === c.clubId);
        if (dist) {
          avgOffline = dist.meanOffline;
          sdOffline = dist.stdOffline;
        }
      }

      // Dominant shape
      let dominantShape: ShotShape | undefined;
      if (!c.imputed) {
        const counts: Partial<Record<ShotShape, number>> = {};
        for (const s of c.shots) {
          if (s.shape) counts[s.shape] = (counts[s.shape] || 0) + 1;
        }
        let max = 0;
        for (const [shape, count] of Object.entries(counts) as [ShotShape, number][]) {
          if (count > max) { max = count; dominantShape = shape; }
        }
      }

      return {
        clubName: c.clubName,
        clubId: c.clubId,
        color: c.color,
        shotCount: c.shots.length,
        avg,
        sd,
        avgCarry: avg.carryYards ?? 0,
        avgOffline,
        sdOffline,
        imputed: !!c.imputed,
        dominantShape,
      };
    });

    result.sort((a, b) => a.avgCarry - b.avgCarry);
    return result;
  }, [clubs]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
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
              <th className="px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Offline
                <br />
                <span className="font-normal normal-case tracking-normal text-text-faint">
                  (yds)
                </span>
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Shape
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.clubName} className={`${i % 2 === 1 ? 'bg-surface/30' : ''} ${row.imputed ? 'opacity-60' : ''}`}>
                <td className="sticky left-0 z-5 bg-card px-3 py-0 align-top" style={i % 2 === 1 ? { background: 'rgba(243,240,235,0.3)' } : undefined}>
                  <div className="flex items-center gap-1.5 pt-1.5">
                    <span
                      className={`inline-block h-2.5 w-2.5 flex-shrink-0 ${row.imputed ? 'rounded-full border border-current' : 'rounded-sm'}`}
                      style={row.imputed ? { borderColor: row.color } : { backgroundColor: row.color }}
                    />
                    <span className={`font-medium ${row.imputed ? 'italic text-text-medium' : 'text-text-dark'}`}>{row.clubName}</span>
                    {row.imputed && (
                      <span className="rounded bg-border px-1 py-px text-[9px] font-medium text-text-muted">Est.</span>
                    )}
                  </div>
                  <div className="pb-1.5 pl-4 text-[10px] text-text-muted">
                    {row.imputed ? 'Estimated' : `${row.shotCount} shot${row.shotCount !== 1 ? 's' : ''}`}
                  </div>
                </td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-1.5 text-right align-top">
                    <div className={`font-mono ${row.imputed ? 'italic text-text-medium' : 'font-semibold text-text-dark'}`}>
                      {formatVal(row.avg[col.key], col.decimals)}
                    </div>
                    {!row.imputed && (
                      <div className="font-mono text-[10px] text-text-muted">
                        {row.sd[col.key] != null ? `±${formatVal(row.sd[col.key], col.decimals)}` : ''}
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right align-top">
                  <div className={`font-mono ${row.imputed ? 'italic text-text-medium' : 'font-semibold text-text-dark'}`}>
                    {row.avgOffline != null
                      ? `${row.avgOffline >= 0 ? '+' : ''}${Math.round(row.avgOffline)}`
                      : '\u2014'}
                  </div>
                  {row.sdOffline != null && (
                    <div className="font-mono text-[10px] text-text-muted">
                      ±{Math.round(row.sdOffline)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center align-top">
                  {row.dominantShape ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: THEME.shotShape[row.dominantShape] }}
                      />
                      <span className="text-text-medium">{SHAPE_LABEL[row.dominantShape]}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">{'\u2014'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
