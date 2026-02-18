export type ShotShape = 'straight' | 'draw' | 'fade' | 'hook' | 'slice' | 'pull' | 'push';
export type ShotQuality = 'pure' | 'good' | 'acceptable' | 'mishit';
export type IngestionMethod = 'photo' | 'csv' | 'manual';

export interface Session {
  id: string;
  clubId: string;
  date: number;
  location?: string;
  notes?: string;
  source: IngestionMethod;
  shotCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface Shot {
  id: string;
  sessionId: string;
  clubId: string;
  shotNumber: number;
  carryYards: number;
  totalYards?: number;
  ballSpeed?: number;
  clubHeadSpeed?: number;
  launchAngle?: number;
  spinRate?: number;
  spinAxis?: number;
  apexHeight?: number;
  offlineYards?: number;
  pushPull?: number;
  sideSpinRate?: number;
  descentAngle?: number;
  shape?: ShotShape;
  quality?: ShotQuality;
  timestamp: number;
}

export interface SessionSummary {
  sessionId: string;
  clubId: string;
  clubName: string;
  date: number;
  shotCount: number;
  avgCarry: number;
  avgTotal?: number;
  medianCarry: number;
  maxCarry: number;
  minCarry: number;
  stdDevCarry: number;
  dispersionRange: number;
  avgBallSpeed?: number;
  avgClubHeadSpeed?: number;
  avgLaunchAngle?: number;
  avgSpinRate?: number;
  avgSpinAxis?: number;
  avgApexHeight?: number;
  avgOffline?: number;
  avgAbsOffline?: number;
  avgPushPull?: number;
  avgSideSpinRate?: number;
  avgDescentAngle?: number;
  shapeDistribution: Partial<Record<ShotShape, number>>;
  dominantShape?: ShotShape;
  qualityDistribution: Partial<Record<ShotQuality, number>>;
  pureRate: number;
}
