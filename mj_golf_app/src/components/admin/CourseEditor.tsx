import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { useCourses, useCourse, mutateCourse } from '../../hooks/useCourses';
import { api } from '../../lib/api';
import type { HazardFeature } from '../../models/course';

const TEE_BOXES = ['blue', 'white', 'red'];

export function CourseEditor() {
  const { courses } = useCourses();
  const [courseId, setCourseId] = useState<string>('');
  const [holeNumber, setHoleNumber] = useState<number>(1);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Default to first course
  useEffect(() => {
    if (!courseId && courses?.length) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  const { course } = useCourse(courseId || undefined);
  const hole = course?.holes.find((h) => h.holeNumber === holeNumber);

  // Local editable state
  const [notes, setNotes] = useState('');
  const [yardages, setYardages] = useState<Record<string, number>>({});
  const [hazards, setHazards] = useState<HazardFeature[]>([]);

  // Sync from fetched hole
  useEffect(() => {
    if (hole) {
      setNotes(hole.notes ?? '');
      setYardages({ ...hole.yardages });
      setHazards(hole.hazards.map((h) => ({ ...h })));
      setStatus(null);
    }
  }, [hole]);

  const handleSave = async () => {
    if (!courseId || !hole) return;
    setStatus(null);
    try {
      await api.patch(`/admin/${courseId}/holes/${holeNumber}`, {
        notes: notes || null,
        yardages,
        hazards,
      });
      mutateCourse(courseId);
      setStatus({ type: 'success', message: 'Saved' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    }
  };

  if (!courses?.length) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border-light bg-surface p-4 text-center opacity-50">
        <span className="text-xs text-text-muted">Course Editor</span>
        <span className="text-[10px] text-text-muted">Import a course first</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-text-dark">Course Editor</h3>

      {/* Course selector */}
      <Select
        label="Course"
        value={courseId}
        onChange={(e) => {
          setCourseId(e.target.value);
          setHoleNumber(1);
        }}
        options={(courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />

      {/* Hole selector */}
      {course && (
        <Select
          label="Hole"
          value={String(holeNumber)}
          onChange={(e) => setHoleNumber(parseInt(e.target.value))}
          options={course.holes.map((h) => ({
            value: String(h.holeNumber),
            label: `Hole ${h.holeNumber} — Par ${h.par}`,
          }))}
        />
      )}

      {hole && (
        <>
          {/* Notes */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-medium">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tips, e.g. 'favor left side'"
              rows={2}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-dark placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Yardages */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text-medium">Yardages by Tee</label>
            <div className="grid grid-cols-3 gap-2">
              {TEE_BOXES.map((tee) => (
                <Input
                  key={tee}
                  label={tee.charAt(0).toUpperCase() + tee.slice(1)}
                  type="number"
                  value={yardages[tee] ?? ''}
                  onChange={(e) =>
                    setYardages((prev) => ({
                      ...prev,
                      [tee]: e.target.value ? parseInt(e.target.value) : 0,
                    }))
                  }
                  suffix="yds"
                />
              ))}
            </div>
          </div>

          {/* Hazard penalties */}
          {hazards.length > 0 && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text-medium">Hazard Penalties</label>
              <div className="flex flex-col gap-2">
                {hazards.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-dark truncate">{h.name}</p>
                      <p className="text-[10px] text-text-muted capitalize">{h.type}</p>
                    </div>
                    <Input
                      type="number"
                      value={h.penalty}
                      onChange={(e) => {
                        const updated = [...hazards];
                        updated[idx] = { ...updated[idx], penalty: parseInt(e.target.value) || 0 };
                        setHazards(updated);
                      }}
                      className="!w-16 text-center"
                      suffix="pen"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Save */}
          <Button onClick={handleSave} className="w-full">
            <Save size={16} />
            Save Changes
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
