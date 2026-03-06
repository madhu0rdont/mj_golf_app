import { useMemo, useState } from 'react';
import { MultiClubTrajectoryChart } from './MultiClubTrajectoryChart';
import { MultiClubDispersionChart } from './MultiClubDispersionChart';
import { YardageSummaryTable } from './YardageSummaryTable';
import { Toggle } from '../ui/Toggle';
import { useYardageBookShots } from '../../hooks/useYardageBook';
import { computeXScale } from '../flight/flight-math';
import { buildDistributions } from '../../services/monte-carlo';

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

  const distributions = useMemo(
    () => buildDistributions(filteredClubs),
    [filteredClubs]
  );

  const imputedDistributions = useMemo(
    () => distributions.filter((d) =>
      filteredClubs.some((c) => c.clubId === d.clubId && c.imputed)
    ),
    [distributions, filteredClubs]
  );

  const realClubCount = filteredClubs.filter((c) => !c.imputed).length;
  const imputedClubCount = filteredClubs.filter((c) => c.imputed).length;

  if (!clubs || clubs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No shot data yet. Log practice sessions to see detailed analytics.
      </p>
    );
  }

  return (
    <>
      {/* Filter meta + mishit toggle */}
      <div className="md:px-8 mb-3 flex items-center justify-between flex-wrap gap-2">
        <p className="font-mono text-[10px] tracking-[0.1em] text-ink-faint">
          {realClubCount} club{realClubCount !== 1 ? 's' : ''} · {realShotCount} shots
          {imputedClubCount > 0 && ` · ${imputedClubCount} estimated`}
        </p>

        {mishitCount > 0 && (
          <Toggle
            checked={excludeMishits}
            onChange={setExcludeMishits}
            label={`Exclude mishits (${mishitCount})`}
          />
        )}
      </div>

      {/* Viz hero — dark green, full-width, side-by-side charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 bg-forest border-b-[3px] border-gold">
        <div className="relative overflow-hidden">
          <div className="absolute top-3.5 left-5 z-10 font-mono text-[9px] tracking-[0.3em] uppercase text-white/30">
            Flight Profile · Side View
          </div>
          <MultiClubTrajectoryChart clubs={filteredClubs} xScale={xScale} />
        </div>
        <div className="relative overflow-hidden border-t md:border-t-0 md:border-l border-white/[0.06]">
          <div className="absolute top-3.5 left-5 z-10 font-mono text-[9px] tracking-[0.3em] uppercase text-white/30">
            Dispersion · Top View
          </div>
          <MultiClubDispersionChart clubs={filteredClubs} xScale={xScale} imputedDistributions={imputedDistributions} />
        </div>
      </div>

      {/* Summary table */}
      <div className="md:px-8 mt-0">
        <YardageSummaryTable clubs={filteredClubs} distributions={distributions} />
      </div>
    </>
  );
}
