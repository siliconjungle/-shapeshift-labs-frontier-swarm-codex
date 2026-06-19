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
