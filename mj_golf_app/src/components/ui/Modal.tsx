import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
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
      className="w-full max-w-lg rounded-2xl border border-border bg-card p-0 text-text-dark shadow-[var(--shadow-card)] backdrop:bg-black/30"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold text-text-dark">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-dark">
          <X size={20} />
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </dialog>
  );
}
