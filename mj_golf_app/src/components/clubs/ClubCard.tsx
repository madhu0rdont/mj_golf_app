import { useNavigate } from 'react-router';
import { GripVertical, ChevronRight } from 'lucide-react';
import type { Club } from '../../models/club';

interface ClubCardProps {
  club: Club;
  dragHandleProps?: Record<string, unknown>;
}

const CATEGORY_COLORS: Record<string, string> = {
  driver: 'bg-red-900/50 text-red-300',
  wood: 'bg-orange-900/50 text-orange-300',
  hybrid: 'bg-yellow-900/50 text-yellow-300',
  iron: 'bg-blue-900/50 text-blue-300',
  wedge: 'bg-purple-900/50 text-purple-300',
  putter: 'bg-gray-700/50 text-gray-300',
};

export function ClubCard({ club, dragHandleProps }: ClubCardProps) {
  const navigate = useNavigate();
  const carry = club.computedCarry ?? club.manualCarry;

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-3 py-3 transition-colors hover:border-gray-700"
      onClick={() => navigate(`/bag/${club.id}/edit`)}
    >
      {dragHandleProps && (
        <div {...dragHandleProps} className="cursor-grab touch-none text-gray-600 active:cursor-grabbing">
          <GripVertical size={18} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{club.name}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase ${CATEGORY_COLORS[club.category] || 'bg-gray-700 text-gray-400'}`}>
            {club.category}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          {club.brand && <span>{club.brand}</span>}
          {club.loft && <span>{club.loft}&deg;</span>}
          {club.shaft && <span>{club.shaft}</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {carry != null && (
          <div className="text-right">
            <div className="text-sm font-semibold text-white">{carry}</div>
            <div className="text-[10px] text-gray-500">yds</div>
          </div>
        )}
        <ChevronRight size={16} className="text-gray-600" />
      </div>
    </div>
  );
}
