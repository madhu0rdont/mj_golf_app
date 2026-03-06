import { Link, useNavigate } from 'react-router';
import { Plus, ClipboardList, AlertTriangle } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { useRecentSessions } from '../hooks/useSessions';
import { useAllClubs } from '../hooks/useClubs';
import { useYardageBook } from '../hooks/useYardageBook';

export function PracticePage() {
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
      <TopBar title="Practice" showBack />
      <div className="px-4 py-6">
        {/* Practice Actions */}
        <div className="mb-6">
          <h3 className="mb-2 font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Practice</h3>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/session/new"
              className="shimmer-hover flex flex-col items-center gap-1.5 rounded-sm bg-forest p-3 text-center text-sm font-medium text-white transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-card-hover)]"
            >
              <Plus size={20} />
              <span>Start Practice</span>
            </Link>
            <Link
              to="/sessions"
              className="shimmer-hover flex flex-col items-center gap-1.5 rounded-sm bg-parchment border border-sand p-3 text-center text-sm font-medium text-forest transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-1"
            >
              <ClipboardList size={20} />
              <span>Sessions</span>
            </Link>
          </div>
        </div>

        {/* Stale Clubs Warning */}
        {staleClubs.length > 0 && (
          <div className="mb-6 rounded-sm border border-amber-300 bg-amber-50 p-3">
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
            <div className="rounded-sm bg-card backdrop-blur-[8px] border border-card-border shadow-[var(--shadow-card)] p-3 text-center">
              <div className="font-display text-xl font-light text-gold">{clubs?.length ?? 0}</div>
              <div className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Clubs</div>
            </div>
            <div className="rounded-sm bg-card backdrop-blur-[8px] border border-card-border shadow-[var(--shadow-card)] p-3 text-center">
              <div className="font-display text-xl font-light text-gold">{yardageBook.length}</div>
              <div className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">With Data</div>
            </div>
            <div className="rounded-sm bg-card backdrop-blur-[8px] border border-card-border shadow-[var(--shadow-card)] p-3 text-center">
              <div className="font-display text-xl font-light text-gold">{totalSessions}</div>
              <div className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Sessions</div>
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-mono text-[0.6rem] tracking-[0.2em] uppercase text-sand">Recent Sessions</h3>
            {recentSessions && recentSessions.length > 0 && (
              <Link to="/sessions" className="text-xs font-medium text-primary">
                View All
              </Link>
            )}
          </div>
          {!recentSessions || recentSessions.length === 0 ? (
            <div className="rounded-sm border border-border p-8 text-center text-sm text-text-muted">
              No sessions yet. Tap "Start Practice" to get started.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/session/${session.id}`)}
                  className="flex items-center justify-between bg-card backdrop-blur-[8px] border border-card-border rounded-sm p-3 text-left transition-colors hover:border-sage"
                >
                  <div>
                    <div className="text-sm font-medium text-text-dark">
                      {session.type === 'wedge-distance' ? 'Wedge Practice' : session.type === 'interleaved' ? 'Interleaved Practice' : clubMap.get(session.clubId ?? '') || 'Unknown Club'}
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
                    <div className="text-[10px] text-text-faint uppercase">{session.source}</div>
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
