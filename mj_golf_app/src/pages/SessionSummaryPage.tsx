import { useParams } from 'react-router';
import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { useSession, useShotsForSession, updateSession } from '../hooks/useSessions';
import { useClub, useAllClubs } from '../hooks/useClubs';
import { computeSessionSummary } from '../services/stats';
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

  // Offline label with L/R
  const offlineLabel = useMemo(() => {
    if (summary?.avgOffline == null) return undefined;
    const abs = Math.abs(summary.avgOffline);
    if (abs < 0.5) return '0';
    return `${abs.toFixed(1)} ${summary.avgOffline < 0 ? 'L' : 'R'}`;
  }, [summary]);

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

        {/* Hero Metrics */}
        <div className="grid grid-cols-4 gap-2">
          <HeroStat compact label="Carry" value={summary.avgCarry} unit="yds" accent="gold" />
          <HeroStat compact label="Total" value={summary.avgTotal ?? '—'} unit={summary.avgTotal ? 'yds' : ''} accent="gold" />
          <HeroStat compact label="Speed" value={summary.avgBallSpeed ?? '—'} unit={summary.avgBallSpeed ? 'mph' : ''} />
          <HeroStat compact label="Launch" value={summary.avgLaunchAngle != null ? summary.avgLaunchAngle.toFixed(1) : '—'} unit={summary.avgLaunchAngle != null ? '°' : ''} />
          <HeroStat compact label="Descent" value={summary.avgDescentAngle != null ? summary.avgDescentAngle.toFixed(1) : '—'} unit={summary.avgDescentAngle != null ? '°' : ''} />
          <HeroStat compact label="Peak Ht" value={summary.avgApexHeight ?? '—'} unit={summary.avgApexHeight ? 'yds' : ''} />
          <HeroStat compact label="Offline" value={offlineLabel ?? '—'} unit="yds" accent="primary" />
        </div>

        {/* Shot Data Table */}
        <div className="mt-4">
          <TrackmanTable shots={shots} />
        </div>

        {/* Bottom spacer */}
        <div className="h-6" />
      </div>
    </>
  );
}
