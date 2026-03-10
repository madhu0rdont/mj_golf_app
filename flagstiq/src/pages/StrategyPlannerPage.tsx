import { lazy, Suspense, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ChevronLeft, HelpCircle, MapPin } from 'lucide-react';
import { HelpSheet } from '../components/help/HelpSheet';

const CourseManagementHelpContent = lazy(() => import('../components/help/CourseManagementHelpContent'));
import { TopBar } from '../components/layout/TopBar';
import { PageHeader } from '../components/layout/PageHeader';
import { LoadingPage } from '../components/ui/LoadingPage';
import { HoleSelector } from '../components/strategy/HoleSelector';
import { HoleViewer } from '../components/strategy/HoleViewer';
import { HoleInfoPanel } from '../components/strategy/HoleInfoPanel';
import { StrategyPanel } from '../components/strategy/StrategyPanel';
import { GamePlanView } from '../components/strategy/GamePlanView';
import { useCourses, useCourse } from '../hooks/useCourses';
import { useHoleStrategy } from '../hooks/useHoleStrategy';
import { useYardageBookShots } from '../hooks/useYardageBook';
import { useGamePlanCache } from '../hooks/useGamePlanCache';
import { buildDistributions } from '../services/monte-carlo';
import type { Course } from '../models/course';

const TEE_BOXES = [
  { key: 'blue', label: 'Blue', color: '#3B82F6' },
  { key: 'white', label: 'White', color: '#E5E7EB' },
  { key: 'green', label: 'Green', color: '#22C55E' },
];

type ViewMode = 'hole' | 'gameplan';

const COURSE_LOGOS: Record<string, string> = {
  claremont: '/course-logos/claremont.svg',
  presidio: '/course-logos/presidio.webp',
  tilden: '/course-logos/tilden.webp',
  tcc: '/course-logos/tcc.png',
  harding: '/course-logos/harding.jpg',
  meadow: '/course-logos/meadow.webp',
  blackhawk: '/course-logos/blackhawk.png',
};

function getCourseLogoKey(name: string): string | undefined {
  const lower = name.toLowerCase();
  return Object.keys(COURSE_LOGOS).find((key) => lower.includes(key));
}

function CourseCard({ course, onSelect }: { course: Course; onSelect: (id: string) => void }) {
  const details = [
    course.par ? `Par ${course.par}` : null,
    course.rating ? `Rating ${course.rating}` : null,
    course.slope ? `Slope ${course.slope}` : null,
  ].filter(Boolean);

  const logoKey = getCourseLogoKey(course.name);
  const logoUrl = course.logo || (logoKey ? COURSE_LOGOS[logoKey] : null);

  return (
    <button
      onClick={() => onSelect(course.id)}
      className="shimmer-hover flex flex-col items-center gap-2 rounded-sm bg-card backdrop-blur-[8px] border border-card-border p-4 text-center hover:bg-white/40 transition-all cursor-pointer"
    >
      {logoUrl ? (
        <img src={logoUrl} alt={course.name} className="h-12 w-12 object-contain rounded" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-dim">
          <MapPin size={20} className="text-turf" />
        </div>
      )}
      <p className="font-display text-base font-normal text-ink leading-tight">{course.name}</p>
      {details.length > 0 && (
        <p className="font-mono text-[9px] tracking-[0.1em] text-ink-faint">{details.join(' · ')}</p>
      )}
    </button>
  );
}

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
  const [selectedStrategyIdx, setSelectedStrategyIdx] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('hole');
  const [helpOpen, setHelpOpen] = useState(false);

  // Sync URL when course/hole changes
  useEffect(() => {
    if (courseId) {
      navigate(`/strategy/${courseId}/${holeNumber}`, { replace: true });
    } else {
      navigate('/strategy', { replace: true });
    }
  }, [courseId, holeNumber, navigate]);

  const { course, isLoading: courseLoading } = useCourse(courseId);

  const hole = course?.holes.find((h) => h.holeNumber === holeNumber);
  const totalHoles = course?.holes.length ?? 18;

  const { strategies, landingZones, aimPoints, shotCount, regenerate } =
    useHoleStrategy(hole, teeBox, showSim, selectedStrategyIdx);
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Build distributions for GamePlanView landing zone rendering
  const shotGroups = useYardageBookShots();
  const distributions = useMemo(() => {
    if (!shotGroups) return [];
    return buildDistributions(shotGroups);
  }, [shotGroups]);

  // Game plan (lifted so both views can access keyHoles)
  const { gamePlan, isStale, staleReason, isFetching, isGenerating, progress, generate, regenerateHole, cacheAge } = useGamePlanCache(
    course,
    teeBox,
  );

  const keyHoleSet = useMemo(
    () => new Set<number>(gamePlan?.keyHoles ?? []),
    [gamePlan?.keyHoles],
  );

  // Reset strategy selection when hole or tee changes
  useEffect(() => {
    setSelectedStrategyIdx(0);
  }, [holeNumber, teeBox]);

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

  // Empty state — no courses
  if (!courses?.length) {
    return (
      <>
        <TopBar title="Course Management" rightAction={<button onClick={() => setHelpOpen(true)} className="rounded-sm p-1.5 text-text-muted hover:text-text-dark" aria-label="How it works"><HelpCircle size={20} /></button>} />
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
          <p className="text-sm text-text-muted">
            No courses available yet. Ask an admin to import one.
          </p>
        </div>
        <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How It Works">
          <Suspense fallback={<div className="py-8 text-center text-text-muted text-sm">Loading...</div>}>
            <CourseManagementHelpContent />
          </Suspense>
        </HelpSheet>
      </>
    );
  }

  // Course grid — no course selected yet
  if (!courseId) {
    return (
      <>
        <TopBar title="Strategy" rightAction={<button onClick={() => setHelpOpen(true)} className="rounded-sm p-1.5 text-text-muted hover:text-text-dark" aria-label="How it works"><HelpCircle size={20} /></button>} />
        <PageHeader eyebrow="Course · Strategy" title="Course" titleEmphasis="Strategy" />
        <div className="px-4 md:px-8 py-3 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {courses.map((c) => (
              <CourseCard key={c.id} course={c} onSelect={setCourseId} />
            ))}
          </div>
        </div>
        <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How It Works">
          <Suspense fallback={<div className="py-8 text-center text-text-muted text-sm">Loading...</div>}>
            <CourseManagementHelpContent />
          </Suspense>
        </HelpSheet>
      </>
    );
  }

  return (
    <>
      <TopBar title="Strategy" rightAction={<button onClick={() => setHelpOpen(true)} className="rounded-sm p-1.5 text-text-muted hover:text-text-dark" aria-label="How it works"><HelpCircle size={20} /></button>} />
      <PageHeader
        eyebrow="Course · Strategy"
        title={course?.name ?? 'Course'}
        titleEmphasis="Strategy"
      />
      <div className="flex flex-col gap-3 px-4 md:px-8 py-3 pb-6">
        {/* Course header with back button — mobile only since desktop has PageHeader */}
        <button
          onClick={() => { setCourseId(undefined); setHoleNumber(1); }}
          className="md:hidden flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink transition-colors self-start -ml-1"
        >
          <ChevronLeft size={18} />
          <span className="font-medium">{course?.name ?? 'All Courses'}</span>
        </button>

        {/* View mode toggle */}
        <div className="flex items-center gap-1.5">
          {/* Tee box selector */}
          {TEE_BOXES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTeeBox(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] tracking-[0.15em] transition-colors ${
                teeBox === t.key
                  ? 'bg-forest text-linen'
                  : 'border border-card-border text-ink-light hover:border-ink-mid hover:text-ink'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border border-white/30"
                style={{ backgroundColor: t.color }}
              />
              {t.label}
            </button>
          ))}

        </div>

        {/* View mode segmented control */}
        <div className="flex rounded-sm bg-surface border border-border overflow-hidden">
          {(['hole', 'gameplan'] as const).map((vm) => (
            <button
              key={vm}
              onClick={() => setViewMode(vm)}
              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                viewMode === vm
                  ? 'bg-forest text-linen'
                  : 'text-ink-light hover:bg-border'
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
              <div className="flex items-center justify-center h-[55vh] rounded-sm border border-border bg-surface">
                <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
              </div>
            ) : hole ? (
              <>
                <HoleInfoPanel hole={hole} teeBox={teeBox} allHoles={course!.holes} isKeyHole={keyHoleSet.has(holeNumber)} />

                {/* Sim toggle + Regenerate */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => shotCount > 0 && setShowSim((s) => !s)}
                    disabled={shotCount === 0}
                    className={`rounded-sm px-5 py-2 text-sm font-bold tracking-wide transition-all ${
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
                    <button
                      onClick={async () => {
                        setIsRegenerating(true);
                        try {
                          await regenerateHole(holeNumber);
                          await regenerate();
                        } finally {
                          setIsRegenerating(false);
                        }
                      }}
                      disabled={isRegenerating}
                      className="rounded-sm px-3 py-2 text-sm font-medium bg-surface text-text-dark border border-border hover:border-primary hover:text-primary transition-all disabled:opacity-50"
                    >
                      {isRegenerating ? (
                        <span className="flex items-center gap-1.5">
                          <span className="animate-spin h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full inline-block" />
                          Regenerating
                        </span>
                      ) : (
                        'Regenerate'
                      )}
                    </button>
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
              <div className="flex items-center justify-center h-[55vh] rounded-sm border border-border bg-surface">
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
              isStale={isStale}
              staleReason={staleReason}
              isFetching={isFetching}
              cacheAge={cacheAge}
              courseHoles={course?.holes}
            />
          ) : (
            <div className="flex items-center justify-center h-[55vh] rounded-sm border border-border bg-surface">
              <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
            </div>
          )
        )}
      </div>
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} title="How It Works">
        <Suspense fallback={<div className="py-8 text-center text-text-muted text-sm">Loading...</div>}>
          <CourseManagementHelpContent />
        </Suspense>
      </HelpSheet>
    </>
  );
}
