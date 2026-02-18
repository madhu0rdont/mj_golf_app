import { TopBar } from '../components/layout/TopBar';

export function SessionNewPage() {
  return (
    <>
      <TopBar title="New Session" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Session creation coming in Phase 3.
        </div>
      </div>
    </>
  );
}
