import { TopBar } from '../components/layout/TopBar';

export function ClubBagPage() {
  return (
    <>
      <TopBar title="My Bag" showSettings />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Club bag management coming in Phase 2.
        </div>
      </div>
    </>
  );
}
