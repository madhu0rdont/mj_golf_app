import { TopBar } from '../components/layout/TopBar';

export function SessionSummaryPage() {
  return (
    <>
      <TopBar title="Session Summary" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Session summary coming in Phase 4.
        </div>
      </div>
    </>
  );
}
