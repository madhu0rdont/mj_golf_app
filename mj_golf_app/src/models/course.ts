export type ConfidenceLevel = 'great' | 'ok' | 'stretch';

export interface ClubRecommendation {
  clubId: string;
  clubName: string;
  bookCarry: number;
  delta: number;
  confidence: ConfidenceLevel;
  freshness: string;
  dispersion: number;
}
