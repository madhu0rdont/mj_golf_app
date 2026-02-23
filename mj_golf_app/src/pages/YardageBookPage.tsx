import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, BookOpen } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { MultiClubTrajectoryChart } from '../components/yardage/MultiClubTrajectoryChart';
import { MultiClubDispersionChart } from '../components/yardage/MultiClubDispersionChart';
import { YardageSummaryTable } from '../components/yardage/YardageSummaryTable';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { useYardageBookShots } from '../hooks/useYardageBook';
import { computeXScale } from '../components/flight/flight-math';

export function YardageBookPage() {
  const clubs = useYardageBookShots();
  const [excludeMishits, setExcludeMishits] = useState(false);

  const mishitCount = useMemo(
    () => (clubs ?? []).flatMap((c) => c.shots).filter((s) => s.quality === 'mishit').length,
    [clubs]
  );

  const filteredClubs = useMemo(
    () =>
      (clubs ?? [])
        .map((c) => ({
          ...c,
          shots: excludeMishits ? c.shots.filter((s) => s.quality !== 'mishit') : c.shots,
        }))
        .filter((c) => c.shots.length > 0),
    [clubs, excludeMishits]
  );

  const allShots = useMemo(
    () => filteredClubs.flatMap((c) => c.shots),
    [filteredClubs]
  );

  const xScale = useMemo(() => computeXScale(allShots), [allShots]);

  if (clubs === undefined) return null;

  return (
    <>
      <TopBar
        title="Yardage Book"
        showSettings
        rightAction={
          clubs.length > 0 ? (
            <Link to="/yardage/gapping" className="rounded-lg p-1.5 text-text-muted hover:text-text-dark">
              <BarChart3 size={20} />
            </Link>
          ) : undefined
        }
      />
      <div className="px-4 py-4">
        {clubs.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={40} />}
            title="No yardage data yet"
            description="Log practice sessions to build your yardage book with real data."
            action={
              <Link to="/session/new">
                <Button size="sm">Log a Session</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-text-muted">
                {filteredClubs.length} club{filteredClubs.length !== 1 ? 's' : ''} &middot; {allShots.length} total shots
              </p>

              {mishitCount > 0 && (
                <div className="flex items-center gap-2">
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
                  <span className="text-xs text-text-medium">
                    Exclude mishits ({mishitCount})
                  </span>
                </div>
              )}
            </div>

            {/* Side-by-side charts */}
            <div className="mb-4 grid grid-cols-[3fr_2fr] gap-2">
              <MultiClubTrajectoryChart clubs={filteredClubs} xScale={xScale} />
              <MultiClubDispersionChart clubs={filteredClubs} xScale={xScale} />
            </div>

            {/* Summary table */}
            <YardageSummaryTable clubs={filteredClubs} />

            <Link to="/yardage/gapping" className="mt-4 block">
              <Button variant="secondary" className="w-full">
                <BarChart3 size={16} /> View Gapping Chart
              </Button>
            </Link>
          </>
        )}
      </div>
    </>
  );
}
