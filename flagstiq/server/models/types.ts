// Pure type definitions for server-side game plan generation.
// Mirrors client-side models without browser dependencies.

export type ClubCategory = 'driver' | 'wood' | 'hybrid' | 'iron' | 'wedge' | 'putter';
export type ShotShape = 'straight' | 'draw' | 'fade' | 'hook' | 'slice' | 'pull' | 'push';
export type ShotQuality = 'pure' | 'good' | 'acceptable' | 'mishit';
export type SwingPosition = 'full' | 'shoulder' | 'hip';

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
  preferredShape?: ShotShape | null;
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
  shape?: ShotShape;
  quality?: ShotQuality;
  position?: SwingPosition;
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
  fairway: { lat: number; lng: number }[][];
  green: { lat: number; lng: number }[];
  playsLikeYards: Record<string, number> | null;
  notes: string | null;
}

export interface TeeSet {
  rating: number;
  slope: number;
  ratingWomen?: number;
  slopeWomen?: number;
}

export interface Course {
  id: string;
  name: string;
  par: number | null;
  slope: number | null;
  rating: number | null;
  teeSets: Record<string, TeeSet> | null;
  designers: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CourseWithHoles extends Course {
  holes: CourseHole[];
}

export interface StrategyConstants {
  // Lie multipliers
  lie_fairway: number;
  lie_rough: number;
  lie_green: number;
  lie_fairway_bunker: number;
  lie_greenside_bunker: number;
  lie_trees: number;
  lie_recovery: number;
  // Surface rollout
  rollout_fairway: number;
  rollout_rough: number;
  rollout_green: number;
  rollout_bunker: number;
  // Mode weights
  safe_variance_weight: number;
  aggressive_green_bonus: number;
  // Sampling
  samples_base: number;
  samples_hazard: number;
  samples_high_risk: number;
  // Thresholds
  chip_range: number;
  short_game_threshold: number;
  green_radius: number;
  // Spatial
  zone_interval: number;
  lateral_offset: number;
  bearing_range: number;
  k_neighbors: number;
  kernel_h_s: number;
  kernel_h_u: number;
  // Flight model
  tree_height_yards: number;
  ball_apex_yards: number;
  elev_yards_per_meter: number;
  // Rollout
  rollout_slope_factor: number;
  default_loft: number;
  // Putting model
  putt_coefficient: number;
  putt_cap: number;
  // MC
  mc_trials: number;
  // DP
  max_iterations: number;
  convergence_threshold: number;
  // Club selection
  min_carry_ratio: number;
  max_carry_ratio: number;
  // Hazard
  hazard_drop_penalty: number;
  max_shots_per_hole: number;
  // Slope penalty
  steep_slope_threshold: number;
  steep_slope_max_penalty: number;
  steep_slope_penalty_rate: number;
  // Rough penalty
  rough_landing_penalty: number;
}
