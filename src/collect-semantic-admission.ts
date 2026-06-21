import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { uniqueStrings } from './common.js';
import { isCleanSemanticEditOperationScript, isCleanSemanticEditProjection } from './semantic-edit-clean-eligibility.js';
import { semanticImportSummaryFromBundle, summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';

export type FrontierCodexSemanticCollectAdmissionStatus = 'not-applicable' | 'ready' | 'review' | 'rerun' | 'fail' | 'rejected-no-change';
export type FrontierCodexSemanticCollectAdmissionReasonCode =
  | 'missing-sidecar'
  | 'empty-sidecar'
  | 'stale-source-hash'
  | 'symbol-conflict'
  | 'effect-conflict'
  | 'lossy-import'
  | 'tests-missing'
  | 'kernel-safe-apply'
  | 'kernel-no-op'
  | 'kernel-stale'
  | 'kernel-review-required'
  | 'kernel-blocked-evidence';

type FrontierCodexKernelSafeMergeAdmissionStatus =
  | 'safe-apply'
  | 'no-op'
  | 'rejected-no-change'
  | 'stale'
  | 'review-required'
  | 'blocked-evidence';

interface FrontierCodexKernelSafeMergeAdmission {
  status: FrontierCodexKernelSafeMergeAdmissionStatus;
  reasons: string[];
  reasonCodes: FrontierCodexSemanticCollectAdmissionReasonCode[];
}

export interface FrontierCodexSemanticCollectAdmissionDecision {
  status: FrontierCodexSemanticCollectAdmissionStatus;
  autoMergeCandidate: boolean;
  semanticGatePassed: boolean;
  reasons: string[];
  reasonCodes: FrontierCodexSemanticCollectAdmissionReasonCode[];
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
  const semanticImportSummary = semanticImportSummaryFromBundle(bundle);
  const quality = input.semanticImportQuality ?? summarizeCodexSemanticImportQuality(
    semanticImportSummary,
    input.semanticImportExpected ?? false
  );
  const kernelAdmission = kernelSafeMergeAdmissionFromBundle(bundle, semanticImportSummary);
  const reasonCodes = uniqueStrings([
    ...semanticCollectAdmissionReasonCodes(bundle, quality, {
      hasActionablePatch,
      hasSourceChange,
      wantsAutoMerge
    }),
    ...(kernelAdmission?.reasonCodes ?? [])
  ]) as FrontierCodexSemanticCollectAdmissionReasonCode[];
  const blockers = semanticCollectAdmissionBlockers(quality);
  const staleBlockers = blockers.filter((reason) => reason.includes(' stale'));
  const failBlockers = blockers.filter((reason) =>
    reason.includes(' errors') ||
    reason.includes(' error losses') ||
    reason.includes(' failed proof obligations') ||
    reason.includes(' is blocked') ||
    reason.includes(' rejected candidates')
  );
  const expectedBlockers = semanticExpectedEvidenceBlockers(quality);
  if ((input.staleAgainstHead ?? false) || bundle.staleAgainstHead) {
    return semanticCollectAdmission('rerun', wantsAutoMerge, false, ['semantic collect admission stale against head'], reasonCodes);
  }
  if (kernelAdmission) {
    if (kernelAdmission.status === 'stale') {
      return semanticCollectAdmission('rerun', wantsAutoMerge, false, kernelAdmission.reasons, reasonCodes);
    }
    if (kernelAdmission.status === 'blocked-evidence') {
      return semanticCollectAdmission('fail', wantsAutoMerge, false, kernelAdmission.reasons, reasonCodes);
    }
    if (kernelAdmission.status === 'review-required') {
      return semanticCollectAdmission('review', false, false, kernelAdmission.reasons, reasonCodes);
    }
    if (kernelAdmission.status === 'no-op' || kernelAdmission.status === 'rejected-no-change') {
      const status = kernelAdmission.status === 'rejected-no-change' || hardFailedBundle(bundle) ? 'rejected-no-change' : 'not-applicable';
      return semanticCollectAdmission(status, false, false, uniqueStrings(['no-source-changes', ...kernelAdmission.reasons]), reasonCodes);
    }
    if (kernelAdmission.status === 'safe-apply') {
      if (!hasActionablePatch) {
        return semanticCollectAdmission('not-applicable', false, false, kernelAdmission.reasons, reasonCodes);
      }
      if (staleBlockers.length > 0) return semanticCollectAdmission('rerun', true, false, staleBlockers, reasonCodes);
      if (failBlockers.length > 0) return semanticCollectAdmission('fail', true, false, failBlockers, reasonCodes);
      const kernelGateBlockers = semanticKernelSafeApplyGateBlockers(quality);
      if (kernelGateBlockers.length > 0) return semanticCollectAdmission('review', true, false, kernelGateBlockers, reasonCodes);
      return semanticCollectAdmission('ready', true, true, kernelAdmission.reasons, reasonCodes);
    }
  }
  const priorSemanticReviewReasons = bundle.reasons.filter(semanticCollectReviewReason);
  if (!wantsAutoMerge && priorSemanticReviewReasons.length > 0) {
    return semanticCollectAdmission('review', false, false, priorSemanticReviewReasons, reasonCodes);
  }
  if (!wantsAutoMerge && !hasSourceChange && !quality.present) {
    return semanticCollectAdmission('not-applicable', false, false, [], reasonCodes);
  }
  if (staleBlockers.length > 0) return semanticCollectAdmission('rerun', wantsAutoMerge, false, staleBlockers, reasonCodes);
  if (failBlockers.length > 0) return semanticCollectAdmission('fail', wantsAutoMerge, false, failBlockers, reasonCodes);

  if (wantsAutoMerge || hasActionablePatch && quality.semanticEditAdmission.autoMergeCandidate) {
    const reasons = semanticAutoMergeGateBlockers(quality);
    if (reasons.length > 0) {
      return semanticCollectAdmission('review', wantsAutoMerge || quality.semanticEditAdmission.autoMergeCandidate, false, reasons, reasonCodes);
    }
    return semanticCollectAdmission('ready', true, true, ['semantic auto-merge gate passed'], reasonCodes);
  }
  if (expectedBlockers.length > 0) return semanticCollectAdmission('review', false, false, expectedBlockers, reasonCodes);
  if (blockers.length > 0) return semanticCollectAdmission('review', false, false, blockers, reasonCodes);
  return semanticCollectAdmission('not-applicable', false, false, [], reasonCodes);
}

function semanticKernelSafeApplyGateBlockers(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): string[] {
  const reasons: string[] = [];
  if (quality.present && quality.expected && !quality.expectedSatisfied) {
    reasons.push(quality.expectedMissingReasonCodes.length
      ? `kernel safe-apply semantic import expected evidence unsatisfied: ${quality.expectedMissingReasonCodes.join(',')}`
      : 'kernel safe-apply semantic import expected evidence unsatisfied');
  }
  reasons.push(...semanticCollectAdmissionBlockers(quality));
  if (semanticEditScriptEvidencePresent(quality) && !isCleanSemanticEditOperationScript(quality.semanticEditScript)) {
    reasons.push('kernel safe-apply semantic edit script is not clean');
  }
  if (quality.semanticEditProjection.total > 0 && !isCleanSemanticEditProjection(quality.semanticEditProjection)) {
    reasons.push('kernel safe-apply semantic edit projection gate did not pass cleanly');
  }
  if (semanticEditReplayEvidencePresent(quality) && !semanticEditReplayClean(quality)) {
    reasons.push('kernel safe-apply semantic edit replay gate did not pass cleanly');
  }
  return uniqueStrings(reasons);
}

function semanticEditScriptEvidencePresent(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): boolean {
  const script = quality.semanticEditScript;
  return script.operations > 0 ||
    script.autoMergeCandidates > 0 ||
    script.portable > 0 ||
    script.alreadyApplied > 0 ||
    script.needsPort > 0 ||
    script.conflicts > 0 ||
    script.stale > 0 ||
    script.blocked > 0 ||
    script.reviewRequired > 0 ||
    script.autoApplyCandidates > 0 ||
    Object.keys(script.byStatus).length > 0 ||
    Object.keys(script.admission).length > 0 ||
    script.actions.length > 0 ||
    script.reasonCodes.length > 0 ||
    script.semanticKeys.length > 0;
}

function semanticEditReplayEvidencePresent(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): boolean {
  const replay = quality.semanticEditReplay;
  return replay.total > 0 ||
    replay.acceptedClean > 0 ||
    replay.alreadyApplied > 0 ||
    replay.conflicts > 0 ||
    replay.stale > 0 ||
    replay.blocked > 0 ||
    replay.needsPort > 0 ||
    replay.evidenceOnly > 0 ||
    Object.keys(replay.statusCounts).length > 0 ||
    Object.keys(replay.admission).length > 0 ||
    replay.actions.length > 0 ||
    replay.reasonCodes.length > 0 ||
    replay.semanticKeys.length > 0;
}

function kernelSafeMergeAdmissionFromBundle(
  bundle: FrontierSwarmMergeBundle,
  semanticImportSummary: FrontierSwarmMergeBundle['semanticImport'] | undefined
): FrontierCodexKernelSafeMergeAdmission | undefined {
  const metadata = isRecord(bundle.metadata) ? bundle.metadata : undefined;
  for (const candidate of kernelSafeMergeAdmissionCandidates([
    semanticImportSummary,
    metadata?.semanticImport,
    metadata?.kernelSafeMerge,
    metadata?.kernelSafeMergeAdmission,
    metadata?.safeMerge,
    metadata?.safeMergeAdmission,
    metadata?.semanticMergeAdmission,
    metadata?.mergeAdmission,
    metadata?.collect
  ])) {
    const admission = normalizeKernelSafeMergeAdmission(candidate.record);
    if (admission) return admission;
  }
  return undefined;
}

function kernelSafeMergeAdmissionCandidates(
  roots: readonly unknown[]
): Array<{ record: Record<string, unknown>; path: string[] }> {
  const out: Array<{ record: Record<string, unknown>; path: string[] }> = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, path: string[], depth: number): void => {
    if (depth > 6 || value === null || value === undefined || seen.has(value)) return;
    if (Array.isArray(value)) {
      seen.add(value);
      value.forEach((entry, index) => visit(entry, [...path, String(index)], depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    seen.add(value);
    if (looksLikeKernelSafeMergeAdmission(value, path)) out.push({ record: value, path });
    for (const [key, entry] of Object.entries(value)) {
      if (isRecord(entry) || Array.isArray(entry)) visit(entry, [...path, key], depth + 1);
    }
  };
  roots.forEach((root, index) => visit(root, [`root${index}`], 0));
  return out;
}

function looksLikeKernelSafeMergeAdmission(record: Record<string, unknown>, path: readonly string[]): boolean {
  const pathText = normalizedKernelSignal(path.join('.'));
  const kindText = normalizedKernelSignal(stringValue(record.kind));
  const schemaText = normalizedKernelSignal(stringValue(record.schema));
  const hasAdmissionPath = [
    pathText,
    kindText,
    schemaText
  ].some((entry) =>
    entry.includes('kernelsafemerge') ||
    entry.includes('safemerge') ||
    entry.includes('semanticmergeadmission') ||
    entry.includes('semanticpatchbundle') ||
    entry.includes('semanticeditbundle') ||
    entry.includes('mergeadmission') ||
    entry.includes('admission')
  );
  if (hasAdmissionPath) return true;
  return [
    record.decision,
    record.outcome,
    record.terminalOutcome,
    record.status,
    record.action,
    record.classification,
    record.readiness
  ].some((entry) => !!normalizeKernelSafeMergeStatus(entry, record, false));
}

function normalizeKernelSafeMergeAdmission(
  record: Record<string, unknown>
): FrontierCodexKernelSafeMergeAdmission | undefined {
  const status = normalizeKernelSafeMergeStatus(undefined, record, true) ??
    [
      record.decision,
      record.outcome,
      record.terminalOutcome,
      record.status,
      record.action,
      record.classification,
      record.readiness
    ].map((entry) => normalizeKernelSafeMergeStatus(entry, record, true)).find(Boolean);
  if (!status) return undefined;
  return {
    status,
    reasons: uniqueStrings([
      `kernel safe-merge decision ${status}`,
      ...readStringArray(record.reasons),
      ...readStringArray(record.reasonCodes).map((reason) => `kernel safe-merge reason: ${reason}`),
      ...readStringArray(record.evidenceIds).map((id) => `kernel safe-merge evidence: ${id}`)
    ]),
    reasonCodes: [kernelSafeMergeReasonCode(status)]
  };
}

function normalizeKernelSafeMergeStatus(
  value: unknown,
  record: Record<string, unknown>,
  allowContextualAdmission: boolean
): FrontierCodexKernelSafeMergeAdmissionStatus | undefined {
  const token = normalizedKernelSignal(value);
  if (token === 'safeapply' || token === 'safeapplyready' || token === 'applysafe') return 'safe-apply';
  if (token === 'rejectednochange' || token === 'rejectnochange') return 'rejected-no-change';
  if (token === 'noop' || token === 'nochange' || token === 'unchanged' || token === 'alreadyapplied' || token === 'skip' || token === 'skipped' || token === 'skipexpectedempty' || token === 'expectedempty') {
    return 'no-op';
  }
  if (token === 'stale' || token === 'staleagainsthead' || token === 'needsrerun' || token === 'rerun' || token === 'rerunsemanticimport') return 'stale';
  if (token === 'reviewrequired' || token === 'needsreview' || token === 'review' || token === 'humanreview' || token === 'needsport') return 'review-required';
  if (token === 'blockedevidence' || token === 'blocked' || token === 'block' || token === 'rejectblocked' || token === 'rejectfailedproof' || token === 'failedproof' || token === 'rejectemptyevidence') {
    return 'blocked-evidence';
  }
  if (token === 'safewithlosses') return 'review-required';
  if (token === 'safe' && (record.autoMergeable === true || allowContextualAdmission)) return 'safe-apply';
  if (!allowContextualAdmission) return undefined;
  if ((record.status === 'admitted' || record.action === 'admit') && record.autoApplyCandidate === true) return 'safe-apply';
  if (record.reviewRequired === true) return 'review-required';
  return undefined;
}

function kernelSafeMergeReasonCode(
  status: FrontierCodexKernelSafeMergeAdmissionStatus
): FrontierCodexSemanticCollectAdmissionReasonCode {
  if (status === 'safe-apply') return 'kernel-safe-apply';
  if (status === 'no-op' || status === 'rejected-no-change') return 'kernel-no-op';
  if (status === 'stale') return 'kernel-stale';
  if (status === 'review-required') return 'kernel-review-required';
  return 'kernel-blocked-evidence';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
}

function normalizedKernelSignal(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
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
  const cleanSafeMerge = semanticSafeMergeClean(quality);
  if (quality.semanticEditAdmission.autoMergeCandidate && !cleanSafeMerge && !isCleanSemanticEditOperationScript(quality.semanticEditScript)) {
    reasons.push('auto-merge candidate semantic edit script is not clean');
  }
  if (quality.semanticEditAdmission.autoMergeCandidate && !cleanSafeMerge && !isCleanSemanticEditProjection(quality.semanticEditProjection)) {
    reasons.push('auto-merge candidate semantic edit projection gate did not pass cleanly');
  }
  if (quality.semanticEditAdmission.autoMergeCandidate && !cleanSafeMerge && !semanticEditReplayClean(quality)) {
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
  if (quality.semanticMergeAdmission.conflicts > 0) reasons.push(`semantic merge admission conflicts: ${quality.semanticMergeAdmission.conflicts}`);
  if (quality.semanticMergeAdmission.stale > 0) reasons.push(`semantic merge admission stale: ${quality.semanticMergeAdmission.stale}`);
  if (quality.semanticMergeAdmission.blocked > 0) reasons.push(`semantic merge admission is blocked: ${quality.semanticMergeAdmission.blocked}`);
  if (quality.semanticMergeAdmission.reviewRequired > 0) reasons.push(`semantic merge admission needs review: ${quality.semanticMergeAdmission.reviewRequired}`);
  if (quality.jsTsSafeMergeApply.conflicts > 0) reasons.push(`semantic safe-merge apply conflicts: ${quality.jsTsSafeMergeApply.conflicts}`);
  if (quality.jsTsSafeMergeApply.stale > 0) reasons.push(`semantic safe-merge apply stale: ${quality.jsTsSafeMergeApply.stale}`);
  if (quality.jsTsSafeMergeApply.blocked > 0) reasons.push(`semantic safe-merge apply is blocked: ${quality.jsTsSafeMergeApply.blocked}`);
  if (quality.jsTsSafeMergeApply.needsReview > 0) reasons.push(`semantic safe-merge apply needs review: ${quality.jsTsSafeMergeApply.needsReview}`);
  return uniqueStrings(reasons);
}

function semanticExpectedEvidenceBlockers(
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>
): string[] {
  if (!quality.expected || quality.expectedSatisfied) return [];
  if (!quality.expectedMissingReasonCodes.length) return ['semantic import expected evidence was not satisfied'];
  return [`semantic import expected evidence unsatisfied: ${quality.expectedMissingReasonCodes.join(',')}`];
}

function semanticCollectAdmissionReasonCodes(
  bundle: FrontierSwarmMergeBundle,
  quality: ReturnType<typeof summarizeCodexSemanticImportQuality>,
  input: {
    hasActionablePatch: boolean;
    hasSourceChange: boolean;
    wantsAutoMerge: boolean;
  }
): FrontierCodexSemanticCollectAdmissionReasonCode[] {
  const reasons: FrontierCodexSemanticCollectAdmissionReasonCode[] = [];
  const expectedOrGated = quality.expected || input.wantsAutoMerge || input.hasActionablePatch;
  if (!quality.present && expectedOrGated) reasons.push('missing-sidecar');
  if (quality.present && quality.empty) reasons.push('empty-sidecar');
  if (quality.lossCount > 0 || quality.semanticErrorLosses > 0 || quality.semanticWarningLosses > 0 || hasReadinessLosses(quality)) {
    reasons.push('lossy-import');
  }
  if (
    bundle.staleAgainstHead ||
    quality.semanticEditScript.stale > 0 ||
    quality.semanticEditReplay.stale > 0 ||
    quality.semanticMergeAdmission.stale > 0 ||
    quality.jsTsSafeMergeApply.stale > 0 ||
    semanticReasonSignals(quality).some(isStaleSourceSignal)
  ) {
    reasons.push('stale-source-hash');
  }
  if (
    quality.semanticEditScript.conflicts > 0 ||
    quality.semanticEditReplay.conflicts > 0 ||
    quality.semanticMergeAdmission.conflicts > 0 ||
    quality.jsTsSafeMergeApply.conflicts > 0 ||
    semanticReasonSignals(quality).some(isSymbolConflictSignal)
  ) {
    reasons.push('symbol-conflict');
  }
  if (semanticReasonSignals(quality).some(isEffectConflictSignal)) reasons.push('effect-conflict');
  if (input.hasSourceChange && bundle.commandsPassed.length + bundle.commandsFailed.length === 0) reasons.push('tests-missing');
  return uniqueStrings(reasons) as FrontierCodexSemanticCollectAdmissionReasonCode[];
}

function hasReadinessLosses(quality: ReturnType<typeof summarizeCodexSemanticImportQuality>): boolean {
  return Object.keys(quality.semanticReadiness).some((key) => key.toLowerCase().includes('loss'));
}

function semanticReasonSignals(quality: ReturnType<typeof summarizeCodexSemanticImportQuality>): string[] {
  return uniqueStrings([
    ...quality.expectedMissingReasonCodes,
    ...quality.semanticLineageReasonCodes,
    ...quality.semanticEditScript.reasonCodes,
    ...quality.semanticEditProjection.reasonCodes,
    ...quality.semanticEditReplay.reasonCodes,
    ...quality.semanticEditAdmission.reasons,
    ...quality.semanticMergeAdmission.reasonCodes,
    ...quality.semanticMergeAdmission.conflictReasonCodes,
    ...quality.semanticMergeAdmission.conflictKeys,
    ...quality.jsTsSafeMergeApply.reasonCodes,
    ...quality.jsTsSafeMergeApply.conflictReasonCodes,
    ...quality.jsTsSafeMergeApply.conflictKeys
  ]);
}

function normalizedReasonSignal(value: string): string {
  return value.trim().replace(/_/g, '-').toLowerCase();
}

function isStaleSourceSignal(value: string): boolean {
  const signal = normalizedReasonSignal(value);
  return (signal.includes('stale') || signal.includes('head-') || signal.includes('current-')) &&
    (signal.includes('hash') || signal.includes('anchor') || signal.includes('source') || signal.includes('base'));
}

function isSymbolConflictSignal(value: string): boolean {
  const signal = normalizedReasonSignal(value);
  if (signal.includes('effect')) return false;
  return signal.includes('symbol-conflict') ||
    signal.includes('symbol-anchor') ||
    signal.includes('anchor-content-mismatch') ||
    signal.includes('anchor-changed') ||
    signal.includes('conflict');
}

function isEffectConflictSignal(value: string): boolean {
  const signal = normalizedReasonSignal(value);
  return signal.includes('effect-conflict') ||
    (signal.includes('effect') && (signal.includes('conflict') || signal.includes('mismatch') || signal.includes('blocked')));
}

function semanticEditReplayClean(quality: ReturnType<typeof summarizeCodexSemanticImportQuality>): boolean {
  const replay = quality.semanticEditReplay;
  return semanticSafeMergeClean(quality) || replay.total > 0 &&
    replay.acceptedClean + replay.alreadyApplied > 0 &&
    replay.conflicts + replay.stale + replay.blocked + replay.needsPort === 0;
}

function semanticSafeMergeClean(quality: ReturnType<typeof summarizeCodexSemanticImportQuality>): boolean {
  return quality.jsTsSafeMergeApply.total > 0 &&
    quality.jsTsSafeMergeApply.acceptedClean + quality.jsTsSafeMergeApply.alreadyApplied > 0 &&
    quality.jsTsSafeMergeApply.noOp + quality.jsTsSafeMergeApply.conflicts + quality.jsTsSafeMergeApply.stale +
      quality.jsTsSafeMergeApply.blocked + quality.jsTsSafeMergeApply.needsReview === 0 ||
    quality.semanticMergeAdmission.total > 0 &&
    quality.semanticMergeAdmission.autoMergeable + quality.semanticMergeAdmission.safe > 0 &&
    quality.semanticMergeAdmission.safeWithLosses + quality.semanticMergeAdmission.noOp + quality.semanticMergeAdmission.conflicts +
      quality.semanticMergeAdmission.stale + quality.semanticMergeAdmission.blocked + quality.semanticMergeAdmission.reviewRequired === 0;
}

function semanticCollectAdmission(
  status: FrontierCodexSemanticCollectAdmissionStatus,
  autoMergeCandidate: boolean,
  semanticGatePassed: boolean,
  reasons: string[],
  reasonCodes: readonly FrontierCodexSemanticCollectAdmissionReasonCode[] = []
): FrontierCodexSemanticCollectAdmissionDecision {
  return {
    status,
    autoMergeCandidate,
    semanticGatePassed,
    reasons: uniqueStrings(reasons),
    reasonCodes: uniqueStrings(reasonCodes) as FrontierCodexSemanticCollectAdmissionReasonCode[]
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
