import type { FrontierCodexArtifactRecord } from './index.js';
import { isObject } from './common.js';
import {
  jobSemanticEditAdmission,
  jobSemanticEditProjection,
  jobSemanticEditScript,
  matchesEvidenceSemanticEdit,
  matchesEvidenceSemanticSafeMerge,
  matchesSemanticEdit,
  matchesSemanticEditProjection,
  matchesSemanticSafeMergeArtifact,
  matchesSemanticSafeMergeJob
} from './query-semantic-edit.js';
import {
  evidenceSemanticEditReplay,
  jobSemanticEditReplay,
  matchesSemanticEditReplay
} from './query-semantic-edit-replay.js';
import {
  evidenceCleanupSignal,
  evidenceContextBudget,
  evidenceHealth,
  evidenceOwnershipSignal,
  evidenceSemanticReadinessStatus,
  jobCleanupSignal,
  jobContextBudget,
  jobHealth,
  jobOwnershipSignal,
  jobSemanticReadinessStatus
} from './query-signals.js';
import {
  cleanupMatches,
  healthMatches,
  ownershipMatches,
  pressureMatches,
  semanticReadinessMatches
} from './query-status.js';
import type { FrontierCodexQueryInput } from './query-types.js';
import { normalizeMetricKey, testsPassed } from './query-values.js';

export function matchesJob(
  job: Record<string, unknown>,
  input: FrontierCodexQueryInput,
  overlapJobIds?: Set<string>,
  landedJobIds?: Set<string>
): boolean {
  const haystack = JSON.stringify(job).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || job.jobId === input.jobId)
    && (overlapJobIds === undefined || overlapJobIds.has(String(job.jobId ?? '')))
    && matchesLandedJobId(String(job.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || job.disposition === input.bucket || job.admissionStatus === input.bucket)
    && (input.pathIncludes === undefined || arrayIncludes(job.changedPaths, input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.stale === undefined || Boolean(job.staleAgainstHead) === input.stale)
    && (input.semantic === undefined || Boolean(job.semanticImport) === input.semantic || Boolean(job.semanticImportQuality) === input.semantic)
    && (input.lineage === undefined || jobHasLineage(job) === input.lineage)
    && matchesSemanticEdit(jobSemanticEditScript(job), input, haystack, jobSemanticEditAdmission(job))
    && matchesSemanticEditProjection(jobSemanticEditProjection(job), input, haystack)
    && matchesSemanticSafeMergeJob(job, input, haystack)
    && matchesSemanticEditReplay(jobSemanticEditReplay(job), input, haystack)
    && (input.readiness === undefined || matchesReadiness(job, input.readiness))
    && (input.health === undefined || matchesHealth(job, input.health))
    && (input.pressure === undefined || matchesPressure(job, input.pressure))
    && (input.cleanup === undefined || matchesCleanup(job, input.cleanup))
    && (input.ownership === undefined || matchesOwnership(job, input.ownership))
    && (input.semanticReadiness === undefined || matchesSemanticReadiness(job, input.semanticReadiness))
    && (input.passedTests === undefined || testsPassed(job) === input.passedTests);
}

export function matchesArtifact(record: FrontierCodexArtifactRecord, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(record).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || record.jobId === input.jobId)
    && matchesLandedJobId(String(record.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || record.bucket === input.bucket)
    && (input.kind === undefined || record.kind === input.kind)
    && (input.pathIncludes === undefined || record.path.includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || record.tags.includes(input.tag))
    && (input.semantic === undefined || record.tags.includes('semantic-sidecar') === input.semantic)
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && (input.cleanup === undefined || metricTextMatches(haystack, input.cleanup))
    && (input.ownership === undefined || metricTextMatches(haystack, input.ownership))
    && matchesSemanticEdit(artifactSemanticEditScript(record), input, haystack, artifactSemanticEditAdmission(record))
    && matchesSemanticEditProjection(artifactSemanticEditProjection(record), input, haystack)
    && matchesSemanticSafeMergeArtifact(record, input, haystack)
    && matchesSemanticEditReplay(artifactSemanticEditReplay(record), input, haystack);
}

export function matchesEvidence(entry: Record<string, unknown>, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(entry).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || entry.jobId === input.jobId)
    && matchesLandedJobId(String(entry.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || entry.status === input.bucket)
    && (input.kind === undefined || entry.kind === input.kind)
    && (input.pathIncludes === undefined || String(entry.path ?? '').includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || Array.isArray(entry.tags) && entry.tags.includes(input.tag))
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && (input.health === undefined || matchesEvidenceHealth(entry, input.health))
    && (input.pressure === undefined || matchesEvidencePressure(entry, input.pressure))
    && (input.cleanup === undefined || matchesEvidenceCleanup(entry, input.cleanup))
    && (input.ownership === undefined || matchesEvidenceOwnership(entry, input.ownership))
    && (input.semanticReadiness === undefined || matchesEvidenceSemanticReadiness(entry, input.semanticReadiness))
    && matchesEvidenceSemanticEdit(entry, input, haystack)
    && matchesEvidenceSemanticSafeMerge(entry, input, haystack)
    && matchesSemanticEditReplay(evidenceSemanticEditReplay(entry), input, haystack);
}

function matchesText(haystack: string, input: FrontierCodexQueryInput): boolean {
  return input.q === undefined || haystack.includes(input.q.toLowerCase());
}

function metricTextMatches(haystack: string, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  return haystack.includes(wanted) || haystack.includes(value.toLowerCase());
}

function jobHasLineage(job: Record<string, unknown>): boolean {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  return Number(quality.semanticLineageEvents ?? 0) > 0 ||
    Number(quality.semanticLineageMoved ?? 0) > 0 ||
    Number(quality.semanticLineageRenamed ?? 0) > 0 ||
    Number(quality.semanticLineageDeleted ?? 0) > 0;
}

function textHasLineage(haystack: string): boolean {
  return haystack.includes('semanticlineage') || haystack.includes('lineageinference');
}

function matchesReadiness(job: Record<string, unknown>, value: string): boolean {
  const readiness = value.toLowerCase();
  if (readiness === 'ready-to-port') return job.disposition === 'needs-port' || job.mergeReadiness === 'verified-patch';
  if (readiness === 'ready-to-apply') return job.disposition === 'auto-mergeable' || job.admissionStatus === 'ready-to-apply';
  if (readiness === 'stale') return Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head';
  if (readiness === 'discovery-only') return job.mergeReadiness === 'discovery-only' || job.disposition === 'discovery-only';
  if (readiness === 'blocked') return job.status === 'blocked' || job.mergeReadiness === 'blocked' || job.disposition === 'blocked';
  if (readiness === 'evidence-only') return job.mergeReadiness === 'evidence-only' || job.disposition === 'evidence-only';
  return JSON.stringify(job).toLowerCase().includes(readiness);
}

function matchesHealth(job: Record<string, unknown>, value: string): boolean {
  return healthMatches(jobHealth(job), value);
}

function matchesEvidenceHealth(entry: Record<string, unknown>, value: string): boolean {
  return healthMatches(evidenceHealth(entry), value);
}

function matchesPressure(job: Record<string, unknown>, value: string): boolean {
  return pressureMatches(jobContextBudget(job), job, value);
}

function matchesEvidencePressure(entry: Record<string, unknown>, value: string): boolean {
  return pressureMatches(evidenceContextBudget(entry), entry, value);
}

function matchesCleanup(job: Record<string, unknown>, value: string): boolean {
  return cleanupMatches(jobCleanupSignal(job), value);
}

function matchesEvidenceCleanup(entry: Record<string, unknown>, value: string): boolean {
  return cleanupMatches(evidenceCleanupSignal(entry), value);
}

function matchesOwnership(job: Record<string, unknown>, value: string): boolean {
  return ownershipMatches(jobOwnershipSignal(job), value);
}

function matchesEvidenceOwnership(entry: Record<string, unknown>, value: string): boolean {
  return ownershipMatches(evidenceOwnershipSignal(entry), value);
}

function matchesSemanticReadiness(job: Record<string, unknown>, value: string): boolean {
  return semanticReadinessMatches(jobSemanticReadinessStatus(job), value);
}

function matchesEvidenceSemanticReadiness(entry: Record<string, unknown>, value: string): boolean {
  return semanticReadinessMatches(evidenceSemanticReadinessStatus(entry), value);
}

function matchesLandedJobId(jobId: string, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  if (input.landed === undefined) return true;
  if (!jobId) return input.landed === false;
  return Boolean(landedJobIds?.has(jobId)) === input.landed;
}

function artifactSemanticEditScript(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditScript ?? semanticEdit.script;
}

function artifactSemanticEditAdmission(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditAdmission ?? semanticEdit.admission;
}

function artifactSemanticEditProjection(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditProjection ?? semanticEdit.projection;
}

function artifactSemanticEditReplay(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditReplay ?? semanticEdit.replay;
}

function arrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.includes(needle));
}
