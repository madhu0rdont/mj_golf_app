import { useMemo, useState } from 'react';
import { useYardageBook } from '../../hooks/useYardageBook';
import { useAllClubs } from '../../hooks/useClubs';
import { useWedgeOverrides, setWedgeOverride, removeWedgeOverride } from '../../hooks/useWedgeOverrides';
import type { Club } from '../../models/club';

const CLOCK_POSITIONS = [
  { key: 'full', label: 'Full', multiplier: 1.0 },
  { key: '10:30', label: '10:30', multiplier: 0.85 },
  { key: '9:00', label: '9:00', multiplier: 0.75 },
  { key: '7:30', label: '7:30', multiplier: 0.58 },
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

  const getDistance = (clubId: string, fullCarry: number, position: typeof CLOCK_POSITIONS[number]) => {
    const key = `${clubId}:${position.key}`;
    const override = overrideMap.get(key);
    if (override != null) return { value: Math.round(override), isOverride: true };
    return { value: Math.round(fullCarry * position.multiplier), isOverride: false };
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
            {CLOCK_POSITIONS.map((pos) => (
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
              {CLOCK_POSITIONS.map((pos) => {
                const { value, isOverride } = getDistance(club.id, fullCarry, pos);
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
                        onDoubleClick={() => isOverride && handleReset(club.id, pos.key)}
                        className={`inline-block min-w-[3rem] rounded px-2 py-1 transition ${
                          pos.key === 'full'
                            ? 'font-bold text-primary'
                            : isOverride
                              ? 'font-semibold text-gold-dark underline decoration-gold/40 decoration-1 underline-offset-2'
                              : 'text-text-dark'
                        } hover:bg-surface`}
                        title={isOverride ? 'Double-tap to reset to auto' : 'Tap to override'}
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
        Tap a distance to override. Double-tap an override to reset.
      </p>
    </div>
  );
}
