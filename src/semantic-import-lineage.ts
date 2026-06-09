import type { FrontierCodexSemanticImportRecord, FrontierCodexSemanticLineageSummary } from './types-semantic.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

export function semanticImportLineageSummary(summary: unknown): FrontierCodexSemanticLineageSummary {
  return summarizeSemanticLineageEvidence(summary);
}

export function summarizeSemanticImportLineage(records: FrontierCodexSemanticImportRecord[]): FrontierCodexSemanticLineageSummary {
  return mergeSemanticLineageSummaries(records.flatMap((record) => [
    record.semanticLineage,
    summarizeSemanticLineageEvidence(record.semanticSidecar)
  ]));
}

export function summarizeSemanticLineageEvidence(value: unknown): FrontierCodexSemanticLineageSummary {
  const candidates = lineageCandidates(value);
  if (candidates.length === 0) return emptySemanticLineageSummary();
  return mergeSemanticLineageSummaries(candidates.map(normalizeLineageCandidate));
}

function lineageCandidates(value: unknown): Record<string, unknown>[] {
  const record = isObject(value) ? value : undefined;
  if (!record) return [];
  const direct = record.kind === 'frontier.lang.semanticLineageInference' ? [record] : [];
  return [
    ...direct,
    ...readCandidate(record.semanticLineage),
    ...readCandidate(record.semanticLineageInference),
    ...readCandidate(record.lineageInference),
    ...readCandidate(record.summary),
    ...readCandidate((record.metadata as Record<string, unknown> | undefined)?.semanticLineageInferenceSummary),
    ...readCandidate((record.diff as Record<string, unknown> | undefined)?.lineageInference)
  ];
}

function readCandidate(value: unknown): Record<string, unknown>[] {
  const record = isObject(value) ? value : undefined;
  if (!record) return [];
  const nested = [
    record.semanticLineage,
    record.semanticLineageInference,
    record.semanticLineageInferenceSummary,
    record.lineageInference,
    record.lineageInferenceSummary
  ].filter(isObject);
  return [record, ...nested];
}

function normalizeLineageCandidate(value: Record<string, unknown>): FrontierCodexSemanticLineageSummary {
  const summary = isObject(value.summary) ? value.summary : value;
  const eventKinds = eventKindList(value);
  const readinessKey = typeof value.readiness === 'string'
    ? value.readiness
    : typeof summary.readiness === 'string'
      ? summary.readiness
      : undefined;
  const readiness = {
    ...numberRecord(summary.readiness),
    ...(readinessKey ? { [readinessKey]: 1 } : {})
  };
  const inferredEvents = nonNegativeNumber(summary.inferredEvents ?? summary.events ?? summary.total);
  const total = Math.max(inferredEvents, eventKinds.length, nonNegativeNumber(summary.total));
  const reasonCodes = uniqueStrings([
    ...readStringArray(value.reasons),
    ...readStringArray(summary.reasons),
    ...readStringArray(value.reasonCodes),
    ...readStringArray(summary.reasonCodes)
  ]);
  return {
    total,
    inferredEvents,
    moved: nonNegativeNumber(summary.moved),
    renamed: nonNegativeNumber(summary.renamed),
    deleted: nonNegativeNumber(summary.deleted),
    ambiguous: nonNegativeNumber(summary.ambiguous),
    unmatchedAdded: nonNegativeNumber(summary.unmatchedAdded),
    unchangedAnchors: nonNegativeNumber(summary.unchangedAnchors),
    beforeSymbols: nonNegativeNumber(summary.beforeSymbols),
    afterSymbols: nonNegativeNumber(summary.afterSymbols),
    blocked: nonNegativeNumber(readiness.blocked),
    needsReview: nonNegativeNumber(readiness['needs-review']),
    ready: nonNegativeNumber(readiness.ready),
    reviewRequired: readReviewRequired(value, summary),
    readiness,
    eventKinds,
    reasonCodes,
    empty: total === 0
  };
}

function eventKindList(value: Record<string, unknown>): string[] {
  const events = Array.isArray(value.events) ? value.events : [];
  return uniqueStrings([
    ...readStringArray(value.eventKinds),
    ...events.map((event) => isObject(event) ? event.eventKind ?? event.kind : undefined).filter(Boolean).map(String)
  ]);
}

function readReviewRequired(value: Record<string, unknown>, summary: Record<string, unknown>): boolean {
  const metadata = isObject(value.metadata) ? value.metadata : {};
  return value.reviewRequired === true ||
    summary.reviewRequired === true ||
    metadata.reviewRequired === true ||
    metadata.semanticEquivalenceClaim === false ||
    metadata.autoMergeClaim === false;
}

function mergeSemanticLineageSummaries(
  entries: readonly (FrontierCodexSemanticLineageSummary | undefined)[]
): FrontierCodexSemanticLineageSummary {
  const merged = emptySemanticLineageSummary();
  for (const entry of entries) {
    if (!entry || entry.empty && entry.total === 0) continue;
    for (const key of ['total', 'inferredEvents', 'moved', 'renamed', 'deleted', 'ambiguous', 'unmatchedAdded', 'unchangedAnchors', 'beforeSymbols', 'afterSymbols', 'blocked', 'needsReview', 'ready'] as const) {
      merged[key] += nonNegativeNumber(entry[key]);
    }
    for (const [key, count] of Object.entries(entry.readiness)) {
      merged.readiness[key] = (merged.readiness[key] ?? 0) + nonNegativeNumber(count);
    }
    merged.eventKinds = uniqueStrings([...merged.eventKinds, ...entry.eventKinds]);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
    merged.reviewRequired = merged.reviewRequired || entry.reviewRequired;
  }
  merged.empty = merged.total === 0 && merged.inferredEvents === 0;
  return merged;
}

function emptySemanticLineageSummary(): FrontierCodexSemanticLineageSummary {
  return {
    total: 0,
    inferredEvents: 0,
    moved: 0,
    renamed: 0,
    deleted: 0,
    ambiguous: 0,
    unmatchedAdded: 0,
    unchangedAnchors: 0,
    beforeSymbols: 0,
    afterSymbols: 0,
    blocked: 0,
    needsReview: 0,
    ready: 0,
    reviewRequired: false,
    readiness: {},
    eventKinds: [],
    reasonCodes: [],
    empty: true
  };
}
