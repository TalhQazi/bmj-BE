export interface ScoreResult {
  scoreType: 'BJI' | 'PDI' | 'API' | 'LII';
  value: number; // standardized, -3 to +3
  confidence: number; // 0..1
  sampleSize: number;
  disclaimer: string;
}

export const LEGAL_DISCLAIMER = 'Historical data only. Not predictive.';
