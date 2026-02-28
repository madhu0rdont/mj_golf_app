export type ClubCategory = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
export type ShaftFlex = 'regular' | 'stiff' | 'x-stiff' | 'senior' | 'ladies';

export interface Club {
  id: string;
  name: string;
  category: ClubCategory;
  brand?: string;
  model?: string;
  loft?: number;
  shaft?: string;
  flex?: ShaftFlex;
  manualCarry?: number | null;
  manualTotal?: number | null;
  computedCarry?: number;
  preferredShape?: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export const CLUB_CATEGORIES: { value: ClubCategory; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'wood', label: 'Wood' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'iron', label: 'Iron' },
  { value: 'wedge', label: 'Wedge' },
  { value: 'putter', label: 'Putter' },
];

export const SHAFT_FLEX_OPTIONS: { value: ShaftFlex; label: string }[] = [
  { value: 'regular', label: 'Regular' },
  { value: 'stiff', label: 'Stiff' },
  { value: 'x-stiff', label: 'X-Stiff' },
  { value: 'senior', label: 'Senior' },
  { value: 'ladies', label: 'Ladies' },
];

export const CATEGORY_ORDER: Record<ClubCategory, number> = {
  driver: 0,
  wood: 1,
  hybrid: 2,
  iron: 3,
  wedge: 4,
  putter: 5,
};
