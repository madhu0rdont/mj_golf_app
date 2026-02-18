import { useNavigate } from 'react-router';
import { GripVertical, ChevronRight } from 'lucide-react';
import type { Club } from '../../models/club';

interface ClubCardProps {
  club: Club;
  dragHandleProps?: Record<string, unknown>;
}

const CATEGORY_COLORS: Record<string, string> = {
  driver: 'bg-red-100 text-red-700',
  wood: 'bg-orange-100 text-orange-700',
  hybrid: 'bg-amber-100 text-amber-700',
  iron: 'bg-blue-100 text-blue-700',
  wedge: 'bg-purple-100 text-purple-700',
  putter: 'bg-gray-100 text-text-medium',
};

export function ClubCard({ club, dragHandleProps }: ClubCardProps) {
  const navigate = useNavigate();
  const carry = club.computedCarry ?? club.manualCarry;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] px-3 py-3 transition-all duration-200 hover:-translate-y-px hover:shadow-[var(--shadow-card-hover)]"
      onClick={() => navigate(`/bag/${club.id}/edit`)}
    >
      {dragHandleProps && (
        <div {...dragHandleProps} className="cursor-grab touch-none text-text-faint active:cursor-grabbing">
          <GripVertical size={18} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-dark">{club.name}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase ${CATEGORY_COLORS[club.category] || 'bg-gray-100 text-text-medium'}`}>
            {club.category}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
          {club.brand && <span>{club.brand}</span>}
          {club.loft && <span>{club.loft}&deg;</span>}
          {club.shaft && <span>{club.shaft}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {carry != null && (
          <div className="text-right">
            <div className="text-sm font-semibold text-text-dark">{carry}</div>
            <div className="text-[10px] text-text-muted">yds</div>
          </div>
        )}
        <ChevronRight size={16} className="text-text-faint" />
      </div>
    </div>
  );
}
