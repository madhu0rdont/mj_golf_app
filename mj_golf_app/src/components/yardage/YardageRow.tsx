import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { FreshnessBadge } from './FreshnessBadge';
import type { YardageBookEntry } from '../../models/yardage';

export function YardageRow({ entry }: { entry: YardageBookEntry }) {
  const navigate = useNavigate();

  const daysAgo = Math.floor((Date.now() - entry.lastSessionDate) / (1000 * 60 * 60 * 24));
  const lastPracticed =
    daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;

  return (
    <button
      onClick={() => navigate(`/yardage/${entry.clubId}`)}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 p-3 text-left transition-colors hover:border-gray-700"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FreshnessBadge freshness={entry.freshness} />
          <span className="font-medium text-white">{entry.clubName}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          {entry.dominantShape && <span className="capitalize">{entry.dominantShape}</span>}
          <span>{entry.sessionCount} session{entry.sessionCount !== 1 ? 's' : ''}</span>
          <span>{lastPracticed}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-lg font-bold text-white">{entry.bookCarry}</div>
          <div className="text-[10px] text-gray-500">carry</div>
        </div>
        {entry.bookTotal && (
          <div className="text-right">
            <div className="text-sm font-semibold text-gray-300">{entry.bookTotal}</div>
            <div className="text-[10px] text-gray-500">total</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-sm text-gray-400">{entry.dispersion}</div>
          <div className="text-[10px] text-gray-500">disp</div>
        </div>
        <ChevronRight size={16} className="text-gray-600" />
      </div>
    </button>
  );
}
