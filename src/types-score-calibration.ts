export interface FrontierCodexPatchScoreCalibration {
  source: 'apply-ledger' | 'none';
  applyLedgerPath?: string;
  landedJobIds: string[];
  predictedCleanJobIds: string[];
  truePositiveCleanJobIds: string[];
  falsePositiveCleanJobIds: string[];
  falseNegativeCleanJobIds: string[];
  landedNeedsPortJobIds: string[];
  semanticAutoMergeCandidateJobIds: string[];
  landedSemanticAutoMergeCandidateJobIds: string[];
  falsePositiveSemanticAutoMergeCandidateJobIds: string[];
  semanticAutoMergeCandidatePrecision: number;
  precision: number;
  recall: number;
  summary: {
    landed: number;
    predictedClean: number;
    truePositiveClean: number;
    falsePositiveClean: number;
    falseNegativeClean: number;
    landedNeedsPort: number;
    semanticAutoMergeCandidates: number;
    landedSemanticAutoMergeCandidates: number;
    falsePositiveSemanticAutoMergeCandidates: number;
  };
}
