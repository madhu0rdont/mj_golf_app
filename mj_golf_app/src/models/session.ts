export type ShotShape = 'straight' | 'draw' | 'fade' | 'hook' | 'slice' | 'pull' | 'push';
export type ShotQuality = 'pure' | 'good' | 'acceptable' | 'mishit';
export type IngestionMethod = 'photo' | 'csv' | 'manual';
export type SessionType = 'block' | 'wedge-distance' | 'interleaved';
export type SwingPosition = 'full' | 'shoulder' | 'hip';

export interface InterleavedHole {
  number: number;
  distanceYards: number;
  par: number;
}

export interface InterleavedMetadata {
  holes: InterleavedHole[];
  roundSize: 9 | 18;
}

export interface Session {
  id: string;
  clubId: string | null;
  type: SessionType;
  date: number;
  location?: string;
  notes?: string;
  source: IngestionMethod;
  shotCount: number;
  metadata?: InterleavedMetadata | null;
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
  position?: SwingPosition;
  holeNumber?: number;
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
