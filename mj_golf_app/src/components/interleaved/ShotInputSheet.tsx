import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Club } from '../../models/club';

interface ShotInputSheetProps {
  open: boolean;
  onClose: () => void;
  clubs: Club[];
  suggestedClubId?: string;
  defaultFullShot?: boolean;
  onAdd: (clubId: string, carryYards: number, offlineYards: number, fullShot: boolean) => void;
}

export function ShotInputSheet({ open, onClose, clubs, suggestedClubId, defaultFullShot = true, onAdd }: ShotInputSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const carryRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState('');
  const [carry, setCarry] = useState('');
  const [offline, setOffline] = useState('');
  const [fullShot, setFullShot] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setCarry('');
      setOffline('');
      setFullShot(defaultFullShot);
      // Pre-select suggested club, or keep current selection, or fall back to first club
      if (suggestedClubId) {
        setClubId(suggestedClubId);
      } else if (!clubId && clubs.length > 0) {
        setClubId(clubs[0].id);
      }
      dialog.showModal();
      setTimeout(() => carryRef.current?.focus(), 100);
    } else {
      dialog.close();
    }
  }, [open, clubs, suggestedClubId, defaultFullShot]); // eslint-disable-line react-hooks/exhaustive-deps

  const carryNum = parseFloat(carry);
  const offlineNum = parseFloat(offline) || 0;
  const isValid = !isNaN(carryNum) && carryNum > 0 && clubId;

  const handleAdd = () => {
    if (!isValid) return;
    onAdd(clubId, carryNum, offlineNum, fullShot);
    onClose();
  };

  const isSuggested = suggestedClubId === clubId;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-t-2xl border border-border bg-card p-0 text-text-dark shadow-[var(--shadow-card)] backdrop:bg-black/30 fixed bottom-0 m-0 mx-auto"
      style={{ maxHeight: '60vh' }}
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-text-dark">Hit Shot</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-dark">
          <X size={20} />
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-text-muted">Club</label>
            {isSuggested && (
              <span className="text-[10px] font-medium text-primary">Recommended</span>
            )}
          </div>
          <select
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className={`w-full rounded-lg border bg-surface px-3 py-2.5 text-text-dark focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
              isSuggested ? 'border-primary/40' : 'border-border'
            }`}
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.id === suggestedClubId ? ' *' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-muted mb-1">Carry (yds)</label>
            <input
              ref={carryRef}
              type="number"
              inputMode="decimal"
              value={carry}
              onChange={(e) => setCarry(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="250"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text-dark placeholder-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-text-muted mb-1">Offline (yds)</label>
            <input
              type="number"
              inputMode="numeric"
              value={offline}
              onChange={(e) => setOffline(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text-dark placeholder-text-faint focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[10px] text-text-faint">+ right, - left</p>
          </div>
        </div>

        {/* Full shot toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFullShot(!fullShot)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              fullShot ? 'bg-primary' : 'bg-border'
            }`}
            aria-label="Full shot"
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                fullShot ? 'translate-x-4' : ''
              }`}
            />
          </button>
          <span className="text-xs text-text-medium">
            Full shot
          </span>
          <span className="text-[10px] text-text-faint">
            (counts toward yardage book)
          </span>
        </div>
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleAdd} className="w-full" disabled={!isValid}>
          Add Shot
        </Button>
      </div>
    </dialog>
  );
}
