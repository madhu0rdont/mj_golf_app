import { useState, useMemo } from 'react';
import { GappingChart } from './GappingChart';
import { useYardageBook, useYardageBookShots } from '../../hooks/useYardageBook';

export function GappingTab() {
  const [excludeMishits, setExcludeMishits] = useState(false);
  const entries = useYardageBook(excludeMishits);
  const allClubs = useYardageBookShots();

  const mishitCount = useMemo(
    () =>
      (allClubs ?? [])
        .filter((c) => !c.imputed)
        .flatMap((c) => c.shots)
        .filter((s) => s.quality === 'mishit').length,
    [allClubs]
  );

  if (entries === undefined) return null;

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No yardage data yet. Log sessions to see your gapping chart.
      </p>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          Club distances sorted by carry. Large gaps ({'>'}15 yds) are highlighted.
        </p>

        {mishitCount > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <button
              onClick={() => setExcludeMishits(!excludeMishits)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                excludeMishits ? 'bg-primary' : 'bg-border'
              }`}
              aria-label="Exclude mishits"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  excludeMishits ? 'translate-x-4' : ''
                }`}
              />
            </button>
            <span className="text-xs text-text-medium whitespace-nowrap">
              Exclude mishits ({mishitCount})
            </span>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-card shadow-sm p-3">
        <GappingChart entries={entries} />
      </div>
    </>
  );
}
