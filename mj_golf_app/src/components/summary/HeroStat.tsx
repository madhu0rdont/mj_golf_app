import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ProgressDelta } from '../../services/stats';

interface HeroStatProps {
  label: string;
  value: number | string;
  unit: string;
  delta?: ProgressDelta;
  accent?: 'primary' | 'gold' | 'coral';
}

const ACCENT_COLORS = {
  primary: 'text-primary',
  gold: 'text-gold',
  coral: 'text-coral',
} as const;

export function HeroStat({ label, value, unit, delta, accent }: HeroStatProps) {
  const valueColor = accent ? ACCENT_COLORS[accent] : 'text-text-dark';

  return (
    <div className="flex-1 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`text-3xl font-bold font-mono ${valueColor}`}>{value}</span>
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
            {delta.delta} vs last
          </span>
        </div>
      )}
    </div>
  );
}
