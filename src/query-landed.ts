import { nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';
import { firstPositiveNumber, jobIds, nestedObject, ratio } from './query-values.js';

export function landedJobIdsFromSources(...sources: Record<string, unknown>[]): Set<string> {
  const values: string[] = [];
  for (const source of sources) {
    const summary = nestedObject(source, 'summary');
    const ledger = applyLedgerFromSource(source);
    values.push(
      ...readStringArray(source.landedJobIds),
      ...readStringArray(summary?.landedJobIds),
      ...readStringArray(ledger?.landedJobIds),
      ...readStringArray(ledger?.appliedJobIds),
      ...readStringArray(ledger?.committedJobIds)
    );
  }
  return new Set(uniqueStrings(values));
}

export function queryLandedSummary(
  jobs: Record<string, unknown>[],
  landedJobIds: Set<string>,
  dashboard: Record<string, unknown>,
  collection: Record<string, unknown>,
  compactDashboard: Record<string, unknown>
) {
  const ledger = applyLedgerFromSources(dashboard, collection, compactDashboard);
  const matchedJobIds = jobIds(jobs);
  const landedMatchedJobIds = matchedJobIds.filter((jobId) => landedJobIds.has(jobId));
  const failedJobIds = uniqueStrings([
    ...readStringArray(ledger?.failedJobIds),
    ...readStringArray(nestedObject(collection, 'summary')?.failedJobIds)
  ]);
  const total = firstPositiveNumber(ledger?.total, nestedObject(collection, 'summary')?.total, matchedJobIds.length);
  const collectionJobCount = firstPositiveNumber(nestedObject(collection, 'summary')?.total, nestedObject(dashboard, 'summary')?.jobCount, matchedJobIds.length);
  const landed = firstPositiveNumber(ledger?.landed, compactDashboard.landedCount, landedJobIds.size);
  return {
    total,
    collectionJobCount,
    landed,
    applied: nonNegativeNumber(ledger?.applied),
    committed: nonNegativeNumber(ledger?.committed),
    skipped: nonNegativeNumber(ledger?.skipped),
    failed: nonNegativeNumber(ledger?.failed),
    landedRatio: ratio(landed, total),
    collectionLandedRatio: ratio(landed, collectionJobCount),
    matchedJobCount: matchedJobIds.length,
    matchedLandedJobCount: landedMatchedJobIds.length,
    matchedUnlandedJobCount: Math.max(0, matchedJobIds.length - landedMatchedJobIds.length),
    matchedLandedRatio: ratio(landedMatchedJobIds.length, matchedJobIds.length),
    landedJobIds: Array.from(landedJobIds).sort(),
    matchedLandedJobIds: landedMatchedJobIds,
    failedJobIds
  };
}

function applyLedgerFromSources(...sources: Record<string, unknown>[]): Record<string, unknown> | undefined {
  for (const source of sources) {
    const ledger = applyLedgerFromSource(source);
    if (ledger) return ledger;
  }
  return undefined;
}

function applyLedgerFromSource(source: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(source.applyLedger)) return source.applyLedger;
  const summary = nestedObject(source, 'summary');
  if (isRecord(summary?.applyLedger)) return summary.applyLedger;
  const metadata = nestedObject(source, 'metadata');
  if (isRecord(metadata?.applyLedger)) return metadata.applyLedger;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
