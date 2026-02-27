import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { LoadingPage } from '../components/ui/LoadingPage';
import { Select } from '../components/ui/Select';
import { HoleSelector } from '../components/strategy/HoleSelector';
import { HoleViewer } from '../components/strategy/HoleViewer';
import { HoleInfoPanel } from '../components/strategy/HoleInfoPanel';
import { StrategyPanel } from '../components/strategy/StrategyPanel';
import { useCourses, useCourse } from '../hooks/useCourses';
import { useHoleStrategy } from '../hooks/useHoleStrategy';
import type { StrategyMode } from '../services/strategy-optimizer';

const TEE_BOXES = [
  { key: 'blue', label: 'Blue', color: '#3B82F6' },
  { key: 'white', label: 'White', color: '#E5E7EB' },
  { key: 'red', label: 'Red', color: '#EF4444' },
];

export function StrategyPlannerPage() {
  const params = useParams<{ courseId?: string; holeNumber?: string }>();
  const navigate = useNavigate();
  const { courses, isLoading: coursesLoading } = useCourses();

  const [courseId, setCourseId] = useState<string | undefined>(params.courseId);
  const [holeNumber, setHoleNumber] = useState<number>(
    params.holeNumber ? parseInt(params.holeNumber, 10) : 1,
  );
  const [teeBox, setTeeBox] = useState('blue');
  const [showSim, setShowSim] = useState(false);
  const [strategyMode, setStrategyMode] = useState<StrategyMode>('scoring');
  const [selectedStrategyIdx, setSelectedStrategyIdx] = useState(0);

  // Default to first course when courses load
  useEffect(() => {
    if (!courseId && courses?.length) {
      setCourseId(courses[0].id);
    }
  }, [courses, courseId]);

  // Sync URL when course/hole changes
  useEffect(() => {
    if (courseId) {
      navigate(`/strategy/${courseId}/${holeNumber}`, { replace: true });
    }
  }, [courseId, holeNumber, navigate]);

  const { course, isLoading: courseLoading } = useCourse(courseId);

  const hole = course?.holes.find((h) => h.holeNumber === holeNumber);
  const totalHoles = course?.holes.length ?? 18;

  const { strategies, landingZones, shotCount } =
    useHoleStrategy(hole, teeBox, showSim, selectedStrategyIdx, strategyMode);

  // Reset strategy selection when hole, tee, or mode changes
  useEffect(() => {
    setSelectedStrategyIdx(0);
  }, [holeNumber, teeBox, strategyMode]);

  // Keyboard nav
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        setHoleNumber((n) => (n === 1 ? totalHoles : n - 1));
      } else if (e.key === 'ArrowRight') {
        setHoleNumber((n) => (n === totalHoles ? 1 : n + 1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [totalHoles]);

  if (coursesLoading) {
    return <LoadingPage title="Strategy" />;
  }

  // Empty state
  if (!courses?.length) {
    return (
      <>
        <TopBar title="Strategy" />
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <p className="text-sm text-text-muted">
            No courses imported yet.
          </p>
          <Link
            to="/admin"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Import a Course
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Strategy" />
      <div className="flex flex-col gap-3 px-4 py-3 pb-24">
        {/* Course selector */}
        {courses.length > 1 && (
          <Select
            value={courseId ?? ''}
            onChange={(e) => {
              setCourseId(e.target.value);
              setHoleNumber(1);
            }}
            options={courses.map((c) => ({ value: c.id, label: c.name }))}
          />
        )}

        {/* Tee box selector + Sim toggle */}
        <div className="flex items-center gap-1.5">
          {TEE_BOXES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTeeBox(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                teeBox === t.key
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text-medium hover:bg-border'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/30"
                style={{ backgroundColor: t.color }}
              />
              {t.label}
            </button>
          ))}

          {/* Vertical divider */}
          <div className="h-5 w-px bg-border mx-1" />

          {/* Sim toggle */}
          <button
            onClick={() => shotCount > 0 && setShowSim((s) => !s)}
            disabled={shotCount === 0}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              showSim
                ? 'text-black'
                : shotCount === 0
                  ? 'bg-surface text-text-muted opacity-50 cursor-not-allowed'
                  : 'bg-surface text-text-medium hover:bg-border'
            }`}
            style={showSim ? { backgroundColor: '#00E5FF' } : undefined}
          >
            Sim
          </button>

          {/* Scoring / Safe toggle (only visible when sim is on) */}
          {showSim && (
            <>
              <div className="h-5 w-px bg-border mx-1" />
              {(['scoring', 'safe'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setStrategyMode(m)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    strategyMode === m
                      ? 'bg-primary text-white'
                      : 'bg-surface text-text-medium hover:bg-border'
                  }`}
                >
                  {m === 'scoring' ? 'Scoring' : 'Safe'}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Hole selector */}
        <HoleSelector
          totalHoles={totalHoles}
          current={holeNumber}
          onChange={setHoleNumber}
        />

        {/* Map */}
        {courseLoading ? (
          <div className="flex items-center justify-center h-[55vh] rounded-2xl border border-border bg-surface">
            <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
          </div>
        ) : hole ? (
          <>
            <HoleViewer hole={hole} teeBox={teeBox} landingZones={showSim ? landingZones : undefined} />
            {showSim && (
              <StrategyPanel
                strategies={strategies}
                selectedIdx={selectedStrategyIdx}
                onSelect={setSelectedStrategyIdx}
                shotCount={shotCount}
              />
            )}
            <HoleInfoPanel hole={hole} teeBox={teeBox} />
          </>
        ) : (
          <div className="flex items-center justify-center h-[55vh] rounded-2xl border border-border bg-surface">
            <p className="text-sm text-text-muted">Hole not found</p>
          </div>
        )}
      </div>
    </>
  );
}
