import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { api } from '../../lib/api';

interface HoleComparison {
  holeNumber: number;
  before: Record<string, number> | null;
  after: Record<string, number>;
}

interface ElevationRefreshProps {
  courseId: string;
}

export function ElevationRefresh({ courseId }: ElevationRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [comparison, setComparison] = useState<HoleComparison[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRefresh = async () => {
    if (!courseId) return;
    setIsRefreshing(true);
    setError(null);
    setComparison(null);
    try {
      const result = await api.post<{ holes: HoleComparison[] }>(
        `/admin/courses/${courseId}/refresh-elevation`,
        {},
      );
      setComparison(result.holes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Get the first tee box key from comparison data
  const teeBox = comparison?.[0]?.after
    ? Object.keys(comparison[0].after)[0]
    : 'blue';

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={handleRefresh} disabled={isRefreshing || !courseId} variant="ghost" className="w-full">
        {isRefreshing ? (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
        ) : (
          <RefreshCw size={16} />
        )}
        {isRefreshing ? 'Refreshing...' : 'Refresh Elevation Data'}
      </Button>

      {error && <p className="text-xs text-coral">{error}</p>}

      {comparison && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-medium">
            Before / After ({teeBox} tees)
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-surface text-text-muted">
                  <th className="py-1.5 px-2 text-left font-medium">Hole</th>
                  <th className="py-1.5 px-2 text-right font-medium">Before</th>
                  <th className="py-1.5 px-2 text-right font-medium">After</th>
                  <th className="py-1.5 px-2 text-right font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {comparison.map((h) => {
                  const before = h.before?.[teeBox] ?? null;
                  const after = h.after[teeBox] ?? null;
                  const delta = before != null && after != null ? after - before : null;
                  return (
                    <tr key={h.holeNumber} className="border-t border-border">
                      <td className="py-1.5 px-2 font-medium text-text-dark">{h.holeNumber}</td>
                      <td className="py-1.5 px-2 text-right text-text-medium">
                        {before ?? '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-text-medium">
                        {after ?? '—'}
                      </td>
                      <td
                        className="py-1.5 px-2 text-right font-medium"
                        style={{
                          color:
                            delta == null
                              ? undefined
                              : delta < 0
                                ? '#40916C'
                                : delta > 0
                                  ? '#E76F51'
                                  : undefined,
                        }}
                      >
                        {delta == null
                          ? '—'
                          : delta === 0
                            ? '0'
                            : delta > 0
                              ? `+${delta}`
                              : String(delta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
