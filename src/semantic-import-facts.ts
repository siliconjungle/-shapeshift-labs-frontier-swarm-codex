import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';
import type { FrontierCodexSemanticFactSummary } from './types-semantic.js';

export function emptySemanticFactSummary(): FrontierCodexSemanticFactSummary {
  return { total: 0, byPredicate: {}, predicates: [] };
}

export function semanticImportFactSummary(summary: unknown): FrontierCodexSemanticFactSummary {
  const record = isObject(summary) ? summary : undefined;
  const embedded = isObject(record?.semanticFacts) ? factSummaryFromRecord(record.semanticFacts) : emptySemanticFactSummary();
  const direct = numberRecord(record?.semanticFactSummary);
  const semanticIndex = isObject(record?.semanticIndex) ? record.semanticIndex : undefined;
  const byPredicate = mergeNumberRecords(embedded.byPredicate, direct);
  const predicates = uniqueStrings([
    ...embedded.predicates,
    ...readStringArray(record?.semanticFactPredicates),
    ...Object.keys(byPredicate)
  ]).sort();
  const total = Math.max(
    embedded.total,
    nonNegativeNumber(record?.semanticFactCount),
    nonNegativeNumber(semanticIndex?.facts),
    sumRecord(byPredicate)
  );
  return { total, byPredicate, predicates };
}

export function summarizeLangSidecarSemanticFacts(sidecar: unknown): FrontierCodexSemanticFactSummary {
  const record = isObject(sidecar) ? sidecar : undefined;
  const direct = semanticImportFactSummary(record?.summary ?? record);
  if (direct.total > 0 || direct.predicates.length > 0) return direct;
  const imports = [
    ...(Array.isArray(record?.imports) ? record.imports : []),
    ...(Array.isArray((record?.summary as { imports?: unknown } | undefined)?.imports)
      ? (record?.summary as { imports: unknown[] }).imports
      : [])
  ];
  return mergeSemanticFactSummaries(imports.map((entry) => semanticImportFactSummary(entry)));
}

export function mergeSemanticFactSummaries(
  entries: readonly (FrontierCodexSemanticFactSummary | undefined)[]
): FrontierCodexSemanticFactSummary {
  const byPredicate: Record<string, number> = {};
  let total = 0;
  const predicates: string[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    total += nonNegativeNumber(entry.total);
    for (const [key, value] of Object.entries(entry.byPredicate)) {
      byPredicate[key] = (byPredicate[key] ?? 0) + nonNegativeNumber(value);
    }
    predicates.push(...entry.predicates);
  }
  return {
    total,
    byPredicate,
    predicates: uniqueStrings([...predicates, ...Object.keys(byPredicate)]).sort()
  };
}

function factSummaryFromRecord(record: Record<string, unknown>): FrontierCodexSemanticFactSummary {
  const byPredicate = numberRecord(record.byPredicate);
  const predicates = uniqueStrings([
    ...readStringArray(record.predicates),
    ...Object.keys(byPredicate)
  ]).sort();
  return {
    total: Math.max(nonNegativeNumber(record.total), sumRecord(byPredicate)),
    byPredicate,
    predicates
  };
}

function mergeNumberRecords(left: Record<string, number>, right: Record<string, number>): Record<string, number> {
  const out = { ...left };
  for (const [key, value] of Object.entries(right)) out[key] = (out[key] ?? 0) + value;
  return out;
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + nonNegativeNumber(value), 0);
}
