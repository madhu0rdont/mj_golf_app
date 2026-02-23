import type { ShotShape, ShotQuality } from '../../models/session';
import { THEME } from '../../theme/colors';

interface CompactShot {
  shotNumber: number;
  carryYards: number | string;
  totalYards?: number | string;
  offlineYards?: number | string;
  ballSpeed?: number | string;
  launchAngle?: number | string;
  spinRate?: number | string;
  apexHeight?: number | string;
  shape?: ShotShape;
  quality?: ShotQuality;
}

interface CompactShotTableProps {
  shots: CompactShot[];
}

const QUALITY_COLOR: Record<ShotQuality, string> = {
  pure: 'text-primary',
  good: 'text-soft-blue',
  acceptable: 'text-gold',
  mishit: 'text-coral',
};

const SHAPE_ABBR: Record<ShotShape, string> = {
  straight: 'S',
  draw: 'D',
  fade: 'F',
  hook: 'H',
  slice: 'Sl',
  pull: 'Pu',
  push: 'Ps',
};

const COLUMNS = [
  { key: 'carryYards', label: 'Carry', width: 'w-14' },
  { key: 'totalYards', label: 'Total', width: 'w-14' },
  { key: 'offlineYards', label: 'Offline', width: 'w-14' },
  { key: 'ballSpeed', label: 'Ball Spd', width: 'w-16' },
  { key: 'launchAngle', label: 'Launch', width: 'w-14' },
  { key: 'spinRate', label: 'Spin', width: 'w-14' },
  { key: 'apexHeight', label: 'Apex', width: 'w-12' },
] as const;

function formatCell(key: string, value: number | string | undefined): string {
  if (value == null || value === '') return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  if (key === 'launchAngle') return num.toFixed(1);
  if (key === 'offlineYards') {
    const abs = Math.abs(num).toFixed(1);
    if (Math.abs(num) < 0.5) return '0';
    return num < 0 ? `${abs}L` : `${abs}R`;
  }
  return Math.round(num).toString();
}

export function CompactShotTable({ shots }: CompactShotTableProps) {
  return (
    <div className="mt-2 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-xs">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-muted w-8">
                #
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-muted ${col.width}`}
                >
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted w-10">
                Shape
              </th>
              <th className="px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-muted w-14">
                Quality
              </th>
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
                    {formatCell(col.key, shot[col.key as keyof CompactShot] as number | string | undefined)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center">
                  {shot.shape ? (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: THEME.shotShape[shot.shape] }}
                      />
                      <span className="text-text-medium">{SHAPE_ABBR[shot.shape]}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {shot.quality ? (
                    <span className={`font-medium capitalize ${QUALITY_COLOR[shot.quality]}`}>
                      {shot.quality}
                    </span>
                  ) : (
                    <span className="text-text-faint">—</span>
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
