import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check } from 'lucide-react';
import { TopBar } from '../components/layout/TopBar';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { useYardageBook } from '../hooks/useYardageBook';
import { useAllClubs } from '../hooks/useClubs';
import { useWedgeOverrides } from '../hooks/useWedgeOverrides';
import { createSession } from '../hooks/useSessions';
import type { Club } from '../models/club';
import type { SwingPosition } from '../models/session';

interface ShotEntry {
  carryYards: number;
  totalYards?: number;
  ballSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
}

const SWING_POSITIONS: { key: SwingPosition; label: string; multiplier: number }[] = [
  { key: 'full', label: 'Full', multiplier: 1.0 },
  { key: 'shoulder', label: 'Shoulder', multiplier: 0.85 },
  { key: 'hip', label: 'Hip', multiplier: 0.65 },
];

interface CellKey {
  clubId: string;
  position: SwingPosition;
}

function cellKeyStr(clubId: string, position: string): string {
  return `${clubId}:${position}`;
}

export function WedgePracticePage() {
  const navigate = useNavigate();
  const entries = useYardageBook();
  const clubs = useAllClubs();
  const overrides = useWedgeOverrides();

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState('');
  const [shotData, setShotData] = useState<Map<string, ShotEntry[]>>(new Map());
  const [activeCell, setActiveCell] = useState<CellKey | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number>(0);

  // Auto-focus the inline input when a cell becomes active
  useEffect(() => {
    if (activeCell) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [activeCell]);

  // Build wedge list with full carry distances
  const wedges = useMemo(() => {
    if (!clubs || !entries) return undefined;
    const entryMap = new Map(entries.map((e) => [e.clubId, e]));
    return clubs
      .filter((c) => c.category === 'wedge')
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((club) => {
        const entry = entryMap.get(club.id);
        const fullCarry = entry?.bookCarry ?? club.manualCarry;
        return { club, fullCarry };
      })
      .filter((w): w is { club: Club; fullCarry: number } => w.fullCarry != null);
  }, [clubs, entries]);

  // Override map for target distances
  const overrideMap = useMemo(() => {
    if (!overrides) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const o of overrides) {
      map.set(cellKeyStr(o.clubId, o.position), o.carry);
    }
    return map;
  }, [overrides]);

  const getTarget = (clubId: string, fullCarry: number, pos: typeof SWING_POSITIONS[number]) => {
    const override = overrideMap.get(cellKeyStr(clubId, pos.key));
    if (override != null) return Math.round(override);
    return Math.round(fullCarry * pos.multiplier);
  };

  const totalShotCount = useMemo(() => {
    let count = 0;
    for (const shots of shotData.values()) count += shots.length;
    return count;
  }, [shotData]);

  // Running stats: average delta from target across all cells
  const avgDelta = useMemo(() => {
    if (!wedges || totalShotCount === 0) return null;
    let totalDelta = 0;
    let count = 0;
    for (const [key, shots] of shotData.entries()) {
      const [clubId, position] = key.split(':') as [string, SwingPosition];
      const wedge = wedges.find((w) => w.club.id === clubId);
      if (!wedge) continue;
      const pos = SWING_POSITIONS.find((p) => p.key === position);
      if (!pos) continue;
      const target = getTarget(clubId, wedge.fullCarry, pos);
      for (const shot of shots) {
        totalDelta += shot.carryYards - target;
        count++;
      }
    }
    return count > 0 ? totalDelta / count : null;
  }, [shotData, wedges, totalShotCount, overrideMap]);

  const handleCellTap = (clubId: string, position: SwingPosition) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    if (activeCell?.clubId === clubId && activeCell?.position === position) return;
    setActiveCell({ clubId, position });
    setInputValue('');
  };

  const handleAddShot = () => {
    if (!activeCell) return;
    const carry = parseFloat(inputValue);
    if (isNaN(carry) || carry <= 0) return;
    const key = cellKeyStr(activeCell.clubId, activeCell.position);
    const next = new Map(shotData);
    const existing = next.get(key) || [];
    next.set(key, [...existing, { carryYards: carry }]);
    setShotData(next);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddShot();
    } else if (e.key === 'Escape') {
      setActiveCell(null);
      setInputValue('');
    }
  };

  const handleInputBlur = () => {
    blurTimeoutRef.current = window.setTimeout(() => {
      setActiveCell(null);
      setInputValue('');
    }, 200);
  };

  const handleSaveSession = async () => {
    if (totalShotCount === 0) return;
    setSaving(true);

    try {
      const allShots: {
        clubId: string;
        position: SwingPosition;
        carryYards: number;
        totalYards?: number;
        ballSpeed?: number;
        launchAngle?: number;
        spinRate?: number;
        shotNumber: number;
      }[] = [];

      let shotNum = 1;
      for (const [key, shots] of shotData.entries()) {
        const [clubId, position] = key.split(':') as [string, SwingPosition];
        for (const shot of shots) {
          allShots.push({
            clubId,
            position,
            carryYards: shot.carryYards,
            totalYards: shot.totalYards,
            ballSpeed: shot.ballSpeed,
            launchAngle: shot.launchAngle,
            spinRate: shot.spinRate,
            shotNumber: shotNum++,
          });
        }
      }

      const sessionId = await createSession({
        type: 'wedge-distance',
        date: new Date(date).getTime(),
        location: location.trim() || undefined,
        source: 'manual',
        shots: allShots,
      });

      navigate(`/session/${sessionId}`);
    } catch (err) {
      console.error('Failed to save wedge practice session', err);
      setSaving(false);
    }
  };

  if (!wedges) return null;

  if (wedges.length === 0) {
    return (
      <>
        <TopBar title="Wedge Practice" showBack />
        <p className="py-8 text-center text-sm text-text-muted">
          No wedges in your bag with distance data. Add wedges and set carry distances first.
        </p>
      </>
    );
  }

  return (
    <>
      <TopBar title="Wedge Practice" showBack />
      <div className="px-4 py-4">
        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {/* Matrix grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2.5 pl-1 pr-3 text-left text-xs font-medium text-text-muted uppercase">
                  Club
                </th>
                {SWING_POSITIONS.map((pos) => (
                  <th
                    key={pos.key}
                    className="py-2.5 px-2 text-center text-xs font-medium text-text-muted uppercase"
                  >
                    {pos.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wedges.map(({ club, fullCarry }) => (
                <tr key={club.id} className="border-b border-border-light">
                  <td className="py-3 pl-1 pr-3 font-medium text-text-dark">
                    {club.name}
                  </td>
                  {SWING_POSITIONS.map((pos) => {
                    const target = getTarget(club.id, fullCarry, pos);
                    const key = cellKeyStr(club.id, pos.key);
                    const shots = shotData.get(key);
                    const hasShots = shots && shots.length > 0;
                    const avg = hasShots
                      ? Math.round(shots.reduce((s, sh) => s + sh.carryYards, 0) / shots.length)
                      : null;
                    const isActive =
                      activeCell?.clubId === club.id && activeCell?.position === pos.key;

                    return (
                      <td key={pos.key} className="py-3 px-2 text-center">
                        {isActive ? (
                          <div className="relative inline-block min-w-[3.5rem]">
                            <input
                              ref={inputRef}
                              type="number"
                              inputMode="decimal"
                              value={inputValue}
                              onChange={(e) => setInputValue(e.target.value)}
                              onKeyDown={handleKeyDown}
                              onBlur={handleInputBlur}
                              placeholder={String(target)}
                              className="w-16 rounded-lg border border-primary bg-surface px-2 py-1.5 text-center text-sm text-text-dark placeholder-text-faint focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            {hasShots && (
                              <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                                {shots.length}
                              </span>
                            )}
                            {avg != null && (
                              <div className="text-[10px] text-text-muted mt-0.5">
                                avg: {avg}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleCellTap(club.id, pos.key)}
                            className={`relative inline-block min-w-[3.5rem] rounded-lg px-2 py-1.5 transition ${
                              hasShots
                                ? 'bg-primary/10 font-bold text-primary ring-1 ring-primary/30'
                                : 'text-text-dark hover:bg-surface'
                            }`}
                          >
                            {hasShots ? (
                              <>
                                {avg}
                                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">
                                  {shots.length}
                                </span>
                              </>
                            ) : (
                              <span className="text-text-muted">{target}</span>
                            )}
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2 text-xs text-text-faint">
          Tap a cell, type carry, press Enter. Target distances shown in gray.
        </p>

        {/* Running session stats */}
        {totalShotCount > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl bg-surface px-4 py-2">
            <span className="text-sm text-text-medium">
              {totalShotCount} shot{totalShotCount !== 1 ? 's' : ''}
            </span>
            {avgDelta != null && (
              <span
                className={`text-sm font-semibold ${avgDelta >= 0 ? 'text-green-500' : 'text-coral'}`}
              >
                Avg {avgDelta >= 0 ? '+' : ''}
                {avgDelta.toFixed(1)} yds
              </span>
            )}
          </div>
        )}

        {/* Save button */}
        <div className="mt-6">
          <Button
            onClick={handleSaveSession}
            disabled={totalShotCount === 0 || saving}
            className="w-full"
            size="lg"
          >
            <Check size={18} />
            {saving ? 'Saving...' : `Save Session (${totalShotCount} shots)`}
          </Button>
        </div>
      </div>
    </>
  );
}
