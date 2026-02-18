import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ProgressDelta } from '../../services/stats';

interface StatCardProps {
  label: string;
  value: number | string;
  unit?: string;
  delta?: ProgressDelta;
}

export function StatCard({ label, value, unit, delta }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </div>
      {delta && delta.direction !== 'neutral' && (
        <div
          className={`mt-1 flex items-center gap-1 text-xs ${
            delta.improved ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {delta.direction === 'up' ? (
            <TrendingUp size={12} />
          ) : delta.direction === 'down' ? (
            <TrendingDown size={12} />
          ) : (
            <Minus size={12} />
          )}
          <span>
            {delta.delta > 0 ? '+' : ''}
            {delta.delta}
          </span>
        </div>
      )}
    </div>
  );
}
