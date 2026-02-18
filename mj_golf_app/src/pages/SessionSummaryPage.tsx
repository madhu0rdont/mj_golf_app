import { useParams } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { StatCard } from '../components/charts/StatCard';
import { ShotShapePie } from '../components/charts/ShotShapePie';
import { QualityBar } from '../components/charts/QualityBar';
import { ShotTable, type ShotRow } from '../components/sessions/ShotTable';
import { useSession, useShotsForSession } from '../hooks/useSessions';
import { useClub } from '../hooks/useClubs';
import { computeSessionSummary } from '../services/stats';
import { useMemo } from 'react';
import { SessionFlightView } from '../components/flight/SessionFlightView';

export function SessionSummaryPage() {
  const { sessionId } = useParams();
  const session = useSession(sessionId);
  const shots = useShotsForSession(sessionId);
  const club = useClub(session?.clubId);

  const summary = useMemo(() => {
    if (!shots || shots.length === 0 || !session || !club) return null;
    return computeSessionSummary(shots, club.name, session.id, session.clubId, session.date);
  }, [shots, session, club]);

  if (!session || !shots || !club || !summary) {
    return (
      <>
        <TopBar title="Session Summary" showBack />
        <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
      </>
    );
  }

  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const shotRows: ShotRow[] = shots.map((s) => ({
    shotNumber: s.shotNumber,
    carryYards: s.carryYards,
    totalYards: s.totalYards,
    ballSpeed: s.ballSpeed,
    clubHeadSpeed: s.clubHeadSpeed,
    launchAngle: s.launchAngle,
    spinRate: s.spinRate,
    spinAxis: s.spinAxis,
    apexHeight: s.apexHeight,
    offlineYards: s.offlineYards,
    pushPull: s.pushPull,
    sideSpinRate: s.sideSpinRate,
    descentAngle: s.descentAngle,
  }));

  return (
    <>
      <TopBar title="Session Summary" showBack />
      <div className="px-4 py-4">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-xl font-bold">{club.name}</h2>
          <p className="text-sm text-gray-400">
            {dateStr} &middot; {summary.shotCount} shots
            {session.location && ` at ${session.location}`}
          </p>
        </div>

        {/* Flight View */}
        <SessionFlightView
          shots={shots}
          clubName={club.name}
          sessionDate={new Date(session.date)}
        />

        {/* Key Stats Grid */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <StatCard label="Avg Carry" value={summary.avgCarry} unit="yds" />
          <StatCard
            label="Avg Total"
            value={summary.avgTotal ?? '—'}
            unit={summary.avgTotal ? 'yds' : ''}
          />
          <StatCard label="Dispersion" value={summary.dispersionRange} unit="yds" />
          <StatCard label="Pure Rate" value={summary.pureRate} unit="%" />
        </div>

        {/* Distance Range */}
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-3">
          <div className="mb-2 text-xs font-medium uppercase text-gray-500">Carry Range</div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Min: <strong className="text-white">{summary.minCarry}</strong></span>
            <span className="text-gray-400">Median: <strong className="text-white">{summary.medianCarry}</strong></span>
            <span className="text-gray-400">Max: <strong className="text-white">{summary.maxCarry}</strong></span>
          </div>
          <div className="mt-1 text-xs text-gray-500">Std Dev: {summary.stdDevCarry} yds</div>
        </div>

        {/* Launch Stats */}
        {(summary.avgBallSpeed || summary.avgClubHeadSpeed || summary.avgLaunchAngle || summary.avgSpinRate) && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">Launch Data</h3>
            <div className="grid grid-cols-2 gap-2">
              {summary.avgBallSpeed && <StatCard label="Ball Speed" value={summary.avgBallSpeed} unit="mph" />}
              {summary.avgClubHeadSpeed && <StatCard label="Club Speed" value={summary.avgClubHeadSpeed} unit="mph" />}
              {summary.avgLaunchAngle && <StatCard label="Launch Angle" value={summary.avgLaunchAngle} unit="°" />}
              {summary.avgSpinRate && <StatCard label="Spin Rate" value={summary.avgSpinRate} unit="rpm" />}
            </div>
          </div>
        )}

        {/* Shot Shape */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">
            Shot Shape
            {summary.dominantShape && (
              <span className="ml-2 text-white capitalize">({summary.dominantShape})</span>
            )}
          </h3>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            <ShotShapePie distribution={summary.shapeDistribution} />
          </div>
        </div>

        {/* Quality */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">Shot Quality</h3>
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
            <QualityBar distribution={summary.qualityDistribution} total={summary.shotCount} />
          </div>
        </div>

        {/* Shot-by-Shot Data */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">All Shots</h3>
          <ShotTable
            shots={shotRows}
            onChange={() => {}}
            onDelete={() => {}}
            readOnly
          />
        </div>
      </div>
    </>
  );
}
