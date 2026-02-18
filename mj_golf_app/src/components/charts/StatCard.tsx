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
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold font-mono text-text-dark">{value}</span>
        {unit && <span className="text-sm text-text-muted">{unit}</span>}
      </div>
      {delta && delta.direction !== 'neutral' && (
        <div
          className={`mt-1 flex items-center gap-1 text-xs ${
            delta.improved ? 'text-primary' : 'text-coral'
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
