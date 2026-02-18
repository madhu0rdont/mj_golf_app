import { Link, useNavigate } from 'react-router';
import { Plus, BookOpen, Target, AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { useRecentSessions } from '../hooks/useSessions';
import { useAllClubs } from '../hooks/useClubs';
import { useYardageBook } from '../hooks/useYardageBook';

export function HomePage() {
  const navigate = useNavigate();
  const recentSessions = useRecentSessions(5);
  const clubs = useAllClubs();
  const yardageBook = useYardageBook();

  const totalSessions = recentSessions?.length ?? 0;
  const staleClubs = yardageBook?.filter((e) => e.freshness === 'stale') ?? [];

  // Build a club name map for session display
  const clubMap = new Map(clubs?.map((c) => [c.id, c.name]) ?? []);

  return (
    <>
      <TopBar title="MJ Golf" showSettings />
      <div className="px-4 py-6">
        <div className="mb-6">
          <h2 className="mb-1 text-2xl font-bold">Welcome back</h2>
          <p className="text-sm text-gray-400">Track your game, improve your scores.</p>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 grid grid-cols-3 gap-2">
          <Link
            to="/session/new"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-green-700 p-3 text-center text-sm font-medium transition-colors hover:bg-green-600"
          >
            <Plus size={20} />
            <span>Session</span>
          </Link>
          <Link
            to="/yardage"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-800 p-3 text-center text-sm font-medium transition-colors hover:bg-gray-700"
          >
            <BookOpen size={20} />
            <span>Yardage</span>
          </Link>
          <Link
            to="/course"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-gray-800 p-3 text-center text-sm font-medium transition-colors hover:bg-gray-700"
          >
            <Target size={20} />
            <span>Course</span>
          </Link>
        </div>

        {/* Stale Clubs Warning */}
        {staleClubs.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-800 bg-amber-950/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
              <AlertTriangle size={16} />
              {staleClubs.length} club{staleClubs.length !== 1 ? 's' : ''} need fresh data
            </div>
            <p className="mt-1 text-xs text-amber-400/70">
              {staleClubs.map((c) => c.clubName).join(', ')}
            </p>
          </div>
        )}

        {/* Quick Stats */}
        {yardageBook && yardageBook.length > 0 && (
          <div className="mb-6 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <div className="text-xl font-bold text-white">{clubs?.length ?? 0}</div>
              <div className="text-[10px] text-gray-500 uppercase">Clubs</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <div className="text-xl font-bold text-white">{yardageBook.length}</div>
              <div className="text-[10px] text-gray-500 uppercase">With Data</div>
            </div>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
              <div className="text-xl font-bold text-white">{totalSessions}</div>
              <div className="text-[10px] text-gray-500 uppercase">Sessions</div>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div>
          <h3 className="mb-3 text-sm font-medium text-gray-400 uppercase">Recent Sessions</h3>
          {!recentSessions || recentSessions.length === 0 ? (
            <div className="rounded-xl border border-gray-800 p-8 text-center text-sm text-gray-500">
              No sessions yet. Tap "Session" to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-3 text-left transition-colors hover:border-gray-700"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {clubMap.get(session.clubId) || 'Unknown Club'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(session.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {session.location && ` · ${session.location}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-300">{session.shotCount} shots</div>
                    <div className="text-[10px] text-gray-600 capitalize">{session.source}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
