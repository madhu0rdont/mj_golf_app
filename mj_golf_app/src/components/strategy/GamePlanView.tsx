import { useEffect } from 'react';
import { FileDown, Copy, Play } from 'lucide-react';
import { Button } from '../ui/Button';
import { useGamePlan } from '../../hooks/useGamePlan';
import { exportGamePlanPDF } from '../../services/game-plan-pdf';
import type { GamePlan, HolePlan } from '../../services/game-plan';
import type { ScoreDistribution, StrategyMode } from '../../services/strategy-optimizer';
import type { ClubDistribution } from '../../services/monte-carlo';
import type { CourseWithHoles } from '../../models/course';

interface GamePlanViewProps {
  course: CourseWithHoles;
  teeBox: string;
  distributions: ClubDistribution[];
  mode: StrategyMode;
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
      className="rounded-lg flex-shrink-0"
      width={48}
      height={48}
      loading="lazy"
    />
  );
}

function HoleCard({ hole }: { hole: HolePlan }) {
  const midLat = (hole.strategy.aimPoints[0]?.position.lat ?? 0);
  const midLng = (hole.strategy.aimPoints[0]?.position.lng ?? 0);

  return (
    <div
      className="rounded-xl bg-card border border-border overflow-hidden"
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
            <span className="text-xs text-text-muted">
              Par {hole.par} · {hole.yardage}y
              {hole.playsLikeYardage && hole.playsLikeYardage !== hole.yardage && (
                <span className="text-text-muted/60"> (plays {hole.playsLikeYardage})</span>
              )}
            </span>
            <span className="ml-auto text-sm font-semibold text-primary">
              {hole.strategy.expectedStrokes.toFixed(1)} xS
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function copySummary(plan: GamePlan) {
  const lines = [
    `${plan.courseName} — ${plan.teeBox.charAt(0).toUpperCase() + plan.teeBox.slice(1)} Tees`,
    `${plan.mode === 'scoring' ? 'Scoring' : 'Safe'} Mode — ${plan.date}`,
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

export function GamePlanView({ course, teeBox, distributions, mode }: GamePlanViewProps) {
  const { gamePlan, progress, isGenerating, generate } = useGamePlan(
    course,
    teeBox,
    distributions,
    mode,
  );

  // Auto-regenerate when mode changes if a plan already exists
  useEffect(() => {
    if (gamePlan && gamePlan.mode !== mode) {
      generate();
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!gamePlan && !isGenerating) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-sm text-text-muted text-center">
          Generate a plan for all {course.holes.length} holes
        </p>
        <Button onClick={generate} disabled={distributions.length === 0}>
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
      {/* Progress bar */}
      {isGenerating && progress && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs text-text-muted text-center">
            Optimizing hole {progress.current} of {progress.total}...
          </p>
          <div className="h-2 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {gamePlan && (
        <>
          {/* Header card */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-dark">{gamePlan.courseName}</h3>
                <p className="text-xs text-text-muted">
                  {gamePlan.teeBox.charAt(0).toUpperCase() + gamePlan.teeBox.slice(1)} Tees · {gamePlan.date}
                </p>
              </div>
              <span className="rounded-full bg-primary-pale px-2 py-0.5 text-[10px] font-medium text-primary capitalize">
                {gamePlan.mode}
              </span>
            </div>
          </div>

          {/* Summary card */}
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-primary">
                {gamePlan.totalExpected.toFixed(1)}
              </span>
              <span className="text-xs text-text-muted">expected total</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>{gamePlan.totalPlaysLike}y plays-like</span>
              {gamePlan.keyHoles.length > 0 && (
                <span>Key: #{gamePlan.keyHoles.join(', #')}</span>
              )}
            </div>
            <ScoreBreakdownPills dist={gamePlan.breakdown} />
          </div>

          {/* Per-hole cards */}
          <div className="flex flex-col gap-2">
            {gamePlan.holes.map((hole) => (
              <HoleCard key={hole.holeNumber} hole={hole} />
            ))}
          </div>

          {/* Export buttons */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportGamePlanPDF(gamePlan)}
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
          <Button variant="ghost" size="sm" onClick={generate} className="w-full">
            <Play size={14} />
            Regenerate
          </Button>
        </>
      )}
    </div>
  );
}
