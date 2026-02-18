import { TopBar } from '../components/layout/TopBar';

export function CourseModePage() {
  return (
    <>
      <TopBar title="Course Mode" showSettings />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Course management coming in Phase 8.
        </div>
      </div>
    </>
  );
}
