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
      className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 p-0 text-white backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white">
          <X size={20} />
        </button>
      </div>
      <div className="px-4 py-4">{children}</div>
    </dialog>
  );
}
