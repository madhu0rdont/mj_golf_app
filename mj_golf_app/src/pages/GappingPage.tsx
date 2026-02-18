import { TopBar } from '../components/layout/TopBar';

export function GappingPage() {
  return (
    <>
      <TopBar title="Gapping" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Gapping chart coming in Phase 6.
        </div>
      </div>
    </>
  );
}
