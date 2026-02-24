import { useMemo } from 'react';
import { Link } from 'react-router';
import { useYardageBook } from '../../hooks/useYardageBook';
import { useAllClubs } from '../../hooks/useClubs';
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
            {group.items.map(({ club, entry }) => {
              const carry = entry?.bookCarry ?? club.manualCarry;
              const total = entry?.bookTotal ?? club.manualTotal;
              const hasData = !!entry;

              return (
                <Link
                  key={club.id}
                  to={`/yardage/${club.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface transition"
                >
                  <span className={`text-sm font-medium ${hasData ? 'text-text-dark' : 'text-text-muted italic'}`}>
                    {club.name}
                  </span>
                  <div className="flex items-baseline gap-2">
                    {carry != null ? (
                      <>
                        <span className={`text-base font-bold ${hasData ? 'text-primary' : 'text-text-muted'}`}>
                          {Math.round(carry)}
                        </span>
                        {total != null && (
                          <span className="text-xs text-text-muted">
                            / {Math.round(total)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-text-faint">—</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
