import type { ApproachStrategy } from '../../services/monte-carlo';

interface StrategyPanelProps {
  strategies: ApproachStrategy[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  shotCount: number;
}

export function StrategyPanel({ strategies, selectedIdx, onSelect, shotCount }: StrategyPanelProps) {
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
        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
              isSelected
                ? 'bg-primary/10 border border-primary/40'
                : 'bg-surface border border-transparent hover:bg-border/50'
            }`}
          >
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
              <p className="text-sm font-medium text-text-dark truncate">{s.label}</p>
              {s.tip && (
                <p className="text-xs text-text-muted mt-0.5">{s.tip}</p>
              )}
            </div>

            <span className="flex-shrink-0 text-sm font-semibold text-primary mt-0.5">
              {s.expectedStrokes.toFixed(1)} xS
            </span>
          </button>
        );
      })}

      <p className="text-[10px] text-text-muted mt-1">
        Based on {shotCount} recorded shots
      </p>
    </div>
  );
}
