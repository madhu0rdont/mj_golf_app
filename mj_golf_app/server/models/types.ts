// Pure type definitions for server-side game plan generation.
// Mirrors client-side models without browser dependencies.

export type ClubCategory = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';

export interface Club {
  id: string;
  name: string;
  category: ClubCategory;
  brand?: string;
  model?: string;
  loft?: number;
  shaft?: string;
  flex?: string;
  manualCarry?: number | null;
  manualTotal?: number | null;
  computedCarry?: number;
  preferredShape?: string | null;
  sortOrder: number;
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
  shape?: string;
  quality?: string;
  position?: string;
  holeNumber?: number;
  timestamp: number;
}

export interface Coordinate {
  lat: number;
  lng: number;
  elevation: number;
}

export interface Target {
  index: number;
  coordinate: Coordinate;
  fromTee: number;
  toPin: number;
}

export interface HazardFeature {
  name: string;
  type: 'bunker' | 'fairway_bunker' | 'greenside_bunker' | 'water' | 'ob' | 'trees' | 'rough' | 'green';
  penalty: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'claude-vision' | 'manual';
  polygon: { lat: number; lng: number }[];
  status?: 'accepted' | 'pending';
}

export interface CourseHole {
  id: string;
  courseId: string;
  holeNumber: number;
  par: number;
  handicap: number | null;
  yardages: Record<string, number>;
  heading: number;
  tee: Coordinate;
  pin: Coordinate;
  targets: Target[];
  centerLine: Coordinate[];
  hazards: HazardFeature[];
  fairway: { lat: number; lng: number }[];
  green: { lat: number; lng: number }[];
  playsLikeYards: Record<string, number> | null;
  notes: string | null;
}

export interface Course {
  id: string;
  name: string;
  par: number | null;
  slope: number | null;
  rating: number | null;
  designers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CourseWithHoles extends Course {
  holes: CourseHole[];
}
