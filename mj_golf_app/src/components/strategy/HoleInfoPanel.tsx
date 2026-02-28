import type { CourseHole } from '../../models/course';

const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  fairway_bunker: '#DAA520',
  greenside_bunker: '#FFA500',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
  rough: '#8B7355',
};

const HAZARD_LABELS: Record<string, string> = {
  bunker: 'Bunker',
  fairway_bunker: 'FW Bunker',
  greenside_bunker: 'GS Bunker',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
  rough: 'Rough',
};

/** Plural label for hazard type counts */
const HAZARD_PLURALS: Record<string, string> = {
  bunker: 'Bunkers',
  fairway_bunker: 'FW Bunkers',
  greenside_bunker: 'GS Bunkers',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
  rough: 'Rough',
};

interface HoleInfoPanelProps {
  hole: CourseHole;
  teeBox: string;
}

export function HoleInfoPanel({ hole, teeBox }: HoleInfoPanelProps) {
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  const playsLike = hole.playsLikeYards?.[teeBox] ?? null;
  const elevDeltaFeet = Math.round((hole.pin.elevation - hole.tee.elevation) * 3.281);
  const isUphill = elevDeltaFeet > 0;

  // Summarize hazards by type
  const hazardCounts = new Map<string, number>();
  for (const h of hole.hazards) {
    hazardCounts.set(h.type, (hazardCounts.get(h.type) ?? 0) + 1);
  }

  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 flex flex-col gap-1">
      {/* Row 1: Hole info + yardage */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-bold text-text-dark">
            Hole {hole.holeNumber}
          </span>
          <span className="text-xs font-medium text-text-medium">
            Par {hole.par}
          </span>
          {elevDeltaFeet !== 0 && (
            <span className={`text-xs font-medium ${isUphill ? 'text-coral' : 'text-primary'}`}>
              {isUphill ? '+' : ''}{elevDeltaFeet}ft {isUphill ? '↑' : '↓'}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold text-text-dark">{yardage}</span>
          <span className="text-[10px] text-text-muted">yds</span>
          {playsLike && playsLike !== yardage && (
            <span className={`text-xs font-medium ${isUphill ? 'text-coral' : 'text-primary'}`}>
              plays {playsLike}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Hazard summary + notes */}
      {(hazardCounts.size > 0 || hole.notes) && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {[...hazardCounts.entries()].map(([type, count]) => (
            <span
              key={type}
              className="inline-flex items-center gap-1 rounded-full bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-dark"
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: HAZARD_COLORS[type] ?? '#888' }}
              />
              {count > 1
                ? `${count} ${HAZARD_PLURALS[type] ?? type}`
                : HAZARD_LABELS[type] ?? type}
            </span>
          ))}
          {hole.notes && (
            <span className="text-[10px] text-text-muted italic truncate">
              {hole.notes}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
