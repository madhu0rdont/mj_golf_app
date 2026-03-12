import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { Loader2, Save, RotateCcw } from 'lucide-react';
import { Button } from '../ui/Button';
import { fetcher } from '../../lib/fetcher';

interface ConstantRow {
  key: string;
  value: number;
  category: string;
  description: string;
}

const CONSTANTS_KEY = '/api/admin/strategy-constants';

const CATEGORY_ORDER = [
  'lie', 'rollout', 'mode', 'sampling', 'threshold', 'spatial',
  'flight', 'putting', 'simulation', 'dp', 'club', 'hazard',
];

const CATEGORY_LABELS: Record<string, string> = {
  lie: 'Lie Multipliers',
  rollout: 'Surface Rollout',
  mode: 'Mode Weights',
  sampling: 'Sampling',
  threshold: 'Thresholds',
  spatial: 'Spatial Parameters',
  flight: 'Flight Model',
  putting: 'Putting Model',
  simulation: 'Simulation',
  dp: 'DP Convergence',
  club: 'Club Selection',
  hazard: 'Hazard',
};

export function StrategyConstantsEditor() {
  const { data: serverConstants, isLoading } = useSWR<ConstantRow[]>(CONSTANTS_KEY, fetcher);
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

  const dbMap = new Map((serverConstants ?? []).map((r) => [r.key, r.value]));

  function getValue(key: string): number {
    if (key in edits) return edits[key];
    return dbMap.get(key) ?? 0;
  }

  function getOriginal(key: string): number {
    return dbMap.get(key) ?? 0;
  }

  function updateValue(key: string, value: number) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function resetEdits() {
    setEdits({});
    setStatus(null);
  }

  const hasDirty = (serverConstants ?? []).some((c) => {
    const current = getValue(c.key);
    return current !== getOriginal(c.key);
  });

  // Group by category
  const grouped = new Map<string, ConstantRow[]>();
  for (const c of serverConstants ?? []) {
    const list = grouped.get(c.category) || [];
    list.push(c);
    grouped.set(c.category, list);
  }

  const sortedCategories = CATEGORY_ORDER.filter((cat) => grouped.has(cat));
  // Add any categories not in the predefined order
  for (const cat of grouped.keys()) {
    if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);

    const constants = (serverConstants ?? []).map((c) => ({
      key: c.key,
      value: getValue(c.key),
    }));

    try {
      const res = await fetch(CONSTANTS_KEY, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
        credentials: 'include',
        body: JSON.stringify({ constants }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body);
      }

      await mutate(CONSTANTS_KEY);
      setEdits({});
      setStatus({ type: 'success', message: 'Constants updated — plans will regenerate' });
    } catch (err) {
      setStatus({ type: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-muted">
        Tune strategy optimizer parameters. Changes trigger plan regeneration for all courses.
      </p>

      {sortedCategories.map((category) => {
        const items = grouped.get(category) ?? [];
        return (
          <div key={category} className="flex flex-col gap-1.5">
            <h4 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-1">
              {CATEGORY_LABELS[category] ?? category}
            </h4>
            <div className="flex flex-col gap-1">
              {items.map((c) => {
                const current = getValue(c.key);
                const original = getOriginal(c.key);
                const isDirty = current !== original;

                return (
                  <div
                    key={c.key}
                    className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-text-dark font-medium">{c.key}</span>
                      <p className="text-[10px] text-text-muted leading-tight truncate">{c.description}</p>
                    </div>
                    <input
                      type="number"
                      step={c.value < 1 ? '0.01' : c.value < 10 ? '0.1' : '1'}
                      value={current}
                      onChange={(e) => updateValue(c.key, parseFloat(e.target.value) || 0)}
                      className={`w-20 rounded border bg-card px-1.5 py-1 text-sm text-center text-text-dark focus:border-primary focus:outline-none ${
                        isDirty ? 'border-primary' : 'border-border'
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving || !hasDirty} className="flex-1">
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
        {hasDirty && (
          <Button onClick={resetEdits} variant="ghost" className="px-3">
            <RotateCcw size={16} />
          </Button>
        )}
      </div>

      {status && (
        <p className={`text-xs ${status.type === 'success' ? 'text-primary' : 'text-coral'}`}>
          {status.message}
        </p>
      )}
    </div>
  );
}
