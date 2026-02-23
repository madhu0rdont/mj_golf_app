import { useParams } from 'react-router';
import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { ShotShapePie } from '../components/charts/ShotShapePie';
import { QualityBar } from '../components/charts/QualityBar';
import { useSession, useShotsForSession, updateSession } from '../hooks/useSessions';
import { useClub, useAllClubs } from '../hooks/useClubs';
import { computeSessionSummary, computeDelta } from '../services/stats';
import { SessionFlightView } from '../components/flight/SessionFlightView';
import { usePreviousSessionSummary } from '../hooks/usePreviousSession';
import { SectionHeading } from '../components/summary/SectionHeading';
import { HeroStat } from '../components/summary/HeroStat';
import { CarryStripChart } from '../components/summary/CarryStripChart';
import { LaunchProfileCard } from '../components/summary/LaunchProfileCard';
import { StatRow } from '../components/summary/StatRow';
import { CompactShotTable } from '../components/summary/CompactShotTable';
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

  const openEditModal = () => {
    if (!session) return;
    setEditClubId(session.clubId);
    // Convert epoch ms to YYYY-MM-DD for the date input
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

  const prevSummary = usePreviousSessionSummary(session?.clubId, session?.date);

  // Carry values for strip chart
  const carries = useMemo(() => shots?.map((s) => s.carryYards) ?? [], [shots]);

  // Smash factor
  const smashFactor = useMemo(() => {
    if (summary?.avgBallSpeed && summary?.avgClubHeadSpeed) {
      return Math.round((summary.avgBallSpeed / summary.avgClubHeadSpeed) * 100) / 100;
    }
    return undefined;
  }, [summary]);

  // Spin axis label
  const spinAxisLabel = useMemo(() => {
    if (summary?.avgSpinAxis == null) return undefined;
    const abs = Math.abs(summary.avgSpinAxis);
    if (abs < 1) return 'Neutral';
    return `${abs.toFixed(1)}° ${summary.avgSpinAxis < 0 ? 'Draw' : 'Fade'}`;
  }, [summary]);

  // Offline label with L/R
  const offlineLabel = useMemo(() => {
    if (summary?.avgOffline == null) return undefined;
    const abs = Math.abs(summary.avgOffline);
    if (abs < 0.5) return '0';
    return `${abs.toFixed(1)} ${summary.avgOffline < 0 ? 'L' : 'R'}`;
  }, [summary]);

  // Deltas vs previous session
  const carryDelta = prevSummary ? computeDelta(summary!.avgCarry, prevSummary.avgCarry) : undefined;
  const totalDelta =
    prevSummary && summary?.avgTotal && prevSummary.avgTotal
      ? computeDelta(summary.avgTotal, prevSummary.avgTotal)
      : undefined;
  const dispersionDelta = prevSummary
    ? computeDelta(summary!.dispersionRange, prevSummary.dispersionRange, false)
    : undefined;

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

  const compactShots = shots.map((s) => ({
    shotNumber: s.shotNumber,
    carryYards: s.carryYards,
    totalYards: s.totalYards,
    offlineYards: s.offlineYards,
    ballSpeed: s.ballSpeed,
    launchAngle: s.launchAngle,
    spinRate: s.spinRate,
    apexHeight: s.apexHeight,
    shape: s.shape,
    quality: s.quality,
  }));

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

        {/* Flight View */}
        <SessionFlightView
          shots={shots}
          clubName={club.name}
          sessionDate={new Date(session.date)}
        />

        {/* ── DISTANCE ─────────────────── */}
        <SectionHeading title="Distance" />
        <div className="flex gap-2">
          <HeroStat
            label="Avg Carry"
            value={summary.avgCarry}
            unit="yds"
            accent="gold"
            delta={carryDelta}
          />
          <HeroStat
            label="Avg Total"
            value={summary.avgTotal ?? '—'}
            unit={summary.avgTotal ? 'yds' : ''}
            accent="gold"
            delta={totalDelta}
          />
        </div>
        <CarryStripChart
          carries={carries}
          avgCarry={summary.avgCarry}
          medianCarry={summary.medianCarry}
          stdDevCarry={summary.stdDevCarry}
        />

        {/* ── ACCURACY ─────────────────── */}
        <SectionHeading title="Accuracy" />
        <div className="flex gap-2">
          <HeroStat
            label="Avg Offline"
            value={offlineLabel ?? '—'}
            unit="yds"
            accent="primary"
          />
          <HeroStat
            label="Dispersion"
            value={summary.dispersionRange}
            unit="yds"
            accent="primary"
            delta={dispersionDelta}
          />
        </div>
        <StatRow
          items={[
            { label: 'Abs Offline', value: summary.avgAbsOffline ?? '—', unit: 'yds' },
            { label: 'Pure Rate', value: summary.pureRate, unit: '%' },
            { label: 'Push/Pull', value: summary.avgPushPull != null ? `${Math.abs(summary.avgPushPull).toFixed(1)}` : '—', unit: '°' },
          ]}
        />

        {/* ── LAUNCH PROFILE ──────────── */}
        <SectionHeading title="Launch Profile" />
        <LaunchProfileCard
          ballSpeed={summary.avgBallSpeed}
          clubHeadSpeed={summary.avgClubHeadSpeed}
          launchAngle={summary.avgLaunchAngle}
          spinRate={summary.avgSpinRate}
        />
        <StatRow
          items={[
            { label: 'Apex Height', value: summary.avgApexHeight ?? '—', unit: 'yds' },
            { label: 'Descent', value: summary.avgDescentAngle != null ? summary.avgDescentAngle.toFixed(1) : '—', unit: '°' },
            { label: 'Smash Factor', value: smashFactor ?? '—', unit: 'x' },
          ]}
        />

        {/* ── SHOT TENDENCIES ─────────── */}
        <SectionHeading title="Shot Tendencies" />
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <ShotShapePie distribution={summary.shapeDistribution} />
          <div className="mt-3 border-t border-border-light pt-3">
            <QualityBar distribution={summary.qualityDistribution} total={summary.shotCount} />
          </div>
        </div>
        <StatRow
          items={[
            { label: 'Spin Axis', value: spinAxisLabel ?? '—', unit: '' },
            { label: 'Side Spin', value: summary.avgSideSpinRate ?? '—', unit: 'rpm' },
            { label: 'Dominant', value: summary.dominantShape ? summary.dominantShape.charAt(0).toUpperCase() + summary.dominantShape.slice(1) : '—', unit: '' },
          ]}
        />

        {/* ── ALL SHOTS ───────────────── */}
        <SectionHeading title="All Shots" />
        <CompactShotTable shots={compactShots} />

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </>
  );
}
