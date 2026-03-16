import { useState, useEffect, useRef } from 'react';
import { FileDown, Copy, Play, Flag, RefreshCw, Bug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';
import { exportGamePlanPDF } from '../../services/game-plan-pdf';
import type { GamePlan, HolePlan } from '../../services/game-plan';
import type { ScoreDistribution } from '../../services/strategy-optimizer';
import type { ClubDistribution } from '../../services/monte-carlo';
import type { CourseHole } from '../../models/course';

interface GamePlanViewProps {
  gamePlan: GamePlan | null;
  progress: { current: number; total: number } | null;
  isGenerating: boolean;
  onGenerate: () => void;
  distributions: ClubDistribution[];
  isStale?: boolean;
  staleReason?: string | null;
  isFetching?: boolean;
  cacheAge?: number | null;
  courseHoles?: CourseHole[];
}

const STALE_REASON_LABELS: Record<string, string> = {
  'New practice data recorded': 'New practice data recorded — plan may be outdated',
  'Practice data deleted': 'Practice data was deleted — plan may be outdated',
  'Elevation data refreshed': 'Elevation data changed — distances may differ',
  'Scorecard updated': 'Scorecard updated — yardages may have changed',
  'Hole data edited': 'Hole details were edited — hazards or targets may differ',
  'Club bag changed': 'Club bag changed — auto-refreshing...',
  'Club settings changed': 'Club settings changed — auto-refreshing...',
  'Club removed': 'Club removed — auto-refreshing...',
  'Data imported from backup': 'Data imported — auto-refreshing...',
  'Hazard penalties updated': 'Hazard penalties changed — auto-refreshing...',
};

function formatCacheAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const BORDER_COLORS = {
  green: '#40916C',
  yellow: '#D4A843',
  red: '#E76F51',
};

const SCORE_PILLS: { key: keyof ScoreDistribution; label: string; color: string }[] = [
  { key: 'eagle', label: 'Eagle', color: '#D4A843' },
  { key: 'birdie', label: 'Birdie', color: '#40916C' },
  { key: 'par', label: 'Par', color: '#2D6A4F' },
  { key: 'bogey', label: 'Bogey', color: '#9B9B9B' },
  { key: 'double', label: 'Dbl', color: '#E76F51' },
  { key: 'worse', label: 'Worse', color: '#DC2626' },
];

function ScoreBreakdownPills({ dist }: { dist: ScoreDistribution }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SCORE_PILLS.map(({ key, label, color }) => {
        const pct = dist[key] * 100;
        if (pct < 1) return null;
        return (
          <span
            key={key}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
            style={{ backgroundColor: color }}
          >
            {label} {pct.toFixed(0)}%
          </span>
        );
      })}
    </div>
  );
}

function SatelliteThumbnail({ lat, lng, zoom }: { lat: number; lng: number; zoom: number }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=80x80&scale=2&maptype=satellite&key=${apiKey}`;

  return (
    <img
      src={url}
      alt="Hole satellite"
      className="rounded-sm flex-shrink-0"
      width={48}
      height={48}
      loading="lazy"
    />
  );
}

function HoleCard({ hole, isKeyHole }: { hole: HolePlan; isKeyHole?: boolean }) {
  const midLat = (hole.strategy.aimPoints[0]?.position.lat ?? 0);
  const midLng = (hole.strategy.aimPoints[0]?.position.lng ?? 0);

  return (
    <div
      className="rounded-sm bg-card border border-border overflow-hidden"
      style={{ borderLeftWidth: 4, borderLeftColor: BORDER_COLORS[hole.colorCode] }}
    >
      <div className="flex items-start gap-3 p-3">
        {midLat !== 0 && (
          <SatelliteThumbnail lat={midLat} lng={midLng} zoom={17} />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
              style={{ backgroundColor: BORDER_COLORS[hole.colorCode] }}
            >
              {hole.holeNumber}
            </span>
            {isKeyHole && (
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                style={{ backgroundColor: 'rgba(212, 168, 67, 0.15)', color: '#D4A843' }}
              >
                <Flag size={9} fill="#D4A843" />
                KEY
              </span>
            )}
            <span className="text-xs text-text-muted">
              Par {hole.par} · {hole.yardage}y
              {hole.playsLikeYardage && hole.playsLikeYardage !== hole.yardage && (
                <span className="text-text-muted/60"> (plays {hole.playsLikeYardage})</span>
              )}
            </span>
            <span className="ml-auto flex items-center gap-1">
              <span className="text-sm font-semibold text-primary">
                {hole.strategy.expectedStrokes.toFixed(1)}
              </span>
              <span className="text-[10px] text-text-muted">
                ±{hole.strategy.stdStrokes.toFixed(1)}
              </span>
              {hole.strategy.blowupRisk > 0.05 && (
                <span
                  className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                    hole.strategy.blowupRisk > 0.15
                      ? 'bg-coral/20 text-coral'
                      : 'bg-gold/20 text-gold-dark'
                  }`}
                >
                  {(hole.strategy.blowupRisk * 100).toFixed(0)}% blow
                </span>
              )}
            </span>
          </div>

          <p className="text-xs font-semibold text-primary mt-1">{hole.strategy.strategyName}</p>
          <p className="text-[11px] text-text-medium truncate">
            {hole.strategy.label}
          </p>

          {hole.strategy.aimPoints.length > 0 && (
            <div className="mt-1 flex flex-col gap-0.5">
              {hole.strategy.aimPoints.map((ap) => (
                <p key={ap.shotNumber} className="text-[10px] text-text-muted">
                  <span className="font-semibold text-text-medium">{ap.shotNumber}.</span>{' '}
                  {ap.carry > 0 && (
                    <span className="font-medium">{ap.carry}y{ap.carryNote ? ` (${ap.carryNote})` : ''} — </span>
                  )}
                  {ap.tip}
                </p>
              ))}
              {(() => {
                const last = hole.strategy.aimPoints[hole.strategy.aimPoints.length - 1];
                if (!last?.remainingToPin || last.remainingToPin <= 1) return null;
                return (
                  <p className="text-[10px] text-text-muted/70">
                    <span className="font-semibold">+</span>{' '}
                    {last.remainingToPin}y to pin — chip + putts (~{last.shortGameStrokes} strokes)
                  </p>
                );
              })()}
            </div>
          )}

          {/* Score distribution bar */}
          <div className="flex h-2 w-full rounded-full overflow-hidden mt-1.5">
            {SCORE_PILLS.map(({ key, color }) => {
              const pct = hole.strategy.scoreDistribution[key] * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={key}
                  style={{ width: `${pct}%`, backgroundColor: color }}
                  title={`${key}: ${pct.toFixed(0)}%`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Descriptive messages about what the optimizer is doing at each phase
const PHASE_MESSAGES = [
  'Surveying the course layout...',
  'Modeling tee shot landing zones...',
  'Simulating approach angles...',
  'Evaluating hazard risk corridors...',
  'Running Monte Carlo simulations...',
  'Calculating optimal club sequences...',
  'Analyzing wind and elevation effects...',
  'Computing scoring probabilities...',
  'Mapping safe miss zones...',
  'Weighing risk vs reward tradeoffs...',
  'Factoring in your shot dispersion...',
  'Identifying key scoring opportunities...',
  'Stress-testing the strategy...',
  'Dialing in carry distances...',
  'Finding the smartest play...',
  'Simulating your approach patterns...',
  'Calibrating blow-up risk...',
  'Locking in the final strategy...',
];

const GOLF_TIPS = [
  'Aim for the fat side of the green.',
  'Course management beats raw distance.',
  'A bogey is better than a double.',
  'Play the shot you\'ve practiced.',
  'When in doubt, take more club.',
  'Miss on the right side of trouble.',
  'Par is always a good score.',
  'Commit to every shot.',
];

function PlanGenerationLoader({ current, total }: { current: number; total: number }) {
  const [tipIndex, setTipIndex] = useState(0);
  const pct = total > 0 ? (current / total) * 100 : 0;
  const phaseMsg = PHASE_MESSAGES[Math.min(current, PHASE_MESSAGES.length - 1)];

  // Rotate tips every 4 seconds
  useEffect(() => {
    const id = setInterval(() => setTipIndex((i) => (i + 1) % GOLF_TIPS.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-8 px-4">
      {/* Animated golf ball */}
      <div className="relative h-10 w-10">
        <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
        <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-forest text-white font-display text-sm font-light">
          {current}/{total}
        </div>
      </div>

      {/* Phase message */}
      <p
        key={phaseMsg}
        className="text-sm font-medium text-text-dark text-center animate-fadeUp"
      >
        {phaseMsg}
      </p>

      {/* Progress bar */}
      <div className="w-full max-w-xs">
        <div className="h-2.5 rounded-full bg-border overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-turf to-fairway transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-[10px] text-text-muted text-center mt-1.5">
          Hole {current} of {total}
        </p>
      </div>

      {/* Rotating tip */}
      <p
        key={tipIndex}
        className="text-xs text-sage italic text-center animate-fadeUp"
      >
        "{GOLF_TIPS[tipIndex]}"
      </p>
    </div>
  );
}

function copySummary(plan: GamePlan) {
  const lines = [
    `${plan.courseName} — ${plan.teeBox.charAt(0).toUpperCase() + plan.teeBox.slice(1)} Tees`,
    `${plan.date}`,
    `Expected Total: ${plan.totalExpected.toFixed(1)} (Plays-Like: ${plan.totalPlaysLike}y)`,
    '',
    ...plan.holes.flatMap((h) => [
      `#${h.holeNumber} Par ${h.par} ${h.yardage}y → ${h.strategy.strategyName}: ${h.strategy.clubs.map((c) => c.clubName).join(' → ')} (${h.strategy.expectedStrokes.toFixed(1)} xS)`,
      ...h.strategy.aimPoints.map(
        (ap) => `  ${ap.shotNumber}. ${ap.carry}y${ap.carryNote ? ` (${ap.carryNote})` : ''} — ${ap.tip}`,
      ),
    ]),
  ];
  navigator.clipboard.writeText(lines.join('\n'));
}

export function GamePlanView({ gamePlan, progress, isGenerating, onGenerate, distributions, isStale, staleReason, isFetching, cacheAge, courseHoles }: GamePlanViewProps) {
  const { isAdmin } = useAuth();
  const trackedPlanRef = useRef<string | null>(null);

  // Track static-maps impressions once per game plan render
  useEffect(() => {
    if (!gamePlan) return;
    const planKey = `${gamePlan.courseName}_${gamePlan.teeBox}`;
    if (trackedPlanRef.current === planKey) return;
    trackedPlanRef.current = planKey;
    const count = gamePlan.holes.filter(
      (h) => (h.strategy.aimPoints[0]?.position.lat ?? 0) !== 0,
    ).length;
    if (count > 0) {
      fetch('/api/track/map-impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'static_maps', endpoint: 'game_plan_thumbnail', count }),
      }).catch(() => {});
    }
  }, [gamePlan]);

  // Loading cached plan from server
  if (isFetching && !gamePlan && !isGenerating) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-7 w-7 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!gamePlan && !isGenerating) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-text-muted text-center">
          Generate a plan for all holes
        </p>
        <Button onClick={onGenerate} disabled={distributions.length === 0}>
          <Play size={16} />
          Generate Game Plan
        </Button>
        {distributions.length === 0 && (
          <p className="text-xs text-text-muted">
            Enable Sim mode and record sessions to generate plans
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Progress loader */}
      {isGenerating && progress && (
        <PlanGenerationLoader current={progress.current} total={progress.total} />
      )}

      {gamePlan && (
        <>
          {/* Stale banner */}
          {isStale && (
            <div className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <RefreshCw size={16} className="text-amber-600 flex-shrink-0 animate-spin" />
                <p className="text-xs text-amber-800 flex-1">
                  {isGenerating && progress
                    ? `${PHASE_MESSAGES[Math.min(progress.current, PHASE_MESSAGES.length - 1)]} (hole ${progress.current} of ${progress.total})`
                    : staleReason ? (STALE_REASON_LABELS[staleReason] ?? `${staleReason} — auto-refreshing...`) : 'Auto-refreshing...'}
                </p>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1 rounded-sm bg-amber-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} />
                  Refresh Now
                </button>
              </div>
              {isGenerating && progress && progress.total > 0 && (
                <div className="mt-2 h-1.5 rounded-full bg-amber-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-500 ease-out"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Header card */}
          <div className="rounded-sm border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-dark">{gamePlan.courseName}</h3>
                <p className="text-xs text-text-muted">
                  {gamePlan.teeBox.charAt(0).toUpperCase() + gamePlan.teeBox.slice(1)} Tees · {gamePlan.date}
                  {cacheAge != null && (
                    <span className="text-text-muted/60"> · Generated {formatCacheAge(cacheAge)}</span>
                  )}
                </p>
              </div>
              {isAdmin && gamePlan.optimizerVersion && (
                <span className="inline-flex items-center gap-1 rounded-full bg-border/50 px-2 py-0.5 text-[9px] font-mono text-text-muted">
                  <Bug size={9} />
                  v{gamePlan.optimizerVersion}
                </span>
              )}
            </div>
          </div>

          {/* Summary card */}
          <div className="rounded-sm border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {gamePlan.totalExpected.toFixed(1)}
              </span>
              <span className="text-xs text-text-muted">expected total</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>{gamePlan.totalPlaysLike}y plays-like</span>
              {gamePlan.keyHoles.length > 0 && (
                <span>
                  <span className="font-medium text-text-dark">Key Holes:</span>{' '}
                  #{gamePlan.keyHoles.join(', #')}
                </span>
              )}
            </div>
            <ScoreBreakdownPills dist={gamePlan.breakdown} />
          </div>

          {/* Per-hole cards */}
          <div className="flex flex-col gap-2">
            {gamePlan.holes.map((hole) => (
              <HoleCard key={hole.holeNumber} hole={hole} isKeyHole={gamePlan.keyHoles.includes(hole.holeNumber)} />
            ))}
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportGamePlanPDF(gamePlan, courseHoles)}
              className="flex-1"
            >
              <FileDown size={14} />
              Save as PDF
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => copySummary(gamePlan)}
              className="flex-1"
            >
              <Copy size={14} />
              Copy Summary
            </Button>
          </div>

          {/* Regenerate */}
          <Button variant="ghost" size="sm" onClick={onGenerate} className="w-full">
            <Play size={14} />
            Regenerate
          </Button>
        </>
      )}
    </div>
  );
}
