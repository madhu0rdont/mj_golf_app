import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, ChevronDown } from 'lucide-react';
import { MultiClubTrajectoryChart } from './MultiClubTrajectoryChart';
import { MultiClubDispersionChart } from './MultiClubDispersionChart';
import { YardageSummaryTable } from './YardageSummaryTable';
import { Button } from '../ui/Button';
import { useYardageBookShots } from '../../hooks/useYardageBook';
import { computeXScale } from '../flight/flight-math';

export function DetailsTab() {
  const clubs = useYardageBookShots();
  const [excludeMishits, setExcludeMishits] = useState(false);

  const realClubs = useMemo(
    () => (clubs ?? []).filter((c) => !c.imputed),
    [clubs]
  );

  const mishitCount = useMemo(
    () => realClubs.flatMap((c) => c.shots).filter((s) => s.quality === 'mishit').length,
    [realClubs]
  );

  const filteredClubs = useMemo(
    () =>
      (clubs ?? [])
        .map((c) => ({
          ...c,
          shots: !c.imputed && excludeMishits ? c.shots.filter((s) => s.quality !== 'mishit') : c.shots,
        }))
        .filter((c) => c.shots.length > 0),
    [clubs, excludeMishits]
  );

  const realShotCount = useMemo(
    () => filteredClubs.filter((c) => !c.imputed).flatMap((c) => c.shots).length,
    [filteredClubs]
  );

  const allShots = useMemo(
    () => filteredClubs.flatMap((c) => c.shots),
    [filteredClubs]
  );

  const xScale = useMemo(() => computeXScale(allShots), [allShots]);

  const realClubCount = filteredClubs.filter((c) => !c.imputed).length;
  const imputedClubCount = filteredClubs.filter((c) => c.imputed).length;
  const [chartsOpen, setChartsOpen] = useState(false);

  if (!clubs || clubs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No shot data yet. Log practice sessions to see detailed analytics.
      </p>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-text-muted">
          {realClubCount} club{realClubCount !== 1 ? 's' : ''} &middot; {realShotCount} shots
          {imputedClubCount > 0 && ` · ${imputedClubCount} estimated`}
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

      {/* Collapsible flight charts */}
      <div className="mb-4 rounded-xl border border-border overflow-hidden">
        <button
          onClick={() => setChartsOpen(!chartsOpen)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium text-text-medium hover:bg-surface transition"
        >
          Flight Visuals
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform ${chartsOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {chartsOpen && (
          <div className="flex flex-col gap-2 px-3 pb-3">
            <div className="w-full rounded-xl border border-border overflow-hidden shadow-[var(--shadow-card)]">
              <MultiClubTrajectoryChart clubs={filteredClubs} xScale={xScale} />
            </div>
            <div className="w-full rounded-xl border border-border overflow-hidden shadow-[var(--shadow-card)]">
              <MultiClubDispersionChart clubs={filteredClubs} xScale={xScale} />
            </div>
          </div>
        )}
      </div>

      {/* Summary table */}
      <YardageSummaryTable clubs={filteredClubs} />

      <Link to="/yardage/gapping" className="mt-4 block">
        <Button variant="secondary" className="w-full">
          <BarChart3 size={16} /> View Gapping Chart
        </Button>
      </Link>
    </>
  );
}
