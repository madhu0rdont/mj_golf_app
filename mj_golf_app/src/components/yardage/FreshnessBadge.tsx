import type { DataFreshness } from '../../models/yardage';

const FRESHNESS_CONFIG: Record<DataFreshness, { dot: string; label: string; text: string }> = {
  fresh: { dot: 'bg-green-400', label: 'Fresh', text: 'text-green-400' },
  aging: { dot: 'bg-yellow-400', label: 'Aging', text: 'text-yellow-400' },
  stale: { dot: 'bg-red-400', label: 'Stale', text: 'text-red-400' },
};

export function FreshnessBadge({ freshness }: { freshness: DataFreshness }) {
  const config = FRESHNESS_CONFIG[freshness];
  return (
    <div className="flex items-center gap-1">
      <div className={`h-2 w-2 rounded-full ${config.dot}`} />
      <span className={`text-[10px] font-medium ${config.text}`}>{config.label}</span>
    </div>
  );
}
