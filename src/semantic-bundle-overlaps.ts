import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type {
  FrontierCodexSemanticPatchBundleOverlapEntry,
  FrontierCodexSemanticPatchBundleOverlapSummary
} from './types-semantic-bundle-overlap.js';
import { isObject, readStringArray, uniqueStrings } from './common.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';

type LangOverlapApi = {
  querySemanticPatchBundleOverlaps?: (
    records: readonly Record<string, unknown>[],
    query?: Record<string, unknown>
  ) => readonly unknown[];
};

export async function summarizeSemanticPatchBundleOverlaps(
  bundles: readonly FrontierSwarmMergeBundle[]
): Promise<FrontierCodexSemanticPatchBundleOverlapSummary> {
  const records = bundles.map(bundleToSemanticPatchBundleRecord);
  const api = await loadLangOverlapApi();
  if (!api?.querySemanticPatchBundleOverlaps) {
    return emptySummary(records.length, ['optional @shapeshift-labs/frontier-lang overlap API unavailable']);
  }
  const overlaps = api.querySemanticPatchBundleOverlaps(records, { includeIndependent: false })
    .filter(isObject)
    .map((record) => normalizeOverlapEntry(record, records))
    .filter((entry): entry is FrontierCodexSemanticPatchBundleOverlapEntry => !!entry)
    .sort((left, right) => right.score - left.score || left.leftJobId.localeCompare(right.leftJobId));
  return {
    available: true,
    recordCount: records.length,
    total: overlaps.length,
    statusCounts: countBy(overlaps.map((entry) => entry.status)),
    duplicateCount: overlaps.filter((entry) => entry.status === 'duplicate').length,
    semanticOverlapCount: overlaps.filter((entry) => entry.status === 'semantic-overlap').length,
    sourceOverlapCount: overlaps.filter((entry) => entry.status === 'source-overlap').length,
    reviewRequiredCount: overlaps.filter((entry) => entry.reviewRequired).length,
    warnings: [],
    top: overlaps.slice(0, 50)
  };
}

export function semanticPatchBundleOverlapJobIds(
  summary: unknown,
  filter: string | undefined
): Set<string> | undefined {
  if (!filter) return undefined;
  const wanted = filter.toLowerCase();
  const record = isObject(summary) ? summary : {};
  const entries = Array.isArray(record.top) ? record.top.filter(isObject) : [];
  const matched = entries.filter((entry) => overlapEntryMatches(entry, wanted));
  return new Set(matched.flatMap((entry) => [entry.leftJobId, entry.rightJobId].filter((id): id is string => typeof id === 'string')));
}

function bundleToSemanticPatchBundleRecord(bundle: FrontierSwarmMergeBundle): Record<string, unknown> {
  const quality = summarizeCodexSemanticImportQuality(bundle.semanticImport, false);
  const script = quality.semanticEditScript;
  const projection = quality.semanticEditProjection;
  const metadata = isObject(bundle.metadata) ? bundle.metadata : {};
  const collect = isObject(metadata.collect) ? metadata.collect : {};
  return {
    id: bundle.id,
    jobId: bundle.jobId,
    sourcePath: singleString([...bundle.changedPaths, ...projection.sourcePaths]),
    baseHash: firstString(metadata.baseHash, metadata.beforeHash, collect.baseHash),
    targetHash: firstString(metadata.targetHash, metadata.afterHash, collect.targetHash),
    index: {
      baseHashes: readStringArray(metadata.baseHashes),
      targetHashes: readStringArray(metadata.targetHashes),
      sourcePaths: uniqueStrings([...bundle.changedPaths, ...projection.sourcePaths]),
      regionKeys: uniqueStrings([...bundle.changedRegions, ...projection.anchorKeys]),
      conflictKeys: uniqueStrings([...script.conflictKeys, ...projection.conflictKeys]),
      semanticEditKeys: uniqueStrings([...script.semanticKeys, ...projection.semanticKeys]),
      semanticIdentityHashes: uniqueStrings([...script.semanticIdentityHashes, ...projection.semanticIdentityHashes]),
      sourceIdentityHashes: uniqueStrings([...script.sourceIdentityHashes, ...projection.sourceIdentityHashes]),
      operationContentHashes: uniqueStrings([...script.operationContentHashes, ...projection.operationContentHashes]),
      editContentHashes: projection.editContentHashes,
      semanticTransformKeys: projection.semanticTransformKeys,
      semanticTransformIdentityHashes: projection.semanticTransformIdentityHashes,
      semanticTransformContentHashes: projection.semanticTransformContentHashes,
      projectionIdentityHashes: projection.projectionIdentityHashes
    }
  };
}

async function loadLangOverlapApi(): Promise<LangOverlapApi | undefined> {
  try {
    return await import('@shapeshift-labs/frontier-lang') as unknown as LangOverlapApi;
  } catch {
    return undefined;
  }
}

function normalizeOverlapEntry(
  record: Record<string, unknown>,
  records: readonly Record<string, unknown>[]
): FrontierCodexSemanticPatchBundleOverlapEntry | undefined {
  const leftBundleId = typeof record.leftBundleId === 'string' ? record.leftBundleId : '';
  const rightBundleId = typeof record.rightBundleId === 'string' ? record.rightBundleId : '';
  const left = records.find((entry) => entry.id === leftBundleId);
  const right = records.find((entry) => entry.id === rightBundleId);
  const admission = isObject(record.admission) ? record.admission : {};
  const shared = isObject(record.shared) ? record.shared : {};
  if (!left || !right || typeof admission.status !== 'string') return undefined;
  return {
    id: String(record.id ?? `${leftBundleId}:${rightBundleId}`),
    leftJobId: String(left.jobId ?? leftBundleId),
    rightJobId: String(right.jobId ?? rightBundleId),
    leftBundleId,
    rightBundleId,
    status: admission.status,
    score: Number(record.score ?? 0),
    reviewRequired: admission.reviewRequired === true,
    overlapKinds: readStringArray(record.overlapKinds),
    reasonCodes: readStringArray(admission.reasonCodes),
    shared: {
      semanticEditKeys: readStringArray(shared.semanticEditKeys),
      semanticIdentityHashes: readStringArray(shared.semanticIdentityHashes),
      sourceIdentityHashes: readStringArray(shared.sourceIdentityHashes),
      operationContentHashes: readStringArray(shared.operationContentHashes),
      editContentHashes: readStringArray(shared.editContentHashes),
      semanticTransformKeys: readStringArray(shared.semanticTransformKeys),
      semanticTransformIdentityHashes: readStringArray(shared.semanticTransformIdentityHashes),
      semanticTransformContentHashes: readStringArray(shared.semanticTransformContentHashes),
      projectionIdentityHashes: readStringArray(shared.projectionIdentityHashes),
      regionKeys: readStringArray(shared.regionKeys),
      conflictKeys: readStringArray(shared.conflictKeys),
      sourcePaths: readStringArray(shared.sourcePaths)
    }
  };
}

function overlapEntryMatches(entry: Record<string, unknown>, wanted: string): boolean {
  if (wanted === 'any' || entry.status === wanted) return true;
  return readStringArray(entry.overlapKinds).some((kind) => kind.toLowerCase() === wanted) ||
    readStringArray(entry.reasonCodes).some((reason) => reason.toLowerCase() === wanted);
}

function emptySummary(recordCount: number, warnings: string[]): FrontierCodexSemanticPatchBundleOverlapSummary {
  return {
    available: false,
    recordCount,
    total: 0,
    statusCounts: {},
    duplicateCount: 0,
    semanticOverlapCount: 0,
    sourceOverlapCount: 0,
    reviewRequiredCount: 0,
    warnings,
    top: []
  };
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((out, value) => {
    out[value] = (out[value] ?? 0) + 1;
    return out;
  }, {});
}

function singleString(values: readonly string[]): string | undefined {
  const unique = uniqueStrings(values);
  return unique.length === 1 ? unique[0] : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.map((value) => typeof value === 'string' ? value : '').find(Boolean);
}
