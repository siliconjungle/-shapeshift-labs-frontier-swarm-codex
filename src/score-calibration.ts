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
  const landedSet = new Set(landed);
  const predictedSet = new Set(predicted);
  const truePositive = predicted.filter((jobId) => landedSet.has(jobId));
  const falsePositive = predicted.filter((jobId) => !landedSet.has(jobId));
  const falseNegative = landed.filter((jobId) => !predictedSet.has(jobId));
  const statusByJob = new Map(input.entries.map((entry) => [entry.jobId, entry.status]));
  const landedNeedsPort = landed.filter((jobId) => statusByJob.get(jobId) === 'accepted-needs-port');
  const semanticAutoMergeCandidates = uniqueStrings(input.entries
    .filter((entry) => entry.status === 'accepted-clean' && entry.semanticEvidence.semanticEditAdmission.autoMergeCandidate)
    .map((entry) => entry.jobId));
  const landedSemanticAutoMergeCandidates = semanticAutoMergeCandidates.filter((jobId) => landedSet.has(jobId));
  const falsePositiveSemanticAutoMergeCandidates = semanticAutoMergeCandidates.filter((jobId) => !landedSet.has(jobId));
  return {
    source: 'apply-ledger',
    applyLedgerPath: ledgerPath,
    landedJobIds: landed,
    predictedCleanJobIds: predicted,
    truePositiveCleanJobIds: truePositive,
    falsePositiveCleanJobIds: falsePositive,
    falseNegativeCleanJobIds: falseNegative,
    landedNeedsPortJobIds: landedNeedsPort,
    semanticAutoMergeCandidateJobIds: semanticAutoMergeCandidates,
    landedSemanticAutoMergeCandidateJobIds: landedSemanticAutoMergeCandidates,
    falsePositiveSemanticAutoMergeCandidateJobIds: falsePositiveSemanticAutoMergeCandidates,
    semanticAutoMergeCandidatePrecision: ratio(landedSemanticAutoMergeCandidates.length, semanticAutoMergeCandidates.length),
    precision: ratio(truePositive.length, predicted.length),
    recall: ratio(truePositive.length, landed.length),
    summary: {
      landed: landed.length,
      predictedClean: predicted.length,
      truePositiveClean: truePositive.length,
      falsePositiveClean: falsePositive.length,
      falseNegativeClean: falseNegative.length,
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
    predictedCleanJobIds: [],
    truePositiveCleanJobIds: [],
    falsePositiveCleanJobIds: [],
    falseNegativeCleanJobIds: [],
    landedNeedsPortJobIds: [],
    semanticAutoMergeCandidateJobIds: [],
    landedSemanticAutoMergeCandidateJobIds: [],
    falsePositiveSemanticAutoMergeCandidateJobIds: [],
    semanticAutoMergeCandidatePrecision: 0,
    precision: 0,
    recall: 0,
    summary: {
      landed: 0,
      predictedClean: 0,
      truePositiveClean: 0,
      falsePositiveClean: 0,
      falseNegativeClean: 0,
      landedNeedsPort: 0,
      semanticAutoMergeCandidates: 0,
      landedSemanticAutoMergeCandidates: 0,
      falsePositiveSemanticAutoMergeCandidates: 0
    }
  };
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
