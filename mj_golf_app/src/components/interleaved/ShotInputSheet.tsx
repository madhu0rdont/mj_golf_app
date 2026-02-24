import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Club } from '../../models/club';

interface ShotInputSheetProps {
  open: boolean;
  onClose: () => void;
  clubs: Club[];
  onAdd: (clubId: string, carryYards: number, offlineYards: number) => void;
}

export function ShotInputSheet({ open, onClose, clubs, onAdd }: ShotInputSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const carryRef = useRef<HTMLInputElement>(null);
  const [clubId, setClubId] = useState('');
  const [carry, setCarry] = useState('');
  const [offline, setOffline] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      setCarry('');
      setOffline('');
      if (!clubId && clubs.length > 0) setClubId(clubs[0].id);
      dialog.showModal();
      setTimeout(() => carryRef.current?.focus(), 100);
    } else {
      dialog.close();
    }
  }, [open, clubs, clubId]);

  const carryNum = parseFloat(carry);
  const offlineNum = parseFloat(offline) || 0;
  const isValid = !isNaN(carryNum) && carryNum > 0 && clubId;

  const handleAdd = () => {
    if (!isValid) return;
    onAdd(clubId, carryNum, offlineNum);
    onClose();
  };

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
          <label className="block text-xs font-medium text-text-muted mb-1">Club</label>
          <select
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text-dark focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button onClick={handleAdd} className="w-full" disabled={!isValid}>
          Add Shot
        </Button>
      </div>
    </dialog>
  );
}
