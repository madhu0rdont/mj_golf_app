import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { ShotInputSheet } from '../components/interleaved/ShotInputSheet';
import { useAllClubs } from '../hooks/useClubs';
import { useYardageBook, useYardageBookShots } from '../hooks/useYardageBook';
import { useWedgeOverrides } from '../hooks/useWedgeOverrides';
import { buildDistributions, findBestApproaches } from '../services/monte-carlo';
import type { ApproachStrategy } from '../services/monte-carlo';
import { createSession } from '../hooks/useSessions';
import { generateHoles } from '../services/course-generator';
import { computeRemaining, computeHoleScore } from '../services/interleaved-scoring';
import type { InterleavedHole } from '../models/session';

interface HoleShotData {
  clubId: string;
  clubName: string;
  carryYards: number;
  offlineYards: number;
  fullShot: boolean;
}

interface Recommendation {
  clubId: string;
  clubName: string;
  carry: number;
  tip?: string; // e.g. "Grip down 1\"" or "Shoulder swing"
}

const WEDGE_POSITIONS = [
  { key: 'full', label: 'Full', multiplier: 1.0 },
  { key: 'shoulder', label: 'Shoulder', multiplier: 0.85 },
  { key: 'hip', label: 'Hip', multiplier: 0.65 },
] as const;

const GRIP_DOWN_YDS_PER_INCH = 5;

type Phase = 'setup' | 'playing' | 'saving';

export function InterleavedPracticePage() {
  const navigate = useNavigate();
  const clubs = useAllClubs();
  const entries = useYardageBook();
  const wedgeOverrides = useWedgeOverrides();
  const shotGroups = useYardageBookShots();

  // Build carry lookup and wedge distance matrix for recommendations
  const { clubCarryMap, wedgeDistances } = useMemo(() => {
    const carryMap = new Map<string, number>();
    const wedgeDist: { clubId: string; clubName: string; position: string; positionLabel: string; carry: number }[] = [];

    if (!clubs || !entries) return { clubCarryMap: carryMap, wedgeDistances: wedgeDist };

    const entryMap = new Map(entries.map((e) => [e.clubId, e.bookCarry]));
    const overrideMap = new Map<string, number>();
    if (wedgeOverrides) {
      for (const o of wedgeOverrides) overrideMap.set(`${o.clubId}:${o.position}`, o.carry);
    }

    for (const club of clubs) {
      if (club.category === 'putter') continue;
      const carry = entryMap.get(club.id) ?? club.manualCarry ?? 0;
      if (carry > 0) carryMap.set(club.id, carry);

      // Build wedge position distances (sorted by least loft = lowest sortOrder first)
      if (club.category === 'wedge' && carry > 0) {
        for (const pos of WEDGE_POSITIONS) {
          const override = overrideMap.get(`${club.id}:${pos.key}`);
          const dist = override ?? Math.round(carry * pos.multiplier);
          wedgeDist.push({
            clubId: club.id,
            clubName: club.name,
            position: pos.key,
            positionLabel: pos.label,
            carry: dist,
          });
        }
      }
    }

    // Sort wedges by least loft first (lowest sortOrder), then full > shoulder > hip
    wedgeDist.sort((a, b) => {
      const aClub = clubs.find((c) => c.id === a.clubId)!;
      const bClub = clubs.find((c) => c.id === b.clubId)!;
      if (aClub.sortOrder !== bClub.sortOrder) return aClub.sortOrder - bClub.sortOrder;
      const posOrder = { full: 0, shoulder: 1, hip: 2 } as Record<string, number>;
      return (posOrder[a.position] ?? 0) - (posOrder[b.position] ?? 0);
    });

    return { clubCarryMap: carryMap, wedgeDistances: wedgeDist };
  }, [clubs, entries, wedgeOverrides]);

  // Max full-swing wedge carry — MC switches to greedy below this distance
  const maxWedgeCarry = useMemo(() => {
    if (!clubs) return 0;
    let max = 0;
    for (const club of clubs) {
      if (club.category !== 'wedge') continue;
      const carry = clubCarryMap.get(club.id) ?? 0;
      if (carry > max) max = carry;
    }
    return max;
  }, [clubs, clubCarryMap]);

  const recommend = (targetDistance: number): Recommendation | undefined => {
    if (!clubs || clubCarryMap.size === 0) return undefined;

    const nonWedges = clubs
      .filter((c) => c.category !== 'putter' && c.category !== 'wedge')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let best: Recommendation | undefined;
    let bestDiff = Infinity;

    // 1. Check non-wedge clubs (driver, woods, hybrids, irons) — exact + grip down
    for (const club of nonWedges) {
      const carry = clubCarryMap.get(club.id);
      if (!carry) continue;

      // Exact match
      const diff = Math.abs(carry - targetDistance);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = { clubId: club.id, clubName: club.name, carry };
      }

      // Grip down 1" (~5 yds less)
      const carry1 = carry - GRIP_DOWN_YDS_PER_INCH;
      const diff1 = Math.abs(carry1 - targetDistance);
      if (diff1 < bestDiff) {
        bestDiff = diff1;
        best = { clubId: club.id, clubName: club.name, carry: carry1, tip: 'Grip down 1"' };
      }

      // Grip down 2" (~10 yds less)
      const carry2 = carry - 2 * GRIP_DOWN_YDS_PER_INCH;
      if (carry2 > 0) {
        const diff2 = Math.abs(carry2 - targetDistance);
        if (diff2 < bestDiff) {
          bestDiff = diff2;
          best = { clubId: club.id, clubName: club.name, carry: carry2, tip: 'Grip down 2"' };
        }
      }
    }

    // 2. Check wedge + position combos (sorted by least loft first)
    for (const w of wedgeDistances) {
      const diff = Math.abs(w.carry - targetDistance);
      // For wedges, favor least loft: only replace if strictly closer
      // (the sort order ensures least-loft wedges are checked first)
      if (diff < bestDiff) {
        bestDiff = diff;
        const tip = w.position !== 'full' ? `${w.positionLabel} swing` : undefined;
        best = { clubId: w.clubId, clubName: w.clubName, carry: w.carry, tip };
      }
    }

    return best;
  };

  const [phase, setPhase] = useState<Phase>('setup');
  const [roundSize, setRoundSize] = useState<9 | 18>(9);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');

  const [holes, setHoles] = useState<InterleavedHole[]>([]);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [holeShots, setHoleShots] = useState<Map<number, HoleShotData[]>>(new Map());
  const [shotEntryOpen, setShotEntryOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStrategyClubId, setSelectedStrategyClubId] = useState<string | null>(null);

  // Monte Carlo club distributions from actual shot data
  const clubDistributions = useMemo(
    () => (shotGroups ? buildDistributions(shotGroups) : []),
    [shotGroups],
  );

  const sortedClubs = useMemo(() => {
    if (!clubs) return [];
    return [...clubs]
      .filter((c) => c.category !== 'putter')
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [clubs]);

  const currentHole = holes[currentHoleIndex];
  const currentShots = currentHole ? holeShots.get(currentHole.number) ?? [] : [];

  const remaining = useMemo(() => {
    if (!currentHole) return { forwardRemaining: 0, cumulativeOffline: 0, trueRemaining: 0 };
    return computeRemaining(currentHole.distanceYards, currentShots);
  }, [currentHole, currentShots]);

  const holeComplete = remaining.trueRemaining <= 10 && currentShots.length > 0;

  // Recommend a club for the current distance
  const targetDistance = currentShots.length === 0
    ? currentHole?.distanceYards ?? 0
    : remaining.trueRemaining;
  const suggestion = useMemo(
    () => recommend(targetDistance),
    [targetDistance, clubCarryMap, wedgeDistances, clubs] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Monte Carlo best approaches — recomputed after each shot until within wedge range
  const mcDistance = currentShots.length === 0
    ? currentHole?.distanceYards ?? 0
    : remaining.trueRemaining;
  const showMonteCarlo = !holeComplete && mcDistance > maxWedgeCarry && clubDistributions.length > 0;

  const bestApproaches: ApproachStrategy[] = useMemo(() => {
    if (!showMonteCarlo || mcDistance <= 0) return [];
    return findBestApproaches(Math.round(mcDistance), clubDistributions);
  }, [showMonteCarlo, mcDistance, clubDistributions]); // eslint-disable-line react-hooks/exhaustive-deps

  const isLastHole = currentHoleIndex === holes.length - 1;
  const roundComplete = holeComplete && isLastHole;

  const completedScores = useMemo(() => {
    const limit = currentHoleIndex + (holeComplete ? 1 : 0);
    return holes.slice(0, limit).map((hole) => {
      const shots = holeShots.get(hole.number) ?? [];
      return computeHoleScore(hole, shots);
    });
  }, [holes, currentHoleIndex, holeComplete, holeShots]);

  const totalScore = completedScores.reduce((s, h) => s + h.total, 0);
  const totalToPar = completedScores.reduce((s, h) => s + h.toPar, 0);

  const handleStartRound = () => {
    const generated = generateHoles(roundSize);
    setHoles(generated);
    setCurrentHoleIndex(0);
    setHoleShots(new Map());
    setPhase('playing');
  };

  const handleAddShot = (clubId: string, carryYards: number, offlineYards: number, fullShot: boolean) => {
    if (!currentHole) return;
    const club = clubs?.find((c) => c.id === clubId);
    const shot: HoleShotData = {
      clubId,
      clubName: club?.name ?? 'Unknown',
      carryYards,
      offlineYards,
      fullShot,
    };
    const next = new Map(holeShots);
    const list = [...(next.get(currentHole.number) ?? []), shot];
    next.set(currentHole.number, list);
    setHoleShots(next);
    setSelectedStrategyClubId(null); // reset for new MC results
  };

  const handleNextHole = () => {
    setSelectedStrategyClubId(null);
    setCurrentHoleIndex((i) => i + 1);
  };

  const handleFinishRound = async (earlyExit = false) => {
    setSaving(true);
    try {
      // Only include holes that have shots (completed holes)
      const playedHoles = earlyExit
        ? holes.filter((h) => (holeShots.get(h.number) ?? []).length > 0)
        : holes;

      let shotNumber = 1;
      const allShots = playedHoles.flatMap((hole) => {
        const shots = holeShots.get(hole.number) ?? [];
        return shots.map((s) => ({
          clubId: s.clubId,
          carryYards: s.carryYards,
          offlineYards: s.offlineYards,
          holeNumber: hole.number,
          shotNumber: shotNumber++,
          position: s.fullShot ? 'full' as const : undefined,
        }));
      });

      const sessionId = await createSession({
        type: 'interleaved',
        date: new Date(date + 'T00:00:00').getTime(),
        location: location.trim() || undefined,
        source: 'manual',
        metadata: { holes: playedHoles, roundSize },
        shots: allShots,
      });

      navigate(`/session/${sessionId}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Setup Phase ──
  if (phase === 'setup') {
    return (
      <>
        <TopBar title="Interleaved Practice" showBack />
        <div className="px-4 py-4">
          <div className="flex gap-3 mb-6">
            <div className="flex-1">
              <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <h3 className="text-sm font-medium text-text-muted mb-3">Round Size</h3>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {([9, 18] as const).map((n) => (
              <button
                key={n}
                onClick={() => setRoundSize(n)}
                className={`rounded-xl border-2 py-6 text-center transition ${
                  roundSize === n
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-text-muted hover:border-primary/40'
                }`}
              >
                <div className="text-3xl font-bold">{n}</div>
                <div className="text-sm mt-1">Holes</div>
              </button>
            ))}
          </div>

          <Button onClick={handleStartRound} className="w-full" size="lg">
            Start Round
          </Button>
        </div>
      </>
    );
  }

  // ── Playing Phase ──
  return (
    <>
      <TopBar
        title="Interleaved Practice"
        showBack
        rightAction={
          completedScores.length > 0 ? (
            <button
              onClick={() => setScorecardOpen(true)}
              className="rounded-lg p-1.5 text-primary hover:text-primary-light"
              aria-label="Scorecard"
            >
              <ClipboardList size={20} />
            </button>
          ) : undefined
        }
      />
      <div className="px-4 py-4">
        {/* Mini scorestrip */}
        <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
          {holes.map((hole, i) => {
            const score = completedScores[i];
            const isCurrent = i === currentHoleIndex;
            return (
              <div
                key={hole.number}
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                  isCurrent
                    ? 'bg-primary text-white'
                    : score
                      ? score.toPar < 0
                        ? 'bg-primary/20 text-primary'
                        : score.toPar === 0
                          ? 'bg-surface text-text-dark'
                          : 'bg-coral/20 text-coral'
                      : 'bg-surface text-text-faint'
                }`}
              >
                {score ? score.total : hole.number}
              </div>
            );
          })}
          {completedScores.length > 0 && (
            <div className="flex-shrink-0 ml-2 text-xs font-medium text-text-muted">
              {totalToPar === 0 ? 'E' : totalToPar > 0 ? `+${totalToPar}` : totalToPar}
            </div>
          )}
        </div>

        {/* Current hole card */}
        {currentHole && (
          <div className="rounded-2xl border border-border bg-card p-4 mb-4">
            <div className="text-center mb-4">
              <p className="text-xs text-text-muted uppercase tracking-wide">
                Hole {currentHole.number} of {holes.length}
              </p>
              <p className="text-2xl font-bold text-text-dark mt-1">
                Par {currentHole.par} — {currentHole.distanceYards} yds
              </p>
            </div>

            {/* Remaining distance */}
            {currentShots.length > 0 && !holeComplete && (
              <div className="rounded-xl bg-surface p-3 mb-4 text-center">
                <div className="text-lg font-bold text-primary">
                  {Math.round(remaining.trueRemaining)} yds to hole
                </div>
              </div>
            )}

            {/* Shot log */}
            {currentShots.length > 0 && (
              <div className="space-y-1.5 mb-4">
                {currentShots.map((shot, i) => {
                  const afterShots = currentShots.slice(0, i + 1);
                  const rem = computeRemaining(currentHole.distanceYards, afterShots);
                  return (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-faint w-4">#{i + 1}</span>
                        <span className="font-medium text-text-dark">{shot.clubName}</span>
                        {shot.fullShot && (
                          <span className="text-[10px] text-primary">full</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span>{shot.carryYards} carry</span>
                        {shot.offlineYards !== 0 && (
                          <span>{Math.abs(shot.offlineYards)}{shot.offlineYards > 0 ? 'R' : 'L'}</span>
                        )}
                        <span className="text-text-faint">{Math.round(rem.trueRemaining)} left</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Hole complete */}
            {holeComplete && (
              <div className="rounded-xl bg-surface p-4 text-center mb-4">
                <p className="text-xs text-text-muted uppercase mb-1">Hole Complete</p>
                <p className="text-xl font-bold">
                  {(() => {
                    const score = computeHoleScore(currentHole, currentShots);
                    return (
                      <span className={
                        score.toPar < 0 ? 'text-primary'
                        : score.toPar === 0 ? 'text-text-dark'
                        : 'text-coral'
                      }>
                        {score.strokes} + 2 putts = {score.total} ({score.label})
                      </span>
                    );
                  })()}
                </p>
              </div>
            )}

            {/* Monte Carlo strategy card — shown until within wedge range */}
            {showMonteCarlo && bestApproaches.length > 0 && (
              <div className="mb-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-3">
                <p className="text-[10px] text-text-muted uppercase tracking-wide mb-2">
                  Best Approaches <span className="normal-case">({Math.round(mcDistance)} yds · 2k sims)</span>
                </p>
                <div className="space-y-1">
                  {bestApproaches.map((strategy, i) => {
                    const firstClubId = strategy.clubs[0].clubId;
                    const isSelected = selectedStrategyClubId === firstClubId;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedStrategyClubId(firstClubId)}
                        className={`flex w-full items-start justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition ${
                          isSelected
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : 'hover:bg-primary/5'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className={`font-medium ${i === 0 ? 'text-primary' : 'text-text-dark'}`}>
                            {strategy.label}
                          </span>
                          {strategy.tip && (
                            <p className="text-xs text-gold-dark mt-0.5">{strategy.tip}</p>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-xs text-text-muted tabular-nums whitespace-nowrap">
                          ~{strategy.expectedStrokes.toFixed(1)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Greedy suggestion — within wedge range or no MC data */}
            {!holeComplete && !showMonteCarlo && suggestion && (
              <div className="mb-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-center">
                <span className="text-xs text-text-muted">Suggested: </span>
                <span className="text-sm font-semibold text-primary">
                  {suggestion.clubName}
                </span>
                {suggestion.tip && (
                  <span className="text-xs font-medium text-gold-dark ml-1">
                    — {suggestion.tip}
                  </span>
                )}
                <span className="text-xs text-text-faint ml-1">
                  ({suggestion.carry} yds)
                </span>
              </div>
            )}

            {/* Fallback greedy when MC has data but finds no viable combos */}
            {showMonteCarlo && bestApproaches.length === 0 && suggestion && (
              <div className="mb-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-center">
                <span className="text-xs text-text-muted">Suggested: </span>
                <span className="text-sm font-semibold text-primary">
                  {suggestion.clubName}
                </span>
                {suggestion.tip && (
                  <span className="text-xs font-medium text-gold-dark ml-1">
                    — {suggestion.tip}
                  </span>
                )}
                <span className="text-xs text-text-faint ml-1">
                  ({suggestion.carry} yds)
                </span>
              </div>
            )}

            {!holeComplete && (
              <Button onClick={() => setShotEntryOpen(true)} className="w-full" size="lg">
                Hit Shot
              </Button>
            )}

            {holeComplete && !roundComplete && (
              <Button onClick={handleNextHole} className="w-full" size="lg">
                Next Hole
              </Button>
            )}

            {roundComplete && (
              <Button onClick={() => handleFinishRound()} className="w-full" size="lg" disabled={saving}>
                {saving ? 'Saving...' : 'Finish Round'}
              </Button>
            )}
          </div>
        )}

        <div className="h-6" />
      </div>

      {/* Scorecard modal */}
      <Modal open={scorecardOpen} onClose={() => setScorecardOpen(false)} title="Scorecard">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase text-text-muted">
                <th className="py-2 text-left font-medium">Hole</th>
                <th className="py-2 text-center font-medium">Par</th>
                <th className="py-2 text-center font-medium">Dist</th>
                <th className="py-2 text-center font-medium">Score</th>
                <th className="py-2 text-right font-medium">+/−</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((hole, i) => {
                const score = completedScores[i];
                const isCurrent = i === currentHoleIndex;
                return (
                  <tr
                    key={hole.number}
                    className={`border-b border-border/50 ${isCurrent ? 'bg-primary/5' : ''}`}
                  >
                    <td className="py-2 text-left font-medium text-text-dark">{hole.number}</td>
                    <td className="py-2 text-center text-text-muted">{hole.par}</td>
                    <td className="py-2 text-center text-text-muted">{hole.distanceYards}</td>
                    <td className="py-2 text-center font-semibold text-text-dark">
                      {score ? score.total : '—'}
                    </td>
                    <td className={`py-2 text-right font-medium ${
                      score
                        ? score.toPar < 0 ? 'text-primary'
                        : score.toPar === 0 ? 'text-text-muted'
                        : 'text-coral'
                        : 'text-text-faint'
                    }`}>
                      {score
                        ? score.toPar === 0 ? 'E' : score.toPar > 0 ? `+${score.toPar}` : score.toPar
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {completedScores.length > 0 && (
              <tfoot>
                <tr className="text-sm font-semibold">
                  <td className="pt-3 text-left text-text-dark">Total</td>
                  <td className="pt-3 text-center text-text-muted">
                    {holes.slice(0, currentHoleIndex + (holeComplete ? 1 : 0)).reduce((s, h) => s + h.par, 0)}
                  </td>
                  <td className="pt-3 text-center text-text-muted" />
                  <td className="pt-3 text-center text-text-dark">{totalScore}</td>
                  <td className={`pt-3 text-right ${
                    totalToPar < 0 ? 'text-primary' : totalToPar === 0 ? 'text-text-muted' : 'text-coral'
                  }`}>
                    {totalToPar === 0 ? 'E' : totalToPar > 0 ? `+${totalToPar}` : totalToPar}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Scoring zone summary */}
        {(() => {
          const szApplicable = completedScores.filter((s) => s.scoringZone.applicable);
          const szTotal = szApplicable.reduce((s, h) => s + h.scoringZone.delta, 0);
          if (szApplicable.length === 0) return null;
          return (
            <div className="mt-4 rounded-xl bg-surface px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-text-muted uppercase">Scoring Zone</span>
              <span className={`text-sm font-bold ${
                szTotal < 0 ? 'text-primary' : szTotal === 0 ? 'text-text-dark' : 'text-coral'
              }`}>
                {szTotal === 0 ? 'E' : szTotal > 0 ? `+${szTotal}` : szTotal}
              </span>
            </div>
          );
        })()}

        {/* Early exit */}
        {!roundComplete && completedScores.length > 0 && (
          <div className="mt-4">
            <Button
              variant="ghost"
              onClick={() => { setScorecardOpen(false); handleFinishRound(true); }}
              className="w-full"
              disabled={saving}
            >
              {saving ? 'Saving...' : `End Round (${completedScores.length} hole${completedScores.length !== 1 ? 's' : ''} played)`}
            </Button>
          </div>
        )}
      </Modal>

      <ShotInputSheet
        open={shotEntryOpen}
        onClose={() => setShotEntryOpen(false)}
        clubs={sortedClubs}
        suggestedClubId={selectedStrategyClubId ?? suggestion?.clubId}
        defaultFullShot={!suggestion?.tip}
        onAdd={handleAddShot}
      />
    </>
  );
}
