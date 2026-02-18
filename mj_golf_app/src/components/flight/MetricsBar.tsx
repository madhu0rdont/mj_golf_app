import type { Shot } from '../../models/session';
import { mean } from '../../services/stats';

interface MetricsBarProps {
  shots: Shot[];
  highlightedShotId: string | null;
}

interface MetricDef {
  label: string;
  key: keyof Shot;
  unit: string;
  format?: (v: number) => string;
  accent?: boolean;
}

const METRICS: MetricDef[] = [
  { label: 'SPEED', key: 'ballSpeed', unit: 'mph' },
  { label: 'LAUNCH', key: 'launchAngle', unit: '°', format: (v) => v.toFixed(1) },
  { label: 'SPIN', key: 'spinRate', unit: 'rpm', format: (v) => v.toLocaleString() },
  { label: 'CARRY', key: 'carryYards', unit: 'yds', accent: true },
  { label: 'TOTAL', key: 'totalYards', unit: 'yds', accent: true },
  { label: 'PUSH/PULL', key: 'pushPull', unit: '°', format: (v) => v.toFixed(1) },
  { label: 'SIDESPIN', key: 'sideSpinRate', unit: 'rpm' },
  { label: 'DESCENT', key: 'descentAngle', unit: '°', format: (v) => v.toFixed(1) },
  { label: 'PEAK HT', key: 'apexHeight', unit: 'yds' },
  { label: 'OFFLINE', key: 'offlineYards', unit: 'yds', format: (v) => Math.abs(v).toFixed(1) },
];

function formatValue(value: number | undefined, metric: MetricDef): string {
  if (value == null) return '—';
  if (metric.format) return metric.format(value);
  return Math.round(value).toString();
}

function getAvg(shots: Shot[], key: keyof Shot): number | undefined {
  const vals = shots
    .map((s) => s[key] as number | undefined)
    .filter((v): v is number => v != null);
  return vals.length > 0 ? mean(vals) : undefined;
}

export function MetricsBar({ shots, highlightedShotId }: MetricsBarProps) {
  const displayShot = highlightedShotId
    ? shots.find((s) => s.id === highlightedShotId)
    : shots[shots.length - 1]; // last shot

  return (
    <div className="overflow-x-auto scrollbar-none border-b border-gray-800/50">
      <div className="flex min-w-max">
        {/* Row labels */}
        <div className="flex flex-col justify-center gap-0.5 px-2 py-2 shrink-0">
          <span className="text-[8px] text-gray-600 uppercase tracking-wider">&nbsp;</span>
          <span className="text-[9px] text-gray-500 font-medium">LAST</span>
          <span className="text-[9px] text-gray-600 font-medium">AVG</span>
        </div>

        {METRICS.map((metric) => {
          const lastVal = displayShot ? (displayShot[metric.key] as number | undefined) : undefined;
          const avgVal = getAvg(shots, metric.key);

          return (
            <div
              key={metric.key}
              className="flex flex-col items-center px-2.5 py-2 min-w-[62px]"
              style={metric.accent ? { borderBottom: '2px solid #d4a843' } : undefined}
            >
              <span className="text-[8px] text-gray-500 uppercase tracking-wider leading-none mb-1">
                {metric.label}
              </span>
              <span
                className="text-sm font-bold tabular-nums leading-none"
                style={{ color: metric.accent ? '#d4a843' : '#ffffff' }}
              >
                {formatValue(lastVal, metric)}
              </span>
              <span className="text-[10px] text-gray-500 tabular-nums leading-none mt-0.5">
                {formatValue(avgVal, metric)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
