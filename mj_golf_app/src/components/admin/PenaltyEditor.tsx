import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { useCourses, useCourse, mutateCourse } from '../../hooks/useCourses';

const HAZARD_TYPES = [
  { type: 'fairway_bunker', label: 'Fairway Bunker', defaultPenalty: 0.3 },
  { type: 'greenside_bunker', label: 'Greenside Bunker', defaultPenalty: 0.5 },
  { type: 'bunker', label: 'Bunker', defaultPenalty: 0.4 },
  { type: 'water', label: 'Water', defaultPenalty: 1 },
  { type: 'ob', label: 'OB', defaultPenalty: 1 },
  { type: 'trees', label: 'Trees', defaultPenalty: 0.5 },
  { type: 'rough', label: 'Rough', defaultPenalty: 0.2 },
] as const;

const HAZARD_TYPE_COLORS: Record<string, string> = {
  fairway_bunker: 'bg-yellow-500/20 text-yellow-700',
  greenside_bunker: 'bg-orange-500/20 text-orange-700',
  bunker: 'bg-yellow-500/20 text-yellow-700',
  water: 'bg-blue-500/20 text-blue-700',
  ob: 'bg-red-500/20 text-red-700',
  trees: 'bg-green-500/20 text-green-700',
  rough: 'bg-amber-700/20 text-amber-800',
};

interface TypePenalty {
  type: string;
  label: string;
  penalty: number;
  originalPenalty: number;
  count: number; // how many hazards of this type exist
}

export function PenaltyEditor() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState('');
  const [typePenalties, setTypePenalties] = useState<TypePenalty[]>([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (!courseId && courses?.length) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  const { course } = useCourse(courseId || undefined);

  // Build per-type penalty rows from course hazards
  useEffect(() => {
    if (!course) {
      setTypePenalties([]);
      return;
    }

    // Count hazards by type and get current penalty (from first hazard of that type)
    const typeMap = new Map<string, { count: number; penalty: number }>();
    for (const hole of course.holes) {
      for (const h of hole.hazards) {
        const existing = typeMap.get(h.type);
        if (existing) {
          existing.count++;
        } else {
          typeMap.set(h.type, { count: 1, penalty: h.penalty });
        }
      }
    }

    // Build rows for types that exist in this course
    const rows: TypePenalty[] = [];
    for (const ht of HAZARD_TYPES) {
      const data = typeMap.get(ht.type);
      if (!data) continue;
      rows.push({
        type: ht.type,
        label: ht.label,
        penalty: data.penalty,
        originalPenalty: data.penalty,
        count: data.count,
      });
    }

    setTypePenalties(rows);
    setStatus(null);
  }, [course]);

  function updatePenalty(type: string, penalty: number) {
    setTypePenalties((prev) =>
      prev.map((r) => (r.type === type ? { ...r, penalty } : r)),
    );
  }

  async function handleSave() {
    if (!course) return;
    setSaving(true);
    setStatus(null);

    // Build a map of type → new penalty for dirty types
    const dirtyTypes = new Map<string, number>();
    for (const row of typePenalties) {
      if (row.penalty !== row.originalPenalty) {
        dirtyTypes.set(row.type, row.penalty);
      }
    }

    if (dirtyTypes.size === 0) return;

    try {
      // Find which holes have hazards of the dirty types
      const affectedHoles = new Set<number>();
      for (const hole of course.holes) {
        for (const h of hole.hazards) {
          if (dirtyTypes.has(h.type)) {
            affectedHoles.add(hole.holeNumber);
            break;
          }
        }
      }

      for (const holeNumber of affectedHoles) {
        const hole = course.holes.find((h) => h.holeNumber === holeNumber);
        if (!hole) continue;

        const updatedHazards = hole.hazards.map((h) => {
          const newPenalty = dirtyTypes.get(h.type);
          return newPenalty !== undefined ? { ...h, penalty: newPenalty } : h;
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
      const typeNames = [...dirtyTypes.keys()].map(
        (t) => HAZARD_TYPES.find((ht) => ht.type === t)?.label ?? t,
      );
      setStatus({
        type: 'success',
        message: `Updated ${typeNames.join(', ')} across ${affectedHoles.size} hole(s)`,
      });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  const hasDirty = typePenalties.some((r) => r.penalty !== r.originalPenalty);

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

      {typePenalties.length === 0 && course && (
        <p className="text-sm text-text-muted py-4 text-center">
          No hazards mapped yet. Use Edit Courses to add hazards first.
        </p>
      )}

      {typePenalties.length > 0 && (
        <>
          <p className="text-xs text-text-muted">
            Set penalty strokes by hazard type. Changes apply to all hazards of that type across all holes.
          </p>

          <div className="flex flex-col gap-2">
            {typePenalties.map((row) => (
              <div
                key={row.type}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
              >
                <span
                  className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    HAZARD_TYPE_COLORS[row.type] ?? 'bg-gray-500/20 text-gray-700'
                  }`}
                >
                  {row.label}
                </span>
                <span className="flex-1 text-[10px] text-text-muted">
                  {row.count} hazard{row.count !== 1 ? 's' : ''}
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={row.penalty}
                  onChange={(e) =>
                    updatePenalty(row.type, parseFloat(e.target.value) || 0)
                  }
                  className={`w-16 rounded border bg-card px-1.5 py-1 text-sm text-center text-text-dark focus:border-primary focus:outline-none ${
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
