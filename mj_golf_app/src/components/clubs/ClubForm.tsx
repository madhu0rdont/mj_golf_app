import { useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { CLUB_CATEGORIES, SHAFT_FLEX_OPTIONS, type Club, type ClubCategory, type ShaftFlex } from '../../models/club';

interface ClubFormProps {
  initial?: Club;
  onSave: (data: ClubFormData) => void;
  onDelete?: () => void;
  onCancel: () => void;
}

export interface ClubFormData {
  name: string;
  category: ClubCategory;
  brand?: string;
  model?: string;
  loft?: number;
  shaft?: string;
  flex?: ShaftFlex;
  manualCarry?: number;
  manualTotal?: number;
}

export function ClubForm({ initial, onSave, onDelete, onCancel }: ClubFormProps) {
  const [name, setName] = useState(initial?.name || '');
  const [category, setCategory] = useState<ClubCategory>(initial?.category || 'iron');
  const [brand, setBrand] = useState(initial?.brand || '');
  const [model, setModel] = useState(initial?.model || '');
  const [loft, setLoft] = useState(initial?.loft?.toString() || '');
  const [shaft, setShaft] = useState(initial?.shaft || '');
  const [flex, setFlex] = useState<ShaftFlex | ''>(initial?.flex || '');
  const [manualCarry, setManualCarry] = useState(initial?.manualCarry?.toString() || '');
  const [manualTotal, setManualTotal] = useState(initial?.manualTotal?.toString() || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      category,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      loft: loft ? parseFloat(loft) : undefined,
      shaft: shaft.trim() || undefined,
      flex: flex || undefined,
      manualCarry: manualCarry ? parseFloat(manualCarry) : undefined,
      manualTotal: manualTotal ? parseFloat(manualTotal) : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Club Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder='e.g. "7 Iron", "60° Lob"'
        required
      />

      <Select
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value as ClubCategory)}
        options={CLUB_CATEGORIES}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Brand"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Titleist"
        />
        <Input
          label="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="e.g. T200"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Loft"
          type="number"
          value={loft}
          onChange={(e) => setLoft(e.target.value)}
          placeholder="e.g. 32"
          suffix="°"
          step="0.5"
        />
        <Select
          label="Flex"
          value={flex}
          onChange={(e) => setFlex(e.target.value as ShaftFlex)}
          options={[{ value: '', label: 'Select...' }, ...SHAFT_FLEX_OPTIONS]}
        />
      </div>

      <Input
        label="Shaft"
        value={shaft}
        onChange={(e) => setShaft(e.target.value)}
        placeholder="e.g. Project X 6.0"
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" className="flex-1">
          {initial ? 'Save Changes' : 'Add Club'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      {onDelete && (
        <Button type="button" variant="danger" onClick={onDelete} className="w-full">
          Delete Club
        </Button>
      )}
    </form>
  );
}
