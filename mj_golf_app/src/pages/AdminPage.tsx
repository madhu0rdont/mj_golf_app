import { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Map, Shield, Upload, ChevronLeft, MapPin, Users, LogOut } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { LoadingPage } from '../components/ui/LoadingPage';
import { KmlImporter } from '../components/admin/KmlImporter';
import { HazardMapper } from '../components/admin/HazardMapper';
import { ElevationRefresh } from '../components/admin/ElevationRefresh';
import { PenaltyEditor } from '../components/admin/PenaltyEditor';
import { UserManager } from '../components/admin/UserManager';
import { useCourses, useCourse, mutateCourses } from '../hooks/useCourses';
import { useAuth } from '../context/AuthContext';
import type { Course, CourseHole, HazardFeature } from '../models/course';

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

type View = 'dashboard' | 'course-grid' | 'course-edit' | 'penalties' | 'import' | 'users';

function deriveView(pathname: string, courseId: string): View {
  if (pathname === '/admin/penalties') return 'penalties';
  if (pathname === '/admin/import') return 'import';
  if (pathname === '/admin/courses') return 'course-grid';
  if (pathname === '/admin/users') return 'users';
  if (courseId) return 'course-edit';
  return 'dashboard';
}

function AdminCourseCard({ course }: { course: Course }) {
  const navigate = useNavigate();
  const details = [
    course.par ? `Par ${course.par}` : null,
    course.rating ? `Rating ${course.rating}` : null,
    course.slope ? `Slope ${course.slope}` : null,
  ].filter(Boolean);

  const logoKey = getCourseLogoKey(course.name);
  const logoUrl = logoKey ? COURSE_LOGOS[logoKey] : null;

  return (
    <button
      onClick={() => navigate(`/admin/${course.id}`)}
      className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center hover:border-primary hover:shadow-sm transition-all"
    >
      {logoUrl ? (
        <img src={logoUrl} alt={course.name} className="h-12 w-12 object-contain" />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <MapPin size={20} className="text-primary" />
        </div>
      )}
      <p className="text-sm font-semibold text-text-dark leading-tight">{course.name}</p>
      {details.length > 0 && (
        <p className="text-[10px] text-text-muted">{details.join(' · ')}</p>
      )}
    </button>
  );
}

function CourseSummaryHeader({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const { course } = useCourse(courseId);

  const stats = useMemo(() => {
    if (!course) return null;
    const mapped = course.holes.filter((h: CourseHole) => {
      if (!h.hazards || h.hazards.length === 0) return false;
      return h.hazards.every((hz: HazardFeature) => hz.status === 'accepted');
    }).length;

    const teeKeys = new Set<string>();
    for (const h of course.holes) {
      for (const key of Object.keys(h.yardages)) {
        if (h.yardages[key] > 0) teeKeys.add(key);
      }
    }

    return { mapped, teeBoxes: teeKeys.size };
  }, [course]);

  if (!course) return null;

  const details = [
    course.par ? `Par ${course.par}` : null,
    course.rating ? `Rating ${course.rating}` : null,
    course.slope ? `Slope ${course.slope}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <button
        onClick={() => navigate('/admin/courses')}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-text-dark transition-colors -ml-1 mb-1"
      >
        <ChevronLeft size={16} />
        <span className="text-xs font-medium">All Courses</span>
      </button>
      <p className="text-base font-semibold text-text-dark">{course.name}</p>
      {details.length > 0 && (
        <p className="text-xs text-text-muted mt-0.5">{details.join(' · ')}</p>
      )}
      {stats && (
        <p className="text-xs text-text-muted mt-0.5">
          {stats.mapped}/18 holes mapped{stats.teeBoxes > 0 ? ` · ${stats.teeBoxes} tee box${stats.teeBoxes !== 1 ? 'es' : ''} with data` : ''}
        </p>
      )}
    </div>
  );
}

export function AdminPage() {
  const params = useParams<{ courseId?: string; holeNumber?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { courses, isLoading } = useCourses();
  const { user, logout } = useAuth();

  const courseId = params.courseId ?? '';
  const view = deriveView(location.pathname, courseId);
  const selectedHole = params.holeNumber ? parseInt(params.holeNumber, 10) : null;


  const isAdmin = user?.role === 'admin';

  if (isLoading) return <LoadingPage title="Admin" showBack={!isAdmin} />;

  function handleSelectHole(hole: number | null) {
    if (hole != null) {
      navigate(`/admin/${courseId}/${hole}`);
    } else {
      navigate(`/admin/${courseId}`);
    }
  }

  return (
    <>
      <TopBar title="Admin" showBack={!isAdmin} />
      <div className="px-4 py-4 pb-6 flex flex-col gap-4">

        {/* Dashboard landing */}
        {view === 'dashboard' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => navigate('/admin/courses')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Map size={20} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-text-dark">Courses</p>
                <p className="text-xs text-text-muted">Edit scorecards, hazards & holes</p>
                {courses && courses.length > 0 && (
                  <p className="text-[10px] text-text-faint">{courses.length} course{courses.length !== 1 ? 's' : ''}</p>
                )}
              </button>

              <button
                onClick={() => navigate('/admin/penalties')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Shield size={20} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-text-dark">Penalties</p>
                <p className="text-xs text-text-muted">Configure hazard penalty values</p>
              </button>

              <button
                onClick={() => navigate('/admin/import')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Upload size={20} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-text-dark">Import Course</p>
                <p className="text-xs text-text-muted">Import a new course from KML</p>
              </button>

              <button
                onClick={() => navigate('/admin/users')}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center hover:border-primary hover:shadow-sm transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Users size={20} className="text-primary" />
                </div>
                <p className="text-sm font-semibold text-text-dark">Users</p>
                <p className="text-xs text-text-muted">Manage user accounts & roles</p>
              </button>
            </div>

            <button
              onClick={logout}
              className="mt-4 flex items-center gap-2 self-start text-sm text-text-muted hover:text-text-dark transition-colors"
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        )}

        {/* Course selection grid */}
        {view === 'course-grid' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-dark transition-colors self-start -ml-1"
            >
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Admin</span>
            </button>

            {!courses?.length ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No courses imported yet.{' '}
                <button onClick={() => navigate('/admin/import')} className="text-primary underline">Import one</button>.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {courses.map((c) => (
                  <AdminCourseCard key={c.id} course={c} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Course editor */}
        {view === 'course-edit' && courseId && (
          <div className="flex flex-col gap-4">
            <CourseSummaryHeader courseId={courseId} />
            <ElevationRefresh courseId={courseId} />
            <HazardMapper
              courseId={courseId}
              selectedHole={selectedHole}
              onSelectHole={handleSelectHole}
            />
          </div>
        )}

        {/* Penalties */}
        {view === 'penalties' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-dark transition-colors self-start -ml-1"
            >
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Admin</span>
            </button>
            <PenaltyEditor />
          </div>
        )}

        {/* Import */}
        {view === 'import' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-dark transition-colors self-start -ml-1"
            >
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Admin</span>
            </button>
            <KmlImporter
              onComplete={() => {
                mutateCourses();
                navigate('/admin/courses');
              }}
            />
          </div>
        )}

        {/* Users */}
        {view === 'users' && (
          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/admin')}
              className="flex items-center gap-1 text-sm text-text-muted hover:text-text-dark transition-colors self-start -ml-1"
            >
              <ChevronLeft size={16} />
              <span className="text-xs font-medium">Admin</span>
            </button>
            <UserManager />
          </div>
        )}
      </div>
    </>
  );
}
