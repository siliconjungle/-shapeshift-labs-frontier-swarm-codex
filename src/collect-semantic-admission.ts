import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { uniqueStrings } from './common.js';
import { isCleanSemanticEditOperationScript, isCleanSemanticEditProjection } from './semantic-edit-clean-eligibility.js';
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';

export type FrontierCodexSemanticCollectAdmissionStatus = 'not-applicable' | 'ready' | 'review' | 'rerun' | 'fail';

export interface FrontierCodexSemanticCollectAdmissionDecision {
  status: FrontierCodexSemanticCollectAdmissionStatus;
  autoMergeCandidate: boolean;
  semanticGatePassed: boolean;
  reasons: string[];
}

export function classifyCodexSemanticCollectAdmission(
  bundle: FrontierSwarmMergeBundle,
  input: {
    staleAgainstHead?: boolean;
    hasActionablePatch?: boolean;
    semanticImportExpected?: boolean;
    semanticImportQuality?: ReturnType<typeof summarizeCodexSemanticImportQuality>;
  } = {}
): FrontierCodexSemanticCollectAdmissionDecision {
  const wantsAutoMerge = bundle.autoMergeable || bundle.disposition === 'auto-mergeable';
  const hasActionablePatch = input.hasActionablePatch ?? Boolean(bundle.patchPath);
  const hasSourceChange = bundle.changedPaths.length > 0 || hasActionablePatch;
  const quality = input.semanticImportQuality ?? summarizeCodexSemanticImportQuality(
    semanticImportSummaryFromBundle(bundle),
    input.semanticImportExpected ?? false
  );
  if ((input.staleAgainstHead ?? false) || bundle.staleAgainstHead) {
    return semanticCollectAdmission('rerun', wantsAutoMerge, false, ['semantic collect admission stale against head']);
  }
  const priorSemanticReviewReasons = bundle.reasons.filter(semanticCollectReviewReason);
  if (!wantsAutoMerge && priorSemanticReviewReasons.length > 0) {
    return semanticCollectAdmission('review', false, false, priorSemanticReviewReasons);
  }
  if (!wantsAutoMerge && !hasSourceChange && !quality.present) {
    return semanticCollectAdmission('not-applicable', false, false, []);
  }
  const blockers = semanticCollectAdmissionBlockers(quality);
  const staleBlockers = blockers.filter((reason) => reason.includes(' stale'));
  const failBlockers = blockers.filter((reason) =>
    reason.includes(' errors') ||
    reason.includes(' error losses') ||
    reason.includes(' failed proof obligations') ||
    reason.includes(' is blocked') ||
    reason.includes(' rejected candidates')
  );
  if (staleBlockers.length > 0) return semanticCollectAdmission('rerun', wantsAutoMerge, false, staleBlockers);
  if (failBlockers.length > 0) return semanticCollectAdmission('fail', wantsAutoMerge, false, failBlockers);

  if (wantsAutoMerge || hasActionablePatch && quality.semanticEditAdmission.autoMergeCandidate) {
    const reasons = semanticAutoMergeGateBlockers(quality);
    if (reasons.length > 0) {
      return semanticCollectAdmission('review', wantsAutoMerge || quality.semanticEditAdmission.autoMergeCandidate, false, reasons);
    }
    return semanticCollectAdmission('ready', true, true, ['semantic auto-merge gate passed']);
  }
  if (blockers.length > 0) return semanticCollectAdmission('review', false, false, blockers);
  return semanticCollectAdmission('not-applicable', false, false, []);
}

function semanticAutoMergeGateBlockers(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): string[] {
  const reasons: string[] = [];
  if (!quality.present) reasons.push('auto-merge candidate missing semantic import sidecar');
  if (quality.expected && !quality.expectedSatisfied) {
    reasons.push(quality.expectedMissingReasonCodes.length
      ? `auto-merge candidate semantic import expected evidence unsatisfied: ${quality.expectedMissingReasonCodes.join(',')}`
      : 'auto-merge candidate semantic import expected evidence unsatisfied');
  }
  reasons.push(...semanticCollectAdmissionBlockers(quality));
  if (!quality.semanticEditAdmission.autoMergeCandidate) {
    reasons.push('auto-merge candidate missing explicit semantic edit gate success');
  } else if (!quality.semanticEditAdmission.cleanEligible) {
    reasons.push(...quality.semanticEditAdmission.reasons);
  }
  if (quality.semanticEditAdmission.autoMergeCandidate && !isCleanSemanticEditOperationScript(quality.semanticEditScript)) {
    reasons.push('auto-merge candidate semantic edit script is not clean');
  }
  if (quality.semanticEditAdmission.autoMergeCandidate && !isCleanSemanticEditProjection(quality.semanticEditProjection)) {
    reasons.push('auto-merge candidate semantic edit projection gate did not pass cleanly');
  }
  if (quality.semanticEditAdmission.autoMergeCandidate && !semanticEditReplayClean(quality)) {
    reasons.push('auto-merge candidate semantic edit replay gate did not pass cleanly');
  }
  return uniqueStrings(reasons);
}

function semanticCollectAdmissionBlockers(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): string[] {
  const reasons: string[] = [];
  if (quality.errors > 0) reasons.push(`semantic import errors: ${quality.errors}`);
  if (quality.semanticErrorLosses > 0) reasons.push(`semantic import error losses: ${quality.semanticErrorLosses}`);
  if (quality.semanticReadiness.blocked > 0) reasons.push(`semantic import readiness is blocked: ${quality.semanticReadiness.blocked}`);
  if (quality.semanticReadiness['needs-review'] > 0) reasons.push(`semantic import readiness needs review: ${quality.semanticReadiness['needs-review']}`);
  if (quality.sourceProjectionBlocked > 0) reasons.push(`semantic source projection is blocked: ${quality.sourceProjectionBlocked}`);
  if (quality.sourceProjectionNeedsReview > 0) reasons.push(`semantic source projection needs review: ${quality.sourceProjectionNeedsReview}`);
  if (quality.sourceProjectionStubs > 0) reasons.push(`semantic source projection uses stubs: ${quality.sourceProjectionStubs}`);
  if (quality.nativeCompileBlocked > 0) reasons.push(`semantic native compile is blocked: ${quality.nativeCompileBlocked}`);
  if (quality.nativeCompileNeedsReview > 0) reasons.push(`semantic native compile needs review: ${quality.nativeCompileNeedsReview}`);
  if (quality.nativeCompileTargetStubs > 0) reasons.push(`semantic native compile emitted target stubs: ${quality.nativeCompileTargetStubs}`);
  if (quality.proofSpecFailedObligations > 0) reasons.push(`semantic import failed proof obligations: ${quality.proofSpecFailedObligations}`);
  if (quality.semanticSliceAdmissionRejected > 0) reasons.push(`semantic slice admission rejected candidates: ${quality.semanticSliceAdmissionRejected}`);
  if (quality.semanticLineageBlocked > 0) reasons.push(`semantic lineage is blocked: ${quality.semanticLineageBlocked}`);
  if (quality.semanticLineageAmbiguous > 0) reasons.push(`semantic lineage needs review: ${quality.semanticLineageAmbiguous}`);
  if (quality.semanticLineageNeedsReview > 0) reasons.push(`semantic lineage needs review: ${quality.semanticLineageNeedsReview}`);
  if (quality.semanticEditScript.conflicts > 0) reasons.push(`semantic edit script conflicts: ${quality.semanticEditScript.conflicts}`);
  if (quality.semanticEditScript.stale > 0) reasons.push(`semantic edit script stale anchors: ${quality.semanticEditScript.stale}`);
  if (quality.semanticEditScript.blocked > 0) reasons.push(`semantic edit script is blocked: ${quality.semanticEditScript.blocked}`);
  if (quality.semanticEditProjection.blocked > 0) reasons.push(`semantic edit projection is blocked: ${quality.semanticEditProjection.blocked}`);
  if (quality.semanticEditProjection.projectedSourceMismatchesWorker > 0) {
    reasons.push(`semantic edit projection worker mismatch: ${quality.semanticEditProjection.projectedSourceMismatchesWorker}`);
  }
  if (quality.semanticEditProjection.projectedSourceMatchUnknown > 0) {
    reasons.push(`semantic edit projection worker match unknown: ${quality.semanticEditProjection.projectedSourceMatchUnknown}`);
  }
  if (quality.semanticEditReplay.conflicts > 0) reasons.push(`semantic edit replay conflicts: ${quality.semanticEditReplay.conflicts}`);
  if (quality.semanticEditReplay.stale > 0) reasons.push(`semantic edit replay stale: ${quality.semanticEditReplay.stale}`);
  if (quality.semanticEditReplay.blocked > 0) reasons.push(`semantic edit replay is blocked: ${quality.semanticEditReplay.blocked}`);
  if (quality.semanticEditReplay.needsPort > 0) reasons.push(`semantic edit replay needs port: ${quality.semanticEditReplay.needsPort}`);
  return uniqueStrings(reasons);
}

function semanticEditReplayClean(quality: ReturnType<typeof summarizeCodexSemanticImportQuality>): boolean {
  const replay = quality.semanticEditReplay;
  return replay.total > 0 &&
    replay.acceptedClean + replay.alreadyApplied > 0 &&
    replay.conflicts + replay.stale + replay.blocked + replay.needsPort === 0;
}

function semanticCollectAdmission(
  status: FrontierCodexSemanticCollectAdmissionStatus,
  autoMergeCandidate: boolean,
  semanticGatePassed: boolean,
  reasons: string[]
): FrontierCodexSemanticCollectAdmissionDecision {
  return {
    status,
    autoMergeCandidate,
    semanticGatePassed,
    reasons: uniqueStrings(reasons)
  };
}

function hardFailedBundle(bundle: FrontierSwarmMergeBundle): boolean {
  return bundle.disposition === 'rejected' ||
    bundle.disposition === 'blocked' ||
    bundle.commandsFailed.length > 0 ||
    bundle.status === 'failed';
}

function semanticCollectReviewReason(reason: string): boolean {
  return reason.startsWith('auto-merge candidate ') ||
    reason.startsWith('semantic edit ') ||
    reason.startsWith('semantic import ') ||
    reason.startsWith('semantic source ') ||
    reason.startsWith('semantic native ') ||
    reason.startsWith('semantic lineage ') ||
    reason.startsWith('semantic slice ');
}
