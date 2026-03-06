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
    <div className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b-2 border-card-border bg-bg2 sticky top-0 z-20">
              <th className="sticky left-0 z-10 bg-bg2 px-4 py-2.5 text-left font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
                Club
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2.5 text-right font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint leading-tight"
                >
                  {col.label}
                  <br />
                  <span className="font-normal normal-case tracking-normal">
                    ({col.unit})
                  </span>
                </th>
              ))}
              <th className="px-2 py-2.5 text-right font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint leading-tight">
                Offline
                <br />
                <span className="font-normal normal-case tracking-normal">
                  (yds)
                </span>
              </th>
              <th className="px-2 py-2.5 text-center font-mono text-[9px] tracking-[0.2em] uppercase text-ink-faint">
                Shape
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.clubName}
                className={`border-b border-card-border hover:bg-white/50 transition-colors cursor-pointer ${row.imputed ? 'opacity-50' : ''}`}
              >
                <td className="sticky left-0 z-5 bg-surface px-4 py-3 align-middle">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: row.color }}
                    />
                    <div>
                      <div className="font-display text-[17px] font-normal text-ink leading-none">
                        {row.clubName}
                      </div>
                      <div className="font-mono text-[9px] text-ink-faint tracking-[0.1em]">
                        {row.imputed ? 'Estimated' : `${row.shotCount} shots`}
                      </div>
                    </div>
                  </div>
                </td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className="px-2 py-3 text-right align-middle">
                    <div className="font-display text-xl font-normal text-ink leading-none">
                      {formatVal(row.avg[col.key], col.decimals)}
                    </div>
                    {!row.imputed && row.sd[col.key] != null && (
                      <div className="font-mono text-[9px] text-ink-faint tracking-[0.05em] mt-0.5">
                        ±{formatVal(row.sd[col.key], col.decimals)}
                      </div>
                    )}
                  </td>
                ))}
                <td className="px-2 py-3 text-right align-middle">
                  <div className="font-display text-xl font-normal text-ink leading-none">
                    {row.avgOffline != null
                      ? `${row.avgOffline >= 0 ? '+' : ''}${Math.round(row.avgOffline)}`
                      : '\u2014'}
                  </div>
                  {row.sdOffline != null && (
                    <div className="font-mono text-[9px] text-ink-faint tracking-[0.05em] mt-0.5">
                      ±{Math.round(row.sdOffline)}
                    </div>
                  )}
                </td>
                <td className="px-2 py-3 text-center align-middle">
                  {row.dominantShape ? (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-mid tracking-[0.05em]">
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: THEME.shotShape[row.dominantShape] }}
                      />
                      {SHAPE_LABEL[row.dominantShape]}
                    </span>
                  ) : (
                    <span className="text-ink-faint">{'\u2014'}</span>
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
