import { arrayOfObjects, isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

export type FrontierCodexSemanticMergeAdmissionStatus = 'safe' | 'safe-with-losses' | 'review-required' | 'blocked';

export type FrontierCodexJsTsSafeMergeApplyStatus =
  | 'safe-apply'
  | 'no-op'
  | 'stale'
  | 'review-required'
  | 'blocked-evidence';

export type FrontierCodexKernelSafeMergeRecordKind = 'semantic-merge-admission' | 'js-ts-safe-merge-apply';

export interface FrontierCodexSemanticMergeAdmissionSummary {
  readonly recordKind: 'semantic-merge-admission';
  readonly id?: string;
  readonly candidateId?: string;
  readonly status: FrontierCodexSemanticMergeAdmissionStatus;
  readonly autoMergeable: boolean;
  readonly safe: boolean;
  readonly reviewRequired: boolean;
  readonly blocked: boolean;
  readonly conflictKeys: number;
  readonly conflictKeyKinds: readonly string[];
  readonly evidence: number;
  readonly passedEvidence: number;
  readonly failedEvidence: number;
  readonly unknownEvidence: number;
  readonly staleEvidence: number;
  readonly losses: number;
  readonly blockingLosses: number;
  readonly nonBlockingLosses: number;
  readonly lossesBySeverity: Readonly<Record<string, number>>;
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
}

export interface FrontierCodexJsTsSafeMergeApplySummary {
  readonly recordKind: 'js-ts-safe-merge-apply';
  readonly id?: string;
  readonly status: FrontierCodexJsTsSafeMergeApplyStatus;
  readonly action?: string;
  readonly safeToApply: boolean;
  readonly noOp: boolean;
  readonly stale: boolean;
  readonly reviewRequired: boolean;
  readonly blocked: boolean;
  readonly autoApplyCandidate: boolean;
  readonly edits: number;
  readonly applied: number;
  readonly alreadyApplied: number;
  readonly conflicts: number;
  readonly staleEdits: number;
  readonly blockedEdits: number;
  readonly evidence: number;
  readonly passedEvidence: number;
  readonly failedEvidence: number;
  readonly staleEvidence: number;
  readonly sourcePaths: readonly string[];
  readonly operationIds: readonly string[];
  readonly semanticKeys: readonly string[];
  readonly reasonCodes: readonly string[];
  readonly reasons: readonly string[];
}

export type FrontierCodexKernelSafeMergeSummary =
  | FrontierCodexSemanticMergeAdmissionSummary
  | FrontierCodexJsTsSafeMergeApplySummary;

export function summarizeSemanticMergeAdmission(value: unknown): FrontierCodexSemanticMergeAdmissionSummary | undefined {
  const record = semanticMergeAdmissionRecord(value);
  return record ? normalizeSemanticMergeAdmission(record) : undefined;
}

export function summarizeJsTsSafeMergeApply(value: unknown): FrontierCodexJsTsSafeMergeApplySummary | undefined {
  const record = jsTsSafeMergeApplyRecord(value);
  return record ? normalizeJsTsSafeMergeApply(record) : undefined;
}

export function summarizeKernelSafeMergeRecord(value: unknown): FrontierCodexKernelSafeMergeSummary | undefined {
  return summarizeSemanticMergeAdmission(value) ?? summarizeJsTsSafeMergeApply(value);
}

export function summarizeKernelSafeMergeRecords(value: unknown): FrontierCodexKernelSafeMergeSummary[] {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((entry) => {
    const summary = summarizeKernelSafeMergeRecord(entry);
    return summary ? [summary] : [];
  });
}

function normalizeSemanticMergeAdmission(record: Record<string, unknown>): FrontierCodexSemanticMergeAdmissionSummary {
  const evidence = collectEvidence(record);
  const evidenceSummary = summarizeEvidence(evidence);
  const losses = collectLosses(record);
  const lossesBySeverity = lossSeverityCounts(record, losses);
  const lossTotal = Math.max(losses.length, Object.values(lossesBySeverity).reduce((sum, value) => sum + nonNegativeNumber(value), 0));
  const blockingLosses = Math.max(
    losses.filter(isBlockingLoss).length,
    nonNegativeNumber(lossesBySeverity.error) + nonNegativeNumber(lossesBySeverity.fatal) + nonNegativeNumber(lossesBySeverity.blocking)
  );
  const nonBlockingLosses = Math.max(0, lossTotal - blockingLosses);
  const rawStatus = firstString(record, ['classification', 'status', 'readiness', 'admissionStatus']) ??
    firstString(recordField(record, 'metadata'), ['classification', 'status', 'readiness']);
  const status = canonicalSemanticMergeAdmissionStatus(rawStatus, {
    autoMergeable: record.autoMergeable === true,
    hasFailedEvidence: evidenceSummary.failed > 0,
    hasUnknownEvidence: evidenceSummary.unknown > 0,
    hasBlockingLosses: blockingLosses > 0,
    hasNonBlockingLosses: nonBlockingLosses > 0
  });
  const conflictKeys = uniqueStrings([
    ...strings(record.conflictKeys),
    ...strings(recordField(record, 'metadata')?.conflictKeys)
  ]);
  const conflictKeyKinds = uniqueStrings([
    ...strings(record.conflictKeyKinds),
    ...conflictKeys.map(inferSemanticMergeConflictKeyKind)
  ]);
  return {
    recordKind: 'semantic-merge-admission',
    id: firstString(record, ['id']),
    candidateId: firstString(record, ['candidateId']),
    status,
    autoMergeable: record.autoMergeable === true || status === 'safe' && record.autoMergeable !== false,
    safe: status === 'safe' || status === 'safe-with-losses',
    reviewRequired: status === 'review-required',
    blocked: status === 'blocked',
    conflictKeys: Math.max(conflictKeys.length, nonNegativeNumber(recordField(record, 'summary')?.conflictKeys)),
    conflictKeyKinds,
    evidence: evidence.length,
    passedEvidence: evidenceSummary.passed,
    failedEvidence: evidenceSummary.failed,
    unknownEvidence: evidenceSummary.unknown,
    staleEvidence: evidenceSummary.stale,
    losses: lossTotal,
    blockingLosses,
    nonBlockingLosses,
    lossesBySeverity,
    reasonCodes: uniqueStrings([
      ...strings(record.reasonCodes),
      ...strings(recordField(record, 'metadata')?.reasonCodes),
      ...evidence.flatMap((entry) => strings(entry.reasonCodes)),
      ...losses.flatMap((entry) => strings(entry.reasonCodes))
    ]),
    reasons: uniqueStrings([
      ...strings(record.reasons),
      ...strings(recordField(record, 'metadata')?.reasons),
      ...evidence.flatMap((entry) => strings(entry.reasons)),
      ...losses.flatMap((entry) => strings(entry.reasons))
    ])
  };
}

function normalizeJsTsSafeMergeApply(record: Record<string, unknown>): FrontierCodexJsTsSafeMergeApplySummary {
  const admission = recordField(record, 'admission');
  const summary = recordField(record, 'summary');
  const evidence = collectEvidence(record);
  const evidenceSummary = summarizeEvidence(evidence);
  const edits = arrayOfObjects(record.edits);
  const editStatuses = edits.map((edit) => firstString(edit, ['status']));
  const applied = Math.max(nonNegativeNumber(summary?.applied), countStatus(editStatuses, ['applied']));
  const alreadyApplied = Math.max(nonNegativeNumber(summary?.alreadyApplied), countStatus(editStatuses, ['already-applied', 'alreadyApplied']));
  const conflicts = Math.max(nonNegativeNumber(summary?.conflicts), countStatus(editStatuses, ['conflict', 'conflicts']));
  const staleEdits = Math.max(nonNegativeNumber(summary?.stale), countStatus(editStatuses, ['stale']));
  const blockedEdits = Math.max(nonNegativeNumber(summary?.blocked), countStatus(editStatuses, ['blocked', 'failed', 'error']));
  const editCount = Math.max(nonNegativeNumber(summary?.edits), edits.length, applied + alreadyApplied + conflicts + staleEdits + blockedEdits);
  const rawStatus = firstString(record, ['status', 'classification', 'readiness']) ??
    firstString(admission, ['status', 'classification', 'readiness']) ??
    firstString(summary, ['status']);
  const action = firstString(record, ['action']) ?? firstString(admission, ['action']);
  const status = canonicalJsTsSafeMergeApplyStatus(rawStatus, {
    action,
    editCount,
    applied,
    alreadyApplied,
    conflicts,
    staleEdits,
    blockedEdits,
    autoApplyCandidate: record.autoApplyCandidate === true || admission?.autoApplyCandidate === true,
    reviewRequired: record.reviewRequired === true || admission?.reviewRequired === true,
    failedEvidence: evidenceSummary.failed,
    staleEvidence: evidenceSummary.stale
  });
  const operationIds = uniqueStrings([
    ...strings(record.appliedOperations),
    ...strings(record.skippedOperations),
    ...edits.flatMap((edit) => strings(edit.operationId))
  ]);
  const semanticKeys = uniqueStrings([
    ...strings(summary?.semanticKeys),
    ...edits.flatMap((edit) => strings(edit.semanticKey))
  ]);
  return {
    recordKind: 'js-ts-safe-merge-apply',
    id: firstString(record, ['id']),
    status,
    action,
    safeToApply: status === 'safe-apply',
    noOp: status === 'no-op',
    stale: status === 'stale',
    reviewRequired: status === 'review-required',
    blocked: status === 'blocked-evidence',
    autoApplyCandidate: record.autoApplyCandidate === true || admission?.autoApplyCandidate === true || status === 'safe-apply',
    edits: editCount,
    applied,
    alreadyApplied,
    conflicts,
    staleEdits,
    blockedEdits,
    evidence: evidence.length,
    passedEvidence: evidenceSummary.passed,
    failedEvidence: evidenceSummary.failed,
    staleEvidence: evidenceSummary.stale,
    sourcePaths: uniqueStrings([
      ...strings(record.sourcePath),
      ...strings(summary?.sourcePaths),
      ...edits.flatMap((edit) => strings(edit.sourcePath))
    ]),
    operationIds,
    semanticKeys,
    reasonCodes: uniqueStrings([
      ...strings(record.reasonCodes),
      ...strings(admission?.reasonCodes),
      ...strings(summary?.reasonCodes),
      ...edits.flatMap((edit) => strings(edit.reasonCodes)),
      ...evidence.flatMap((entry) => strings(entry.reasonCodes))
    ]),
    reasons: uniqueStrings([
      ...strings(record.reasons),
      ...strings(admission?.reasons),
      ...strings(summary?.reasons),
      ...edits.flatMap((edit) => strings(edit.reasons)),
      ...evidence.flatMap((entry) => strings(entry.reasons))
    ])
  };
}

function semanticMergeAdmissionRecord(value: unknown): Record<string, unknown> | undefined {
  const record = isObject(value) ? value : undefined;
  if (!record) return undefined;
  if (record.kind === 'frontier.lang.semanticMergeAdmission') return record;
  if (typeof record.classification === 'string' && isSemanticMergeAdmissionStatusLike(record.classification)) return record;
  if (typeof record.classification === 'string' && ('conflictKeys' in record || 'losses' in record || 'evidence' in record)) return record;
  if (typeof record.autoMergeable === 'boolean' && ('conflictKeys' in record || 'losses' in record || 'evidence' in record)) return record;
  for (const key of ['semanticMergeAdmission', 'mergeAdmission', 'admissionRecord']) {
    const nested = semanticMergeAdmissionRecord(record[key]);
    if (nested) return nested;
  }
  return undefined;
}

function isSemanticMergeAdmissionStatusLike(status: string): boolean {
  return [
    'safe',
    'safe-with-losses',
    'safewithlosses',
    'ready',
    'ready-with-losses',
    'readywithlosses',
    'review-required',
    'reviewrequired',
    'needs-review',
    'needsreview',
    'blocked'
  ].includes(normalizeStatus(status));
}

function jsTsSafeMergeApplyRecord(value: unknown): Record<string, unknown> | undefined {
  const record = isObject(value) ? value : undefined;
  if (!record) return undefined;
  if (record.kind === 'frontier.lang.jsTsSafeMergeApply') return record;
  if (record.schema === 'frontier.lang.jsTsSafeMergeApply.v1') return record;
  if (record.kind === 'frontier.lang.semanticEditReplay') return record;
  if (typeof record.status === 'string' && isJsTsSafeMergeApplyStatusLike(record.status)) return record;
  if (typeof record.status === 'string' && ('edits' in record || 'admission' in record || 'summary' in record || 'outputSourceText' in record)) return record;
  for (const key of ['jsTsSafeMergeApply', 'safeMergeApply', 'semanticEditReplay', 'replay', 'applyRecord', 'applyResult']) {
    const nested = jsTsSafeMergeApplyRecord(record[key]);
    if (nested) return nested;
  }
  return undefined;
}

function isJsTsSafeMergeApplyStatusLike(status: string): boolean {
  return [
    'safe-apply',
    'safeapply',
    'accepted-clean',
    'acceptedclean',
    'no-op',
    'noop',
    'already-applied',
    'alreadyapplied',
    'stale',
    'review-required',
    'reviewrequired',
    'needs-review',
    'needsreview',
    'needs-port',
    'needsport',
    'blocked-evidence',
    'blockedevidence',
    'blocked'
  ].includes(normalizeStatus(status));
}

function canonicalSemanticMergeAdmissionStatus(
  status: string | undefined,
  signals: {
    autoMergeable: boolean;
    hasFailedEvidence: boolean;
    hasUnknownEvidence: boolean;
    hasBlockingLosses: boolean;
    hasNonBlockingLosses: boolean;
  }
): FrontierCodexSemanticMergeAdmissionStatus {
  if (signals.hasFailedEvidence || signals.hasBlockingLosses) return 'blocked';
  const normalized = normalizeStatus(status);
  if (['blocked', 'blockedevidence', 'failed', 'error', 'rejected'].includes(normalized)) return 'blocked';
  if (['safe-with-losses', 'safewithlosses', 'ready-with-losses', 'readywithlosses'].includes(normalized)) return 'safe-with-losses';
  if (['review-required', 'reviewrequired', 'needs-review', 'needsreview', 'unknown-needs-review', 'unknownneedsreview', 'needs-port', 'needsport'].includes(normalized)) {
    return 'review-required';
  }
  if (['safe', 'ready', 'admitted', 'auto-merge-candidate', 'automergecandidate'].includes(normalized)) {
    return signals.hasNonBlockingLosses ? 'safe-with-losses' : 'safe';
  }
  if (signals.hasUnknownEvidence) return 'review-required';
  if (signals.autoMergeable) return signals.hasNonBlockingLosses ? 'safe-with-losses' : 'safe';
  return 'review-required';
}

function canonicalJsTsSafeMergeApplyStatus(
  status: string | undefined,
  signals: {
    action: string | undefined;
    editCount: number;
    applied: number;
    alreadyApplied: number;
    conflicts: number;
    staleEdits: number;
    blockedEdits: number;
    autoApplyCandidate: boolean;
    reviewRequired: boolean;
    failedEvidence: number;
    staleEvidence: number;
  }
): FrontierCodexJsTsSafeMergeApplyStatus {
  if (signals.failedEvidence > 0 || signals.blockedEdits > 0) return 'blocked-evidence';
  if (signals.staleEvidence > 0 || signals.staleEdits > 0) return 'stale';
  if (signals.conflicts > 0) return 'blocked-evidence';
  const normalized = normalizeStatus(status);
  if (['safe-apply', 'safeapply', 'accepted-clean', 'acceptedclean', 'applied', 'apply', 'ready', 'safe'].includes(normalized)) return 'safe-apply';
  if (['no-op', 'noop', 'already-applied', 'alreadyapplied', 'skip', 'skipped', 'none'].includes(normalized)) return 'no-op';
  if (['stale', 'rerun-semantic-import', 'rerunsemanticimport'].includes(normalized)) return 'stale';
  if (['blocked-evidence', 'blockedevidence', 'blocked', 'failed', 'failure', 'error', 'rejected', 'conflict'].includes(normalized)) {
    return 'blocked-evidence';
  }
  if (['review-required', 'reviewrequired', 'needs-review', 'needsreview', 'needs-port', 'needsport', 'evidence-only', 'evidenceonly', 'human-review', 'humanreview'].includes(normalized)) {
    return 'review-required';
  }
  const action = normalizeStatus(signals.action);
  if (['apply', 'admit'].includes(action) && signals.autoApplyCandidate) return 'safe-apply';
  if (['skip', 'none'].includes(action)) return 'no-op';
  if (['block'].includes(action)) return 'blocked-evidence';
  if (['human-review', 'humanreview', 'review'].includes(action) || signals.reviewRequired) return 'review-required';
  if (signals.editCount === 0) return 'no-op';
  if (signals.applied > 0 && signals.applied + signals.alreadyApplied >= signals.editCount) return 'safe-apply';
  if (signals.alreadyApplied > 0 && signals.alreadyApplied >= signals.editCount) return 'no-op';
  return 'review-required';
}

function collectEvidence(record: Record<string, unknown>): Record<string, unknown>[] {
  return uniqueObjectsById([
    ...arrayOfObjects(record.evidence),
    ...arrayOfObjects(record.testEvidence),
    ...arrayOfObjects(record.testResults),
    ...arrayOfObjects(record.gateEvidence),
    ...arrayOfObjects(record.proofEvidence)
  ]);
}

function collectLosses(record: Record<string, unknown>): Record<string, unknown>[] {
  return uniqueObjectsById([
    ...arrayOfObjects(record.losses),
    ...arrayOfObjects(recordField(record, 'metadata')?.losses)
  ]);
}

function summarizeEvidence(evidence: readonly Record<string, unknown>[]): {
  passed: number;
  failed: number;
  unknown: number;
  stale: number;
} {
  let passed = 0;
  let failed = 0;
  let unknown = 0;
  let stale = 0;
  for (const entry of evidence) {
    const status = normalizeStatus(firstString(entry, ['status', 'outcome', 'result']));
    const reasons = strings(entry.reasonCodes ?? entry.reasons).map((reason) => reason.toLowerCase());
    if (['passed', 'pass', 'ok', 'success', 'succeeded', 'accepted', 'verified'].includes(status)) passed += 1;
    if (['failed', 'failure', 'error', 'blocked', 'rejected'].includes(status)) failed += 1;
    if (['unknown', 'pending', 'missing'].includes(status)) unknown += 1;
    if (status === 'stale' || entry.metadata && isObject(entry.metadata) && entry.metadata.stale === true || reasons.some((reason) => reason.includes('stale'))) stale += 1;
  }
  return { passed, failed, unknown, stale };
}

function lossSeverityCounts(record: Record<string, unknown>, losses: readonly Record<string, unknown>[]): Record<string, number> {
  const counts = { ...numberRecord(recordField(record, 'summary')?.lossesBySeverity), ...numberRecord(record.lossesBySeverity) };
  for (const loss of losses) {
    const severity = normalizeStatus(firstString(loss, ['severity']) ?? 'unknown');
    counts[severity] = (counts[severity] ?? 0) + 1;
  }
  return counts;
}

function isBlockingLoss(loss: Record<string, unknown>): boolean {
  const severity = normalizeStatus(firstString(loss, ['severity']));
  return ['error', 'fatal', 'blocked', 'blocking'].includes(severity) || loss.blocking === true;
}

function inferSemanticMergeConflictKeyKind(conflictKey: string): string {
  if (conflictKey.startsWith('symbol:')) return 'symbol';
  if (conflictKey.startsWith('node:')) return 'semantic-node';
  if (conflictKey.startsWith('region:')) return 'region';
  if (conflictKey.startsWith('native:')) return 'native-span';
  if (conflictKey.startsWith('ast-subtree:') || conflictKey.startsWith('source-subtree:')) return 'source-subtree';
  if (conflictKey.startsWith('effect:')) return 'effect';
  if (conflictKey.startsWith('generated:') || conflictKey.startsWith('generated-output:')) return 'generated-output';
  if (conflictKey.startsWith('sig:')) return 'signature';
  return 'custom';
}

function countStatus(values: readonly (string | undefined)[], aliases: readonly string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeStatus));
  return values.filter((value) => normalizedAliases.has(normalizeStatus(value))).length;
}

function uniqueObjectsById(values: readonly Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = firstString(value, ['id']);
    const key = id ? `id:${id}` : JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function firstString(record: Record<string, unknown> | undefined, keys: readonly string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return readStringArray(value).map((entry) => entry.trim()).filter(Boolean);
}

function recordField(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  return isObject(record[key]) ? record[key] : undefined;
}

function normalizeStatus(status: string | undefined): string {
  return String(status ?? '').trim().replace(/_/g, '-').toLowerCase();
}
