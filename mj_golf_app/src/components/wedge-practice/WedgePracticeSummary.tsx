import { useMemo } from 'react';
import { useAllClubs } from '../../hooks/useClubs';
import { useYardageBook } from '../../hooks/useYardageBook';
import { useWedgeOverrides } from '../../hooks/useWedgeOverrides';
import type { Session, Shot, SwingPosition } from '../../models/session';

const SWING_POSITIONS: { key: SwingPosition; label: string; multiplier: number }[] = [
  { key: 'full', label: 'Full', multiplier: 1.0 },
  { key: 'shoulder', label: 'Shoulder', multiplier: 0.85 },
  { key: 'hip', label: 'Hip', multiplier: 0.65 },
];

interface WedgePracticeSummaryProps {
  session: Session;
  shots: Shot[];
}

interface CellData {
  shots: Shot[];
  avgCarry: number;
  target: number;
  delta: number;
}

export function WedgePracticeSummary({ session, shots }: WedgePracticeSummaryProps) {
  const clubs = useAllClubs();
  const entries = useYardageBook();
  const overrides = useWedgeOverrides();

  const clubMap = useMemo(() => {
    if (!clubs) return new Map<string, string>();
    return new Map(clubs.map((c) => [c.id, c.name]));
  }, [clubs]);

  // Get target distances for each cell
  const overrideMap = useMemo(() => {
    if (!overrides) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const o of overrides) map.set(`${o.clubId}:${o.position}`, o.carry);
    return map;
  }, [overrides]);

  const entryMap = useMemo(() => {
    if (!entries) return new Map<string, number>();
    return new Map(entries.map((e) => [e.clubId, e.bookCarry]));
  }, [entries]);

  // Group shots by club + position
  const { wedgeIds, cellMap } = useMemo(() => {
    const byCell = new Map<string, Shot[]>();
    const clubIds = new Set<string>();

    for (const shot of shots) {
      if (!shot.position) continue;
      const key = `${shot.clubId}:${shot.position}`;
      const list = byCell.get(key) || [];
      list.push(shot);
      byCell.set(key, list);
      clubIds.add(shot.clubId);
    }

    // Sort wedges by their sort order in the clubs list
    const ordered = clubs
      ?.filter((c) => clubIds.has(c.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id) ?? [...clubIds];

    const cellData = new Map<string, CellData>();
    for (const [key, cellShots] of byCell.entries()) {
      const [clubId, position] = key.split(':');
      const fullCarry = entryMap.get(clubId) ??
        clubs?.find((c) => c.id === clubId)?.manualCarry ?? 0;
      const pos = SWING_POSITIONS.find((p) => p.key === position);
      const override = overrideMap.get(key);
      const target = override ?? Math.round(fullCarry * (pos?.multiplier ?? 1));
      const avg = cellShots.reduce((s, sh) => s + sh.carryYards, 0) / cellShots.length;

      cellData.set(key, {
        shots: cellShots,
        avgCarry: Math.round(avg * 10) / 10,
        target,
        delta: Math.round(avg - target),
      });
    }

    return { wedgeIds: ordered, cellMap: cellData };
  }, [shots, clubs, entryMap, overrideMap]);

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
        <h2 className="text-xl font-bold">Wedge Distance Practice</h2>
        <p className="text-sm text-text-medium">
          {dateStr} &middot; {shots.length} shots
          {session.location && ` at ${session.location}`}
        </p>
      </div>

      {/* Results matrix */}
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
            {wedgeIds.map((clubId) => (
              <tr key={clubId} className="border-b border-border-light">
                <td className="py-3 pl-1 pr-3 font-medium text-text-dark">
                  {clubMap.get(clubId) || clubId}
                </td>
                {SWING_POSITIONS.map((pos) => {
                  const key = `${clubId}:${pos.key}`;
                  const cell = cellMap.get(key);

                  if (!cell) {
                    return (
                      <td key={pos.key} className="py-3 px-2 text-center text-text-faint">
                        —
                      </td>
                    );
                  }

                  return (
                    <td key={pos.key} className="py-3 px-2 text-center">
                      <div className="font-bold text-primary">{Math.round(cell.avgCarry)}</div>
                      <div className="flex items-center justify-center gap-1 text-[10px]">
                        <span className={cell.delta >= 0 ? 'text-green-600' : 'text-coral'}>
                          {cell.delta >= 0 ? '+' : ''}{cell.delta}
                        </span>
                        <span className="text-text-faint">
                          ({cell.shots.length})
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Per-cell shot details */}
      <div className="mt-4 space-y-3">
        {wedgeIds.map((clubId) =>
          SWING_POSITIONS.map((pos) => {
            const key = `${clubId}:${pos.key}`;
            const cell = cellMap.get(key);
            if (!cell) return null;

            return (
              <div key={key} className="rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-dark">
                    {clubMap.get(clubId)} — {pos.label}
                  </span>
                  <span className="text-xs text-text-muted">
                    Target: {cell.target} yds
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cell.shots.map((shot, i) => {
                    const diff = Math.round(shot.carryYards - cell.target);
                    return (
                      <div
                        key={i}
                        className="rounded-lg bg-surface px-2.5 py-1 text-center"
                      >
                        <div className="text-sm font-medium text-text-dark">
                          {Math.round(shot.carryYards)}
                        </div>
                        <div className={`text-[10px] ${diff >= 0 ? 'text-green-600' : 'text-coral'}`}>
                          {diff >= 0 ? '+' : ''}{diff}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
