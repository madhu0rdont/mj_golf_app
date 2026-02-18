import { TopBar } from '../components/layout/TopBar';

export function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Settings coming in Phase 9.
        </div>
      </div>
    </>
  );
}
