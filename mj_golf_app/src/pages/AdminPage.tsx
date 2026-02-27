import { useState } from 'react';
import { Upload } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { LoadingPage } from '../components/ui/LoadingPage';
import { KmlImporter } from '../components/admin/KmlImporter';
import { HazardMapper } from '../components/admin/HazardMapper';
import { CourseEditor } from '../components/admin/CourseEditor';
import { ElevationRefresh } from '../components/admin/ElevationRefresh';
import { useCourses, mutateCourses } from '../hooks/useCourses';

export function AdminPage() {
  const { courses, isLoading } = useCourses();
  const [showImporter, setShowImporter] = useState(false);

  if (isLoading) return <LoadingPage title="Admin" showBack />;

  const hasCourses = courses && courses.length > 0;

  return (
    <>
      <TopBar title="Admin" showBack />
      <div className="px-4 py-4 pb-24 flex flex-col gap-6">
        {/* KML Importer */}
        <section>
          {showImporter ? (
            <KmlImporter
              onComplete={() => {
                setShowImporter(false);
                mutateCourses();
              }}
            />
          ) : (
            <Button
              onClick={() => setShowImporter(true)}
              className="w-full"
            >
              <Upload size={18} />
              Import New Course
            </Button>
          )}
        </section>

        {/* Imported Courses */}
        <section>
          <h2 className="text-sm font-semibold text-text-medium mb-2">
            Imported Courses
          </h2>
          {!hasCourses ? (
            <p className="text-sm text-text-muted py-4 text-center">
              No courses imported yet
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {courses.map((course) => (
                <div
                  key={course.id}
                  className="rounded-2xl border border-border bg-card shadow-sm p-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-dark text-sm">
                        {course.name}
                      </p>
                      <p className="text-xs text-text-muted">
                        {course.par ? `Par ${course.par}` : ''}
                        {course.slope ? ` · Slope ${course.slope}` : ''}
                        {course.rating ? ` · Rating ${course.rating}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-primary-pale px-2 py-0.5 text-[10px] font-medium text-primary">
                      Imported
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Hazard Mapper */}
        <section>
          {hasCourses ? (
            <HazardMapper />
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border-light bg-surface p-4 text-center opacity-50">
              <span className="text-xs text-text-muted">Hazard Mapper</span>
              <span className="text-[10px] text-text-muted">
                Import a course first
              </span>
            </div>
          )}
        </section>

        {/* Course Editor */}
        <section>
          <CourseEditor />
        </section>

        {/* Elevation Refresh */}
        <section>
          <ElevationRefresh />
        </section>
      </div>
    </>
  );
}
