import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { validateShotField } from '../../utils/validation';

export interface ShotRow {
  shotNumber: number;
  carryYards: number | string;
  totalYards?: number | string;
  ballSpeed?: number | string;
  clubHeadSpeed?: number | string;
  launchAngle?: number | string;
  spinRate?: number | string;
  spinAxis?: number | string;
  apexHeight?: number | string;
  offlineYards?: number | string;
}

interface ShotTableProps {
  shots: ShotRow[];
  onChange: (index: number, field: keyof ShotRow, value: string) => void;
  onDelete: (index: number) => void;
  readOnly?: boolean;
}

const CORE_FIELDS: { key: keyof ShotRow; label: string; unit: string; placeholder: string }[] = [
  { key: 'carryYards', label: 'Carry', unit: 'yds', placeholder: '155' },
  { key: 'totalYards', label: 'Total', unit: 'yds', placeholder: '167' },
];

const ADVANCED_FIELDS: { key: keyof ShotRow; label: string; unit: string; placeholder: string }[] = [
  { key: 'ballSpeed', label: 'Ball Spd', unit: 'mph', placeholder: '112' },
  { key: 'clubHeadSpeed', label: 'Club Spd', unit: 'mph', placeholder: '87' },
  { key: 'launchAngle', label: 'Launch', unit: '°', placeholder: '17.2' },
  { key: 'spinRate', label: 'Spin', unit: 'rpm', placeholder: '6842' },
  { key: 'spinAxis', label: 'Axis', unit: '°', placeholder: '-2.1' },
  { key: 'apexHeight', label: 'Apex', unit: 'yds', placeholder: '28' },
  { key: 'offlineYards', label: 'Offline', unit: 'yds', placeholder: '-4.2' },
];

function ShotRowCard({
  shot,
  index,
  onChange,
  onDelete,
  readOnly,
}: {
  shot: ShotRow;
  index: number;
  onChange: ShotTableProps['onChange'];
  onDelete: ShotTableProps['onDelete'];
  readOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const renderField = (field: (typeof CORE_FIELDS)[number]) => {
    const value = shot[field.key];
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const isInvalid = numValue != null && !isNaN(numValue) && !validateShotField(field.key, numValue);

    if (readOnly) {
      return (
        <div key={field.key} className="flex flex-col">
          <span className="text-[10px] text-gray-500">{field.label}</span>
          <span className={`text-sm font-medium ${isInvalid ? 'text-amber-400' : 'text-white'}`}>
            {value ?? '—'} <span className="text-gray-600">{field.unit}</span>
          </span>
        </div>
      );
    }

    return (
      <div key={field.key} className="flex flex-col gap-0.5">
        <span className="text-[10px] text-gray-500">{field.label}</span>
        <div className="relative">
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(index, field.key, e.target.value)}
            placeholder={field.placeholder}
            step="0.1"
            className={`w-full rounded border bg-gray-800 px-2 py-1 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 ${
              isInvalid
                ? 'border-amber-500 focus:ring-amber-500'
                : 'border-gray-700 focus:ring-green-500'
            }`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-600">
            {field.unit}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-400">Shot {shot.shotNumber}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 text-gray-500 hover:text-gray-300"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onDelete(index)}
              className="rounded p-1 text-gray-500 hover:text-red-400"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {CORE_FIELDS.map(renderField)}
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-800 pt-3">
          {ADVANCED_FIELDS.map(renderField)}
        </div>
      )}
    </div>
  );
}

export function ShotTable({ shots, onChange, onDelete, readOnly }: ShotTableProps) {
  return (
    <div className="flex flex-col gap-2">
      {shots.map((shot, i) => (
        <ShotRowCard
          key={i}
          shot={shot}
          index={i}
          onChange={onChange}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
