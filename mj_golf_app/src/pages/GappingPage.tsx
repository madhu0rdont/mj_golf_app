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
          <p className="py-8 text-center text-sm text-gray-500">
            No yardage data yet. Log sessions to see your gapping chart.
          </p>
        ) : (
          <>
            <p className="mb-4 text-xs text-gray-500">
              Club distances sorted by carry. Large gaps ({'>'}15 yds) are highlighted.
            </p>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <GappingChart entries={entries} />
            </div>
          </>
        )}
      </div>
    </>
  );
}
