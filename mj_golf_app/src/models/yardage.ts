import type { ShotShape } from './session';

export type DataFreshness = 'fresh' | 'aging' | 'stale';

export interface YardageBookEntry {
  clubId: string;
  clubName: string;
  category: string;
  bookCarry: number;
  bookTotal?: number;
  confidenceCarry: number;
  dispersion: number;
  dominantShape?: ShotShape;
  avgSpinRate?: number;
  avgLaunchAngle?: number;
  sessionCount: number;
  shotCount: number;
  lastSessionDate: number;
  freshness: DataFreshness;
}
