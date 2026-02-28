import type { ApproachStrategy } from '../../services/monte-carlo';
import type { OptimizedStrategy, ScoreDistribution } from '../../services/strategy-optimizer';
import { Skeleton } from '../ui/Skeleton';

interface StrategyPanelProps {
  strategies: ApproachStrategy[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  shotCount: number;
  par: number;
  isLoading?: boolean;
}

function isOptimized(s: ApproachStrategy): s is OptimizedStrategy {
  return 'strategyName' in s;
}

const SCORE_COLORS: { key: keyof ScoreDistribution; color: string }[] = [
  { key: 'eagle', color: '#D4A843' },
  { key: 'birdie', color: '#40916C' },
  { key: 'par', color: '#2D6A4F' },
  { key: 'bogey', color: '#9B9B9B' },
  { key: 'double', color: '#E76F51' },
  { key: 'worse', color: '#DC2626' },
];

function ScoreBar({ dist }: { dist: ScoreDistribution }) {
  return (
    <div className="flex h-2 w-full rounded-full overflow-hidden mt-1.5">
      {SCORE_COLORS.map(({ key, color }) => {
        const pct = dist[key] * 100;
        if (pct < 0.5) return null;
        return (
          <div
            key={key}
            style={{ width: `${pct}%`, backgroundColor: color }}
            title={`${key}: ${pct.toFixed(0)}%`}
          />
        );
      })}
    </div>
  );
}

function BlowupBadge({ risk }: { risk: number }) {
  if (risk <= 0.05) return null;
  const pct = (risk * 100).toFixed(0);
  const colorClass = risk > 0.15 ? 'bg-coral/20 text-coral' : 'bg-gold/20 text-gold-dark';
  return (
    <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${colorClass}`}>
      {pct}% blow
    </span>
  );
}

export function StrategyPanel({ strategies, selectedIdx, onSelect, shotCount, par, isLoading }: StrategyPanelProps) {
  if (isLoading || (strategies.length === 0 && shotCount > 0)) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl bg-surface px-3 py-2.5 flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <Skeleton className="h-5 w-5 rounded-full" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm text-text-muted">
          Record some practice sessions to see strategy recommendations
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text-dark">Approach Strategies</h3>

      {strategies.map((s, idx) => {
        const isSelected = idx === selectedIdx;
        const opt = isOptimized(s) ? s : null;
        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`flex flex-col rounded-xl px-3 py-2.5 text-left transition-colors ${
              isSelected
                ? 'bg-primary/10 border border-primary/40'
                : 'bg-surface border border-transparent hover:bg-border/50'
            }`}
          >
            <div className="flex items-start gap-2.5 w-full">
              {/* Rank badge */}
              <span
                className={`flex-shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                  isSelected
                    ? 'bg-primary text-white'
                    : 'bg-border text-text-medium'
                }`}
              >
                {idx + 1}
              </span>

              <div className="flex-1 min-w-0">
                {opt && (
                  <p className="text-xs font-semibold text-primary mb-0.5">{opt.strategyName}</p>
                )}
                <p className="text-sm font-medium text-text-dark">{s.label}</p>
                {s.tip && (
                  <p className="text-xs text-text-muted mt-0.5">{s.tip}</p>
                )}
                {opt && isSelected && opt.aimPoints.length > 0 && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {opt.aimPoints.map((ap) => (
                      <p key={ap.shotNumber} className="text-[10px] text-text-muted">
                        <span className="font-semibold text-text-medium">{ap.shotNumber}.</span>{' '}
                        {ap.tip}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-shrink-0 flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-semibold text-primary">
                  {s.expectedStrokes.toFixed(1)} xS
                </span>
                {(() => {
                  const delta = s.expectedStrokes - par;
                  const sign = delta >= 0 ? '+' : '';
                  const color = delta <= 0 ? 'text-green-600' : delta <= 0.5 ? 'text-text-muted' : 'text-coral';
                  return (
                    <span className={`text-xs font-medium ${color}`}>
                      {sign}{delta.toFixed(1)}
                    </span>
                  );
                })()}
                {opt && <BlowupBadge risk={opt.blowupRisk} />}
              </div>
            </div>

            {opt && <ScoreBar dist={opt.scoreDistribution} />}
          </button>
        );
      })}

      <p className="text-[10px] text-text-muted mt-1">
        Based on {shotCount} recorded shots
      </p>
    </div>
  );
}
