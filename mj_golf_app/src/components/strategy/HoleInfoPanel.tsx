import type { CourseHole } from '../../models/course';

const HAZARD_COLORS: Record<string, string> = {
  bunker: '#FFD700',
  water: '#4169E1',
  ob: '#FF4444',
  trees: '#228B22',
};

const HAZARD_LABELS: Record<string, string> = {
  bunker: 'Bunker',
  water: 'Water',
  ob: 'OB',
  trees: 'Trees',
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

  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold text-text-dark">
          Hole {hole.holeNumber} — Par {hole.par}
        </h3>
        <div className="text-right">
          <span className="text-lg font-bold text-text-dark">{yardage}</span>
          <span className="text-xs text-text-muted ml-1">yds</span>
          {playsLike && playsLike !== yardage && (
            <span className={`ml-2 text-sm font-medium ${isUphill ? 'text-coral' : 'text-primary'}`}>
              plays {playsLike}
            </span>
          )}
        </div>
      </div>

      {/* Elevation */}
      {elevDeltaFeet !== 0 && (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-text-muted">Elevation:</span>
          <span className={`font-medium ${isUphill ? 'text-coral' : 'text-primary'}`}>
            {isUphill ? '+' : ''}{elevDeltaFeet} ft {isUphill ? '↑' : '↓'}
          </span>
        </div>
      )}

      {/* Hazards */}
      {hole.hazards.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-medium">Hazards</span>
          <div className="flex flex-wrap gap-1.5">
            {hole.hazards.map((h, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-text-dark"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: HAZARD_COLORS[h.type] ?? '#888' }}
                />
                {h.name} ({HAZARD_LABELS[h.type] ?? h.type})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {hole.notes && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-text-medium">Notes</span>
          <p className="text-sm text-text-dark">{hole.notes}</p>
        </div>
      )}
    </div>
  );
}
