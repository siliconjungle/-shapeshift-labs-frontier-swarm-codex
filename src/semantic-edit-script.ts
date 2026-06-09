import type { FrontierCodexSemanticEditScriptSummary } from './types-semantic-edit.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

export function summarizeSemanticEditScript(value: unknown): FrontierCodexSemanticEditScriptSummary | undefined {
  const record = isObject(value) ? value : undefined;
  if (!record) return undefined;
  if (record.kind === 'frontier.lang.semanticEditScript') return normalizeSemanticEditScript(record);
  if (isObject(record.semanticEditScript)) return summarizeSemanticEditScript(record.semanticEditScript);
  if (isObject(record.summary) && isObject(record.admission)) return normalizeSemanticEditScript(record);
  if (isObject(record.semanticEditScripts)) return normalizeSemanticEditScript(record.semanticEditScripts);
  return normalizeSemanticEditScript(record);
}

export function mergeSemanticEditScriptSummaries(
  entries: readonly (FrontierCodexSemanticEditScriptSummary | undefined)[]
): FrontierCodexSemanticEditScriptSummary {
  const merged = emptySemanticEditScriptSummary();
  for (const entry of entries) {
    if (!entry || entry.empty && entry.total === 0) continue;
    for (const key of ['total', 'operations', 'autoMergeCandidates', 'portable', 'alreadyApplied', 'needsPort', 'conflicts', 'stale', 'blocked', 'candidates', 'reviewRequired', 'autoApplyCandidates'] as const) {
      merged[key] += nonNegativeNumber(entry[key]);
    }
    mergeNumberRecord(merged.byStatus, entry.byStatus);
    mergeNumberRecord(merged.byKind, entry.byKind);
    mergeNumberRecord(merged.admission, entry.admission);
    merged.actions = uniqueStrings([...merged.actions, ...entry.actions]);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
    merged.conflictKeys = uniqueStrings([...merged.conflictKeys, ...entry.conflictKeys]);
    merged.evidenceIds = uniqueStrings([...merged.evidenceIds, ...entry.evidenceIds]);
  }
  merged.empty = merged.total === 0 && merged.operations === 0;
  return merged;
}

export function emptySemanticEditScriptSummary(): FrontierCodexSemanticEditScriptSummary {
  return {
    total: 0,
    operations: 0,
    autoMergeCandidates: 0,
    portable: 0,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: 0,
    autoApplyCandidates: 0,
    byStatus: {},
    byKind: {},
    admission: {},
    actions: [],
    reasonCodes: [],
    conflictKeys: [],
    evidenceIds: [],
    empty: true
  };
}

function normalizeSemanticEditScript(record: Record<string, unknown>): FrontierCodexSemanticEditScriptSummary {
  const summary = isObject(record.summary) ? record.summary : record;
  const admission = isObject(record.admission) ? record.admission : {};
  const operations = Array.isArray(record.operations) ? record.operations.filter(isObject) : [];
  const byStatus = {
    ...numberRecord(summary.byStatus),
    ...countStrings(operations.map((operation) => operation.status))
  };
  const byKind = {
    ...numberRecord(summary.byKind),
    ...countStrings(operations.map((operation) => operation.kind))
  };
  const status = typeof admission.status === 'string' ? admission.status : typeof summary.status === 'string' ? summary.status : undefined;
  const action = typeof admission.action === 'string' ? admission.action : typeof summary.action === 'string' ? summary.action : undefined;
  const admissionCounts = { ...numberRecord(summary.admission), ...(status ? { [status]: 1 } : {}) };
  const total = nonNegativeNumber(summary.total) || (record.kind === 'frontier.lang.semanticEditScript' ? 1 : 0);
  const operationCount = nonNegativeNumber(summary.operations) || operations.length;
  return {
    total,
    operations: operationCount,
    autoMergeCandidates: maxCounter(summary.autoMergeCandidates, byStatus, admissionCounts, ['auto-merge-candidate', 'autoMergeCandidate']),
    portable: maxCounter(summary.portable, byStatus, admissionCounts, ['portable']),
    alreadyApplied: maxCounter(summary.alreadyApplied, byStatus, admissionCounts, ['already-applied', 'alreadyApplied']),
    needsPort: maxCounter(summary.needsPort, byStatus, admissionCounts, ['needs-port', 'needsPort']),
    conflicts: maxCounter(summary.conflicts, byStatus, admissionCounts, ['conflict', 'conflicts']),
    stale: maxCounter(summary.stale, byStatus, admissionCounts, ['stale']),
    blocked: maxCounter(summary.blocked, byStatus, admissionCounts, ['blocked']),
    candidates: maxCounter(summary.candidates, byStatus, admissionCounts, ['candidate', 'candidates']),
    reviewRequired: admission.reviewRequired === true ? 1 : maxCounter(summary.reviewRequired, byStatus, admissionCounts, ['needs-review', 'review-required']),
    autoApplyCandidates: admission.autoApplyCandidate === true ? 1 : maxCounter(summary.autoApplyCandidates, byStatus, admissionCounts, ['auto-apply-candidate']),
    byStatus,
    byKind,
    admission: admissionCounts,
    actions: uniqueStrings([action, ...readStringArray(summary.actions)].filter(Boolean).map(String)),
    reasonCodes: uniqueStrings([...readStringArray(admission.reasonCodes), ...readStringArray(summary.reasonCodes)]),
    conflictKeys: uniqueStrings([...readStringArray(admission.conflictKeys), ...readStringArray(summary.conflictKeys)]),
    evidenceIds: uniqueStrings([...readStringArray(admission.evidenceIds), ...readStringArray(summary.evidenceIds)]),
    empty: total === 0 && operationCount === 0
  };
}

function countStrings(values: readonly unknown[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) {
    const key = String(value ?? '').trim();
    if (!key) continue;
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function mergeNumberRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + nonNegativeNumber(value);
}

function maxCounter(value: unknown, statuses: Record<string, number>, admissions: Record<string, number>, keys: readonly string[]): number {
  return Math.max(nonNegativeNumber(value), sumKeys(statuses, keys), sumKeys(admissions, keys));
}

function sumKeys(record: Record<string, number>, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + nonNegativeNumber(record[key]), 0);
}
