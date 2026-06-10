import { isObject } from './common.js';
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

export function matchesSemanticEdit(scriptValue: unknown, input: SemanticEditQuery, haystack: string, admissionValue?: unknown): boolean {
  if (input.semanticEditStatus === undefined && input.semanticEditAdmission === undefined) return true;
  const hasScript = scriptValue !== undefined;
  const script = scriptValue === undefined ? undefined : semanticEditScriptFromUnknown(scriptValue);
  const admission = semanticEditAdmissionFromUnknown(admissionValue, script);
  return (input.semanticEditStatus === undefined || semanticEditScriptHasStatus(script, input.semanticEditStatus) || !hasScript && semanticEditTextMatch(haystack, input.semanticEditStatus))
    && (input.semanticEditAdmission === undefined ||
      semanticEditAdmissionMatches(admission, input.semanticEditAdmission) ||
      semanticEditScriptHasAdmission(script, input.semanticEditAdmission) ||
      !hasScript && semanticEditTextMatch(haystack, input.semanticEditAdmission));
}

export function matchesEvidenceSemanticEdit(entry: Record<string, unknown>, input: SemanticEditQuery, haystack: string): boolean {
  const facets = isObject(entry.facets) ? entry.facets : {};
  return matchesSemanticEdit(facetsToSemanticEditScript(facets), input, haystack, facetsToSemanticEditAdmission(facets));
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
    admission: csvRecord(facets.semanticEditScriptAdmissions)
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

function csvRecord(value: unknown): Record<string, number> {
  return String(value ?? '').split(',').filter(Boolean).reduce<Record<string, number>>((out, key) => {
    out[key] = 1;
    return out;
  }, {});
}

function semanticEditTextMatch(haystack: string, value: string): boolean {
  return haystack.includes(value.toLowerCase()) || haystack.includes(value.toLowerCase().replace(/-/g, ''));
}
