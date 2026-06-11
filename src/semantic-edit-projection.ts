import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

export function summarizeSemanticEditProjection(value: unknown): FrontierCodexSemanticEditProjectionSummary | undefined {
  const record = isObject(value) ? value : undefined;
  if (!record) return undefined;
  if (record.kind === 'frontier.lang.semanticEditProjection') return normalizeProjectionRecord(record);
  if (isObject(record.semanticEditProjection)) return summarizeSemanticEditProjection(record.semanticEditProjection);
  if (isObject(record.semanticEditProjections)) return normalizeProjectionRecord(record.semanticEditProjections);
  return isProjectionSummaryLike(record) ? normalizeProjectionRecord(record) : undefined;
}

export function mergeSemanticEditProjectionSummaries(
  entries: readonly (FrontierCodexSemanticEditProjectionSummary | undefined)[]
): FrontierCodexSemanticEditProjectionSummary {
  const merged = emptySemanticEditProjectionSummary();
  for (const entry of entries) {
    if (!entry || entry.empty && entry.total === 0) continue;
    for (const key of [
      'total',
      'projected',
      'blocked',
      'autoMergeCandidates',
      'appliedOperations',
      'skippedOperations',
      'editCount',
      'appliedEditCount',
      'alreadyAppliedEditCount',
      'deletedBytes',
      'replacementBytes',
      'projectedSourceMatchesWorker',
      'projectedSourceMismatchesWorker',
      'projectedSourceMatchUnknown'
    ] as const) {
      merged[key] += nonNegativeNumber(entry[key]);
    }
    mergeNumberRecord(merged.statusCounts, entry.statusCounts);
    mergeNumberRecord(merged.admission, entry.admission);
    merged.anchorKeys = uniqueStrings([...merged.anchorKeys, ...entry.anchorKeys]);
    merged.conflictKeys = uniqueStrings([...merged.conflictKeys, ...entry.conflictKeys]);
    merged.symbolNames = uniqueStrings([...merged.symbolNames, ...entry.symbolNames]);
    merged.sourcePaths = uniqueStrings([...merged.sourcePaths, ...entry.sourcePaths]);
    merged.semanticKeys = uniqueStrings([...merged.semanticKeys, ...entry.semanticKeys]);
    merged.semanticIdentityHashes = uniqueStrings([...merged.semanticIdentityHashes, ...entry.semanticIdentityHashes]);
    merged.sourceIdentityHashes = uniqueStrings([...merged.sourceIdentityHashes, ...entry.sourceIdentityHashes]);
    merged.editContentHashes = uniqueStrings([...merged.editContentHashes, ...entry.editContentHashes]);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
  }
  merged.empty = merged.total === 0;
  return merged;
}

export function emptySemanticEditProjectionSummary(): FrontierCodexSemanticEditProjectionSummary {
  return {
    total: 0,
    projected: 0,
    blocked: 0,
    autoMergeCandidates: 0,
    appliedOperations: 0,
    skippedOperations: 0,
    editCount: 0,
    appliedEditCount: 0,
    alreadyAppliedEditCount: 0,
    deletedBytes: 0,
    replacementBytes: 0,
    anchorKeys: [],
    conflictKeys: [],
    symbolNames: [],
    sourcePaths: [],
    semanticKeys: [],
    semanticIdentityHashes: [],
    sourceIdentityHashes: [],
    editContentHashes: [],
    projectedSourceMatchesWorker: 0,
    projectedSourceMismatchesWorker: 0,
    projectedSourceMatchUnknown: 0,
    statusCounts: {},
    admission: {},
    reasonCodes: [],
    empty: true
  };
}

function normalizeProjectionRecord(record: Record<string, unknown>): FrontierCodexSemanticEditProjectionSummary {
  const admission = isObject(record.admission) ? record.admission : {};
  const status = typeof record.status === 'string' ? record.status : undefined;
  const admissionStatus = typeof admission.status === 'string' ? admission.status : undefined;
  const statusCounts = { ...numberRecord(record.statusCounts), ...(status ? { [status]: 1 } : {}) };
  const admissionCounts = { ...numberRecord(record.admission), ...(admissionStatus ? { [admissionStatus]: 1 } : {}) };
  const total = nonNegativeNumber(record.total) || (record.kind === 'frontier.lang.semanticEditProjection' ? 1 : 0);
  const projected = nonNegativeNumber(record.projected) || nonNegativeNumber(statusCounts.projected);
  const workerMatch = projectedWorkerMatchCounts(record, status, projected);
  const editSummary = projectionEditSummary(record);
  const editIdentity = projectionEditIdentity(record);
  return {
    total,
    projected,
    blocked: nonNegativeNumber(record.blocked) || nonNegativeNumber(statusCounts.blocked),
    autoMergeCandidates: nonNegativeNumber(record.autoMergeCandidates) || nonNegativeNumber(admissionCounts['auto-merge-candidate']),
    appliedOperations: nonNegativeNumber(record.appliedOperations) || (Array.isArray(record.appliedOperations) ? record.appliedOperations.length : 0),
    skippedOperations: nonNegativeNumber(record.skippedOperations) || (Array.isArray(record.skippedOperations) ? record.skippedOperations.length : 0),
    editCount: editSummary.editCount,
    appliedEditCount: editSummary.appliedEditCount,
    alreadyAppliedEditCount: editSummary.alreadyAppliedEditCount,
    deletedBytes: editSummary.deletedBytes,
    replacementBytes: editSummary.replacementBytes,
    anchorKeys: editIdentity.anchorKeys,
    conflictKeys: editIdentity.conflictKeys,
    symbolNames: editIdentity.symbolNames,
    sourcePaths: editIdentity.sourcePaths,
    semanticKeys: editIdentity.semanticKeys,
    semanticIdentityHashes: editIdentity.semanticIdentityHashes,
    sourceIdentityHashes: editIdentity.sourceIdentityHashes,
    editContentHashes: editIdentity.editContentHashes,
    projectedSourceMatchesWorker: workerMatch.matches,
    projectedSourceMismatchesWorker: workerMatch.mismatches,
    projectedSourceMatchUnknown: workerMatch.unknown,
    statusCounts,
    admission: admissionCounts,
    reasonCodes: uniqueStrings([...readStringArray(admission.reasonCodes), ...readStringArray(record.reasonCodes)]),
    empty: total === 0
  };
}

function isProjectionSummaryLike(record: Record<string, unknown>): boolean {
  return record.projected !== undefined ||
    record.blocked !== undefined ||
    record.statusCounts !== undefined ||
    record.skippedOperations !== undefined ||
    record.appliedOperations !== undefined ||
    record.edits !== undefined ||
    record.editCount !== undefined ||
    record.anchorKeys !== undefined ||
    record.conflictKeys !== undefined ||
    record.projectedSourceMatchesWorker !== undefined ||
    record.projectedSourceMismatchesWorker !== undefined ||
    record.projectedSourceMatchUnknown !== undefined;
}

function mergeNumberRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + nonNegativeNumber(value);
}

function projectionEditIdentity(record: Record<string, unknown>): {
  anchorKeys: string[];
  conflictKeys: string[];
  symbolNames: string[];
  sourcePaths: string[];
  semanticKeys: string[];
  semanticIdentityHashes: string[];
  sourceIdentityHashes: string[];
  editContentHashes: string[];
} {
  const edits = Array.isArray(record.edits) ? record.edits.filter(isObject) : [];
  if (!edits.length) {
    return {
      anchorKeys: readStringArray(record.anchorKeys),
      conflictKeys: readStringArray(record.conflictKeys),
      symbolNames: readStringArray(record.symbolNames),
      sourcePaths: readStringArray(record.sourcePaths),
      semanticKeys: readStringArray(record.semanticKeys),
      semanticIdentityHashes: readStringArray(record.semanticIdentityHashes),
      sourceIdentityHashes: readStringArray(record.sourceIdentityHashes),
      editContentHashes: readStringArray(record.editContentHashes)
    };
  }
  return {
    anchorKeys: uniqueStrings(edits.flatMap((edit) => stringField(edit.anchorKey))),
    conflictKeys: uniqueStrings(edits.flatMap((edit) => stringField(edit.conflictKey))),
    symbolNames: uniqueStrings(edits.flatMap((edit) => stringField(edit.symbolName))),
    sourcePaths: uniqueStrings(edits.flatMap((edit) => stringField(edit.sourcePath))),
    semanticKeys: uniqueStrings(edits.flatMap((edit) => stringField(edit.semanticKey))),
    semanticIdentityHashes: uniqueStrings(edits.flatMap((edit) => stringField(edit.semanticIdentityHash))),
    sourceIdentityHashes: uniqueStrings(edits.flatMap((edit) => stringField(edit.sourceIdentityHash))),
    editContentHashes: uniqueStrings(edits.flatMap((edit) => stringField(edit.editContentHash)))
  };
}

function projectionEditSummary(record: Record<string, unknown>): {
  editCount: number;
  appliedEditCount: number;
  alreadyAppliedEditCount: number;
  deletedBytes: number;
  replacementBytes: number;
} {
  const edits = Array.isArray(record.edits) ? record.edits.filter(isObject) : [];
  const empty = { editCount: 0, appliedEditCount: 0, alreadyAppliedEditCount: 0, deletedBytes: 0, replacementBytes: 0 };
  if (!edits.length) {
    return {
      editCount: nonNegativeNumber(record.editCount),
      appliedEditCount: nonNegativeNumber(record.appliedEditCount),
      alreadyAppliedEditCount: nonNegativeNumber(record.alreadyAppliedEditCount),
      deletedBytes: nonNegativeNumber(record.deletedBytes),
      replacementBytes: nonNegativeNumber(record.replacementBytes)
    };
  }
  return edits.reduce<typeof empty>((out, edit) => {
    out.editCount += 1;
    if (edit.status === 'already-applied') out.alreadyAppliedEditCount += 1;
    else out.appliedEditCount += 1;
    out.deletedBytes += nonNegativeNumber(edit.deletedBytes);
    out.replacementBytes += nonNegativeNumber(edit.replacementBytes);
    return out;
  }, { ...empty });
}

function stringField(value: unknown): string[] {
  return typeof value === 'string' && value.length ? [value] : [];
}

function projectedWorkerMatchCounts(
  record: Record<string, unknown>,
  status: string | undefined,
  projected: number
): { matches: number; mismatches: number; unknown: number } {
  const explicit = record.projectedSourceMatchesWorker !== undefined ||
    record.projectedSourceMismatchesWorker !== undefined ||
    record.projectedSourceMatchUnknown !== undefined;
  if (explicit) {
    return {
      matches: nonNegativeNumber(record.projectedSourceMatchesWorker),
      mismatches: nonNegativeNumber(record.projectedSourceMismatchesWorker),
      unknown: nonNegativeNumber(record.projectedSourceMatchUnknown)
    };
  }
  if (record.kind === 'frontier.lang.semanticEditProjection' && status === 'projected') {
    const projectedHash = typeof record.projectedHash === 'string' ? record.projectedHash : undefined;
    const workerHash = typeof record.workerHash === 'string' ? record.workerHash : undefined;
    if (!projectedHash || !workerHash) return { matches: 0, mismatches: 0, unknown: 1 };
    return projectedHash === workerHash
      ? { matches: 1, mismatches: 0, unknown: 0 }
      : { matches: 0, mismatches: 1, unknown: 0 };
  }
  return { matches: 0, mismatches: 0, unknown: projected };
}
