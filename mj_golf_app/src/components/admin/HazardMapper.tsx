import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { useCourse, mutateCourse } from '../../hooks/useCourses';
import { HoleHazardEditor } from './HoleHazardEditor';
import type { CourseHole, HazardFeature } from '../../models/course';

type HoleStatus = 'empty' | 'pending' | 'accepted';

function getHoleStatus(hole: CourseHole): HoleStatus {
  if (!hole.hazards || hole.hazards.length === 0) return 'empty';
  const hasPending = hole.hazards.some((h: HazardFeature) => h.status === 'pending');
  return hasPending ? 'pending' : 'accepted';
}

const STATUS_COLORS: Record<HoleStatus, string> = {
  empty: 'bg-surface border-border text-text-muted',
  pending: 'bg-amber-500/20 border-amber-500/40 text-amber-600',
  accepted: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600',
};

const TEES = ['blue', 'white', 'red'] as const;

interface HazardMapperProps {
  courseId: string;
  selectedHole: number | null;
  onSelectHole: (hole: number | null) => void;
}

// ---------------------------------------------------------------------------
// Inline Scorecard Editor
// ---------------------------------------------------------------------------
function ScorecardEditor({ courseId, holes }: { courseId: string; holes: CourseHole[] }) {
  const [edits, setEdits] = useState<Record<number, { par?: number; handicap?: number | null; yardages?: Record<string, number> }>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = Object.keys(edits).length > 0;

  function getVal(hole: CourseHole) {
    const e = edits[hole.holeNumber];
    return {
      par: e?.par ?? hole.par,
      handicap: e?.handicap !== undefined ? e.handicap : hole.handicap,
      yardages: { ...hole.yardages, ...e?.yardages },
    };
  }

  function setPar(holeNum: number, par: number) {
    setEdits((prev) => ({ ...prev, [holeNum]: { ...prev[holeNum], par } }));
  }
  function setHandicap(holeNum: number, hcp: number | null) {
    setEdits((prev) => ({ ...prev, [holeNum]: { ...prev[holeNum], handicap: hcp } }));
  }
  function setYardage(holeNum: number, tee: string, yds: number) {
    setEdits((prev) => {
      const existing = prev[holeNum]?.yardages ?? {};
      return { ...prev, [holeNum]: { ...prev[holeNum], yardages: { ...existing, [tee]: yds } } };
    });
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      for (const [holeNumStr, patch] of Object.entries(edits)) {
        const holeNumber = parseInt(holeNumStr);
        const res = await fetch(`/api/admin/${courseId}/holes/${holeNumber}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          credentials: 'include',
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(`Failed to save hole ${holeNumber}`);
      }
      setEdits({});
      await mutateCourse(courseId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const front = holes.filter((h) => h.holeNumber <= 9).sort((a, b) => a.holeNumber - b.holeNumber);
  const back = holes.filter((h) => h.holeNumber > 9).sort((a, b) => a.holeNumber - b.holeNumber);

  const inputClass = 'w-full bg-transparent text-center text-xs text-text-dark border-0 focus:outline-none focus:ring-1 focus:ring-primary rounded px-0 py-0.5';

  function renderNine(nineHoles: CourseHole[], label: string) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left px-1 py-1 font-medium w-12">{label}</th>
              {nineHoles.map((h) => (
                <th key={h.holeNumber} className="px-1 py-1 font-semibold text-center text-text-dark w-10">
                  {h.holeNumber}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border">
              <td className="px-1 py-1 text-text-muted font-medium">Par</td>
              {nineHoles.map((h) => {
                const v = getVal(h);
                return (
                  <td key={h.holeNumber} className="px-0.5 py-0.5 text-center">
                    <select
                      value={v.par}
                      onChange={(e) => setPar(h.holeNumber, parseInt(e.target.value))}
                      className={inputClass}
                    >
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </td>
                );
              })}
            </tr>
            <tr className="border-t border-border">
              <td className="px-1 py-1 text-text-muted font-medium">HCP</td>
              {nineHoles.map((h) => {
                const v = getVal(h);
                return (
                  <td key={h.holeNumber} className="px-0.5 py-0.5 text-center">
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={v.handicap ?? ''}
                      onChange={(e) => setHandicap(h.holeNumber, e.target.value ? parseInt(e.target.value) : null)}
                      className={inputClass}
                      placeholder="-"
                    />
                  </td>
                );
              })}
            </tr>
            {TEES.map((tee) => (
              <tr key={tee} className="border-t border-border">
                <td className="px-1 py-1 text-text-muted font-medium capitalize">{tee}</td>
                {nineHoles.map((h) => {
                  const v = getVal(h);
                  return (
                    <td key={h.holeNumber} className="px-0.5 py-0.5 text-center">
                      <input
                        type="number"
                        value={v.yardages[tee] ?? ''}
                        onChange={(e) => setYardage(h.holeNumber, tee, e.target.value ? parseInt(e.target.value) : 0)}
                        className={inputClass}
                        placeholder="-"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-text-medium uppercase">Scorecard</h4>
        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        )}
      </div>
      {error && (
        <div className="rounded-lg border border-coral/30 bg-coral/10 px-3 py-2 text-xs text-coral">{error}</div>
      )}
      {front.length > 0 && renderNine(front, 'Front')}
      {back.length > 0 && renderNine(back, 'Back')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function HazardMapper({ courseId, selectedHole, onSelectHole }: HazardMapperProps) {
  const { course } = useCourse(courseId || undefined);

  return (
    <div className="flex flex-col gap-4">
      {course && (
        <>
          {/* Scorecard editor */}
          <ScorecardEditor courseId={courseId} holes={course.holes} />

          {/* Hole status grid */}
          <div className="grid grid-cols-6 gap-1.5">
            {course.holes.map((hole) => {
              const status = getHoleStatus(hole);
              const isSelected = selectedHole === hole.holeNumber;
              return (
                <button
                  key={hole.holeNumber}
                  onClick={() =>
                    onSelectHole(isSelected ? null : hole.holeNumber)
                  }
                  className={`flex flex-col items-center rounded-lg border p-1.5 text-xs transition-all ${
                    STATUS_COLORS[status]
                  } ${isSelected ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                >
                  <span className="font-semibold">{hole.holeNumber}</span>
                  <span className="text-[9px]">
                    {status === 'empty'
                      ? '--'
                      : status === 'pending'
                        ? 'Review'
                        : 'Done'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hole editor */}
          {selectedHole != null && (
            <HoleHazardEditor
              courseId={courseId}
              holeNumber={selectedHole}
              onSave={() => mutateCourse(courseId)}
            />
          )}
        </>
      )}
    </div>
  );
}
