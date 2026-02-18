import { TopBar } from '../components/layout/TopBar';
import { GappingChart } from '../components/yardage/GappingChart';
import { useYardageBook } from '../hooks/useYardageBook';

export function GappingPage() {
  const entries = useYardageBook();

  if (entries === undefined) return null;

  return (
    <>
      <TopBar title="Gapping Analysis" showBack />
      <div className="px-4 py-4">
        {entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            No yardage data yet. Log sessions to see your gapping chart.
          </p>
        ) : (
          <>
            <p className="mb-4 text-xs text-text-muted">
              Club distances sorted by carry. Large gaps ({'>'}15 yds) are highlighted.
            </p>
            <div className="rounded-2xl border border-border bg-card shadow-sm p-3">
              <GappingChart entries={entries} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
