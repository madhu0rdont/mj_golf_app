interface LaunchMetric {
  label: string;
  value: number | undefined;
  unit: string;
  min: number;
  max: number;
  format?: (v: number) => string;
}

interface LaunchProfileCardProps {
  ballSpeed?: number;
  clubHeadSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
}

const METRICS: Omit<LaunchMetric, 'value'>[] = [
  { label: 'Ball Speed', unit: 'mph', min: 80, max: 190 },
  { label: 'Club Speed', unit: 'mph', min: 60, max: 130 },
  { label: 'Launch Angle', unit: '°', min: 0, max: 40, format: (v) => v.toFixed(1) },
  { label: 'Spin Rate', unit: 'rpm', min: 1500, max: 10000, format: (v) => v.toLocaleString() },
];

export function LaunchProfileCard({
  ballSpeed,
  clubHeadSpeed,
  launchAngle,
  spinRate,
}: LaunchProfileCardProps) {
  const values = [ballSpeed, clubHeadSpeed, launchAngle, spinRate];
  const rows = METRICS.map((m, i) => ({ ...m, value: values[i] })).filter(
    (r) => r.value != null
  );

  if (rows.length === 0) return null;

  return (
    <div className="mt-2 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const pct = Math.min(100, Math.max(0, ((row.value! - row.min) / (row.max - row.min)) * 100));
          const display = row.format ? row.format(row.value!) : Math.round(row.value!).toString();

          return (
            <div key={row.label} className="flex items-center gap-3">
              <div className="w-24 shrink-0">
                <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  {row.label}
                </div>
                <div className="flex items-baseline gap-0.5">
                  <span className="text-lg font-bold font-mono text-text-dark">{display}</span>
                  <span className="text-[10px] text-text-muted">{row.unit}</span>
                </div>
              </div>
              <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
