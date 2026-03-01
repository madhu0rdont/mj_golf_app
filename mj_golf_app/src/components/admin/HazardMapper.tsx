import { useState } from 'react';
import { Loader2, Radar } from 'lucide-react';
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

interface HazardMapperProps {
  courseId: string;
}

export function HazardMapper({ courseId }: HazardMapperProps) {
  const [selectedHole, setSelectedHole] = useState<number | null>(null);
  const [detectingAll, setDetectingAll] = useState(false);
  const [detectProgress, setDetectProgress] = useState(0);

  const { course } = useCourse(courseId || undefined);

  async function handleDetectAll() {
    if (!course) return;
    setDetectingAll(true);
    setDetectProgress(0);

    for (let i = 0; i < course.holes.length; i++) {
      const hole = course.holes[i];
      try {
        const res = await fetch('/api/admin/hazard-detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
          credentials: 'include',
          body: JSON.stringify({
            courseId,
            holeNumber: hole.holeNumber,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          // Save detected hazards + fairway to the hole
          await fetch(`/api/admin/${courseId}/holes/${hole.holeNumber}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
            credentials: 'include',
            body: JSON.stringify({
              hazards: data.hazards,
              fairway: data.fairway,
            }),
          });
        }
      } catch {
        // Continue with next hole on error
      }
      setDetectProgress(i + 1);
    }

    await mutateCourse(courseId);
    setDetectingAll(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {course && (
        <>
          {/* Auto-detect all */}
          <Button
            onClick={handleDetectAll}
            disabled={detectingAll}
            variant="ghost"
            className="w-full"
          >
            {detectingAll ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Detecting {detectProgress}/{course.holes.length}...
              </>
            ) : (
              <>
                <Radar size={16} />
                Auto-detect All Holes
              </>
            )}
          </Button>

          {/* 18-hole status grid */}
          <div className="grid grid-cols-6 gap-1.5">
            {course.holes.map((hole) => {
              const status = getHoleStatus(hole);
              const isSelected = selectedHole === hole.holeNumber;
              return (
                <button
                  key={hole.holeNumber}
                  onClick={() =>
                    setSelectedHole(
                      isSelected ? null : hole.holeNumber,
                    )
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
