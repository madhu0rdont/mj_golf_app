import { TopBar } from '../components/layout/TopBar';

export function YardageBookPage() {
  return (
    <>
      <TopBar title="Yardage Book" showSettings />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Yardage book coming in Phase 6.
        </div>
      </div>
    </>
  );
}
