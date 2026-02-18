import type { DataFreshness } from '../../models/yardage';

const FRESHNESS_CONFIG: Record<DataFreshness, { dot: string; label: string; text: string }> = {
  fresh: { dot: 'bg-primary', label: 'Fresh', text: 'text-primary' },
  aging: { dot: 'bg-amber-500', label: 'Aging', text: 'text-amber-600' },
  stale: { dot: 'bg-coral', label: 'Stale', text: 'text-coral' },
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
