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
        <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
      </>
    );
  }

  const entry = yardageBook.find((e) => e.clubId === clubId);

  return (
    <>
      <TopBar title={club.name} showBack />
      <div className="px-4 py-4">
        {/* Header */}
        <div className="mb-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-xl font-bold">{club.name}</h2>
              <p className="text-xs text-gray-500">
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
                <div className="text-2xl font-bold text-green-400">{entry.bookCarry}</div>
                <div className="text-[10px] text-gray-500 uppercase">Book Carry</div>
              </div>
              {entry.bookTotal && (
                <div>
                  <div className="text-2xl font-bold text-white">{entry.bookTotal}</div>
                  <div className="text-[10px] text-gray-500 uppercase">Book Total</div>
                </div>
              )}
              <div>
                <div className="text-2xl font-bold text-gray-300">{entry.dispersion}</div>
                <div className="text-[10px] text-gray-500 uppercase">Dispersion</div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-500">No practice data yet</p>
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
            <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">Carry Over Time</h3>
            <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <CarryOverTimeChart data={history} />
            </div>
          </div>
        )}

        {/* Session History */}
        <div className="mb-6">
          <h3 className="mb-2 text-sm font-medium text-gray-400 uppercase">Session History</h3>
          {history.length === 0 ? (
            <p className="text-sm text-gray-500">No sessions yet</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((h) => (
                <button
                  key={h.sessionId}
                  onClick={() => navigate(`/session/${h.sessionId}`)}
                  className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-3 text-left transition-colors hover:border-gray-700"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {new Date(h.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                    <div className="text-xs text-gray-500">{h.shotCount} shots</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{h.avgCarry} yds</div>
                    <div className="text-xs text-gray-500">disp: {h.dispersion}</div>
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
