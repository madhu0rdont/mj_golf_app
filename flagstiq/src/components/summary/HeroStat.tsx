import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { ProgressDelta } from '../../services/stats';

interface HeroStatProps {
  label: string;
  value: number | string;
  unit: string;
  delta?: ProgressDelta;
  accent?: 'primary' | 'gold' | 'coral';
  compact?: boolean;
}

const ACCENT_COLORS = {
  primary: 'text-ink',
  gold: 'text-gold',
  coral: 'text-coral',
} as const;

export function HeroStat({ label, value, unit, delta, accent, compact }: HeroStatProps) {
  const valueColor = accent ? ACCENT_COLORS[accent] : 'text-ink';

  return (
    <div className={`flex-1 rounded-sm border border-card-border bg-card backdrop-blur-[8px] shadow-[var(--shadow-card)] ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`font-mono uppercase tracking-[0.2em] text-sand ${compact ? 'text-[9px]' : 'text-[0.6rem]'}`}>
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`font-light font-display ${valueColor} ${compact ? 'text-2xl' : 'text-3xl'}`}>{value}</span>
        {unit && <span className={`text-ink-faint ${compact ? 'text-xs' : 'text-sm'}`}>{unit}</span>}
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
