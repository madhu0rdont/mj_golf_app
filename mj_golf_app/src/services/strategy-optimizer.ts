import type { ClubDistribution, ApproachStrategy } from './monte-carlo';

// ---------------------------------------------------------------------------
// Types (used by UI components — strategy computation now runs server-side)
// ---------------------------------------------------------------------------

export interface ScoreDistribution {
  eagle: number;
  birdie: number;
  par: number;
  bogey: number;
  double: number;
  worse: number;
}

export interface AimPoint {
  position: { lat: number; lng: number };
  clubName: string;
  shotNumber: number;
  carry: number; // meanCarry in yards
  carryNote: string | null; // e.g. "+20y past bunker"
  tip: string; // caddy tip, e.g. "Right of the bunker, works left to center"
}

export interface OptimizedStrategy extends ApproachStrategy {
  strategyName: string;
  strategyType: 'scoring' | 'safe' | 'balanced';
  scoreDistribution: ScoreDistribution;
  blowupRisk: number; // P(double bogey or worse), 0-1
  stdStrokes: number; // standard deviation of simulated scores
  fairwayRate: number; // proportion of MC trials with first shot on fairway/green (0-1)
  aimPoints: AimPoint[];
}

/** Internal plan used to drive GPS simulation */
export interface NamedStrategyPlan {
  name: string;
  type: 'scoring' | 'safe' | 'balanced';
  shots: {
    clubDist: ClubDistribution;
    aimPoint: { lat: number; lng: number };
  }[];
}

// Keep unused import reference to satisfy the extends clause
export type { ClubDistribution, ApproachStrategy };
