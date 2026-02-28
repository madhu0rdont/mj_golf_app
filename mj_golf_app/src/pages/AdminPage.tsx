import { useState } from 'react';
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

export function AdminPage() {
  const { courses, isLoading } = useCourses();
  const [activeTab, setActiveTab] = useState<Tab>('courses');
  const [courseId, setCourseId] = useState('');

  if (isLoading) return <LoadingPage title="Admin" showBack />;

  // Auto-select first course if none selected
  if (!courseId && courses?.length) {
    setCourseId(courses[0].id);
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
              onClick={() => setActiveTab(tab.value)}
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
                  onChange={(e) => setCourseId(e.target.value)}
                  options={courses.map((c) => ({ value: c.id, label: c.name }))}
                />

                <ElevationRefresh courseId={courseId} />

                <HazardMapper courseId={courseId} />
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
              setActiveTab('courses');
            }}
          />
        )}
      </div>
    </>
  );
}
