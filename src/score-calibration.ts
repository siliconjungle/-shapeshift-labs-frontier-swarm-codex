import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierCodexApplyResult,
  FrontierCodexPatchScoreEntry
} from './types-collection.js';
import type { FrontierCodexPatchScoreCalibration } from './types-score-calibration.js';
import { pathExists, uniqueStrings } from './common.js';

export async function calibratePatchScores(input: {
  collectionDir: string;
  entries: readonly FrontierCodexPatchScoreEntry[];
}): Promise<FrontierCodexPatchScoreCalibration> {
  const ledgerPath = await findApplyLedger(input.collectionDir);
  if (!ledgerPath) return emptyCalibration('none');
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as FrontierCodexApplyResult;
  const landed = uniqueStrings((ledger.entries ?? [])
    .filter((entry) => entry.status === 'applied' || entry.status === 'committed')
    .map((entry) => entry.jobId));
  const predicted = uniqueStrings(input.entries
    .filter((entry) => entry.status === 'accepted-clean')
    .map((entry) => entry.jobId));
  const predictedNeedsPort = uniqueStrings(input.entries
    .filter((entry) => entry.status === 'accepted-needs-port')
    .map((entry) => entry.jobId));
  const predictedAccepted = uniqueStrings([...predicted, ...predictedNeedsPort]);
  const landedSet = new Set(landed);
  const predictedSet = new Set(predicted);
  const truePositive = predicted.filter((jobId) => landedSet.has(jobId));
  const falsePositive = predicted.filter((jobId) => !landedSet.has(jobId));
  const falseNegative = landed.filter((jobId) => !predictedSet.has(jobId));
  const truePositiveNeedsPort = predictedNeedsPort.filter((jobId) => landedSet.has(jobId));
  const falsePositiveNeedsPort = predictedNeedsPort.filter((jobId) => !landedSet.has(jobId));
  const truePositiveAccepted = predictedAccepted.filter((jobId) => landedSet.has(jobId));
  const falsePositiveAccepted = predictedAccepted.filter((jobId) => !landedSet.has(jobId));
  const statusByJob = new Map(input.entries.map((entry) => [entry.jobId, entry.status]));
  const landedNeedsPort = landed.filter((jobId) => statusByJob.get(jobId) === 'accepted-needs-port');
  const semanticAutoMergeCandidates = uniqueStrings(input.entries
    .filter((entry) => entry.status === 'accepted-clean' && semanticAutoMergeCandidate(entry))
    .map((entry) => entry.jobId));
  const landedSemanticAutoMergeCandidates = semanticAutoMergeCandidates.filter((jobId) => landedSet.has(jobId));
  const falsePositiveSemanticAutoMergeCandidates = semanticAutoMergeCandidates.filter((jobId) => !landedSet.has(jobId));
  return {
    source: 'apply-ledger',
    applyLedgerPath: ledgerPath,
    landedJobIds: landed,
    predictedAcceptedJobIds: predictedAccepted,
    truePositiveAcceptedJobIds: truePositiveAccepted,
    falsePositiveAcceptedJobIds: falsePositiveAccepted,
    predictedCleanJobIds: predicted,
    truePositiveCleanJobIds: truePositive,
    falsePositiveCleanJobIds: falsePositive,
    falseNegativeCleanJobIds: falseNegative,
    predictedNeedsPortJobIds: predictedNeedsPort,
    truePositiveNeedsPortJobIds: truePositiveNeedsPort,
    falsePositiveNeedsPortJobIds: falsePositiveNeedsPort,
    landedNeedsPortJobIds: landedNeedsPort,
    semanticAutoMergeCandidateJobIds: semanticAutoMergeCandidates,
    landedSemanticAutoMergeCandidateJobIds: landedSemanticAutoMergeCandidates,
    falsePositiveSemanticAutoMergeCandidateJobIds: falsePositiveSemanticAutoMergeCandidates,
    acceptedPrecision: ratio(truePositiveAccepted.length, predictedAccepted.length),
    acceptedRecall: ratio(truePositiveAccepted.length, landed.length),
    needsPortPrecision: ratio(truePositiveNeedsPort.length, predictedNeedsPort.length),
    semanticAutoMergeCandidatePrecision: ratio(landedSemanticAutoMergeCandidates.length, semanticAutoMergeCandidates.length),
    precision: ratio(truePositive.length, predicted.length),
    recall: ratio(truePositive.length, landed.length),
    summary: {
      landed: landed.length,
      predictedAccepted: predictedAccepted.length,
      truePositiveAccepted: truePositiveAccepted.length,
      falsePositiveAccepted: falsePositiveAccepted.length,
      predictedClean: predicted.length,
      truePositiveClean: truePositive.length,
      falsePositiveClean: falsePositive.length,
      falseNegativeClean: falseNegative.length,
      predictedNeedsPort: predictedNeedsPort.length,
      truePositiveNeedsPort: truePositiveNeedsPort.length,
      falsePositiveNeedsPort: falsePositiveNeedsPort.length,
      landedNeedsPort: landedNeedsPort.length,
      semanticAutoMergeCandidates: semanticAutoMergeCandidates.length,
      landedSemanticAutoMergeCandidates: landedSemanticAutoMergeCandidates.length,
      falsePositiveSemanticAutoMergeCandidates: falsePositiveSemanticAutoMergeCandidates.length
    }
  };
}

function emptyCalibration(source: 'none'): FrontierCodexPatchScoreCalibration {
  return {
    source,
    landedJobIds: [],
    predictedAcceptedJobIds: [],
    truePositiveAcceptedJobIds: [],
    falsePositiveAcceptedJobIds: [],
    predictedCleanJobIds: [],
    truePositiveCleanJobIds: [],
    falsePositiveCleanJobIds: [],
    falseNegativeCleanJobIds: [],
    predictedNeedsPortJobIds: [],
    truePositiveNeedsPortJobIds: [],
    falsePositiveNeedsPortJobIds: [],
    landedNeedsPortJobIds: [],
    semanticAutoMergeCandidateJobIds: [],
    landedSemanticAutoMergeCandidateJobIds: [],
    falsePositiveSemanticAutoMergeCandidateJobIds: [],
    acceptedPrecision: 0,
    acceptedRecall: 0,
    needsPortPrecision: 0,
    semanticAutoMergeCandidatePrecision: 0,
    precision: 0,
    recall: 0,
    summary: {
      landed: 0,
      predictedAccepted: 0,
      truePositiveAccepted: 0,
      falsePositiveAccepted: 0,
      predictedClean: 0,
      truePositiveClean: 0,
      falsePositiveClean: 0,
      falseNegativeClean: 0,
      predictedNeedsPort: 0,
      truePositiveNeedsPort: 0,
      falsePositiveNeedsPort: 0,
      landedNeedsPort: 0,
      semanticAutoMergeCandidates: 0,
      landedSemanticAutoMergeCandidates: 0,
      falsePositiveSemanticAutoMergeCandidates: 0
    }
  };
}

function semanticAutoMergeCandidate(entry: FrontierCodexPatchScoreEntry): boolean {
  if (semanticEditReplayAutoMergeCandidate(entry)) return true;
  if (hasReviewOnlySemanticEvidence(entry)) return false;
  return (
    (entry.semanticEvidence.semanticEditAdmission.autoMergeCandidate &&
      entry.semanticEvidence.semanticEditAdmission.cleanEligible) ||
    (entry.semanticEvidence.semanticEditOperationAutoMergeCandidate &&
      entry.semanticEvidence.semanticEditOperationCleanEligible)
  );
}

function semanticEditReplayAutoMergeCandidate(entry: FrontierCodexPatchScoreEntry): boolean {
  const replay = entry.semanticEvidence.semanticEditReplay;
  return replay.total > 0 &&
    replay.acceptedClean + replay.alreadyApplied > 0 &&
    replay.conflicts + replay.stale + replay.blocked + replay.needsPort === 0;
}

function hasReviewOnlySemanticEvidence(entry: FrontierCodexPatchScoreEntry): boolean {
  return [...entry.reasons, ...entry.semanticEvidence.reasons].some((reason) => reason.includes('review-only'));
}

async function findApplyLedger(collectionDir: string): Promise<string | undefined> {
  const candidates = [
    path.join(collectionDir, 'apply-ledger', 'apply-ledger.json'),
    path.join(collectionDir, 'apply-ledger.json')
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return undefined;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}
