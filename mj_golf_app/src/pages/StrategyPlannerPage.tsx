import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { LoadingPage } from '../components/ui/LoadingPage';
import { Select } from '../components/ui/Select';
import { HoleSelector } from '../components/strategy/HoleSelector';
import { HoleViewer } from '../components/strategy/HoleViewer';
import { HoleInfoPanel } from '../components/strategy/HoleInfoPanel';
import { StrategyPanel } from '../components/strategy/StrategyPanel';
import { GamePlanView } from '../components/strategy/GamePlanView';
import { useCourses, useCourse } from '../hooks/useCourses';
import { useHoleStrategy } from '../hooks/useHoleStrategy';
import { useYardageBookShots } from '../hooks/useYardageBook';
import { useGamePlan } from '../hooks/useGamePlan';
import { buildDistributions } from '../services/monte-carlo';
import type { StrategyMode } from '../services/strategy-optimizer';

const TEE_BOXES = [
  { key: 'blue', label: 'Blue', color: '#3B82F6' },
  { key: 'white', label: 'White', color: '#E5E7EB' },
  { key: 'green', label: 'Green', color: '#22C55E' },
];

type ViewMode = 'hole' | 'gameplan';

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
  const [viewMode, setViewMode] = useState<ViewMode>('hole');

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

  const { strategies, landingZones, aimPoints, shotCount } =
    useHoleStrategy(hole, teeBox, showSim, selectedStrategyIdx, strategyMode);

  // Build distributions for GamePlanView (always, not gated by showSim)
  const shotGroups = useYardageBookShots();
  const distributions = useMemo(() => {
    if (!shotGroups) return [];
    return buildDistributions(shotGroups);
  }, [shotGroups]);

  // Game plan (lifted so both views can access keyHoles)
  const { gamePlan, progress, isGenerating, generate } = useGamePlan(
    course,
    teeBox,
    distributions,
    strategyMode,
  );

  // Auto-regenerate when mode changes if a plan already exists
  useEffect(() => {
    if (gamePlan && gamePlan.mode !== strategyMode) {
      generate();
    }
  }, [strategyMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const keyHoleSet = useMemo(
    () => new Set(gamePlan?.keyHoles ?? []),
    [gamePlan?.keyHoles],
  );

  // Reset strategy selection when hole, tee, or mode changes
  useEffect(() => {
    setSelectedStrategyIdx(0);
  }, [holeNumber, teeBox, strategyMode]);

  // Keyboard nav (only in hole view)
  useEffect(() => {
    if (viewMode !== 'hole') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') {
        setHoleNumber((n) => (n === 1 ? totalHoles : n - 1));
      } else if (e.key === 'ArrowRight') {
        setHoleNumber((n) => (n === totalHoles ? 1 : n + 1));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [totalHoles, viewMode]);

  if (coursesLoading) {
    return <LoadingPage title="Course Management" />;
  }

  // Empty state
  if (!courses?.length) {
    return (
      <>
        <TopBar title="Course Management" />
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
      <TopBar title="Course Management" />
      <div className="flex flex-col gap-3 px-4 py-3 pb-24">
        {/* Course selector */}
        <Select
          value={courseId ?? ''}
          onChange={(e) => {
            setCourseId(e.target.value);
            setHoleNumber(1);
          }}
          options={courses.map((c) => ({ value: c.id, label: c.name }))}
        />

        {/* View mode toggle */}
        <div className="flex items-center gap-1.5">
          {/* Tee box selector */}
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

          {/* Scoring / Safe toggle (game plan view) */}
          {viewMode === 'gameplan' && (
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

        {/* View mode segmented control */}
        <div className="flex rounded-lg bg-surface border border-border overflow-hidden">
          {(['hole', 'gameplan'] as const).map((vm) => (
            <button
              key={vm}
              onClick={() => setViewMode(vm)}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                viewMode === vm
                  ? 'bg-primary text-white'
                  : 'text-text-medium hover:bg-border'
              }`}
            >
              {vm === 'hole' ? 'Hole View' : 'Game Plan'}
            </button>
          ))}
        </div>

        {/* Content */}
        {viewMode === 'hole' ? (
          <>
            {/* Hole selector */}
            <HoleSelector
              totalHoles={totalHoles}
              current={holeNumber}
              onChange={setHoleNumber}
              keyHoles={keyHoleSet}
            />

            {/* Map */}
            {courseLoading ? (
              <div className="flex items-center justify-center h-[55vh] rounded-2xl border border-border bg-surface">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
              </div>
            ) : hole ? (
              <>
                <HoleInfoPanel hole={hole} teeBox={teeBox} allHoles={course!.holes} isKeyHole={keyHoleSet.has(holeNumber)} />

                {/* Sim toggle + Scoring/Safe */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => shotCount > 0 && setShowSim((s) => !s)}
                    disabled={shotCount === 0}
                    className={`rounded-lg px-5 py-2 text-sm font-bold tracking-wide transition-all ${
                      showSim
                        ? 'text-black shadow-md'
                        : shotCount === 0
                          ? 'bg-surface text-text-muted opacity-50 cursor-not-allowed'
                          : 'bg-surface text-text-dark border border-border hover:border-primary hover:text-primary'
                    }`}
                    style={showSim ? { backgroundColor: '#00E5FF', boxShadow: '0 0 12px rgba(0,229,255,0.4)' } : undefined}
                  >
                    {showSim ? 'Sim On' : 'Run Sim'}
                  </button>
                  {showSim && (
                    <>
                      <div className="h-6 w-px bg-border" />
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

                {showSim && (
                  <StrategyPanel
                    strategies={strategies}
                    selectedIdx={selectedStrategyIdx}
                    onSelect={setSelectedStrategyIdx}
                    shotCount={shotCount}
                  />
                )}
                <HoleViewer hole={hole} teeBox={teeBox} landingZones={showSim ? landingZones : undefined} aimPoints={showSim ? aimPoints : undefined} />
              </>
            ) : (
              <div className="flex items-center justify-center h-[55vh] rounded-2xl border border-border bg-surface">
                <p className="text-sm text-text-muted">Hole not found</p>
              </div>
            )}
          </>
        ) : (
          /* Game Plan view */
          course ? (
            <GamePlanView
              gamePlan={gamePlan}
              progress={progress}
              isGenerating={isGenerating}
              onGenerate={generate}
              distributions={distributions}
            />
          ) : (
            <div className="flex items-center justify-center h-[55vh] rounded-2xl border border-border bg-surface">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
            </div>
          )
        )}
      </div>
    </>
  );
}
