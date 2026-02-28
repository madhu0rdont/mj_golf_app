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

export interface CourseHole {
  id: string;
  courseId: string;
  holeNumber: number;
  par: number;
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

export interface HazardFeature {
  name: string;
  type: 'bunker' | 'fairway_bunker' | 'greenside_bunker' | 'water' | 'ob' | 'trees' | 'rough' | 'green';
  penalty: number;
  confidence: 'high' | 'medium' | 'low';
  source: 'claude-vision' | 'manual';
  polygon: { lat: number; lng: number }[];
  status?: 'accepted' | 'pending';
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

// KML preview types (from parse endpoint)

export interface ParsedCoordinate {
  lat: number;
  lng: number;
  alt: number;
}

export interface ParsedTarget {
  index: number;
  coordinate: ParsedCoordinate;
}

export interface ParsedHole {
  holeNumber: number;
  par: number;
  yardage: number;
  heading: number;
  tee: ParsedCoordinate;
  pin: ParsedCoordinate;
  targets: ParsedTarget[];
  centerLine: ParsedCoordinate[];
}

export interface ParsedCourse {
  holes: ParsedHole[];
}
