import { Link, useNavigate } from 'react-router';
import { Plus, BookOpen, AlertTriangle } from 'lucide-react';
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
          <p className="text-sm text-text-medium">Track your game, improve your scores.</p>
        </div>

        {/* Quick Actions */}
        <div className="mb-6 grid grid-cols-2 gap-2">
          <Link
            to="/session/new"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-primary p-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-light"
          >
            <Plus size={20} />
            <span>Session</span>
          </Link>
          <Link
            to="/yardage"
            className="flex flex-col items-center gap-1.5 rounded-xl bg-card border border-border shadow-sm p-3 text-center text-sm font-medium transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
          >
            <BookOpen size={20} />
            <span>Yardage</span>
          </Link>
        </div>

        {/* Stale Clubs Warning */}
        {staleClubs.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
              <AlertTriangle size={16} />
              {staleClubs.length} club{staleClubs.length !== 1 ? 's' : ''} need fresh data
            </div>
            <p className="mt-1 text-xs text-amber-600">
              {staleClubs.map((c) => c.clubName).join(', ')}
            </p>
          </div>
        )}

        {/* Quick Stats */}
        {yardageBook && yardageBook.length > 0 && (
          <div className="mb-6 grid grid-cols-3 gap-2">
            <div className="rounded-2xl border border-border bg-card shadow-sm p-3 text-center">
              <div className="text-xl font-bold text-text-dark">{clubs?.length ?? 0}</div>
              <div className="text-[10px] text-text-muted uppercase">Clubs</div>
            </div>
            <div className="rounded-2xl border border-border bg-card shadow-sm p-3 text-center">
              <div className="text-xl font-bold text-text-dark">{yardageBook.length}</div>
              <div className="text-[10px] text-text-muted uppercase">With Data</div>
            </div>
            <div className="rounded-2xl border border-border bg-card shadow-sm p-3 text-center">
              <div className="text-xl font-bold text-text-dark">{totalSessions}</div>
              <div className="text-[10px] text-text-muted uppercase">Sessions</div>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-text-medium uppercase">Recent Sessions</h3>
            {recentSessions && recentSessions.length > 0 && (
              <Link to="/sessions" className="text-xs font-medium text-primary">
                View All
              </Link>
            )}
          </div>
          {!recentSessions || recentSessions.length === 0 ? (
            <div className="rounded-2xl border border-border p-8 text-center text-sm text-text-muted">
              No sessions yet. Tap "Session" to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-3 text-left transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
                >
                  <div>
                    <div className="text-sm font-medium text-text-dark">
                      {session.type === 'wedge-distance' ? 'Wedge Practice' : clubMap.get(session.clubId ?? '') || 'Unknown Club'}
                    </div>
                    <div className="text-xs text-text-muted">
                      {new Date(session.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                      {session.location && ` · ${session.location}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-medium">{session.shotCount} shots</div>
                    <div className="text-[10px] text-text-faint capitalize">{session.source}</div>
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
