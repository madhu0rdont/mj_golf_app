import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '../../lib/fetcher';
import { useYardageBook, computeWeight } from '../../hooks/useYardageBook';
import { useAllClubs } from '../../hooks/useClubs';
import { useWedgeOverrides, setWedgeOverride, removeWedgeOverride } from '../../hooks/useWedgeOverrides';
import type { Club } from '../../models/club';
import type { Session, Shot } from '../../models/session';

const SWING_POSITIONS = [
  { key: 'full', label: 'Full', multiplier: 1.0 },
  { key: 'shoulder', label: 'Shoulder', multiplier: 0.85 },
  { key: 'hip', label: 'Hip', multiplier: 0.65 },
];

interface EditingCell {
  clubId: string;
  position: string;
  value: string;
}

export function WedgeMatrixTab() {
  const entries = useYardageBook();
  const clubs = useAllClubs();
  const overrides = useWedgeOverrides();
  const { data: allSessions } = useSWR<Session[]>('/api/sessions?all=true', fetcher);
  const { data: allShots } = useSWR<Shot[]>('/api/shots', fetcher);
  const [editing, setEditing] = useState<EditingCell | null>(null);

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

  const overrideMap = useMemo(() => {
    if (!overrides) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const o of overrides) {
      map.set(`${o.clubId}:${o.position}`, o.carry);
    }
    return map;
  }, [overrides]);

  // Compute weighted averages from wedge-distance practice sessions
  const practiceAvgs = useMemo(() => {
    if (!allSessions || !allShots) return new Map<string, number>();

    const now = Date.now();
    const wedgeSessions = new Set(
      allSessions.filter((s) => s.type === 'wedge-distance').map((s) => s.id)
    );
    const sessionDateMap = new Map(allSessions.map((s) => [s.id, s.date]));

    // Group practice shots by club+position, with session date for weighting
    const grouped = new Map<string, { carry: number; date: number }[]>();
    for (const shot of allShots) {
      if (!wedgeSessions.has(shot.sessionId) || !shot.position) continue;
      const key = `${shot.clubId}:${shot.position}`;
      const list = grouped.get(key) || [];
      list.push({ carry: shot.carryYards, date: sessionDateMap.get(shot.sessionId) ?? now });
      grouped.set(key, list);
    }

    // Weighted average using exponential decay (30-day half-life)
    const avgs = new Map<string, number>();
    for (const [key, dataPoints] of grouped.entries()) {
      let totalWeight = 0;
      let weightedSum = 0;
      for (const { carry, date } of dataPoints) {
        const daysAgo = (now - date) / (1000 * 60 * 60 * 24);
        const weight = computeWeight(daysAgo);
        weightedSum += carry * weight;
        totalWeight += weight;
      }
      if (totalWeight > 0) {
        avgs.set(key, Math.round(weightedSum / totalWeight));
      }
    }

    return avgs;
  }, [allSessions, allShots]);

  // Distance priority: practice avg > override > multiplier × full carry
  const getDistance = (clubId: string, fullCarry: number, position: typeof SWING_POSITIONS[number]) => {
    const key = `${clubId}:${position.key}`;

    const practiceAvg = practiceAvgs.get(key);
    if (practiceAvg != null) return { value: practiceAvg, source: 'practice' as const };

    const override = overrideMap.get(key);
    if (override != null) return { value: Math.round(override), source: 'override' as const };

    return { value: Math.round(fullCarry * position.multiplier), source: 'calculated' as const };
  };

  const handleCellTap = (clubId: string, position: string, currentValue: number) => {
    setEditing({ clubId, position, value: String(currentValue) });
  };

  const handleSave = async () => {
    if (!editing) return;
    const carry = parseFloat(editing.value);
    if (isNaN(carry) || carry <= 0) {
      setEditing(null);
      return;
    }
    await setWedgeOverride(editing.clubId, editing.position, carry);
    setEditing(null);
  };

  const handleReset = async (clubId: string, position: string) => {
    await removeWedgeOverride(clubId, position);
  };

  if (!wedges) return null;

  if (wedges.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        No wedges in your bag with distance data.
      </p>
    );
  }

  return (
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
                const { value, source } = getDistance(club.id, fullCarry, pos);
                const isEditing = editing?.clubId === club.id && editing?.position === pos.key;

                return (
                  <td key={pos.key} className="py-3 px-2 text-center">
                    {isEditing ? (
                      <input
                        type="number"
                        value={editing.value}
                        onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                        onBlur={handleSave}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSave();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                        className="w-14 rounded border border-primary bg-surface px-1.5 py-1 text-center text-sm font-bold text-primary outline-none"
                        autoFocus
                      />
                    ) : (
                      <button
                        onClick={() => handleCellTap(club.id, pos.key, value)}
                        onDoubleClick={() => source !== 'calculated' && handleReset(club.id, pos.key)}
                        className={`inline-block min-w-[3rem] rounded px-2 py-1 transition ${
                          pos.key === 'full'
                            ? 'font-bold text-primary'
                            : source === 'practice'
                              ? 'font-semibold text-primary'
                              : source === 'override'
                                ? 'font-semibold text-gold-dark underline decoration-gold/40 decoration-1 underline-offset-2'
                                : 'text-text-dark'
                        } hover:bg-surface`}
                        title={
                          source === 'practice'
                            ? 'From practice data (tap to override)'
                            : source === 'override'
                              ? 'Manual override (double-tap to reset)'
                              : 'Auto-calculated (tap to override)'
                        }
                      >
                        {value}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-xs text-text-faint">
        Distances from practice are weighted by recency. Tap to override, double-tap to reset.
      </p>
    </div>
  );
}
