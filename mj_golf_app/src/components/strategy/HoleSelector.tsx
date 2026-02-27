import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HoleSelectorProps {
  totalHoles: number;
  current: number;
  onChange: (n: number) => void;
}

export function HoleSelector({ totalHoles, current, onChange }: HoleSelectorProps) {
  const prev = current === 1 ? totalHoles : current - 1;
  const next = current === totalHoles ? 1 : current + 1;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(prev)}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-dark hover:bg-surface"
        aria-label="Previous hole"
      >
        <ChevronLeft size={20} />
      </button>

      <div className="grid grid-cols-9 gap-1 flex-1">
        {Array.from({ length: totalHoles }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`rounded-md py-1 text-xs font-medium transition-colors ${
              n === current
                ? 'bg-primary text-white'
                : 'bg-surface text-text-medium hover:bg-border'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      <button
        onClick={() => onChange(next)}
        className="rounded-lg p-1.5 text-text-muted hover:text-text-dark hover:bg-surface"
        aria-label="Next hole"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
