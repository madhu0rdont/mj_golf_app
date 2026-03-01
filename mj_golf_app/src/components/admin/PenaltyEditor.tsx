import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Loader2, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import { fetcher } from '../../lib/fetcher';

const HAZARD_TYPES = [
  { type: 'fairway_bunker', label: 'Fairway Bunker' },
  { type: 'greenside_bunker', label: 'Greenside Bunker' },
  { type: 'bunker', label: 'Bunker' },
  { type: 'water', label: 'Water' },
  { type: 'ob', label: 'OB' },
  { type: 'trees', label: 'Trees' },
  { type: 'rough', label: 'Rough' },
] as const;

const HAZARD_TYPE_COLORS: Record<string, string> = {
  fairway_bunker: 'bg-yellow-500/20 text-yellow-700',
  greenside_bunker: 'bg-orange-500/20 text-orange-700',
  bunker: 'bg-yellow-500/20 text-yellow-700',
  water: 'bg-blue-500/20 text-blue-700',
  ob: 'bg-red-500/20 text-red-700',
  trees: 'bg-green-500/20 text-green-700',
  rough: 'bg-amber-700/20 text-amber-800',
};

interface PenaltyRow {
  type: string;
  penalty: number;
}

const PENALTIES_KEY = '/api/admin/hazard-penalties';

export function PenaltyEditor() {
  const { data: serverPenalties, isLoading } = useSWR<PenaltyRow[]>(PENALTIES_KEY, fetcher);
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={20} className="animate-spin text-text-muted" />
      </div>
    );
  }

  // Build a map of type → current DB penalty
  const dbMap = new Map((serverPenalties ?? []).map((r) => [r.type, r.penalty]));

  function getPenalty(type: string, defaultPenalty: number): number {
    if (type in edits) return edits[type];
    return dbMap.get(type) ?? defaultPenalty;
  }

  function getOriginalPenalty(type: string, defaultPenalty: number): number {
    return dbMap.get(type) ?? defaultPenalty;
  }

  function updatePenalty(type: string, value: number) {
    setEdits((prev) => ({ ...prev, [type]: value }));
  }

  const hasDirty = HAZARD_TYPES.some((ht) => {
    const original = getOriginalPenalty(ht.type, 0);
    const current = getPenalty(ht.type, 0);
    return current !== original;
  });

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    // Build payload with all current values (only changed ones matter, but send all for simplicity)
    const penalties = HAZARD_TYPES.map((ht) => ({
      type: ht.type,
      penalty: getPenalty(ht.type, 0),
    }));

    try {
      const res = await fetch(PENALTIES_KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ penalties }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }

      await mutate(PENALTIES_KEY);
      setEdits({});
      setStatus({ type: 'success', message: 'Penalties updated across all courses' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-muted">
        Set penalty strokes by hazard type. Changes apply across all courses.
      </p>

      <div className="flex flex-col gap-2">
        {HAZARD_TYPES.map((ht) => {
          const current = getPenalty(ht.type, 0);
          const original = getOriginalPenalty(ht.type, 0);
          const isDirty = current !== original;

          return (
            <div
              key={ht.type}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5"
            >
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  HAZARD_TYPE_COLORS[ht.type] ?? 'bg-gray-500/20 text-gray-700'
                }`}
              >
                {ht.label}
              </span>
              <span className="flex-1" />
              <input
                type="number"
                step="0.1"
                min="0"
                value={current}
                onChange={(e) => updatePenalty(ht.type, parseFloat(e.target.value) || 0)}
                className={`w-16 rounded border bg-card px-1.5 py-1 text-sm text-center text-text-dark focus:border-primary focus:outline-none ${
                  isDirty ? 'border-primary' : 'border-border'
                }`}
              />
            </div>
          );
        })}
      </div>

      <Button onClick={handleSave} disabled={saving || !hasDirty} className="w-full">
        {saving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <Save size={16} />
            Save All
          </>
        )}
      </Button>

      {status && (
        <p className={`text-xs ${status.type === 'success' ? 'text-primary' : 'text-coral'}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
