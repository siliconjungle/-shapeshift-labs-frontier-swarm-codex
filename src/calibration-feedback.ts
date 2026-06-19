import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierSwarmAdaptiveObservationInput,
  FrontierSwarmTournamentAdaptiveFeedback,
  FrontierSwarmTournamentAdaptiveRecommendation
} from '@shapeshift-labs/frontier-swarm';
import { isObject, pathExists } from './common.js';
import type { FrontierCodexPatchScoreResult } from './types-collection.js';
import type { FrontierCodexCalibrationAdaptiveFeedback } from './types-calibration-feedback.js';
import type { FrontierCodexPatchScoreCalibration } from './types-score-calibration.js';
import { calibratePatchScores } from './score-calibration.js';

export async function createCodexCalibrationAdaptiveFeedback(input: {
  collectionDir?: string;
  generatedAt?: number;
}): Promise<FrontierCodexCalibrationAdaptiveFeedback> {
  const score = input.collectionDir
    ? await readCodexPatchScoreCalibration(input.collectionDir)
    : undefined;
  const calibration = score?.calibration;
  if (!calibration || calibration.source === 'none') return emptyCalibrationFeedback();
  const observations = calibrationObservations(calibration, input.generatedAt ?? Date.now());
  return {
    source: 'patch-score',
    patchScorePath: score?.patchScorePath,
    calibration,
    observations,
    recommendations: observations.map(calibrationRecommendation),
    summary: calibrationFeedbackSummary(calibration, observations.length)
  };
}

export async function readCodexPatchScoreCalibration(collectionDir: string): Promise<{
  patchScorePath: string;
  calibration: FrontierCodexPatchScoreCalibration;
} | undefined> {
  for (const candidate of patchScoreCandidates(collectionDir)) {
    if (!await pathExists(candidate)) continue;
    const parsed = JSON.parse(await fs.readFile(candidate, 'utf8')) as Partial<FrontierCodexPatchScoreResult>;
    const recalibrated = await recalibratePatchScore(candidate, parsed, collectionDir);
    if (recalibrated) {
      return {
        patchScorePath: candidate,
        calibration: recalibrated
      };
    }
    if (isObject(parsed.calibration)) {
      return {
        patchScorePath: candidate,
        calibration: parsed.calibration as FrontierCodexPatchScoreCalibration
      };
    }
  }
  return undefined;
}

export function attachCodexCalibrationAdaptiveFeedback(
  feedback: FrontierSwarmTournamentAdaptiveFeedback,
  calibrationFeedback: FrontierCodexCalibrationAdaptiveFeedback
): FrontierSwarmTournamentAdaptiveFeedback {
  if (calibrationFeedback.observations.length === 0) return feedback;
  const observations = [...feedback.observations, ...calibrationFeedback.observations];
  const recommendations = [...feedback.recommendations, ...calibrationFeedback.recommendations];
  return {
    ...feedback,
    observations,
    recommendations,
    summary: {
      observationCount: observations.length,
      recommendationCount: recommendations.length,
      reduceSignals: recommendations.filter((entry) => entry.action === 'decrease').length,
      increaseSignals: recommendations.filter((entry) => entry.action === 'increase').length,
      holdSignals: recommendations.filter((entry) => entry.action === 'hold').length
    },
    metadata: {
      ...objectMetadata(feedback.metadata),
      calibrationFeedback: calibrationFeedback.summary,
      ...(calibrationFeedback.patchScorePath ? { patchScorePath: calibrationFeedback.patchScorePath } : {})
    }
  };
}

function patchScoreCandidates(collectionDir: string): string[] {
  return [
    path.join(collectionDir, 'patch-scores', 'patch-score.json'),
    path.join(collectionDir, 'patch-score.json')
  ];
}

function calibrationObservations(
  calibration: FrontierCodexPatchScoreCalibration,
  at: number
): FrontierSwarmAdaptiveObservationInput[] {
  const summary = calibration.summary;
  const observations: FrontierSwarmAdaptiveObservationInput[] = [];
  const truePositiveAccepted = numericSummary(summary.truePositiveAccepted, summary.truePositiveClean + summary.landedNeedsPort);
  const predictedAccepted = numericSummary(summary.predictedAccepted, summary.predictedClean + numericSummary(summary.predictedNeedsPort, 0));
  const acceptedPrecision = numericSummary(calibration.acceptedPrecision, ratio(truePositiveAccepted, predictedAccepted));
  const needsPortPrecision = numericSummary(calibration.needsPortPrecision, ratio(summary.landedNeedsPort, numericSummary(summary.predictedNeedsPort, summary.landedNeedsPort)));
  const unacceptedLanded = Math.max(0, summary.landed - truePositiveAccepted);
  if (summary.predictedClean > 0 && calibration.precision >= 0.75 && summary.truePositiveClean > 0) {
    observations.push(calibrationObservation('healthy-throughput', 'info', at, calibration.precision * 100,
      `calibrated clean patch precision ${calibration.precision}`));
  }
  if (predictedAccepted > 0 && truePositiveAccepted > 0) {
    observations.push(calibrationObservation('landed-throughput', 'info', at, acceptedPrecision * 100,
      `${truePositiveAccepted} accepted patch candidates landed with precision ${acceptedPrecision}`));
  }
  if (summary.falsePositiveClean > 0) {
    observations.push(calibrationObservation('review-backlog', 'warning', at, summary.falsePositiveClean,
      `${summary.falsePositiveClean} predicted-clean patches did not land`));
  }
  if (numericSummary(summary.falsePositiveNeedsPort, 0) > 0) {
    observations.push(calibrationObservation('review-backlog', 'warning', at, summary.falsePositiveNeedsPort,
      `${summary.falsePositiveNeedsPort} accepted-needs-port patches did not land`));
  }
  if (summary.landedNeedsPort > 0) {
    observations.push(calibrationObservation('landed-needs-port', 'info', at, needsPortPrecision * 100,
      `${summary.landedNeedsPort} accepted-needs-port patches landed with precision ${needsPortPrecision}`));
  }
  if (unacceptedLanded > 0) {
    observations.push(calibrationObservation('strategy-underperforming', 'warning', at, unacceptedLanded,
      `${unacceptedLanded} landed patches were not accepted by patch scoring`));
  }
  if (summary.landedSemanticAutoMergeCandidates > 0) {
    observations.push(calibrationObservation('healthy-throughput', 'info', at,
      calibration.semanticAutoMergeCandidatePrecision * 100,
      `${summary.landedSemanticAutoMergeCandidates} semantic auto-merge candidates landed`));
  }
  if (summary.falsePositiveSemanticAutoMergeCandidates > 0) {
    observations.push(calibrationObservation('semantic-weak', 'warning', at,
      summary.falsePositiveSemanticAutoMergeCandidates,
      `${summary.falsePositiveSemanticAutoMergeCandidates} semantic auto-merge candidates did not land`));
  }
  return observations;
}

function calibrationObservation(
  kind: string,
  severity: 'info' | 'warning',
  at: number,
  value: number,
  reason: string
): FrontierSwarmAdaptiveObservationInput {
  return {
    kind,
    severity,
    at,
    value: Math.round(value * 100) / 100,
    reason,
    metadata: { source: 'patch-score-calibration' }
  };
}

function calibrationRecommendation(
  observation: FrontierSwarmAdaptiveObservationInput
): FrontierSwarmTournamentAdaptiveRecommendation {
  const action = observation.kind === 'healthy-throughput'
    ? 'increase'
    : observation.severity === 'warning'
      ? 'decrease'
      : 'observe';
  return {
    action,
    target: 'max-ready-jobs',
    reason: observation.reason ?? observation.kind,
    score: observation.value
  };
}

function calibrationFeedbackSummary(
  calibration: FrontierCodexPatchScoreCalibration,
  observationCount: number
): FrontierCodexCalibrationAdaptiveFeedback['summary'] {
  return {
    observationCount,
    recommendationCount: observationCount,
    landed: calibration.summary.landed,
    predictedClean: calibration.summary.predictedClean,
    truePositiveClean: calibration.summary.truePositiveClean,
    falsePositiveClean: calibration.summary.falsePositiveClean,
    falseNegativeClean: calibration.summary.falseNegativeClean,
    semanticAutoMergeCandidates: calibration.summary.semanticAutoMergeCandidates,
    landedSemanticAutoMergeCandidates: calibration.summary.landedSemanticAutoMergeCandidates,
    falsePositiveSemanticAutoMergeCandidates: calibration.summary.falsePositiveSemanticAutoMergeCandidates,
    precision: calibration.precision,
    recall: calibration.recall,
    semanticAutoMergeCandidatePrecision: calibration.semanticAutoMergeCandidatePrecision
  };
}

function emptyCalibrationFeedback(): FrontierCodexCalibrationAdaptiveFeedback {
  return {
    source: 'none',
    observations: [],
    recommendations: [],
    summary: {
      observationCount: 0,
      recommendationCount: 0,
      landed: 0,
      predictedClean: 0,
      truePositiveClean: 0,
      falsePositiveClean: 0,
      falseNegativeClean: 0,
      semanticAutoMergeCandidates: 0,
      landedSemanticAutoMergeCandidates: 0,
      falsePositiveSemanticAutoMergeCandidates: 0,
      precision: 0,
      recall: 0,
      semanticAutoMergeCandidatePrecision: 0
    }
  };
}

async function recalibratePatchScore(
  patchScorePath: string,
  parsed: Partial<FrontierCodexPatchScoreResult>,
  fallbackCollectionDir: string
): Promise<FrontierCodexPatchScoreCalibration | undefined> {
  if (!Array.isArray(parsed.entries)) return undefined;
  const collectionDir = typeof parsed.collectionDir === 'string' ? parsed.collectionDir : fallbackCollectionDir;
  const calibration = await calibratePatchScores({ collectionDir, entries: parsed.entries });
  if (calibration.source !== 'apply-ledger') return undefined;
  if (isCurrentCalibration(parsed.calibration, calibration)) return parsed.calibration as FrontierCodexPatchScoreCalibration;
  return {
    ...calibration,
    applyLedgerPath: calibration.applyLedgerPath ?? patchScorePath
  };
}

function isCurrentCalibration(
  value: unknown,
  calibration: FrontierCodexPatchScoreCalibration
): value is FrontierCodexPatchScoreCalibration {
  if (!isObject(value)) return false;
  const current = value as Partial<FrontierCodexPatchScoreCalibration>;
  return current.source === 'apply-ledger' &&
    current.applyLedgerPath === calibration.applyLedgerPath &&
    current.acceptedPrecision === calibration.acceptedPrecision &&
    current.summary?.landed === calibration.summary.landed &&
    current.summary?.predictedAccepted === calibration.summary.predictedAccepted &&
    current.summary?.truePositiveAccepted === calibration.summary.truePositiveAccepted;
}

function numericSummary(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function objectMetadata(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
