import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { ShotTable, type ShotRow } from '../components/sessions/ShotTable';
import { Button } from '../components/ui/Button';
import { createSession } from '../hooks/useSessions';

function emptyShot(shotNumber: number): ShotRow {
  return {
    shotNumber,
    carryYards: '',
    totalYards: '',
    ballSpeed: '',
    clubHeadSpeed: '',
    launchAngle: '',
    spinRate: '',
    spinAxis: '',
    apexHeight: '',
    offlineYards: '',
    pushPull: '',
    sideSpinRate: '',
    descentAngle: '',
  };
}

function parseNum(val: string | number | undefined): number | undefined {
  if (val == null || val === '') return undefined;
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return isNaN(n) ? undefined : n;
}

export function SessionManualPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { clubId: string; date: number; location?: string } | null;

  const [shots, setShots] = useState<ShotRow[]>([emptyShot(1)]);
  const [saving, setSaving] = useState(false);

  if (!state?.clubId) {
    return (
      <>
        <TopBar title="Manual Entry" showBack />
        <div className="px-4 py-8 text-center text-sm text-text-muted">
          No club selected. Go back and select a club first.
        </div>
      </>
    );
  }

  const handleChange = (index: number, field: keyof ShotRow, value: string) => {
    setShots((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDelete = (index: number) => {
    setShots((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      return updated.map((s, i) => ({ ...s, shotNumber: i + 1 }));
    });
  };

  const addShot = () => {
    setShots((prev) => [...prev, emptyShot(prev.length + 1)]);
  };

  const handleSave = async () => {
    const validShots = shots.filter((s) => {
      const carry = parseNum(s.carryYards);
      return carry != null && carry > 0;
    });

    if (validShots.length === 0) return;

    setSaving(true);
    try {
      const sessionId = await createSession({
        clubId: state.clubId,
        date: state.date,
        location: state.location,
        source: 'manual',
        shots: validShots.map((s, i) => ({
          shotNumber: i + 1,
          carryYards: parseNum(s.carryYards)!,
          totalYards: parseNum(s.totalYards),
          ballSpeed: parseNum(s.ballSpeed),
          clubHeadSpeed: parseNum(s.clubHeadSpeed),
          launchAngle: parseNum(s.launchAngle),
          spinRate: parseNum(s.spinRate),
          spinAxis: parseNum(s.spinAxis),
          apexHeight: parseNum(s.apexHeight),
          offlineYards: parseNum(s.offlineYards),
          pushPull: parseNum(s.pushPull),
          sideSpinRate: parseNum(s.sideSpinRate),
          descentAngle: parseNum(s.descentAngle),
        })),
      });
      navigate(`/session/${sessionId}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  const hasValidShots = shots.some((s) => {
    const carry = parseNum(s.carryYards);
    return carry != null && carry > 0;
  });

  return (
    <>
      <TopBar title="Manual Entry" showBack />
      <div className="px-4 py-4">
        <p className="mb-4 text-xs text-text-muted">
          Enter shot data below. Carry is required; expand each shot for advanced fields.
        </p>

        <ShotTable shots={shots} onChange={handleChange} onDelete={handleDelete} />

        <Button variant="secondary" onClick={addShot} className="mt-3 w-full">
          <Plus size={16} /> Add Shot
        </Button>

        <Button
          onClick={handleSave}
          disabled={!hasValidShots || saving}
          className="mt-6 w-full"
          size="lg"
        >
          {saving ? 'Saving...' : `Save Session (${shots.filter((s) => parseNum(s.carryYards)).length} shots)`}
        </Button>
      </div>
    </>
  );
}
