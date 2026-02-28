import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useCourses, useCourse, mutateCourse } from '../../hooks/useCourses';

const HAZARD_TYPE_LABELS: Record<string, string> = {
  fairway_bunker: 'FW Bunker',
  greenside_bunker: 'GS Bunker',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
  rough: 'Rough',
};

const HAZARD_TYPE_COLORS: Record<string, string> = {
  fairway_bunker: 'bg-yellow-500/20 text-yellow-700',
  greenside_bunker: 'bg-orange-500/20 text-orange-700',
  water: 'bg-blue-500/20 text-blue-700',
  ob: 'bg-red-500/20 text-red-700',
  trees: 'bg-green-500/20 text-green-700',
  rough: 'bg-amber-700/20 text-amber-800',
};

interface PenaltyRow {
  holeNumber: number;
  hazardIdx: number;
  name: string;
  type: string;
  penalty: number;
  originalPenalty: number;
}

export function PenaltyEditor() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<PenaltyRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!courseId && courses?.length) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  const { course } = useCourse(courseId || undefined);

  // Build flat penalty rows from course holes
  useEffect(() => {
    if (!course) {
      setRows([]);
      return;
    }
    const allRows: PenaltyRow[] = [];
    for (const hole of course.holes) {
      for (let i = 0; i < hole.hazards.length; i++) {
        const h = hole.hazards[i];
        allRows.push({
          holeNumber: hole.holeNumber,
          hazardIdx: i,
          name: h.name,
          type: h.type,
          penalty: h.penalty,
          originalPenalty: h.penalty,
        });
      }
    }
    setRows(allRows);
    setStatus(null);
  }, [course]);

  function updatePenalty(holeNumber: number, hazardIdx: number, penalty: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.holeNumber === holeNumber && r.hazardIdx === hazardIdx
          ? { ...r, penalty }
          : r,
      ),
    );
  }

  async function handleSave() {
    if (!course) return;
    setSaving(true);
    setStatus(null);

    // Group dirty rows by hole
    const dirtyByHole = new Map<number, PenaltyRow[]>();
    for (const row of rows) {
      if (row.penalty !== row.originalPenalty) {
        const existing = dirtyByHole.get(row.holeNumber) ?? [];
        existing.push(row);
        dirtyByHole.set(row.holeNumber, existing);
      }
    }

    try {
      for (const [holeNumber, dirtyRows] of dirtyByHole) {
        const hole = course.holes.find((h) => h.holeNumber === holeNumber);
        if (!hole) continue;

        const updatedHazards = hole.hazards.map((h, idx) => {
          const dirty = dirtyRows.find((r) => r.hazardIdx === idx);
          return dirty ? { ...h, penalty: dirty.penalty } : h;
        });

        const res = await fetch(`/api/admin/${courseId}/holes/${holeNumber}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ hazards: updatedHazards }),
        });
        if (!res.ok) {
          throw new Error(`Failed to save hole ${holeNumber}`);
        }
      }

      await mutateCourse(courseId);
      setStatus({ type: 'success', message: `Saved ${dirtyByHole.size} hole(s)` });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  const hasDirty = rows.some((r) => r.penalty !== r.originalPenalty);

  if (!courses?.length) {
    return (
      <p className="text-sm text-text-muted py-4 text-center">
        No courses imported yet
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Select
        label="Course"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />

      {rows.length === 0 && course && (
        <p className="text-sm text-text-muted py-4 text-center">
          No hazards mapped yet. Use Edit Courses to add hazards first.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-col gap-1.5">
            {rows.map((row) => (
              <div
                key={`${row.holeNumber}-${row.hazardIdx}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5"
              >
                <span className="flex-shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  #{row.holeNumber}
                </span>
                <span className="flex-1 min-w-0 text-xs text-text-dark truncate">
                  {row.name}
                </span>
                <span
                  className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                    HAZARD_TYPE_COLORS[row.type] ?? 'bg-gray-500/20 text-gray-700'
                  }`}
                >
                  {HAZARD_TYPE_LABELS[row.type] ?? row.type}
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={row.penalty}
                  onChange={(e) =>
                    updatePenalty(
                      row.holeNumber,
                      row.hazardIdx,
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className={`w-16 rounded border bg-card px-1.5 py-1 text-xs text-center text-text-dark focus:border-primary focus:outline-none ${
                    row.penalty !== row.originalPenalty
                      ? 'border-primary'
                      : 'border-border'
                  }`}
                />
              </div>
            ))}
          </div>

          <Button onClick={handleSave} disabled={saving || !hasDirty} className="w-full">
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save All
              </>
            )}
          </Button>

          {status && (
            <p className={`text-xs ${status.type === 'success' ? 'text-primary' : 'text-coral'}`}>
              {status.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
