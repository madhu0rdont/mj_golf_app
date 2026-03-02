import { useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { LoadingPage } from '../components/ui/LoadingPage';
import { Select } from '../components/ui/Select';
import { KmlImporter } from '../components/admin/KmlImporter';
import { HazardMapper } from '../components/admin/HazardMapper';
import { ElevationRefresh } from '../components/admin/ElevationRefresh';
import { PenaltyEditor } from '../components/admin/PenaltyEditor';
import { useCourses, mutateCourses } from '../hooks/useCourses';

type Tab = 'courses' | 'penalties' | 'import';

const TABS: { value: Tab; label: string }[] = [
  { value: 'courses', label: 'Edit Courses' },
  { value: 'penalties', label: 'Edit Penalties' },
  { value: 'import', label: 'Import Course' },
];

function deriveTab(pathname: string): Tab {
  if (pathname === '/admin/penalties') return 'penalties';
  if (pathname === '/admin/import') return 'import';
  return 'courses';
}

export function AdminPage() {
  const params = useParams<{ courseId?: string; holeNumber?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { courses, isLoading } = useCourses();

  const activeTab = deriveTab(location.pathname);
  const courseId = params.courseId ?? '';
  const selectedHole = params.holeNumber ? parseInt(params.holeNumber, 10) : null;

  // Auto-redirect to first course when on bare /admin
  useEffect(() => {
    if (activeTab === 'courses' && !courseId && courses?.length) {
      navigate(`/admin/${courses[0].id}`, { replace: true });
    }
  }, [activeTab, courseId, courses, navigate]);

  if (isLoading) return <LoadingPage title="Admin" showBack />;

  function handleTabClick(tab: Tab) {
    if (tab === 'penalties') navigate('/admin/penalties');
    else if (tab === 'import') navigate('/admin/import');
    else if (courseId) navigate(`/admin/${courseId}`);
    else navigate('/admin');
  }

  function handleCourseChange(newCourseId: string) {
    navigate(`/admin/${newCourseId}`);
  }

  function handleSelectHole(hole: number | null) {
    if (hole != null) {
      navigate(`/admin/${courseId}/${hole}`);
    } else {
      navigate(`/admin/${courseId}`);
    }
  }

  return (
    <>
      <TopBar title="Admin" showBack />
      <div className="px-4 py-4 pb-24 flex flex-col gap-4">
        {/* Tab toggle */}
        <div className="flex rounded-xl bg-surface p-1 gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabClick(tab.value)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-card text-text-dark shadow-sm'
                  : 'text-text-muted hover:text-text-medium'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Edit Courses */}
        {activeTab === 'courses' && (
          <div className="flex flex-col gap-4">
            {!courses?.length ? (
              <p className="text-sm text-text-muted py-4 text-center">
                No courses imported yet. Use the Import tab to add one.
              </p>
            ) : (
              <>
                <Select
                  label="Course"
                  value={courseId}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  options={courses.map((c) => ({ value: c.id, label: c.name }))}
                />

                {courseId && <ElevationRefresh courseId={courseId} />}

                {courseId && (
                  <HazardMapper
                    courseId={courseId}
                    selectedHole={selectedHole}
                    onSelectHole={handleSelectHole}
                  />
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Edit Penalties */}
        {activeTab === 'penalties' && <PenaltyEditor />}

        {/* Tab: Import Course */}
        {activeTab === 'import' && (
          <KmlImporter
            onComplete={() => {
              mutateCourses();
              navigate('/admin');
            }}
          />
        )}
      </div>
    </>
  );
}
