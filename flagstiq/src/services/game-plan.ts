import type { OptimizedStrategy, ScoreDistribution } from './strategy-optimizer';

// ---------------------------------------------------------------------------
// Types (used by UI components — plan generation now runs server-side)
// ---------------------------------------------------------------------------

export interface HolePlan {
  holeNumber: number;
  par: number;
  yardage: number;
  playsLikeYardage: number | null;
  strategy: OptimizedStrategy;
  allStrategies: OptimizedStrategy[];   // all 3 modes [scoring, safe, aggressive]
  colorCode: 'green' | 'yellow' | 'red';
}

export interface GamePlan {
  courseName: string;
  teeBox: string;
  date: string;
  totalExpected: number;
  breakdown: ScoreDistribution;
  keyHoles: number[];
  totalPlaysLike: number;
  holes: HolePlan[];
  optimizerVersion?: string;
}

export type { OptimizedStrategy, ScoreDistribution };
