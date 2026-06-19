import type { FrontierCodexSemanticDependencySummary } from './index.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';

const dependencyFields = ['calls', 'uses', 'references', 'imports', 'depends', 'extends', 'implements', 'includes', 'requires'] as const;

export function summarizeSemanticDependencies(semanticIndex: unknown, sidecar?: unknown): FrontierCodexSemanticDependencySummary {
  return mergeDependencySummaries([
    normalizeDependencySummary(readObject(sidecar)?.dependencies),
    normalizeSidecarDependencySummary(sidecar),
    summarizeRelationDependencies(readObject(semanticIndex)?.relations)
  ]);
}

export function mergeDependencySummaries(summaries: readonly FrontierCodexSemanticDependencySummary[]): FrontierCodexSemanticDependencySummary {
  const merged = emptyDependencySummary();
  for (const summary of summaries) {
    merged.total += summary.total;
    for (const field of dependencyFields) merged[field] += summary[field];
    for (const [predicate, count] of Object.entries(summary.byPredicate)) {
      merged.byPredicate[predicate] = (merged.byPredicate[predicate] ?? 0) + count;
    }
    merged.predicates = uniqueStrings([...merged.predicates, ...summary.predicates]);
    merged.ids = uniqueStrings([...merged.ids, ...summary.ids]).slice(0, 48);
    merged.sourceSymbolIds = uniqueStrings([...merged.sourceSymbolIds, ...summary.sourceSymbolIds]).slice(0, 48);
    merged.targetSymbolIds = uniqueStrings([...merged.targetSymbolIds, ...summary.targetSymbolIds]).slice(0, 48);
  }
  if (!merged.total) merged.total = Object.values(merged.byPredicate).reduce((sum, count) => sum + count, 0);
  return merged;
}

export function emptyDependencySummary(): FrontierCodexSemanticDependencySummary {
  return {
    total: 0,
    calls: 0,
    uses: 0,
    references: 0,
    imports: 0,
    depends: 0,
    extends: 0,
    implements: 0,
    includes: 0,
    requires: 0,
    byPredicate: {},
    predicates: [],
    ids: [],
    sourceSymbolIds: [],
    targetSymbolIds: []
  };
}

function normalizeDependencySummary(input: unknown): FrontierCodexSemanticDependencySummary {
  const object = readObject(input);
  if (!object) return emptyDependencySummary();
  const byPredicate = numberRecord(object.byPredicate);
  const summary = emptyDependencySummary();
  for (const field of dependencyFields) summary[field] = nonNegativeNumber(object[field]);
  summary.byPredicate = byPredicate;
  summary.predicates = uniqueStrings(readStringArray(object.predicates));
  summary.ids = uniqueStrings(readStringArray(object.ids)).slice(0, 48);
  summary.sourceSymbolIds = uniqueStrings(readStringArray(object.sourceSymbolIds)).slice(0, 48);
  summary.targetSymbolIds = uniqueStrings(readStringArray(object.targetSymbolIds)).slice(0, 48);
  summary.total = nonNegativeNumber(object.total)
    || Object.values(byPredicate).reduce((sum, count) => sum + count, 0)
    || dependencyFields.reduce((sum, field) => sum + summary[field], 0);
  return summary;
}

function normalizeSidecarDependencySummary(sidecar: unknown): FrontierCodexSemanticDependencySummary {
  const summary = readObject(readObject(sidecar)?.summary);
  if (!summary) return emptyDependencySummary();
  const out = emptyDependencySummary();
  out.total = nonNegativeNumber(summary.dependencyRelations);
  out.predicates = uniqueStrings(readStringArray(summary.dependencyPredicates));
  for (const predicate of out.predicates) out.byPredicate[predicate] = out.byPredicate[predicate] ?? 0;
  return out;
}

function summarizeRelationDependencies(relations: unknown): FrontierCodexSemanticDependencySummary {
  const out = emptyDependencySummary();
  if (!Array.isArray(relations)) return out;
  for (const relation of relations) {
    const object = readObject(relation);
    if (!object) continue;
    const predicate = dependencyPredicateKey(object.predicate);
    if (!predicate) continue;
    out.total += 1;
    if (predicate in out) out[predicate as typeof dependencyFields[number]] += 1;
    out.byPredicate[predicate] = (out.byPredicate[predicate] ?? 0) + 1;
    out.predicates = uniqueStrings([...out.predicates, predicate]);
    out.ids = appendLimited(out.ids, object.id);
    out.sourceSymbolIds = appendLimited(out.sourceSymbolIds, object.sourceId);
    out.targetSymbolIds = appendLimited(out.targetSymbolIds, object.targetId);
  }
  return out;
}

function dependencyPredicateKey(value: unknown): string | undefined {
  const predicate = String(value ?? '').toLowerCase();
  if (!predicate || predicate === 'defines' || predicate === 'definitionof') return undefined;
  if (predicate.includes('call')) return 'calls';
  if (predicate.includes('reference')) return 'references';
  if (predicate.includes('import')) return 'imports';
  if (predicate.includes('depend')) return 'depends';
  if (predicate.includes('require')) return 'requires';
  if (predicate.includes('include')) return 'includes';
  if (predicate.includes('extend')) return 'extends';
  if (predicate.includes('implement')) return 'implements';
  if (predicate === 'uses' || predicate.includes('use')) return 'uses';
  return undefined;
}

function appendLimited(values: string[], value: unknown): string[] {
  const clean = typeof value === 'string' ? value : undefined;
  return clean ? uniqueStrings([...values, clean]).slice(0, 48) : values;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}
