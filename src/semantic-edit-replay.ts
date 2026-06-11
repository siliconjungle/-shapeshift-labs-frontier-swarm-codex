import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

export function summarizeSemanticEditReplay(value: unknown): FrontierCodexSemanticEditReplaySummary | undefined {
  const record = isObject(value) ? value : undefined;
  if (!record) return undefined;
  if (record.kind === 'frontier.lang.semanticEditReplay') return normalizeReplayRecord(record);
  if (isObject(record.semanticEditReplay)) return summarizeSemanticEditReplay(record.semanticEditReplay);
  if (isObject(record.semanticEditReplays)) return normalizeReplayRecord(record.semanticEditReplays);
  return isReplaySummaryLike(record) ? normalizeReplayRecord(record) : undefined;
}

export function mergeSemanticEditReplaySummaries(
  entries: readonly (FrontierCodexSemanticEditReplaySummary | undefined)[]
): FrontierCodexSemanticEditReplaySummary {
  const merged = emptySemanticEditReplaySummary();
  for (const entry of entries) {
    if (!entry || entry.empty && entry.total === 0) continue;
    for (const key of [
      'total',
      'acceptedClean',
      'alreadyApplied',
      'conflicts',
      'stale',
      'blocked',
      'needsPort',
      'evidenceOnly',
      'appliedOperations',
      'skippedOperations',
      'editCount',
      'appliedEditCount',
      'alreadyAppliedEditCount'
    ] as const) merged[key] += nonNegativeNumber(entry[key]);
    mergeNumberRecord(merged.statusCounts, entry.statusCounts);
    mergeNumberRecord(merged.admission, entry.admission);
    merged.actions = uniqueStrings([...merged.actions, ...entry.actions]);
    merged.operationIds = uniqueStrings([...merged.operationIds, ...entry.operationIds]);
    merged.semanticKeys = uniqueStrings([...merged.semanticKeys, ...entry.semanticKeys]);
    merged.semanticIdentityHashes = uniqueStrings([...merged.semanticIdentityHashes, ...entry.semanticIdentityHashes]);
    merged.sourceIdentityHashes = uniqueStrings([...merged.sourceIdentityHashes, ...entry.sourceIdentityHashes]);
    merged.editContentHashes = uniqueStrings([...merged.editContentHashes, ...entry.editContentHashes]);
    merged.sourcePaths = uniqueStrings([...merged.sourcePaths, ...entry.sourcePaths]);
    merged.symbolNames = uniqueStrings([...merged.symbolNames, ...entry.symbolNames]);
    merged.currentHashes = uniqueStrings([...merged.currentHashes, ...entry.currentHashes]);
    merged.outputHashes = uniqueStrings([...merged.outputHashes, ...entry.outputHashes]);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
  }
  merged.empty = merged.total === 0;
  return merged;
}

export function emptySemanticEditReplaySummary(): FrontierCodexSemanticEditReplaySummary {
  return {
    total: 0,
    acceptedClean: 0,
    alreadyApplied: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    needsPort: 0,
    evidenceOnly: 0,
    appliedOperations: 0,
    skippedOperations: 0,
    editCount: 0,
    appliedEditCount: 0,
    alreadyAppliedEditCount: 0,
    statusCounts: {},
    admission: {},
    actions: [],
    operationIds: [],
    semanticKeys: [],
    semanticIdentityHashes: [],
    sourceIdentityHashes: [],
    editContentHashes: [],
    sourcePaths: [],
    symbolNames: [],
    currentHashes: [],
    outputHashes: [],
    reasonCodes: [],
    empty: true
  };
}

function normalizeReplayRecord(record: Record<string, unknown>): FrontierCodexSemanticEditReplaySummary {
  const admission = isObject(record.admission) ? record.admission : {};
  const status = typeof record.status === 'string' ? record.status : undefined;
  const admissionStatus = typeof admission.status === 'string' ? admission.status : undefined;
  const statusCounts = { ...numberRecord(record.statusCounts), ...(status ? { [status]: 1 } : {}) };
  const admissionCounts = { ...numberRecord(record.admission), ...(admissionStatus ? { [admissionStatus]: 1 } : {}) };
  const edits = Array.isArray(record.edits) ? record.edits.filter(isObject) : [];
  const total = nonNegativeNumber(record.total) || (record.kind === 'frontier.lang.semanticEditReplay' ? 1 : 0);
  const summary = isObject(record.summary) ? record.summary : {};
  return {
    total,
    acceptedClean: countStatus(record, statusCounts, 'acceptedClean', 'accepted-clean'),
    alreadyApplied: countStatus(record, statusCounts, 'alreadyApplied', 'already-applied') || nonNegativeNumber(summary.alreadyApplied),
    conflicts: countStatus(record, statusCounts, 'conflicts', 'conflict') || nonNegativeNumber(summary.conflicts),
    stale: countStatus(record, statusCounts, 'stale', 'stale') || nonNegativeNumber(summary.stale),
    blocked: countStatus(record, statusCounts, 'blocked', 'blocked') || nonNegativeNumber(summary.blocked),
    needsPort: countStatus(record, statusCounts, 'needsPort', 'needs-port'),
    evidenceOnly: countStatus(record, statusCounts, 'evidenceOnly', 'evidence-only'),
    appliedOperations: nonNegativeNumber(record.appliedOperations) || (Array.isArray(record.appliedOperations) ? record.appliedOperations.length : 0),
    skippedOperations: nonNegativeNumber(record.skippedOperations) || (Array.isArray(record.skippedOperations) ? record.skippedOperations.length : 0),
    editCount: nonNegativeNumber(record.editCount) || nonNegativeNumber(summary.edits) || edits.length,
    appliedEditCount: nonNegativeNumber(record.appliedEditCount) || nonNegativeNumber(summary.applied) || edits.filter((edit) => edit.status === 'applied').length,
    alreadyAppliedEditCount: nonNegativeNumber(record.alreadyAppliedEditCount) || edits.filter((edit) => edit.status === 'already-applied').length,
    statusCounts,
    admission: admissionCounts,
    actions: stringValues(record.actions, admission.action),
    operationIds: uniqueStrings([...stringValues(record.operationIds), ...edits.flatMap((edit) => stringValues(edit.operationId))]),
    semanticKeys: uniqueStrings([...stringValues(record.semanticKeys), ...edits.flatMap((edit) => stringValues(edit.semanticKey))]),
    semanticIdentityHashes: uniqueStrings([...stringValues(record.semanticIdentityHashes), ...edits.flatMap((edit) => stringValues(edit.semanticIdentityHash))]),
    sourceIdentityHashes: uniqueStrings([...stringValues(record.sourceIdentityHashes), ...edits.flatMap((edit) => stringValues(edit.sourceIdentityHash))]),
    editContentHashes: uniqueStrings([...stringValues(record.editContentHashes), ...edits.flatMap((edit) => stringValues(edit.editContentHash))]),
    sourcePaths: uniqueStrings([...stringValues(record.sourcePaths, record.sourcePath), ...edits.flatMap((edit) => stringValues(edit.sourcePath))]),
    symbolNames: uniqueStrings([...stringValues(record.symbolNames), ...edits.flatMap((edit) => stringValues(edit.symbolName))]),
    currentHashes: stringValues(record.currentHashes, record.currentHash),
    outputHashes: stringValues(record.outputHashes, record.outputHash),
    reasonCodes: uniqueStrings([...stringValues(record.reasonCodes), ...stringValues(admission.reasonCodes), ...stringValues(summary.reasonCodes), ...edits.flatMap((edit) => stringValues(edit.reasonCodes))]),
    empty: total === 0
  };
}

function countStatus(record: Record<string, unknown>, counts: Record<string, number>, field: string, status: string): number {
  return nonNegativeNumber(record[field]) || nonNegativeNumber(counts[status]);
}

function isReplaySummaryLike(record: Record<string, unknown>): boolean {
  return record.acceptedClean !== undefined ||
    record.alreadyApplied !== undefined ||
    record.statusCounts !== undefined ||
    record.appliedOperations !== undefined ||
    record.skippedOperations !== undefined ||
    record.edits !== undefined ||
    record.currentHashes !== undefined ||
    record.outputHashes !== undefined;
}

function stringValues(...values: unknown[]): string[] {
  return uniqueStrings(values.flatMap((value) => typeof value === 'string' ? [value] : readStringArray(value)));
}

function mergeNumberRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + nonNegativeNumber(value);
}
