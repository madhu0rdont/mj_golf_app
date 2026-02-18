import type { ShotQuality } from '../../models/session';

interface QualityBarProps {
  distribution: Partial<Record<ShotQuality, number>>;
  total: number;
}

const QUALITY_CONFIG: { key: ShotQuality; label: string; color: string }[] = [
  { key: 'pure', label: 'Pure', color: 'bg-green-500' },
  { key: 'good', label: 'Good', color: 'bg-blue-500' },
  { key: 'acceptable', label: 'OK', color: 'bg-yellow-500' },
  { key: 'mishit', label: 'Mishit', color: 'bg-red-500' },
];

export function QualityBar({ distribution, total }: QualityBarProps) {
  if (total === 0) return null;

  return (
    <div>
      <div className="mb-2 flex h-4 overflow-hidden rounded-full">
        {QUALITY_CONFIG.map(({ key, color }) => {
          const count = distribution[key] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={key}
              className={`${color} transition-all`}
              style={{ width: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px]">
        {QUALITY_CONFIG.map(({ key, label, color }) => {
          const count = distribution[key] || 0;
          return (
            <div key={key} className="flex items-center gap-1 text-text-medium">
              <div className={`h-2 w-2 rounded-full ${color}`} />
              <span>
                {label} ({count})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
