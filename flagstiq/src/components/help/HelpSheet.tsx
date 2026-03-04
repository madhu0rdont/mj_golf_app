import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface HelpSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function HelpSheet({ open, onClose, title, children }: HelpSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-[20px] border border-border bg-card p-0 text-text-dark shadow-[var(--shadow-card)] backdrop:bg-black/30"
      style={{ maxHeight: '85vh' }}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3 rounded-t-[20px]">
        <h2 className="font-display text-lg font-bold text-text-dark">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-dark">
          <X size={20} />
        </button>
      </div>
      <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: 'calc(85vh - 52px)' }}>
        {children}
      </div>
    </dialog>
  );
}
