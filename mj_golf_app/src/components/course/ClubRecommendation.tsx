import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ClubRecommendation as Recommendation } from '../../models/course';
import { FreshnessBadge } from '../yardage/FreshnessBadge';
import type { DataFreshness } from '../../models/yardage';

const CONFIDENCE_CONFIG = {
  great: {
    icon: CheckCircle,
    label: 'Great',
    border: 'border-green-800',
    bg: 'bg-green-950/30',
    badge: 'bg-green-900 text-green-300',
  },
  ok: {
    icon: AlertCircle,
    label: 'OK',
    border: 'border-yellow-800',
    bg: 'bg-yellow-950/20',
    badge: 'bg-yellow-900 text-yellow-300',
  },
  stretch: {
    icon: AlertTriangle,
    label: 'Stretch',
    border: 'border-red-800',
    bg: 'bg-red-950/20',
    badge: 'bg-red-900 text-red-300',
  },
};

export function ClubRecommendationCard({ rec }: { rec: Recommendation }) {
  const config = CONFIDENCE_CONFIG[rec.confidence];
  const Icon = config.icon;

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">{rec.clubName}</span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
              <Icon size={10} className="mr-1 inline" />
              {config.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
            <span>Carry: <strong className="text-white">{rec.bookCarry}</strong> yds</span>
            <span>Disp: {rec.dispersion} yds</span>
            <FreshnessBadge freshness={rec.freshness as DataFreshness} />
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${rec.delta > 0 ? 'text-blue-400' : rec.delta < 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {rec.delta > 0 ? '+' : ''}{rec.delta}
          </div>
          <div className="text-[10px] text-gray-500">
            {rec.delta > 0 ? 'over' : rec.delta < 0 ? 'short' : 'exact'}
          </div>
        </div>
      </div>
    </div>
  );
}
