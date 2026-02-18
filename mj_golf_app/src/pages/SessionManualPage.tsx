import { TopBar } from '../components/layout/TopBar';

export function SessionManualPage() {
  return (
    <>
      <TopBar title="Manual Entry" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Manual entry coming in Phase 3.
        </div>
      </div>
    </>
  );
}
