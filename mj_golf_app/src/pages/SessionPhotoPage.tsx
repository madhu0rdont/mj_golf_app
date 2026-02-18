import { TopBar } from '../components/layout/TopBar';

export function SessionPhotoPage() {
  return (
    <>
      <TopBar title="Photo Capture" showBack />
      <div className="px-4 py-6">
        <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
          Photo extraction coming in Phase 5.
        </div>
      </div>
    </>
  );
}
