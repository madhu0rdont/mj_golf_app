import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAllClubs } from '../../hooks/useClubs';
import { Scorecard } from './Scorecard';
import { computeHoleScore, computeRemaining } from '../../services/interleaved-scoring';
import type { Session, Shot } from '../../models/session';

interface InterleavedSummaryProps {
  session: Session;
  shots: Shot[];
}

export function InterleavedSummary({ session, shots }: InterleavedSummaryProps) {
  const clubs = useAllClubs();
  const [expandedHole, setExpandedHole] = useState<number | null>(null);

  const clubMap = useMemo(() => {
    if (!clubs) return new Map<string, string>();
    return new Map(clubs.map((c) => [c.id, c.name]));
  }, [clubs]);

  const metadata = session.metadata;
  if (!metadata) return null;

  const { holes } = metadata;

  // Group shots by hole
  const shotsByHole = useMemo(() => {
    const map = new Map<number, Shot[]>();
    for (const shot of shots) {
      if (shot.holeNumber == null) continue;
      const list = map.get(shot.holeNumber) || [];
      list.push(shot);
      map.set(shot.holeNumber, list);
    }
    return map;
  }, [shots]);

  const scores = useMemo(() => {
    return holes.map((hole) => {
      const holeShots = shotsByHole.get(hole.number) ?? [];
      return computeHoleScore(hole, holeShots.map((s) => ({
        carryYards: s.carryYards,
        offlineYards: s.offlineYards ?? 0,
      })));
    });
  }, [holes, shotsByHole]);

  const totalScore = scores.reduce((s, h) => s + h.total, 0);
  const totalToPar = scores.reduce((s, h) => s + h.toPar, 0);
  const totalPar = holes.reduce((s, h) => s + h.par, 0);
  const szApplicable = scores.filter((s) => s.scoringZone.applicable);
  const szTotal = szApplicable.reduce((s, h) => s + h.scoringZone.delta, 0);
  const avgStrokes = scores.length > 0
    ? Math.round((scores.reduce((s, h) => s + h.strokes, 0) / scores.length) * 10) / 10
    : 0;

  const dateStr = new Date(session.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold">Interleaved Practice</h2>
        <p className="text-sm text-text-medium">
          {dateStr} &middot; {holes.length} holes &middot; {shots.length} shots
          {session.location && ` at ${session.location}`}
        </p>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="rounded-xl border border-border bg-card px-2 py-3 text-center">
          <p className="text-[10px] text-text-muted uppercase">Score</p>
          <p className="text-lg font-bold text-text-dark">{totalScore}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-2 py-3 text-center">
          <p className="text-[10px] text-text-muted uppercase">vs Par {totalPar}</p>
          <p className={`text-lg font-bold ${
            totalToPar < 0 ? 'text-primary' : totalToPar === 0 ? 'text-text-dark' : 'text-coral'
          }`}>
            {totalToPar === 0 ? 'E' : totalToPar > 0 ? `+${totalToPar}` : totalToPar}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-2 py-3 text-center">
          <p className="text-[10px] text-text-muted uppercase">Zone</p>
          <p className={`text-lg font-bold ${
            szTotal < 0 ? 'text-primary' : szTotal === 0 ? 'text-text-dark' : 'text-coral'
          }`}>
            {szApplicable.length === 0 ? '—' : szTotal === 0 ? 'E' : szTotal > 0 ? `+${szTotal}` : szTotal}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card px-2 py-3 text-center">
          <p className="text-[10px] text-text-muted uppercase">Avg Strk</p>
          <p className="text-lg font-bold text-text-dark">{avgStrokes}</p>
        </div>
      </div>

      {/* Scorecard */}
      <div className="rounded-xl border border-border bg-card p-3 mb-4">
        <Scorecard holes={holes} scores={scores} />
      </div>

      {/* Per-hole shot details */}
      <div className="space-y-2">
        {holes.map((hole) => {
          const holeShots = shotsByHole.get(hole.number) ?? [];
          const score = scores[hole.number - 1];
          const isExpanded = expandedHole === hole.number;

          return (
            <div key={hole.number} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedHole(isExpanded ? null : hole.number)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-dark">
                    Hole {hole.number}
                  </span>
                  <span className="text-xs text-text-muted">
                    Par {hole.par}, {hole.distanceYards} yds
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${
                    score.toPar <= -2 ? 'text-gold-dark'
                    : score.toPar === -1 ? 'text-primary'
                    : score.toPar === 0 ? 'text-text-dark'
                    : 'text-coral'
                  }`}>
                    {score.total} ({score.label})
                  </span>
                  <ChevronDown
                    size={14}
                    className={`text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-border-light px-3 py-2 space-y-1">
                  {holeShots.map((shot, i) => {
                    const shotsToHere = holeShots.slice(0, i + 1).map((s) => ({
                      carryYards: s.carryYards,
                      offlineYards: s.offlineYards ?? 0,
                    }));
                    const rem = computeRemaining(hole.distanceYards, shotsToHere);
                    return (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-faint w-4">#{i + 1}</span>
                          <span className="font-medium text-text-dark">
                            {clubMap.get(shot.clubId) ?? 'Unknown'}
                          </span>
                          {shot.position === 'full' && (
                            <span className="text-[10px] text-primary">full</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-muted">
                          <span>{Math.round(shot.carryYards)} carry</span>
                          {shot.offlineYards != null && shot.offlineYards !== 0 && (
                            <span>{Math.abs(shot.offlineYards)}{shot.offlineYards > 0 ? 'R' : 'L'}</span>
                          )}
                          <span className="text-text-faint">{Math.round(rem.trueRemaining)} left</span>
                        </div>
                      </div>
                    );
                  })}
                  {score.scoringZone.applicable && (
                    <p className={`text-[10px] mt-1 ${
                      score.scoringZone.delta <= 0 ? 'text-primary' : 'text-coral'
                    }`}>
                      Scoring zone: {score.scoringZone.actual} stroke{score.scoringZone.actual !== 1 ? 's' : ''} to reach 100 yds
                      {' '}(target: {score.scoringZone.target})
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
