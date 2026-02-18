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
      className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] p-3 text-left transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-card-hover)]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FreshnessBadge freshness={entry.freshness} />
          <span className="font-medium text-text-dark">{entry.clubName}</span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-text-muted">
          {entry.dominantShape && <span className="capitalize">{entry.dominantShape}</span>}
          <span>{entry.sessionCount} session{entry.sessionCount !== 1 ? 's' : ''}</span>
          <span>{lastPracticed}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-lg font-bold text-text-dark">{entry.bookCarry}</div>
          <div className="text-[10px] text-text-muted">carry</div>
        </div>
        {entry.bookTotal && (
          <div className="text-right">
            <div className="text-sm font-semibold text-text-medium">{entry.bookTotal}</div>
            <div className="text-[10px] text-text-muted">total</div>
          </div>
        )}
        <div className="text-right">
          <div className="text-sm text-text-medium">{entry.dispersion}</div>
          <div className="text-[10px] text-text-muted">disp</div>
        </div>
        <ChevronRight size={16} className="text-text-faint" />
      </div>
    </button>
  );
}
