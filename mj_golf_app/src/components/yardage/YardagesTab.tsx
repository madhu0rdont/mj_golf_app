import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useYardageBook } from '../../hooks/useYardageBook';
import { useAllClubs, updateClub } from '../../hooks/useClubs';
import { imputeFromCarryAndLoft } from '../../services/impute';
import type { Club, ClubCategory } from '../../models/club';
import type { YardageBookEntry } from '../../models/yardage';

const CATEGORY_LABELS: Record<ClubCategory, string> = {
  driver: 'Driver',
  wood: 'Woods',
  hybrid: 'Hybrids',
  iron: 'Irons',
  wedge: 'Wedges',
  putter: 'Putter',
};

const CATEGORY_ORDER: ClubCategory[] = ['driver', 'wood', 'hybrid', 'iron', 'wedge', 'putter'];

interface EditingState {
  clubId: string;
  field: 'carry';
  value: string;
}

function YardageRow({ club, entry }: { club: Club; entry?: YardageBookEntry }) {
  const [editing, setEditing] = useState<EditingState | null>(null);

  const carry = entry?.bookCarry ?? club.manualCarry;
  // Show manual total if set, otherwise impute from carry + loft
  const imputedTotal = (!entry && carry != null && club.loft)
    ? imputeFromCarryAndLoft(carry, club.loft).total
    : undefined;
  const total = entry?.bookTotal ?? club.manualTotal ?? imputedTotal;
  const hasData = !!entry;

  const handleTapCarry = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditing({ clubId: club.id, field: 'carry', value: carry != null ? String(Math.round(carry)) : '' });
  };

  const handleSave = async () => {
    if (!editing) return;
    const num = parseFloat(editing.value);
    await updateClub(club.id, { manualCarry: isNaN(num) ? undefined : num, manualTotal: null });
    setEditing(null);
  };

  const isEditingCarry = editing?.field === 'carry';

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <Link
        to={`/yardage/${club.id}`}
        className={`text-sm font-medium hover:underline ${hasData ? 'text-text-dark' : 'text-text-muted italic'}`}
      >
        {club.name}
      </Link>
      <div className="flex items-baseline gap-1.5">
        {isEditingCarry ? (
          <input
            type="number"
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
            onBlur={handleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(null);
            }}
            className="w-14 rounded border border-primary bg-surface px-1.5 py-0.5 text-center text-base font-bold text-primary outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={handleTapCarry}
            className={`rounded px-1.5 py-0.5 text-base font-bold transition hover:bg-surface ${
              hasData ? 'text-primary' : 'text-text-muted'
            }`}
            title="Tap to edit carry"
          >
            {carry != null ? Math.round(carry) : '—'}
          </button>
        )}

        <span className="text-xs text-text-faint">/</span>

        <span className="px-1 py-0.5 text-xs text-text-muted">
          {total != null ? Math.round(total) : '—'}
        </span>
      </div>
    </div>
  );
}

export function YardagesTab() {
  const entries = useYardageBook();
  const clubs = useAllClubs();

  const grouped = useMemo(() => {
    if (!clubs || !entries) return undefined;

    const entryMap = new Map<string, YardageBookEntry>();
    for (const e of entries) entryMap.set(e.clubId, e);

    const groups: { category: ClubCategory; label: string; items: { club: Club; entry?: YardageBookEntry }[] }[] = [];

    for (const cat of CATEGORY_ORDER) {
      const clubsInCat = clubs
        .filter((c) => c.category === cat)
        .sort((a, b) => a.sortOrder - b.sortOrder);

      if (clubsInCat.length === 0) continue;

      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: clubsInCat.map((club) => ({ club, entry: entryMap.get(club.id) })),
      });
    }

    return groups;
  }, [clubs, entries]);

  if (!grouped) return null;

  return (
    <div className="space-y-4">
      {grouped.map((group) => (
        <div key={group.category}>
          <h3 className="mb-1.5 text-xs font-medium text-text-muted uppercase tracking-wide">
            {group.label}
          </h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border-light">
            {group.items.map(({ club, entry }) => (
              <YardageRow key={club.id} club={club} entry={entry} />
            ))}
          </div>
        </div>
      ))}

      <p className="text-xs text-text-faint text-center">
        Tap carry to edit. Total is auto-calculated. Tap club name for details.
      </p>
    </div>
  );
}
