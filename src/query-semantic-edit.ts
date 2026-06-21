import { isObject, nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';
import {
  canonicalSemanticEditStatus,
  classifySemanticEditScriptAdmission,
  semanticEditScriptAdmissionCount,
  semanticEditScriptFromUnknown,
  semanticEditScriptHasAdmission,
  semanticEditScriptHasStatus
} from './semantic-edit-admission.js';
import type { FrontierCodexSemanticEditAdmissionDecision } from './types-semantic-edit.js';

export interface SemanticEditQuery {
  semanticEditStatus?: string;
  semanticEditAdmission?: string;
  semanticEditProjection?: string;
  semanticMergeAdmission?: string;
  safeMergeApplyDecision?: string;
  semanticMergeDecision?: string;
  semanticEditKey?: string;
  semanticIdentityHash?: string;
  sourceIdentityHash?: string;
  operationContentHash?: string;
  editContentHash?: string;
  semanticTransformKey?: string;
  semanticTransformIdentityHash?: string;
  semanticTransformContentHash?: string;
  projectionIdentityHash?: string;
}

export interface SemanticEditProjectionQuerySummary {
  projected: number;
  blocked: number;
  edits: number;
  appliedEdits: number;
  alreadyAppliedEdits: number;
  deletedBytes: number;
  replacementBytes: number;
  anchorKeys: string[];
  conflictKeys: string[];
  symbolNames: string[];
  sourcePaths: string[];
  semanticKeys: string[];
  semanticIdentityHashes: string[];
  sourceIdentityHashes: string[];
  operationContentHashes: string[];
  editContentHashes: string[];
  semanticTransformKeys: string[]; semanticTransformIdentityHashes: string[];
  semanticTransformContentHashes: string[]; projectionIdentityHashes: string[];
  workerMatches: number;
  workerMismatches: number;
  workerUnknown: number;
}

export interface KernelSemanticMergeQuerySummary {
  ticketCount: number;
  statusCounts: Record<string, number>;
  statuses: string[];
  safeCount: number;
  safeWithLossesCount: number;
  noOpCount: number;
  staleCount: number;
  reviewRequiredCount: number;
  blockedCount: number;
  blockedEvidenceCount: number;
  autoApplyableCount: number;
  reasonCodes: string[];
  reasons: string[];
}

export interface KernelSemanticMergeQueryDetail extends KernelSemanticMergeQuerySummary {
  status?: string;
  autoApplyable: boolean;
  conflictKeys: string[];
}

export interface SafeMergeApplyDecisionQuerySummary {
  decisionCounts: Record<string, number>;
  decisions: string[];
  safeCount: number;
  noOpCount: number;
  staleCount: number;
  reviewCount: number;
  blockedCount: number;
}

const KERNEL_SEMANTIC_MERGE_STATUS_ORDER = [
  'safe',
  'safe-with-losses',
  'no-op',
  'stale',
  'review-required',
  'blocked',
  'blocked-evidence',
  'auto-applyable'
];

export function jobSemanticEditScript(job: Record<string, unknown>): unknown {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const semanticImport = isObject(job.semanticImport) ? job.semanticImport : {};
  return quality.semanticEditScript ?? semanticImport.semanticEditScripts ?? semanticImport.semanticEditScript;
}

export function jobSemanticEditAdmission(job: Record<string, unknown>): unknown {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  return job.semanticEditAdmission ?? quality.semanticEditAdmission;
}

export function jobSemanticEditProjection(job: Record<string, unknown>): unknown {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const semanticImport = isObject(job.semanticImport) ? job.semanticImport : {};
  const compact = isObject(job.semanticCompactSummary) ? job.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return quality.semanticEditProjection ?? semanticEdit.projection ?? semanticImport.semanticEditProjections;
}

export function matchesSemanticEdit(scriptValue: unknown, input: SemanticEditQuery, haystack: string, admissionValue?: unknown): boolean {
  const identityOnly = input.semanticEditStatus === undefined && input.semanticEditAdmission === undefined;
  const hasIdentityFilter = input.semanticEditKey !== undefined ||
    input.semanticIdentityHash !== undefined ||
    input.sourceIdentityHash !== undefined ||
    input.operationContentHash !== undefined ||
    input.editContentHash !== undefined ||
    input.semanticTransformKey !== undefined ||
    input.semanticTransformIdentityHash !== undefined ||
    input.semanticTransformContentHash !== undefined ||
    input.projectionIdentityHash !== undefined;
  if (identityOnly && !hasIdentityFilter) return true;
  const hasScript = scriptValue !== undefined;
  const script = scriptValue === undefined ? undefined : semanticEditScriptFromUnknown(scriptValue);
  const admission = semanticEditAdmissionFromUnknown(admissionValue, script);
  return (input.semanticEditStatus === undefined || semanticEditScriptHasStatus(script, input.semanticEditStatus) || !hasScript && semanticEditTextMatch(haystack, input.semanticEditStatus))
    && (input.semanticEditAdmission === undefined ||
      semanticEditAdmissionMatches(admission, input.semanticEditAdmission) ||
      semanticEditScriptHasAdmission(script, input.semanticEditAdmission) ||
      !hasScript && semanticEditTextMatch(haystack, input.semanticEditAdmission))
    && semanticEditScriptIdentityMatches(script, input, haystack);
}

export function matchesSemanticEditProjection(value: unknown, input: SemanticEditQuery, haystack: string): boolean {
  const projection = isObject(value) ? value : {};
  return matchesProjectionStatus(projection, input.semanticEditProjection, haystack)
    && projectionArrayMatches(projection, 'semanticKeys', input.semanticEditKey, haystack)
    && projectionArrayMatches(projection, 'semanticIdentityHashes', input.semanticIdentityHash, haystack)
    && projectionArrayMatches(projection, 'sourceIdentityHashes', input.sourceIdentityHash, haystack)
    && projectionArrayMatches(projection, 'operationContentHashes', input.operationContentHash, haystack)
    && projectionArrayMatches(projection, 'editContentHashes', input.editContentHash, haystack)
    && projectionArrayMatches(projection, 'semanticTransformKeys', input.semanticTransformKey, haystack)
    && projectionArrayMatches(projection, 'semanticTransformIdentityHashes', input.semanticTransformIdentityHash, haystack)
    && projectionArrayMatches(projection, 'semanticTransformContentHashes', input.semanticTransformContentHash, haystack)
    && projectionArrayMatches(projection, 'projectionIdentityHashes', input.projectionIdentityHash, haystack);
}

export function matchesEvidenceSemanticEdit(entry: Record<string, unknown>, input: SemanticEditQuery, haystack: string): boolean {
  const facets = isObject(entry.facets) ? entry.facets : {};
  return matchesSemanticEdit(facetsToSemanticEditScript(facets), input, haystack, facetsToSemanticEditAdmission(facets)) &&
    matchesSemanticEditProjection(facetsToSemanticEditProjection(facets), input, haystack);
}

export function matchesSemanticSafeMergeJob(job: Record<string, unknown>, input: SemanticEditQuery, haystack = JSON.stringify(job).toLowerCase()): boolean {
  return matchesKernelSemanticMergeStatus(semanticMergeAdmissionFromJob(job), input.semanticMergeAdmission, haystack, true) &&
    matchesKernelSemanticMergeStatus(safeMergeApplyDecisionFromJob(job), input.safeMergeApplyDecision ?? input.semanticMergeDecision, haystack, false);
}

export function matchesSemanticSafeMergeArtifact(record: unknown, input: SemanticEditQuery, haystack = JSON.stringify(record).toLowerCase()): boolean {
  const row = isObject(record) ? record : {};
  return matchesKernelSemanticMergeStatus(semanticMergeAdmissionFromJob(row), input.semanticMergeAdmission, haystack, true) &&
    matchesKernelSemanticMergeStatus(safeMergeApplyDecisionFromJob(row), input.safeMergeApplyDecision ?? input.semanticMergeDecision, haystack, false);
}

export function matchesEvidenceSemanticSafeMerge(entry: Record<string, unknown>, input: SemanticEditQuery, haystack = JSON.stringify(entry).toLowerCase()): boolean {
  return matchesKernelSemanticMergeStatus(semanticMergeAdmissionFromJob(entry), input.semanticMergeAdmission, haystack, true) &&
    matchesKernelSemanticMergeStatus(safeMergeApplyDecisionFromJob(entry), input.safeMergeApplyDecision ?? input.semanticMergeDecision, haystack, false);
}

export function semanticEditAdmissionSummary(jobs: Record<string, unknown>[]) {
  const statusCounts = jobs.reduce<Record<string, number>>((out, job) => {
    const admission = semanticEditAdmissionFromUnknown(jobSemanticEditAdmission(job), semanticEditScriptFromUnknown(jobSemanticEditScript(job)));
    out[admission.status] = (out[admission.status] ?? 0) + 1;
    return out;
  }, {});
  return {
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    autoMergeCandidateCount: jobs.filter((job) => semanticEditAdmissionFromUnknown(jobSemanticEditAdmission(job), semanticEditScriptFromUnknown(jobSemanticEditScript(job))).autoMergeCandidate).length,
    cleanEligibleCount: jobs.filter((job) => semanticEditAdmissionFromUnknown(jobSemanticEditAdmission(job), semanticEditScriptFromUnknown(jobSemanticEditScript(job))).cleanEligible).length
  };
}

export function semanticEditScriptAdmissionSummary(jobs: Record<string, unknown>[]) {
  return {
    autoMergeCandidateCount: jobs.filter((job) => semanticEditScriptAdmissionCount(semanticEditScriptFromUnknown(jobSemanticEditScript(job)), 'auto-merge-candidate') > 0).length,
    cleanEligibleCandidateCount: jobs.filter((job) => {
      const script = semanticEditScriptFromUnknown(jobSemanticEditScript(job));
      return semanticEditScriptAdmissionCount(script, 'auto-merge-candidate') > 0 && semanticEditScriptHasStatus(script, 'portable');
    }).length
  };
}

export function kernelSemanticMergeSummary(jobs: Record<string, unknown>[]): KernelSemanticMergeQuerySummary {
  return kernelSemanticMergeSummaryFromDetails(jobs.map((job) => kernelSemanticMergeFromJob(job)));
}

export function semanticMergeAdmissionSummary(jobs: Record<string, unknown>[]): KernelSemanticMergeQuerySummary {
  return kernelSemanticMergeSummaryFromDetails(jobs.map((job) => semanticMergeAdmissionFromJob(job)));
}

export function safeMergeApplyDecisionSummary(jobs: Record<string, unknown>[]): SafeMergeApplyDecisionQuerySummary {
  const statusCounts = kernelSemanticMergeSummaryFromDetails(jobs.map((job) => safeMergeApplyDecisionFromJob(job))).statusCounts;
  const decisionCounts = Object.fromEntries(Object.entries(statusCounts).filter(([, count]) => count > 0));
  if ((decisionCounts['review-required'] ?? 0) > 0) decisionCounts.review = decisionCounts['review-required'];
  return {
    decisionCounts,
    decisions: orderedKernelSemanticMergeStatuses(decisionCounts),
    safeCount: (decisionCounts.safe ?? 0) + (decisionCounts['safe-with-losses'] ?? 0) + (decisionCounts['auto-applyable'] ?? 0),
    noOpCount: decisionCounts['no-op'] ?? 0,
    staleCount: decisionCounts.stale ?? 0,
    reviewCount: decisionCounts['review-required'] ?? 0,
    blockedCount: (decisionCounts.blocked ?? 0) + (decisionCounts['blocked-evidence'] ?? 0)
  };
}

export function kernelSemanticMergeSummaryFromDetails(
  details: readonly KernelSemanticMergeQueryDetail[]
): KernelSemanticMergeQuerySummary {
  const signaledDetails = details.filter((detail) => hasKernelSemanticMergeSignal(detail));
  const statusCounts: Record<string, number> = {};
  for (const detail of signaledDetails) {
    for (const [status, count] of Object.entries(detail.statusCounts)) {
      statusCounts[status] = (statusCounts[status] ?? 0) + count;
    }
    if (detail.autoApplyable && (detail.statusCounts['auto-applyable'] ?? 0) === 0) {
      statusCounts['auto-applyable'] = (statusCounts['auto-applyable'] ?? 0) + 1;
    }
  }
  return kernelSemanticMergeSummaryFromCounts({
    ticketCount: signaledDetails.length,
    statusCounts,
    reasonCodes: uniqueStrings(signaledDetails.flatMap((detail) => detail.reasonCodes)).slice(0, 24),
    reasons: uniqueStrings(signaledDetails.flatMap((detail) => detail.reasons)).slice(0, 24)
  });
}

export function kernelSemanticMergeFromBundle(value: unknown): KernelSemanticMergeQueryDetail {
  const detail = emptyKernelSemanticMergeDetail();
  const bundle = isObject(value) ? value : {};
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  collectKernelSemanticMergeSource(bundle.kernelSemanticMerge, detail);
  collectKernelSemanticMergeSource(bundle.semanticKernelMerge, detail);
  collectKernelSemanticMergeSource(bundle.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(bundle.safeMerge, detail);
  collectKernelSemanticMergeSource(bundle.safeMergeAdmission, detail);
  collectKernelSemanticMergeSource(bundle.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(bundle.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(bundle.semanticMergeDecision, detail);
  collectKernelSemanticMergeSource(metadata.kernelSemanticMerge, detail);
  collectKernelSemanticMergeSource(metadata.semanticKernelMerge, detail);
  collectKernelSemanticMergeSource(metadata.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(metadata.safeMerge, detail);
  collectKernelSemanticMergeSource(metadata.safeMergeAdmission, detail);
  collectKernelSemanticMergeSource(metadata.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(metadata.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(metadata.semanticMergeDecision, detail);
  const metadataSemanticImport = isObject(metadata.semanticImport) && Object.keys(metadata.semanticImport).length > 0
    ? metadata.semanticImport
    : undefined;
  collectKernelSemanticMergeSource(metadataSemanticImport ?? bundle.semanticImport, detail);
  collectKernelSemanticMergeApplySignals(bundle, detail);
  return finalizeKernelSemanticMergeDetail(detail);
}

export function kernelSemanticMergeFromJob(job: Record<string, unknown>): KernelSemanticMergeQueryDetail {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const detail = emptyKernelSemanticMergeDetail();
  collectKernelSemanticMergeSource(job.kernelSemanticMerge, detail);
  collectKernelSemanticMergeSource(job.semanticKernelMerge, detail);
  collectKernelSemanticMergeSource(job.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(quality.kernelSemanticMerge, detail);
  collectKernelSemanticMergeSource(quality.semanticKernelMerge, detail);
  collectKernelSemanticMergeSource(quality.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(quality.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(quality.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(quality.semanticMergeDecision, detail);
  collectKernelSemanticMergeSource(job.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(job.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(job.semanticMergeDecision, detail);
  if (Object.keys(detail.statusCounts).length === 0) collectKernelSemanticMergeSource(job.semanticImport, detail);
  collectKernelSemanticMergeApplySignals(job, detail);
  return finalizeKernelSemanticMergeDetail(detail);
}

function semanticMergeAdmissionFromJob(job: Record<string, unknown>): KernelSemanticMergeQueryDetail {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const semanticImport = isObject(job.semanticImport) ? job.semanticImport : {};
  const metadata = isObject(job.metadata) ? job.metadata : {};
  const detail = emptyKernelSemanticMergeDetail();
  collectKernelSemanticMergeSource(job.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(job.kernelSafeMergeAdmission, detail);
  collectKernelSemanticMergeSource(job.safeMergeAdmission, detail);
  collectKernelSemanticMergeSource(quality.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(quality.kernelSafeMergeAdmission, detail);
  collectKernelSemanticMergeSource(quality.safeMergeAdmission, detail);
  collectKernelSemanticMergeSource(semanticImport.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(semanticImport.kernelSafeMergeAdmission, detail);
  collectKernelSemanticMergeSource(semanticImport.safeMergeAdmission, detail);
  collectKernelSemanticMergeSource(metadata.semanticMergeAdmission, detail);
  collectKernelSemanticMergeSource(metadata.kernelSafeMergeAdmission, detail);
  collectKernelSemanticMergeSource(metadata.safeMergeAdmission, detail);
  return finalizeKernelSemanticMergeDetail(detail);
}

function safeMergeApplyDecisionFromJob(job: Record<string, unknown>): KernelSemanticMergeQueryDetail {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const semanticImport = isObject(job.semanticImport) ? job.semanticImport : {};
  const metadata = isObject(job.metadata) ? job.metadata : {};
  const detail = emptyKernelSemanticMergeDetail();
  collectKernelSemanticMergeSource(job.safeMergeApply, detail);
  collectKernelSemanticMergeSource(job.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(job.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(job.semanticMergeDecision, detail);
  collectKernelSemanticMergeSource(quality.safeMergeApply, detail);
  collectKernelSemanticMergeSource(quality.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(quality.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(quality.semanticMergeDecision, detail);
  collectKernelSemanticMergeSource(semanticImport.safeMergeApply, detail);
  collectKernelSemanticMergeSource(semanticImport.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(semanticImport.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(semanticImport.semanticMergeDecision, detail);
  collectKernelSemanticMergeSource(metadata.safeMergeApply, detail);
  collectKernelSemanticMergeSource(metadata.safeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(metadata.jsTsSafeMergeApplyDecision, detail);
  collectKernelSemanticMergeSource(metadata.semanticMergeDecision, detail);
  return finalizeKernelSemanticMergeDetail(detail);
}

export function semanticEditProjectionSummary(jobs: Record<string, unknown>[]): SemanticEditProjectionQuerySummary {
  return jobs.reduce<SemanticEditProjectionQuerySummary>((out, job) => {
    const projection = isObject(jobSemanticEditProjection(job)) ? jobSemanticEditProjection(job) as Record<string, unknown> : {};
    out.projected += nonNegativeNumber(projection.projected);
    out.blocked += nonNegativeNumber(projection.blocked);
    out.edits += nonNegativeNumber(projection.editCount);
    out.appliedEdits += nonNegativeNumber(projection.appliedEditCount);
    out.alreadyAppliedEdits += nonNegativeNumber(projection.alreadyAppliedEditCount);
    out.deletedBytes += nonNegativeNumber(projection.deletedBytes);
    out.replacementBytes += nonNegativeNumber(projection.replacementBytes);
    out.anchorKeys = uniqueStrings([...out.anchorKeys, ...readStringArray(projection.anchorKeys)]);
    out.conflictKeys = uniqueStrings([...out.conflictKeys, ...readStringArray(projection.conflictKeys)]);
    out.symbolNames = uniqueStrings([...out.symbolNames, ...readStringArray(projection.symbolNames)]);
    out.sourcePaths = uniqueStrings([...out.sourcePaths, ...readStringArray(projection.sourcePaths)]);
    out.semanticKeys = uniqueStrings([...out.semanticKeys, ...readStringArray(projection.semanticKeys)]);
    out.semanticIdentityHashes = uniqueStrings([...out.semanticIdentityHashes, ...readStringArray(projection.semanticIdentityHashes)]);
    out.sourceIdentityHashes = uniqueStrings([...out.sourceIdentityHashes, ...readStringArray(projection.sourceIdentityHashes)]);
    out.operationContentHashes = uniqueStrings([...out.operationContentHashes, ...readStringArray(projection.operationContentHashes)]);
    out.editContentHashes = uniqueStrings([...out.editContentHashes, ...readStringArray(projection.editContentHashes)]);
    out.semanticTransformKeys = uniqueStrings([...out.semanticTransformKeys, ...readStringArray(projection.semanticTransformKeys)]);
    out.semanticTransformIdentityHashes = uniqueStrings([...out.semanticTransformIdentityHashes, ...readStringArray(projection.semanticTransformIdentityHashes)]);
    out.semanticTransformContentHashes = uniqueStrings([...out.semanticTransformContentHashes, ...readStringArray(projection.semanticTransformContentHashes)]);
    out.projectionIdentityHashes = uniqueStrings([...out.projectionIdentityHashes, ...readStringArray(projection.projectionIdentityHashes)]);
    out.workerMatches += nonNegativeNumber(projection.projectedSourceMatchesWorker);
    out.workerMismatches += nonNegativeNumber(projection.projectedSourceMismatchesWorker);
    out.workerUnknown += nonNegativeNumber(projection.projectedSourceMatchUnknown);
    return out;
  }, {
    projected: 0,
    blocked: 0,
    edits: 0,
    appliedEdits: 0,
    alreadyAppliedEdits: 0,
    deletedBytes: 0,
    replacementBytes: 0,
    anchorKeys: [],
    conflictKeys: [],
    symbolNames: [],
    sourcePaths: [],
    semanticKeys: [],
    semanticIdentityHashes: [],
    sourceIdentityHashes: [],
    operationContentHashes: [],
    editContentHashes: [],
    semanticTransformKeys: [],
    semanticTransformIdentityHashes: [],
    semanticTransformContentHashes: [],
    projectionIdentityHashes: [],
    workerMatches: 0,
    workerMismatches: 0,
    workerUnknown: 0
  });
}

function emptyKernelSemanticMergeDetail(): KernelSemanticMergeQueryDetail {
  return {
    ticketCount: 0,
    statusCounts: {},
    statuses: [],
    safeCount: 0,
    safeWithLossesCount: 0,
    noOpCount: 0,
    staleCount: 0,
    reviewRequiredCount: 0,
    blockedCount: 0,
    blockedEvidenceCount: 0,
    autoApplyableCount: 0,
    autoApplyable: false,
    reasonCodes: [],
    reasons: [],
    conflictKeys: []
  };
}

function collectKernelSemanticMergeSource(value: unknown, detail: KernelSemanticMergeQueryDetail): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectKernelSemanticMergeSource(entry, detail);
    return;
  }
  if (!isObject(value)) return;

  const records = recordsFromUnknown(value.records);
  if (records.length > 0) {
    const before = totalKernelSemanticMergeStatusCount(detail);
    for (const record of records) collectKernelSemanticMergeSource(record, detail);
    if (totalKernelSemanticMergeStatusCount(detail) > before) collectKernelSemanticMergeReasons(value, detail);
    return;
  }

  const summary = isObject(value.summary) ? value.summary : undefined;
  if (summary && collectKernelSemanticMergeAggregate(summary, detail)) {
    collectKernelSemanticMergeReasons(summary, detail);
    return;
  }
  if (collectKernelSemanticMergeAggregate(value, detail)) {
    collectKernelSemanticMergeReasons(value, detail);
    return;
  }

  const admission = firstObjectValue(value, [
    'kernelSemanticMerge',
    'semanticKernelMerge',
    'semanticMergeAdmission',
    'semanticMergeAdmissions',
    'safeMerge',
    'safeMergeAdmission',
    'safeMergeApply',
    'safeMergeApplyDecision',
    'jsTsSafeMergeApplyDecision',
    'semanticMergeDecision',
    'semanticSafeMerge',
    'mergeAdmission',
    'evidenceAdmission',
    'semanticSliceAdmission'
  ]);
  if (admission) {
    collectKernelSemanticMergeReasons(value, detail);
    collectKernelSemanticMergeSource(admission, detail);
    return;
  }

  const fallback = firstObjectValue(value, ['mergeCandidate', 'semanticSlice', 'semanticSidecar']);
  if (fallback) {
    collectKernelSemanticMergeReasons(value, detail);
    collectKernelSemanticMergeSource(fallback, detail);
  }
}

function collectKernelSemanticMergeAggregate(
  value: Record<string, unknown>,
  detail: KernelSemanticMergeQueryDetail
): boolean {
  let collected = false;
  const statusCounts = isObject(value.statusCounts) ? value.statusCounts : undefined;
  let collectedStatusCounts = false;
  if (statusCounts) {
    for (const [status, count] of Object.entries(statusCounts)) {
      const added = addKernelSemanticMergeStatus(detail, status, count);
      collectedStatusCounts = added || collectedStatusCounts;
      collected = added || collected;
    }
  }
  if (!collectedStatusCounts) {
    for (const [field, status] of [
      ['safeCount', 'safe'],
      ['safeWithLossesCount', 'safe-with-losses'],
      ['noOpCount', 'no-op'],
      ['staleCount', 'stale'],
      ['reviewRequiredCount', 'review-required'],
      ['blockedCount', 'blocked'],
      ['blockedEvidenceCount', 'blocked-evidence'],
      ['autoApplyableCount', 'auto-applyable']
    ] as const) {
      collected = addKernelSemanticMergeStatus(detail, status, value[field]) || collected;
    }
  }
  const semanticSliceAdmissions = isObject(value.semanticSliceAdmissions) ? value.semanticSliceAdmissions : undefined;
  if (semanticSliceAdmissions) {
    collected = collectSemanticSliceAdmissionSummary(semanticSliceAdmissions, detail) || collected;
  }
  if (!collectedStatusCounts) {
    const classification = firstStringValue(value, ['classification', 'status']);
    if (classification) collected = addKernelSemanticMergeStatus(detail, classification, 1) || collected;
    const readiness = firstStringValue(value, ['readiness', 'mergeReadiness']);
    if (readiness && hasKernelSemanticMergeRecordShape(value)) {
      collected = addKernelSemanticMergeStatus(detail, readiness, 1) || collected;
    }
    const action = firstStringValue(value, ['action', 'applyAction', 'decision']);
    const actionStatus = normalizedKernelSemanticMergeStatus(action);
    if (actionStatus && (detail.statusCounts[actionStatus] ?? 0) === 0) {
      collected = addKernelSemanticMergeStatus(detail, actionStatus, 1) || collected;
    }
    if (value.reviewRequired === true && (detail.statusCounts['review-required'] ?? 0) === 0) {
      collected = addKernelSemanticMergeStatus(detail, 'review-required', 1) || collected;
    }
    if (value.autoMergeable === true || value.autoApplyable === true || value.autoApplyCandidate === true) {
      detail.autoApplyable = true;
      collected = addKernelSemanticMergeStatus(detail, 'auto-applyable', 1) || collected;
    }
    if (value.mergeable === true && !collected) collected = addKernelSemanticMergeStatus(detail, 'safe', 1) || collected;
  } else {
    const classification = normalizedKernelSemanticMergeStatus(value.classification);
    if (classification && (detail.statusCounts[classification] ?? 0) === 0) {
      collected = addKernelSemanticMergeStatus(detail, classification, 1) || collected;
    }
    const action = normalizedKernelSemanticMergeStatus(value.action ?? value.applyAction ?? value.decision);
    if (action && (detail.statusCounts[action] ?? 0) === 0) {
      collected = addKernelSemanticMergeStatus(detail, action, 1) || collected;
    }
    if (
      (value.autoMergeable === true || value.autoApplyable === true || value.autoApplyCandidate === true) &&
      (detail.statusCounts['auto-applyable'] ?? 0) === 0
    ) {
      detail.autoApplyable = true;
      collected = addKernelSemanticMergeStatus(detail, 'auto-applyable', 1) || collected;
    }
  }
  if (recordsFromUnknown(value.evidence).some((entry) => normalizedKernelSemanticMergeStatus(entry.status) === 'blocked' || String(entry.status ?? '').toLowerCase() === 'failed')) {
    collected = addKernelSemanticMergeStatus(detail, 'blocked-evidence', 1) || collected;
  }
  detail.conflictKeys = uniqueStrings([
    ...detail.conflictKeys,
    ...readStringArray(value.conflictKeys),
    ...readStringArray(value.conflictKeyKinds)
  ]).slice(0, 24);
  return collected;
}

function collectSemanticSliceAdmissionSummary(
  value: Record<string, unknown>,
  detail: KernelSemanticMergeQueryDetail
): boolean {
  let collected = false;
  const byAction = isObject(value.byAction) ? value.byAction : {};
  for (const [action, count] of Object.entries(byAction)) {
    collected = addKernelSemanticMergeStatus(detail, action, count) || collected;
  }
  if (Object.keys(byAction).length === 0) {
    collected = addKernelSemanticMergeStatus(detail, 'admit', value.admitted) || collected;
    collected = addKernelSemanticMergeStatus(detail, 'prioritize', value.prioritized) || collected;
    collected = addKernelSemanticMergeStatus(detail, 'reject', value.rejected) || collected;
  }
  return collected;
}

function collectKernelSemanticMergeApplySignals(
  value: Record<string, unknown>,
  detail: KernelSemanticMergeQueryDetail
): void {
  const signals = uniqueStrings([
    ...['bucket', 'disposition', 'mergeReadiness', 'status'].map((key) => String(value[key] ?? '')),
    ...readStringArray(value.reasons),
    ...readStringArray(value.reasonCodes)
  ]).map((entry) => entry.toLowerCase().replace(/_/g, '-'));
  if (signals.some((signal) => signal === 'ready-to-apply' || signal === 'auto-mergeable' || signal === 'auto-applyable')) {
    detail.autoApplyable = true;
    addKernelSemanticMergeStatus(detail, 'auto-applyable', 1);
  }
  collectKernelSemanticMergeReasons(value, detail);
}

function collectKernelSemanticMergeReasons(
  value: Record<string, unknown>,
  detail: KernelSemanticMergeQueryDetail
): void {
  detail.reasonCodes = uniqueStrings([
    ...detail.reasonCodes,
    ...readStringArray(value.reasonCodes),
    ...readStringArray(value.expectedMissingReasonCodes),
    ...readStringArray(value.semanticImportExpectedMissingReasonCodes)
  ]).slice(0, 24);
  detail.reasons = uniqueStrings([
    ...detail.reasons,
    ...readStringArray(value.reasons),
    ...readStringArray(value.warnings),
    ...readStringArray(value.errors),
    typeof value.reason === 'string' ? value.reason : '',
    typeof value.error === 'string' ? value.error : ''
  ]).slice(0, 24);
}

function addKernelSemanticMergeStatus(
  detail: KernelSemanticMergeQueryDetail,
  value: unknown,
  countValue: unknown
): boolean {
  const count = nonNegativeNumber(countValue);
  if (count === 0) return false;
  const status = normalizedKernelSemanticMergeStatus(value);
  if (!status) return false;
  detail.statusCounts[status] = (detail.statusCounts[status] ?? 0) + count;
  if (status === 'auto-applyable') detail.autoApplyable = true;
  return true;
}

function finalizeKernelSemanticMergeDetail(detail: KernelSemanticMergeQueryDetail): KernelSemanticMergeQueryDetail {
  const summary = kernelSemanticMergeSummaryFromCounts({
    ticketCount: hasKernelSemanticMergeSignal(detail) ? 1 : 0,
    statusCounts: detail.statusCounts,
    reasonCodes: detail.reasonCodes,
    reasons: detail.reasons
  });
  return {
    ...detail,
    ...summary,
    status: summary.statuses[0],
    autoApplyable: detail.autoApplyable || (summary.statusCounts['auto-applyable'] ?? 0) > 0,
    conflictKeys: uniqueStrings(detail.conflictKeys).slice(0, 24)
  };
}

function kernelSemanticMergeSummaryFromCounts(input: {
  ticketCount: number;
  statusCounts: Record<string, number>;
  reasonCodes: string[];
  reasons: string[];
}): KernelSemanticMergeQuerySummary {
  const statusCounts = Object.fromEntries(Object.entries(input.statusCounts).filter(([, count]) => count > 0));
  const statuses = orderedKernelSemanticMergeStatuses(statusCounts);
  return {
    ticketCount: input.ticketCount,
    statusCounts,
    statuses,
    safeCount: statusCounts.safe ?? 0,
    safeWithLossesCount: statusCounts['safe-with-losses'] ?? 0,
    noOpCount: statusCounts['no-op'] ?? 0,
    staleCount: statusCounts.stale ?? 0,
    reviewRequiredCount: statusCounts['review-required'] ?? 0,
    blockedCount: statusCounts.blocked ?? 0,
    blockedEvidenceCount: statusCounts['blocked-evidence'] ?? 0,
    autoApplyableCount: statusCounts['auto-applyable'] ?? 0,
    reasonCodes: uniqueStrings(input.reasonCodes).slice(0, 24),
    reasons: uniqueStrings(input.reasons).slice(0, 24)
  };
}

function orderedKernelSemanticMergeStatuses(statusCounts: Record<string, number>): string[] {
  const known = KERNEL_SEMANTIC_MERGE_STATUS_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0);
  const extras = Object.keys(statusCounts)
    .filter((status) => !KERNEL_SEMANTIC_MERGE_STATUS_ORDER.includes(status))
    .sort();
  return [...known, ...extras];
}

function hasKernelSemanticMergeSignal(detail: KernelSemanticMergeQueryDetail): boolean {
  return Object.keys(detail.statusCounts).length > 0 || detail.autoApplyable;
}

function matchesKernelSemanticMergeDetail(detail: KernelSemanticMergeQueryDetail, input: SemanticEditQuery, haystack: string): boolean {
  return matchesKernelSemanticMergeStatus(detail, input.semanticMergeAdmission, haystack, true) &&
    matchesKernelSemanticMergeStatus(detail, input.safeMergeApplyDecision ?? input.semanticMergeDecision, haystack, false);
}

function matchesKernelSemanticMergeStatus(detail: KernelSemanticMergeQueryDetail, value: string | undefined, haystack: string, includeSafeWithLosses: boolean): boolean {
  if (value === undefined) return true;
  const wanted = normalizedKernelSemanticMergeStatus(value);
  if (!wanted) return semanticEditTextMatch(haystack, value);
  if (wanted === 'safe') {
    return (detail.statusCounts.safe ?? 0) > 0 ||
      includeSafeWithLosses && (detail.statusCounts['safe-with-losses'] ?? 0) > 0 ||
      (detail.statusCounts['auto-applyable'] ?? 0) > 0 ||
      detail.autoApplyable ||
      !hasKernelSemanticMergeSignal(detail) && semanticEditTextMatch(haystack, value);
  }
  if ((detail.statusCounts[wanted] ?? 0) > 0) return true;
  return !hasKernelSemanticMergeSignal(detail) && semanticEditTextMatch(haystack, value);
}

function totalKernelSemanticMergeStatusCount(detail: KernelSemanticMergeQueryDetail): number {
  return Object.values(detail.statusCounts).reduce((sum, count) => sum + count, 0);
}

function normalizedKernelSemanticMergeStatus(value: unknown): string | undefined {
  const status = String(value ?? '').trim().replace(/_/g, '-').toLowerCase();
  if (!status) return undefined;
  if (status === 'safe' || status === 'ready' || status === 'admit' || status === 'mergeable') return 'safe';
  if (status === 'safe-with-losses' || status === 'ready-with-losses') return 'safe-with-losses';
  if (status === 'no-op' || status === 'noop' || status === 'no-change' || status === 'already-applied' || status.startsWith('skip-')) return 'no-op';
  if (status === 'stale' || status === 'stale-against-head' || status === 'rerun-semantic-import') return 'stale';
  if (status === 'review' || status === 'review-required' || status === 'needs-review' || status === 'manual-review' || status === 'prioritize') return 'review-required';
  if (status === 'blocked-evidence' || status === 'failed-evidence' || status === 'evidence-failed') return 'blocked-evidence';
  if (status === 'blocked' || status === 'block' || status === 'reject' || status === 'rejected' || status === 'conflict') return 'blocked';
  if (status === 'auto-applyable' || status === 'auto-apply-candidate' || status === 'autoapplycandidate' || status === 'auto-mergeable') return 'auto-applyable';
  return undefined;
}

function hasKernelSemanticMergeRecordShape(value: Record<string, unknown>): boolean {
  return typeof value.kind === 'string' && value.kind.includes('semanticMergeAdmission') ||
    value.autoMergeable !== undefined ||
    value.autoApplyable !== undefined ||
    value.reviewRequired !== undefined ||
    value.action !== undefined;
}

function recordsFromUnknown(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) as Record<string, unknown>[] : [];
}

function firstObjectValue(value: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const entry = value[key];
    if (isObject(entry) || Array.isArray(entry)) return entry;
  }
  return undefined;
}

function firstStringValue(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (typeof value[key] === 'string') return value[key];
  }
  return undefined;
}

function semanticEditAdmissionFromUnknown(value: unknown, script: ReturnType<typeof semanticEditScriptFromUnknown> | undefined): FrontierCodexSemanticEditAdmissionDecision {
  if (isObject(value) && typeof value.status === 'string') {
    return {
      status: value.status as FrontierCodexSemanticEditAdmissionDecision['status'],
      autoMergeCandidate: value.autoMergeCandidate === true,
      cleanEligible: value.cleanEligible === true,
      reasons: Array.isArray(value.reasons) ? value.reasons.filter((entry): entry is string => typeof entry === 'string') : []
    };
  }
  return classifySemanticEditScriptAdmission(script);
}

function semanticEditAdmissionMatches(admission: FrontierCodexSemanticEditAdmissionDecision, value: string): boolean {
  const wanted = canonicalSemanticEditStatus(value);
  const actual = canonicalSemanticEditStatus(admission.status);
  return actual === wanted ||
    wanted === 'auto-merge-candidate' && admission.autoMergeCandidate ||
    wanted === 'cleaneligible' && admission.cleanEligible ||
    admission.reasons.some((reason) => semanticEditTextMatch(reason.toLowerCase(), value));
}

function facetsToSemanticEditScript(facets: Record<string, unknown>): unknown {
  return {
    total: facets.semanticEditScriptTotal,
    operations: facets.semanticEditScriptOperations,
    autoMergeCandidates: facets.semanticEditScriptAutoMergeCandidates,
    portable: facets.semanticEditScriptPortable,
    alreadyApplied: facets.semanticEditScriptAlreadyApplied,
    needsPort: facets.semanticEditScriptNeedsPort,
    conflicts: facets.semanticEditScriptConflicts,
    stale: facets.semanticEditScriptStale,
    blocked: facets.semanticEditScriptBlocked,
    candidates: facets.semanticEditScriptCandidates,
    reviewRequired: facets.semanticEditScriptReviewRequired,
    autoApplyCandidates: facets.semanticEditScriptAutoApplyCandidates,
    byStatus: csvRecord(facets.semanticEditScriptStatuses),
    admission: csvRecord(facets.semanticEditScriptAdmissions),
    semanticKeys: csvArray(facets.semanticEditScriptSemanticKeys),
    semanticIdentityHashes: csvArray(facets.semanticEditScriptSemanticIdentityHashes),
    sourceIdentityHashes: csvArray(facets.semanticEditScriptSourceIdentityHashes),
    operationContentHashes: csvArray(facets.semanticEditScriptOperationContentHashes)
  };
}

function facetsToSemanticEditAdmission(facets: Record<string, unknown>): unknown {
  const status = facets.semanticEditAdmissionStatus;
  if (typeof status !== 'string') return undefined;
  return {
    status,
    autoMergeCandidate: facets.semanticEditAdmissionAutoMergeCandidate === true || String(facets.semanticEditAdmissionAutoMergeCandidate) === 'true',
    cleanEligible: facets.semanticEditAdmissionCleanEligible === true || String(facets.semanticEditAdmissionCleanEligible) === 'true',
    reasons: String(facets.semanticEditAdmissionReasons ?? '').split(',').filter(Boolean)
  };
}

function facetsToSemanticEditProjection(facets: Record<string, unknown>): unknown {
  return {
    projected: facets.semanticEditProjectionProjected,
    blocked: facets.semanticEditProjectionBlocked,
    editCount: facets.semanticEditProjectionEdits,
    appliedEditCount: facets.semanticEditProjectionAppliedEdits,
    alreadyAppliedEditCount: facets.semanticEditProjectionAlreadyAppliedEdits,
    deletedBytes: facets.semanticEditProjectionDeletedBytes,
    replacementBytes: facets.semanticEditProjectionReplacementBytes,
    projectedSourceMatchesWorker: facets.semanticEditProjectionMatchesWorker,
    projectedSourceMismatchesWorker: facets.semanticEditProjectionMismatchesWorker,
    projectedSourceMatchUnknown: facets.semanticEditProjectionMatchUnknown,
    semanticKeys: csvArray(facets.semanticEditProjectionSemanticKeys),
    semanticIdentityHashes: csvArray(facets.semanticEditProjectionSemanticIdentityHashes),
    sourceIdentityHashes: csvArray(facets.semanticEditProjectionSourceIdentityHashes),
    operationContentHashes: csvArray(facets.semanticEditProjectionOperationContentHashes),
    editContentHashes: csvArray(facets.semanticEditProjectionEditContentHashes),
    semanticTransformKeys: csvArray(facets.semanticEditProjectionSemanticTransformKeys),
    semanticTransformIdentityHashes: csvArray(facets.semanticEditProjectionSemanticTransformIdentityHashes),
    semanticTransformContentHashes: csvArray(facets.semanticEditProjectionSemanticTransformContentHashes),
    projectionIdentityHashes: csvArray(facets.semanticEditProjectionProjectionIdentityHashes)
  };
}

function matchesProjectionStatus(projection: Record<string, unknown>, wanted: string | undefined, haystack: string): boolean {
  if (wanted === undefined) return true;
  const lowered = wanted.toLowerCase();
  const number = (key: string) => Number(projection[key] ?? 0);
  if (lowered === 'projected') return number('projected') > 0;
  if (lowered === 'blocked') return number('blocked') > 0;
  if (lowered === 'edits' || lowered === 'has-edits') return number('editCount') > 0;
  if (lowered === 'applied-edits') return number('appliedEditCount') > 0;
  if (lowered === 'already-applied-edits') return number('alreadyAppliedEditCount') > 0;
  if (lowered === 'worker-match' || lowered === 'match') return number('projectedSourceMatchesWorker') > 0;
  if (lowered === 'worker-mismatch' || lowered === 'mismatch') return number('projectedSourceMismatchesWorker') > 0;
  if (lowered === 'worker-unknown' || lowered === 'unknown') return number('projectedSourceMatchUnknown') > 0;
  return semanticEditTextMatch(haystack, wanted);
}

function projectionArrayMatches(projection: Record<string, unknown>, key: string, wanted: string | undefined, haystack: string): boolean {
  if (wanted === undefined) return true;
  return readStringArray(projection[key]).some((entry) => semanticEditTextMatch(entry.toLowerCase(), wanted)) ||
    semanticEditTextMatch(haystack, wanted);
}

function semanticEditScriptIdentityMatches(
  script: ReturnType<typeof semanticEditScriptFromUnknown> | undefined,
  input: SemanticEditQuery,
  haystack: string
): boolean {
  const entry = script ?? semanticEditScriptFromUnknown(undefined);
  return projectionArrayMatches(entry as unknown as Record<string, unknown>, 'semanticKeys', input.semanticEditKey, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'semanticIdentityHashes', input.semanticIdentityHash, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'sourceIdentityHashes', input.sourceIdentityHash, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'operationContentHashes', input.operationContentHash, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'semanticTransformKeys', input.semanticTransformKey, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'semanticTransformIdentityHashes', input.semanticTransformIdentityHash, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'semanticTransformContentHashes', input.semanticTransformContentHash, haystack)
    && projectionArrayMatches(entry as unknown as Record<string, unknown>, 'projectionIdentityHashes', input.projectionIdentityHash, haystack);
}

function csvRecord(value: unknown): Record<string, number> {
  return String(value ?? '').split(',').filter(Boolean).reduce<Record<string, number>>((out, key) => {
    out[key] = 1;
    return out;
  }, {});
}

function csvArray(value: unknown): string[] {
  return String(value ?? '').split(',').filter(Boolean);
}

function semanticEditTextMatch(haystack: string, value: string): boolean {
  return haystack.includes(value.toLowerCase()) || haystack.includes(value.toLowerCase().replace(/-/g, ''));
}
