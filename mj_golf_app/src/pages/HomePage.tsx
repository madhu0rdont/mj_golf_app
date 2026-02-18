import { Link } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { Plus, BookOpen } from 'lucide-react';

export function HomePage() {
  return (
    <>
      <TopBar title="MJ Golf" showSettings />
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="mb-1 text-2xl font-bold">Welcome back</h2>
          <p className="text-sm text-gray-400">Track your game, improve your scores.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/session/new"
            className="flex flex-col items-center gap-2 rounded-xl bg-green-700 p-4 text-center font-medium transition-colors hover:bg-green-600"
          >
            <Plus size={24} />
            <span>New Session</span>
          </Link>
          <Link
            to="/yardage"
            className="flex flex-col items-center gap-2 rounded-xl bg-gray-800 p-4 text-center font-medium transition-colors hover:bg-gray-700"
          >
            <BookOpen size={24} />
            <span>Yardage Book</span>
          </Link>
        </div>

        <div className="mt-8">
          <h3 className="mb-3 text-sm font-medium text-gray-400 uppercase">Recent Sessions</h3>
          <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
            No sessions yet. Tap "New Session" to get started.
          </div>
        </div>
      </div>
    </>
  );
}
