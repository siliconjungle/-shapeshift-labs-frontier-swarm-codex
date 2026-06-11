import type {
  FrontierSwarmAdaptiveObservationInput,
  FrontierSwarmTournamentAdaptiveRecommendation
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexPatchScoreCalibration } from './types-score-calibration.js';

export interface FrontierCodexCalibrationAdaptiveFeedback {
  source: 'patch-score' | 'none';
  patchScorePath?: string;
  calibration?: FrontierCodexPatchScoreCalibration;
  observations: FrontierSwarmAdaptiveObservationInput[];
  recommendations: FrontierSwarmTournamentAdaptiveRecommendation[];
  summary: {
    observationCount: number;
    recommendationCount: number;
    landed: number;
    predictedClean: number;
    truePositiveClean: number;
    falsePositiveClean: number;
    falseNegativeClean: number;
    semanticAutoMergeCandidates: number;
    landedSemanticAutoMergeCandidates: number;
    falsePositiveSemanticAutoMergeCandidates: number;
    precision: number;
    recall: number;
    semanticAutoMergeCandidatePrecision: number;
  };
}
