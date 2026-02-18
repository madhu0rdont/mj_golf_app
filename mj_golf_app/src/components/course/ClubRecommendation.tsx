import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react';
import type { ClubRecommendation as Recommendation } from '../../models/course';
import { FreshnessBadge } from '../yardage/FreshnessBadge';
import type { DataFreshness } from '../../models/yardage';

const CONFIDENCE_CONFIG = {
  great: {
    icon: CheckCircle,
    label: 'Great',
    border: 'border-green-200',
    bg: 'bg-green-50',
    badge: 'bg-primary-pale text-primary',
  },
  ok: {
    icon: AlertCircle,
    label: 'OK',
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    badge: 'bg-gold-light text-gold-dark',
  },
  stretch: {
    icon: AlertTriangle,
    label: 'Stretch',
    border: 'border-red-200',
    bg: 'bg-red-50',
    badge: 'bg-coral-light text-coral',
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
            <span className="text-lg font-bold text-text-dark">{rec.clubName}</span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${config.badge}`}>
              <Icon size={10} className="mr-1 inline" />
              {config.label}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-text-medium">
            <span>Carry: <strong className="text-text-dark">{rec.bookCarry}</strong> yds</span>
            <span>Disp: {rec.dispersion} yds</span>
            <FreshnessBadge freshness={rec.freshness as DataFreshness} />
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${rec.delta > 0 ? 'text-soft-blue' : rec.delta < 0 ? 'text-gold' : 'text-primary'}`}>
            {rec.delta > 0 ? '+' : ''}{rec.delta}
          </div>
          <div className="text-[10px] text-text-muted">
            {rec.delta > 0 ? 'over' : rec.delta < 0 ? 'short' : 'exact'}
          </div>
        </div>
      </div>
    </div>
  );
}
