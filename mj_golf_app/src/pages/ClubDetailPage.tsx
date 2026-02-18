import { useParams, useNavigate } from 'react-router';
import { TopBar } from '../components/layout/TopBar';
import { FreshnessBadge } from '../components/yardage/FreshnessBadge';
import { CarryOverTimeChart } from '../components/charts/CarryOverTimeChart';
import { StatCard } from '../components/charts/StatCard';
import { useClub } from '../hooks/useClubs';
import { useClubHistory, useYardageBook } from '../hooks/useYardageBook';

export function ClubDetailPage() {
  const { clubId } = useParams();
  const navigate = useNavigate();
  const club = useClub(clubId);
  const history = useClubHistory(clubId);
  const yardageBook = useYardageBook();

  if (!club || !history || !yardageBook) {
    return (
      <>
        <TopBar title="Club Detail" showBack />
        <div className="px-4 py-8 text-center text-sm text-text-muted">Loading...</div>
      </>
    );
  }

  const entry = yardageBook.find((e) => e.clubId === clubId);

  return (
    <>
      <TopBar title={club.name} showBack />
      <div className="px-4 py-4">
        {/* Header */}
        <div className="mb-4 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold">{club.name}</h2>
              <p className="text-xs text-text-muted">
                {[club.brand, club.model, club.loft && `${club.loft}°`, club.shaft]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {entry && <FreshnessBadge freshness={entry.freshness} />}
          </div>
          {entry ? (
            <div className="grid grid-cols-3 gap-3 mt-3">
              <div>
                <div className="text-2xl font-bold text-primary">{entry.bookCarry}</div>
                <div className="text-[10px] text-text-muted uppercase">Book Carry</div>
              </div>
              {entry.bookTotal && (
                <div>
                  <div className="text-2xl font-bold text-text-dark">{entry.bookTotal}</div>
                  <div className="text-[10px] text-text-muted uppercase">Book Total</div>
                </div>
              )}
              <div>
                <div className="text-2xl font-bold text-text-medium">{entry.dispersion}</div>
                <div className="text-[10px] text-text-muted uppercase">Dispersion</div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-muted">No practice data yet</p>
          )}
        </div>

        {/* Stats Grid */}
        {entry && (
          <div className="mb-6 grid grid-cols-2 gap-2">
            {entry.avgSpinRate && (
              <StatCard label="Avg Spin" value={entry.avgSpinRate} unit="rpm" />
            )}
            {entry.avgLaunchAngle && (
              <StatCard label="Avg Launch" value={entry.avgLaunchAngle} unit="°" />
            )}
            <StatCard label="Sessions" value={entry.sessionCount} />
            <StatCard label="Total Shots" value={entry.shotCount} />
          </div>
        )}

        {/* Carry Over Time Chart */}
        {history.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-medium text-text-medium uppercase">Carry Over Time</h3>
            <div className="rounded-2xl border border-border bg-card shadow-sm p-3">
              <CarryOverTimeChart data={history} />
            </div>
          </div>
        )}

        {/* Session History */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-text-medium uppercase">Session History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-text-muted">No sessions yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <button
                  key={h.sessionId}
                  onClick={() => navigate(`/session/${h.sessionId}`)}
                  className="flex items-center justify-between rounded-2xl border border-border bg-card shadow-sm p-3 text-left transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:-translate-y-px"
                >
                  <div>
                    <div className="text-sm font-medium text-text-dark">
                      {new Date(h.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-xs text-text-muted">{h.shotCount} shots</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-text-dark">{h.avgCarry} yds</div>
                    <div className="text-xs text-text-muted">disp: {h.dispersion}</div>
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
