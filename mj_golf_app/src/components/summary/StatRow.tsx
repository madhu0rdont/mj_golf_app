interface StatRowItem {
  label: string;
  value: number | string;
  unit: string;
}

interface StatRowProps {
  items: StatRowItem[];
}

export function StatRow({ items }: StatRowProps) {
  return (
    <div className="mt-2 flex rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-card)]">
      {items.map((item, i) => (
        <div
          key={item.label}
          className={`flex flex-1 flex-col items-center ${
            i > 0 ? 'border-l border-border-light' : ''
          }`}
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            {item.label}
          </span>
          <div className="mt-0.5 flex items-baseline gap-0.5">
            <span className="text-base font-bold font-mono text-text-dark">{item.value}</span>
            {item.unit && <span className="text-[10px] text-text-muted">{item.unit}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
