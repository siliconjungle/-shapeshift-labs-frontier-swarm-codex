import type { FrontierCodexSemanticImportRecord, FrontierCodexSemanticLineageSummary } from './types-semantic.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';
import {
  hasLineageSignalToken,
  inferredLineageSignalCounts,
  lineageEventSignals,
  readEventObjects
} from './semantic-import-lineage-signals.js';

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
  if (record.kind === 'frontier.lang.semanticLineageInference') return [record];
  const primary = [
    ...readCandidate(record.semanticLineage),
    ...readCandidate(record.semanticLineageInference),
    ...readCandidate(record.lineageInference),
    ...readCandidate((record.diff as Record<string, unknown> | undefined)?.lineageInference)
  ];
  const summaryOnly = primary.length === 0
    ? [
        ...readCandidate(record.summary),
        ...readCandidate((record.metadata as Record<string, unknown> | undefined)?.semanticLineageInferenceSummary)
      ]
    : [];
  const directFallback = primary.length === 0 && summaryOnly.length === 0 && hasLineageCandidateShape(record)
    ? [record]
    : [];
  const nativeFallback = primary.length === 0 && summaryOnly.length === 0 && directFallback.length === 0 && record.kind === 'frontier.lang.nativeSourceChangeSet'
    ? [record]
    : [];
  return [
    ...primary,
    ...summaryOnly,
    ...directFallback,
    ...nativeFallback
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

function hasLineageCandidateShape(record: Record<string, unknown>): boolean {
  return record.inferredEvents !== undefined ||
    record.moved !== undefined ||
    record.renamed !== undefined ||
    record.deleted !== undefined ||
    record.ambiguous !== undefined ||
    record.unmatchedAdded !== undefined ||
    record.unchangedAnchors !== undefined ||
    record.beforeSymbols !== undefined ||
    record.afterSymbols !== undefined ||
    record.needsReview !== undefined ||
    record.reviewRequired !== undefined ||
    readStringArray(record.eventKinds).some(hasLineageSignalToken) ||
    readStringArray(record.reasonCodes).some(hasLineageSignalToken) ||
    readStringArray(record.reasons).some(hasLineageSignalToken) ||
    lineageEventSignals(record).some(hasLineageSignalToken) ||
    Array.isArray(record.changedSymbols);
}

function normalizeLineageCandidate(value: Record<string, unknown>): FrontierCodexSemanticLineageSummary {
  const summary = isObject(value.summary) ? value.summary : value;
  const signalCounts = inferredLineageSignalCounts(value, summary);
  const deleted = Math.max(nonNegativeNumber(summary.deleted), nonNegativeNumber(value.deleted), signalCounts.deleted);
  const ambiguous = Math.max(nonNegativeNumber(summary.ambiguous), nonNegativeNumber(value.ambiguous), signalCounts.ambiguous);
  const unmatchedAdded = Math.max(nonNegativeNumber(summary.unmatchedAdded), nonNegativeNumber(value.unmatchedAdded), signalCounts.unmatchedAdded);
  const moved = Math.max(nonNegativeNumber(summary.moved), nonNegativeNumber(value.moved), signalCounts.moved);
  const renamed = Math.max(nonNegativeNumber(summary.renamed), nonNegativeNumber(value.renamed), signalCounts.renamed);
  const eventKinds = eventKindList(value, summary, {
    moved,
    renamed,
    deleted,
    ambiguous,
    unmatchedAdded
  });
  const readinessKey = typeof value.readiness === 'string'
    ? value.readiness
    : typeof summary.readiness === 'string'
      ? summary.readiness
      : undefined;
  const readiness = {
    ...numberRecord(summary.readiness),
    ...(readinessKey ? { [readinessKey]: 1 } : {})
  };
  const inferredEvents = Math.max(readInferredEventCount(value, summary), signalCounts.inferredEvents);
  const total = Math.max(inferredEvents, eventKinds.length, nonNegativeNumber(summary.total));
  const reasonCodes = uniqueStrings([
    ...readStringArray(value.reasons),
    ...readStringArray(summary.reasons),
    ...readStringArray(value.reasonCodes),
    ...readStringArray(summary.reasonCodes),
    ...inferredLineageReasonCodes({
      moved,
      renamed,
      deleted,
      ambiguous,
      unmatchedAdded
    })
  ]);
  const beforeSymbols = nonNegativeNumber(summary.beforeSymbols);
  const afterSymbols = nonNegativeNumber(summary.afterSymbols);
  const blocked = nonNegativeNumber(readiness.blocked);
  const explicitNeedsReview = Math.max(nonNegativeNumber(value.needsReview), nonNegativeNumber(summary.needsReview));
  const readinessNeedsReview = nonNegativeNumber(readiness['needs-review']);
  const reviewRequired = readReviewRequired(value, summary) || inferredLineageNeedsReview({
    inferredEvents,
    moved,
    renamed,
    deleted,
    ambiguous,
    unmatchedAdded
  }) ||
    explicitNeedsReview > 0 ||
    readinessNeedsReview > 0;
  const needsReview = Math.max(
    readinessNeedsReview,
    explicitNeedsReview,
    reviewRequired && blocked === 0 ? 1 : 0
  );
  if (needsReview > 0 && readinessNeedsReview === 0) readiness['needs-review'] = needsReview;
  const ready = nonNegativeNumber(readiness.ready);
  return {
    total,
    inferredEvents,
    moved,
    renamed,
    deleted,
    ambiguous,
    unmatchedAdded,
    unchangedAnchors: nonNegativeNumber(summary.unchangedAnchors),
    beforeSymbols,
    afterSymbols,
    blocked,
    needsReview,
    ready,
    reviewRequired,
    readiness,
    eventKinds,
    reasonCodes,
    empty: total === 0 &&
      beforeSymbols === 0 &&
      afterSymbols === 0 &&
      blocked === 0 &&
      needsReview === 0 &&
      ready === 0 &&
      reasonCodes.length === 0
  };
}

function eventKindList(
  value: Record<string, unknown>,
  summary: Record<string, unknown>,
  counts: { moved: number; renamed: number; deleted: number; ambiguous: number; unmatchedAdded: number }
): string[] {
  const events = [...readEventObjects(value.events), ...readEventObjects(summary.events)];
  return uniqueStrings([
    ...readStringArray(value.eventKinds),
    ...readStringArray(summary.eventKinds),
    ...events.map((event) => isObject(event) ? event.eventKind ?? event.kind : undefined).filter(Boolean).map(String),
    ...(counts.moved > 0 ? ['moved'] : []),
    ...(counts.renamed > 0 ? ['renamed'] : []),
    ...(counts.deleted > 0 ? ['deleted'] : []),
    ...(counts.ambiguous > 0 ? ['ambiguous'] : []),
    ...(counts.unmatchedAdded > 0 ? ['unmatched-added'] : [])
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

function inferredLineageNeedsReview(input: {
  inferredEvents: number;
  moved: number;
  renamed: number;
  deleted: number;
  ambiguous: number;
  unmatchedAdded: number;
}): boolean {
  return input.inferredEvents > 0 ||
    input.moved > 0 ||
    input.renamed > 0 ||
    input.deleted > 0 ||
    input.ambiguous > 0 ||
    input.unmatchedAdded > 0;
}

function inferredLineageReasonCodes(input: {
  moved: number;
  renamed: number;
  deleted: number;
  ambiguous: number;
  unmatchedAdded: number;
}): string[] {
  return [
    input.moved > 0 ? 'moved-anchor-lineage-inferred' : undefined,
    input.renamed > 0 ? 'renamed-anchor-lineage-inferred' : undefined,
    input.deleted > 0 ? 'deleted-anchor-lineage-inferred' : undefined,
    input.ambiguous > 0 ? 'ambiguous-lineage-candidates' : undefined,
    input.unmatchedAdded > 0 ? 'unmatched-added-anchor-review' : undefined
  ].filter((entry): entry is string => Boolean(entry));
}

function readInferredEventCount(value: Record<string, unknown>, summary: Record<string, unknown>): number {
  return Math.max(
    readInferredEventCountFrom(summary),
    summary === value ? 0 : readInferredEventCountFrom(value)
  );
}

function readInferredEventCountFrom(value: Record<string, unknown>): number {
  const direct = Math.max(nonNegativeNumber(value.inferredEvents), nonNegativeNumber(value.events));
  if (direct > 0) return direct;
  if (Array.isArray(value.events) && value.events.length > 0) return value.events.length;
  return nonNegativeNumber(value.total);
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
  merged.empty = merged.total === 0 &&
    merged.inferredEvents === 0 &&
    merged.beforeSymbols === 0 &&
    merged.afterSymbols === 0 &&
    merged.blocked === 0 &&
    merged.needsReview === 0 &&
    merged.ready === 0 &&
    merged.reasonCodes.length === 0;
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
