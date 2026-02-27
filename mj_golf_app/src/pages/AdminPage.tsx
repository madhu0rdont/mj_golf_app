import { useState } from 'react';
import { Upload, MapPin, Pencil, RefreshCw } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Button } from '../components/ui/Button';
import { LoadingPage } from '../components/ui/LoadingPage';
import { KmlImporter } from '../components/admin/KmlImporter';
import { useCourses, mutateCourses } from '../hooks/useCourses';

export function AdminPage() {
  const { courses, isLoading } = useCourses();
  const [showImporter, setShowImporter] = useState(false);

  if (isLoading) return <LoadingPage title="Admin" showBack />;

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
          {!courses || courses.length === 0 ? (
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

        {/* Future Tools */}
        <section>
          <h2 className="text-sm font-semibold text-text-medium mb-2">
            Tools
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: MapPin, label: 'Hazard Mapper' },
              { icon: Pencil, label: 'Course Editor' },
              { icon: RefreshCw, label: 'Elevation Refresh' },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-border-light bg-surface p-4 text-center opacity-50"
              >
                <Icon size={20} className="text-text-muted" />
                <span className="text-xs text-text-muted">{label}</span>
                <span className="text-[10px] text-text-muted">Coming Soon</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
