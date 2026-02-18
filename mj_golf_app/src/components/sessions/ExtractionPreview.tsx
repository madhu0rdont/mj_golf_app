import { ShotTable, type ShotRow } from './ShotTable';
import { Button } from '../ui/Button';
import { AlertTriangle } from 'lucide-react';

interface ExtractionPreviewProps {
  shots: ShotRow[];
  warnings: string[];
  onConfirm: (shots: ShotRow[]) => void;
  onRetry: () => void;
  onManualFallback: () => void;
  onChange: (index: number, field: keyof ShotRow, value: string) => void;
  onDelete: (index: number) => void;
}

export function ExtractionPreview({
  shots,
  warnings,
  onConfirm,
  onRetry,
  onManualFallback,
  onChange,
  onDelete,
}: ExtractionPreviewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-medium">
          Extracted {shots.length} shot{shots.length !== 1 ? 's' : ''}
        </h3>
        <span className="text-xs text-text-muted">Tap any value to edit</span>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-medium text-amber-700">
            <AlertTriangle size={14} />
            {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
          </div>
          <ul className="text-xs text-amber-600">
            {warnings.slice(0, 5).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {warnings.length > 5 && <li>...and {warnings.length - 5} more</li>}
          </ul>
        </div>
      )}

      <ShotTable shots={shots} onChange={onChange} onDelete={onDelete} />

      <div className="flex flex-col gap-2">
        <Button onClick={() => onConfirm(shots)} size="lg" className="w-full">
          Looks Good — Save Session
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onRetry} className="flex-1">
            Re-extract
          </Button>
          <Button variant="ghost" onClick={onManualFallback} className="flex-1">
            Switch to Manual
          </Button>
        </div>
      </div>
    </div>
  );
}
