import { useEffect, useRef, useState } from 'react';
import { Plus, X, ChevronDown } from 'lucide-react';
import { Button } from '../ui/Button';

export interface ShotEntry {
  carryYards: number;
  totalYards?: number;
  ballSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
}

interface ShotEntrySheetProps {
  open: boolean;
  onClose: () => void;
  clubName: string;
  positionLabel: string;
  targetYards: number;
  initialShots: ShotEntry[];
  onSave: (shots: ShotEntry[]) => void;
}

export function ShotEntrySheet({
  open,
  onClose,
  clubName,
  positionLabel,
  targetYards,
  initialShots,
  onSave,
}: ShotEntrySheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedData, setAdvancedData] = useState<Map<number, Partial<ShotEntry>>>(new Map());
  const lastInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      const initial = initialShots.length > 0
        ? initialShots.map((s) => String(s.carryYards))
        : [''];
      setRows(initial);

      // Restore advanced data from initial shots
      const adv = new Map<number, Partial<ShotEntry>>();
      initialShots.forEach((s, i) => {
        const entry: Partial<ShotEntry> = {};
        if (s.totalYards != null) entry.totalYards = s.totalYards;
        if (s.ballSpeed != null) entry.ballSpeed = s.ballSpeed;
        if (s.launchAngle != null) entry.launchAngle = s.launchAngle;
        if (s.spinRate != null) entry.spinRate = s.spinRate;
        if (Object.keys(entry).length > 0) adv.set(i, entry);
      });
      setAdvancedData(adv);

      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open, initialShots]);

  const addRow = () => {
    setRows([...rows, '']);
    setTimeout(() => lastInputRef.current?.focus(), 50);
  };

  const updateRow = (idx: number, value: string) => {
    const next = [...rows];
    next[idx] = value;
    setRows(next);
  };

  const removeRow = (idx: number) => {
    if (rows.length <= 1) {
      setRows(['']);
      return;
    }
    setRows(rows.filter((_, i) => i !== idx));
    const next = new Map(advancedData);
    next.delete(idx);
    setAdvancedData(next);
  };

  const updateAdvanced = (idx: number, field: string, value: string) => {
    const next = new Map(advancedData);
    const entry = next.get(idx) || {};
    const num = parseFloat(value);
    (entry as Record<string, number | undefined>)[field] = isNaN(num) ? undefined : num;
    next.set(idx, entry);
    setAdvancedData(next);
  };

  const validCarries = rows.filter((r) => {
    const n = parseFloat(r);
    return !isNaN(n) && n > 0;
  });

  const avg = validCarries.length > 0
    ? validCarries.reduce((sum, r) => sum + parseFloat(r), 0) / validCarries.length
    : null;

  const handleSave = () => {
    const shots: ShotEntry[] = [];
    rows.forEach((r, i) => {
      const carry = parseFloat(r);
      if (isNaN(carry) || carry <= 0) return;
      const adv = advancedData.get(i);
      shots.push({ carryYards: carry, ...adv });
    });
    onSave(shots);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-0 text-text-dark shadow-[var(--shadow-card)] backdrop:bg-black/30 fixed bottom-0 m-0 mx-auto"
      style={{ maxHeight: '80vh' }}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-text-dark">
            {clubName} — {positionLabel}
          </h2>
          <p className="text-xs text-text-muted">Target: {targetYards} yds</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-dark">
          <X size={20} />
        </button>
      </div>

      <div className="overflow-y-auto px-4 py-3" style={{ maxHeight: 'calc(80vh - 140px)' }}>
        <div className="flex flex-col gap-2">
          {rows.map((value, i) => (
            <div key={i}>
              <div className="flex items-center gap-2">
                <span className="w-6 text-xs text-text-muted text-right">{i + 1}.</span>
                <input
                  ref={i === rows.length - 1 ? lastInputRef : undefined}
                  type="number"
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => updateRow(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRow();
                    }
                  }}
                  placeholder="Carry yds"
                  className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-text-dark placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-text-muted">yds</span>
                <button
                  onClick={() => removeRow(i)}
                  className="rounded p-1 text-text-muted hover:text-coral"
                >
                  <X size={14} />
                </button>
              </div>

              {advancedOpen && (
                <div className="ml-8 mt-1 grid grid-cols-2 gap-1.5">
                  {(['totalYards', 'ballSpeed', 'launchAngle', 'spinRate'] as const).map((field) => (
                    <input
                      key={field}
                      type="number"
                      inputMode="decimal"
                      value={advancedData.get(i)?.[field] ?? ''}
                      onChange={(e) => updateAdvanced(i, field, e.target.value)}
                      placeholder={field === 'totalYards' ? 'Total' : field === 'ballSpeed' ? 'Ball Spd' : field === 'launchAngle' ? 'Launch°' : 'Spin RPM'}
                      className="rounded border border-border-light bg-surface px-2 py-1 text-xs text-text-dark placeholder-text-faint focus:border-primary focus:outline-none"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-sm text-primary hover:text-primary-light"
          >
            <Plus size={14} /> Add Shot
          </button>

          <button
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-medium"
          >
            Advanced fields
            <ChevronDown
              size={12}
              className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        {avg != null && (
          <div className="mt-3 rounded-lg bg-surface px-3 py-2 text-center">
            <span className="text-xs text-text-muted">Avg: </span>
            <span className="text-sm font-bold text-primary">
              {Math.round(avg * 10) / 10}
            </span>
            <span className="text-xs text-text-muted"> yds</span>
            {targetYards > 0 && (
              <span className={`ml-2 text-xs font-medium ${Math.round(avg) - targetYards >= 0 ? 'text-green-600' : 'text-coral'}`}>
                ({Math.round(avg) - targetYards >= 0 ? '+' : ''}{Math.round(avg - targetYards)})
              </span>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleSave} className="w-full" disabled={validCarries.length === 0}>
          Done ({validCarries.length} shot{validCarries.length !== 1 ? 's' : ''})
        </Button>
      </div>
    </dialog>
  );
}
