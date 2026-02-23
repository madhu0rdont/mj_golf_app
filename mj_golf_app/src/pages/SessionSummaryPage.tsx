import { useParams } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { useSession, useShotsForSession, updateSession } from '../hooks/useSessions';
import { useClub, useAllClubs } from '../hooks/useClubs';
import { computeSessionSummary } from '../services/stats';
import { computeXScale } from '../components/flight/flight-math';
import { TrajectoryChart } from '../components/flight/TrajectoryChart';
import { DispersionChart } from '../components/flight/DispersionChart';
import { HeroStat } from '../components/summary/HeroStat';
import { TrackmanTable } from '../components/summary/TrackmanTable';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export function SessionSummaryPage() {
  const { sessionId } = useParams();
  const session = useSession(sessionId);
  const shots = useShotsForSession(sessionId);
  const club = useClub(session?.clubId);
  const allClubs = useAllClubs();

  const [editOpen, setEditOpen] = useState(false);
  const [editClubId, setEditClubId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [excludeMishits, setExcludeMishits] = useState(false);

  const openEditModal = () => {
    if (!session) return;
    setEditClubId(session.clubId);
    const d = new Date(session.date);
    setEditDate(d.toISOString().split('T')[0]);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!session) return;
    const updates: { clubId?: string; date?: number } = {};
    if (editClubId !== session.clubId) updates.clubId = editClubId;
    const newDate = new Date(editDate + 'T00:00:00').getTime();
    if (newDate !== session.date) updates.date = newDate;
    if (Object.keys(updates).length > 0) {
      await updateSession(session.id, updates);
    }
    setEditOpen(false);
  };

  const summary = useMemo(() => {
    if (!shots || shots.length === 0 || !session || !club) return null;
    return computeSessionSummary(shots, club.name, session.id, session.clubId, session.date);
  }, [shots, session, club]);

  const mishitCount = useMemo(
    () => shots?.filter((s) => s.quality === 'mishit').length ?? 0,
    [shots]
  );

  const heroSummary = useMemo(() => {
    if (!shots || shots.length === 0 || !session || !club) return null;
    const filtered = excludeMishits ? shots.filter((s) => s.quality !== 'mishit') : shots;
    if (filtered.length === 0) return null;
    return computeSessionSummary(filtered, club.name, session.id, session.clubId, session.date);
  }, [shots, session, club, excludeMishits]);

  // Flight visualization state
  const [highlightedShotId, setHighlightedShotId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const xScale = useMemo(() => (shots ? computeXScale(shots) : { min: 0, max: 200, step: 50 }), [shots]);
  const hasTrajectoryData = shots?.some((s) => s.launchAngle != null && s.apexHeight != null) ?? false;

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Offline label with L/R
  const offlineLabel = useMemo(() => {
    if (heroSummary?.avgOffline == null) return undefined;
    const abs = Math.abs(heroSummary.avgOffline);
    if (abs < 0.5) return '0';
    return `${abs.toFixed(1)} ${heroSummary.avgOffline < 0 ? 'L' : 'R'}`;
  }, [heroSummary]);

  if (!session || !shots || !club || !summary) {
    return (
      <>
        <TopBar title="Session Summary" showBack />
        <div className="px-4 py-8 text-center text-sm text-text-muted">Loading...</div>
      </>
    );
  }

  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <>
      <TopBar title="Session Summary" showBack />
      <div className="px-4 py-4">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{club.name}</h2>
            <p className="text-sm text-text-medium">
              {dateStr} &middot; {summary.shotCount} shots
              {session.location && ` at ${session.location}`}
            </p>
          </div>
          <button
            onClick={openEditModal}
            className="mt-1 rounded-lg p-1.5 text-text-muted hover:bg-surface hover:text-text-dark"
            aria-label="Edit session"
          >
            <Pencil size={18} />
          </button>
        </div>

        {/* Edit Session Modal */}
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Session">
          <div className="flex flex-col gap-4">
            <Select
              label="Club"
              value={editClubId}
              onChange={(e) => setEditClubId(e.target.value)}
              options={(allClubs ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input
              label="Date"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
            <Button onClick={handleSave} className="w-full">
              Save
            </Button>
          </div>
        </Modal>

        {/* Mishit Toggle */}
        {mishitCount > 0 && (
          <div className="mb-3 flex items-center gap-2">
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

        {/* Hero Metrics */}
        {heroSummary && (
          <div className="grid grid-cols-4 gap-2">
            <HeroStat compact label="Carry" value={heroSummary.avgCarry} unit="yds" accent="gold" />
            <HeroStat compact label="Total" value={heroSummary.avgTotal ?? '—'} unit={heroSummary.avgTotal ? 'yds' : ''} accent="gold" />
            <HeroStat compact label="Speed" value={heroSummary.avgBallSpeed ?? '—'} unit={heroSummary.avgBallSpeed ? 'mph' : ''} />
            <HeroStat compact label="Launch" value={heroSummary.avgLaunchAngle != null ? heroSummary.avgLaunchAngle.toFixed(1) : '—'} unit={heroSummary.avgLaunchAngle != null ? '°' : ''} />
            <HeroStat compact label="Descent" value={heroSummary.avgDescentAngle != null ? heroSummary.avgDescentAngle.toFixed(1) : '—'} unit={heroSummary.avgDescentAngle != null ? '°' : ''} />
            <HeroStat compact label="Peak Ht" value={heroSummary.avgApexHeight ?? '—'} unit={heroSummary.avgApexHeight ? 'yds' : ''} />
            <HeroStat compact label="Offline" value={offlineLabel ?? '—'} unit="yds" accent="primary" />
          </div>
        )}

        {/* Flight Visualization */}
        {hasTrajectoryData && (
          <div className="mt-4 rounded-2xl border border-border overflow-hidden shadow-[var(--shadow-card)]" style={{ backgroundColor: '#1B4332' }}>
            <TrajectoryChart
              shots={shots}
              highlightedShotId={highlightedShotId}
              onShotTap={setHighlightedShotId}
              xScale={xScale}
              animated={animated}
            />
            <DispersionChart
              shots={shots}
              highlightedShotId={highlightedShotId}
              onShotTap={setHighlightedShotId}
              xScale={xScale}
              animated={animated}
            />
          </div>
        )}

        {/* Shot Data Table */}
        <div className="mt-4">
          <TrackmanTable shots={shots} excludeMishits={excludeMishits} />
        </div>

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </>
  );
}
