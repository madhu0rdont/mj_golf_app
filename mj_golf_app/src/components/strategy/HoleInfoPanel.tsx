import { useMemo } from 'react';
import type { CourseHole, HazardFeature } from '../../models/course';
import { haversineYards, bearingBetween } from '../../utils/geo';

interface HoleInfoPanelProps {
  hole: CourseHole;
  teeBox: string;
  allHoles: CourseHole[];
}

// ---------------------------------------------------------------------------
// Difficulty from handicap
// ---------------------------------------------------------------------------

function getDifficulty(handicap: number | null): string | null {
  if (handicap == null) return null;
  if (handicap <= 3) return 'demanding';
  if (handicap <= 6) return 'challenging';
  if (handicap <= 10) return 'moderate';
  if (handicap <= 14) return 'forgiving';
  return 'straightforward';
}

// ---------------------------------------------------------------------------
// Relative length within par group
// ---------------------------------------------------------------------------

function getRelativeLength(
  hole: CourseHole,
  allHoles: CourseHole[],
  teeBox: string,
): string | null {
  const sameParHoles = allHoles.filter((h) => h.par === hole.par);
  if (sameParHoles.length < 2) return null;

  const getYds = (h: CourseHole) => h.yardages[teeBox] ?? Object.values(h.yardages)[0] ?? 0;
  const sorted = [...sameParHoles].sort((a, b) => getYds(a) - getYds(b));

  if (sorted[sorted.length - 1].holeNumber === hole.holeNumber) {
    return `the longest par ${hole.par} on the course`;
  }
  if (sorted[0].holeNumber === hole.holeNumber) {
    return `the shortest par ${hole.par} on the course`;
  }

  // Top/bottom quartile
  const rank = sorted.findIndex((h) => h.holeNumber === hole.holeNumber);
  const pct = rank / (sorted.length - 1);
  if (pct >= 0.75) return 'long';
  if (pct <= 0.25) return 'short';
  return null;
}

// ---------------------------------------------------------------------------
// Dogleg detection from center line
// ---------------------------------------------------------------------------

function detectDogleg(centerLine: { lat: number; lng: number }[]): string | null {
  if (centerLine.length < 3) return null;
  const start = centerLine[0];
  const mid = centerLine[Math.floor(centerLine.length / 2)];
  const end = centerLine[centerLine.length - 1];

  const b1 = bearingBetween(start, mid);
  const b2 = bearingBetween(mid, end);

  let diff = b2 - b1;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  if (Math.abs(diff) < 8) return null;
  if (diff > 20) return 'dogleg right';
  if (diff < -20) return 'dogleg left';
  if (diff > 0) return 'slight dogleg right';
  return 'slight dogleg left';
}

// ---------------------------------------------------------------------------
// Elevation prose
// ---------------------------------------------------------------------------

function getElevationProse(
  yardage: number,
  playsLike: number | null,
  elevDeltaFeet: number,
): string | null {
  if (!playsLike || Math.abs(playsLike - yardage) < 10) return null;
  const diff = Math.abs(playsLike - yardage);

  if (elevDeltaFeet < -8) {
    // Downhill
    if (diff >= 20) {
      return `the green sits well below the tee, playing just ${playsLike} yards`;
    }
    return `plays shorter at ${playsLike} yards downhill`;
  }
  if (elevDeltaFeet > 8) {
    // Uphill
    if (diff >= 20) {
      return `a steep uphill climb, playing ${playsLike} yards`;
    }
    return `plays longer at ${playsLike} yards uphill`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Hazard position analysis
// ---------------------------------------------------------------------------

type Side = 'left' | 'right' | 'center';
type Depth = 'short' | 'mid' | 'long';

function analyzePosition(
  hazard: HazardFeature,
  tee: { lat: number; lng: number },
  heading: number,
  totalYards: number,
): { side: Side; depth: Depth } {
  if (hazard.polygon.length === 0) return { side: 'center', depth: 'mid' };
  const centroid = {
    lat: hazard.polygon.reduce((s, p) => s + p.lat, 0) / hazard.polygon.length,
    lng: hazard.polygon.reduce((s, p) => s + p.lng, 0) / hazard.polygon.length,
  };

  const bearingToHazard = bearingBetween(tee, centroid);
  let angleDiff = bearingToHazard - heading;
  if (angleDiff > 180) angleDiff -= 360;
  if (angleDiff < -180) angleDiff += 360;
  const side: Side = angleDiff > 5 ? 'right' : angleDiff < -5 ? 'left' : 'center';

  const dist = haversineYards(tee, centroid);
  const ratio = totalYards > 0 ? dist / totalYards : 0.5;
  const depth: Depth = ratio < 0.4 ? 'short' : ratio > 0.7 ? 'long' : 'mid';

  return { side, depth };
}

function describeSideGroup(
  positions: { side: Side; depth: Depth }[],
  includeDepth: boolean,
): string {
  const left = positions.filter((p) => p.side === 'left');
  const right = positions.filter((p) => p.side === 'right');

  if (left.length > 0 && right.length > 0) {
    if (!includeDepth) return 'both sides';
    const ld = dominantDepth(left);
    const rd = dominantDepth(right);
    if (ld === 'mid' && rd === 'mid') return 'both sides';
    return `${fmtDepth(ld)}left and ${fmtDepth(rd)}right`;
  }

  const group = left.length > 0 ? left : right.length > 0 ? right : positions;
  const sideName = left.length > 0 ? 'left' : right.length > 0 ? 'right' : '';
  if (!includeDepth || !sideName) return sideName || 'the hole';
  const depth = dominantDepth(group);
  return `${fmtDepth(depth)}${sideName}`;
}

function dominantDepth(positions: { depth: Depth }[]): Depth {
  const counts = { short: 0, mid: 0, long: 0 };
  for (const p of positions) counts[p.depth]++;
  if (counts.short >= counts.mid && counts.short >= counts.long) return 'short';
  if (counts.long >= counts.mid) return 'long';
  return 'mid';
}

function fmtDepth(depth: Depth): string {
  return depth === 'mid' ? '' : depth + ' ';
}

// ---------------------------------------------------------------------------
// Prose generation
// ---------------------------------------------------------------------------

function generateDescription(
  hole: CourseHole,
  teeBox: string,
  allHoles: CourseHole[],
): string {
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  const playsLike = hole.playsLikeYards?.[teeBox] ?? null;
  const elevDeltaFeet = Math.round((hole.pin.elevation - hole.tee.elevation) * 3.281);
  const heading = bearingBetween(hole.tee, hole.pin);

  const sentences: string[] = [];

  // --- Opening sentence ---
  const difficulty = getDifficulty(hole.handicap);
  const relativeLen = getRelativeLength(hole, allHoles, teeBox);
  const dogleg = hole.par >= 4 ? detectDogleg(hole.centerLine) : null;
  const elevProse = getElevationProse(yardage, playsLike, elevDeltaFeet);

  // Build the character description
  let character = '';

  // Special: #1 or #2 handicap gets a callout
  if (hole.handicap != null && hole.handicap <= 2) {
    character = `The #${hole.handicap} handicap hole. `;
  }

  // Determine the best adjective
  if (relativeLen && relativeLen.startsWith('the ')) {
    // "the longest par 3 on the course"
    character += capitalize(relativeLen);
  } else {
    // Combine length modifier + difficulty
    const adj = relativeLen ?? difficulty;
    character += adj ? `${capitalize(adj)} par ${hole.par}` : `Par ${hole.par}`;
  }

  // Dogleg
  if (dogleg) character += `, ${dogleg}`;

  // Elevation context woven in
  if (elevProse) {
    character += ` — ${elevProse}`;
  }

  // --- Hazard sentences ---
  const grouped = new Map<string, { side: Side; depth: Depth }[]>();
  for (const h of hole.hazards) {
    const pos = analyzePosition(h, hole.tee, heading, yardage);
    const arr = grouped.get(h.type) ?? [];
    arr.push(pos);
    grouped.set(h.type, arr);
  }

  const hazardParts: string[] = [];

  // Fairway bunkers
  const fwb = grouped.get('fairway_bunker');
  if (fwb) {
    const n = fwb.length;
    const side = describeSideGroup(fwb, false);
    hazardParts.push(
      `${n} fairway bunker${n > 1 ? 's' : ''} ${side === 'both sides' ? 'lining both sides' : side}`,
    );
  }

  // Greenside bunkers
  const gsb = grouped.get('greenside_bunker');
  if (gsb) {
    const n = gsb.length;
    const left = gsb.filter((p) => p.side === 'left').length;
    const right = gsb.filter((p) => p.side === 'right').length;
    if (left > 0 && right > 0) {
      hazardParts.push(`${n} greenside bunker${n > 1 ? 's' : ''} surround the green`);
    } else {
      const side = left > 0 ? 'left' : right > 0 ? 'right' : '';
      hazardParts.push(
        `${n} greenside bunker${n > 1 ? 's' : ''} guard${n === 1 ? 's' : ''} the green${side ? ` ${side}` : ''}`,
      );
    }
  }

  // Generic bunkers
  const bk = grouped.get('bunker');
  if (bk) {
    const n = bk.length;
    const side = describeSideGroup(bk, false);
    hazardParts.push(`${n} bunker${n > 1 ? 's' : ''} ${side}`);
  }

  // Trees — include depth per side
  const trees = grouped.get('trees');
  if (trees) {
    hazardParts.push(`Trees ${describeSideGroup(trees, true)}`);
  }

  // Water
  const water = grouped.get('water');
  if (water) {
    hazardParts.push(`Water ${describeSideGroup(water, true)}`);
  }

  // OB — conversational warning
  const ob = grouped.get('ob');
  if (ob) {
    const side = describeSideGroup(ob, false);
    hazardParts.push(`Don't go OB ${side || 'here'}`);
  }

  // --- Assemble ---
  if (hazardParts.length === 0) {
    sentences.push(character + '.');
  } else {
    // Connect opening to first hazard with "with"
    sentences.push(character + ' with ' + hazardParts[0] + '.');
    for (let i = 1; i < hazardParts.length; i++) {
      sentences.push(hazardParts[i] + '.');
    }
  }

  return sentences.join(' ');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HoleInfoPanel({ hole, teeBox, allHoles }: HoleInfoPanelProps) {
  const yardage = hole.yardages[teeBox] ?? Object.values(hole.yardages)[0] ?? 0;
  const playsLike = hole.playsLikeYards?.[teeBox] ?? null;
  const elevDeltaFeet = Math.round((hole.pin.elevation - hole.tee.elevation) * 3.281);
  const isUphill = elevDeltaFeet > 0;

  const description = useMemo(
    () => generateDescription(hole, teeBox, allHoles),
    [hole, teeBox, allHoles],
  );

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
          {hole.handicap != null && (
            <span className="text-xs font-medium text-text-muted">
              HCP {hole.handicap}
            </span>
          )}
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

      {/* Row 2: Prose description */}
      {description && (
        <p className="text-[11px] text-text-medium italic leading-snug">
          {description}
        </p>
      )}

      {/* Notes */}
      {hole.notes && (
        <p className="text-[10px] text-text-muted italic truncate">
          {hole.notes}
        </p>
      )}
    </div>
  );
}
