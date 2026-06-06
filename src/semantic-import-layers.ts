import type { FrontierCodexSemanticImportRecord, FrontierCodexUniversalAstLayerSummary } from './index.js';
import { isObject, nonNegativeNumber, numberRecord, uniqueStrings } from './common.js';


export function semanticImportUniversalAstLayerSummary(summary: unknown): FrontierCodexUniversalAstLayerSummary {
  const input = isObject(summary) && isObject(summary.universalAstLayers) ? summary.universalAstLayers : undefined;
  const names = Array.isArray(input?.names)
    ? uniqueStrings(input.names.map((entry) => String(entry)).filter(Boolean))
    : [];
  const ids = Array.isArray(input?.ids)
    ? uniqueStrings(input.ids.map((entry) => String(entry)).filter(Boolean))
    : [];
  const byName = isObject(input?.byName) ? numberRecord(input.byName) : {};
  const total = nonNegativeNumber(input?.total ?? ids.length);
  return {
    total,
    names,
    ids,
    byName,
    empty: input?.empty === true || total === 0
  };
}


export function summarizeSemanticImportUniversalAstLayers(records: FrontierCodexSemanticImportRecord[]): FrontierCodexUniversalAstLayerSummary {
  const byName: Record<string, number> = {};
  const names: string[] = [];
  const ids: string[] = [];
  for (const record of records) {
    for (const name of record.universalAstLayers?.names ?? []) {
      names.push(name);
      byName[name] = (byName[name] ?? 0) + 1;
    }
    ids.push(...(record.universalAstLayers?.ids ?? []));
  }
  const uniqueNames = uniqueStrings(names);
  const uniqueIds = uniqueStrings(ids);
  return {
    total: records.reduce((sum, record) => sum + (record.universalAstLayers?.total ?? 0), 0),
    names: uniqueNames,
    ids: uniqueIds,
    byName,
    empty: uniqueIds.length === 0
  };
}


export function summarizeUniversalAstLayers(universalAst: any, semanticSidecar: any): FrontierCodexUniversalAstLayerSummary {
  const layers = collectUniversalAstLayerRecords(universalAst?.layers);
  const sidecarNames = Array.isArray(semanticSidecar?.summary?.universalAstLayerNames)
    ? semanticSidecar.summary.universalAstLayerNames
    : Array.isArray(semanticSidecar?.universalAstLayers?.names)
      ? semanticSidecar.universalAstLayers.names
      : [];
  const sidecarIds = Array.isArray(semanticSidecar?.universalAstLayers?.ids) ? semanticSidecar.universalAstLayers.ids : [];
  const byName: Record<string, number> = {};
  for (const layer of layers) {
    if (!layer?.layer) continue;
    byName[String(layer.layer)] = (byName[String(layer.layer)] ?? 0) + 1;
  }
  for (const [name, count] of Object.entries(semanticSidecar?.universalAstLayers?.byName ?? {})) {
    byName[name] = Math.max(byName[name] ?? 0, Number(count) || 0);
  }
  const names = uniqueStrings([
    ...layers.map((layer) => String(layer?.layer ?? '')).filter(Boolean),
    ...sidecarNames.map((name: unknown) => String(name)).filter(Boolean)
  ]);
  const ids = uniqueStrings([
    ...layers.map((layer) => String(layer?.id ?? '')).filter(Boolean),
    ...sidecarIds.map((id: unknown) => String(id)).filter(Boolean)
  ]);
  const total = Math.max(layers.length, Number(semanticSidecar?.universalAstLayers?.total ?? 0) || 0, ids.length);
  return { total, names, ids, byName, empty: total === 0 };
}


function collectUniversalAstLayerRecords(layers: any): any[] {
  if (!layers) return [];
  if (Array.isArray(layers)) return layers.filter(Boolean);
  if (typeof layers !== 'object') return [];
  return Object.values(layers).flatMap((value) => Array.isArray(value) ? value : [value]).filter(Boolean);
}


export function summarizeNativeSourceProjection(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    language: value.language,
    sourcePath: value.sourcePath,
    mode: value.mode,
    outputHash: value.outputHash,
    declarationCount: Array.isArray(value.declarations) ? value.declarations.length : 0,
    lossCount: Array.isArray(value.losses) ? value.losses.length : 0,
    readiness: value.readiness?.readiness,
    sourceHashVerified: value.metadata?.sourceHashVerified,
    exactSourceAvailable: value.metadata?.exactSourceAvailable
  };
}


export function summarizeNativeSourceCompile(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    ok: value.ok,
    language: value.language,
    target: value.target,
    sourcePath: value.sourcePath,
    outputMode: value.outputMode,
    outputHash: value.outputHash,
    lossCount: Array.isArray(value.losses) ? value.losses.length : 0,
    readiness: value.readiness?.readiness,
    targetCoverage: value.targetCoverage ? {
      target: value.targetCoverage.target,
      lossClass: value.targetCoverage.lossClass,
      supported: value.targetCoverage.supported,
      readiness: value.targetCoverage.readiness
    } : undefined
  };
}


export function summarizeSemanticLosses(value: any): unknown {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  return value.slice(0, 12).map((loss) => ({
    id: loss?.id,
    severity: loss?.severity,
    phase: loss?.phase,
    kind: loss?.kind,
    message: loss?.message,
    nodeId: loss?.nodeId,
    span: loss?.span
  }));
}


export function summarizeSemanticMergeCandidate(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    readiness: value.readiness,
    touchedSymbols: Array.isArray(value.touchedSymbols) ? value.touchedSymbols.slice(0, 50) : [],
    touchedSemanticNodes: Array.isArray(value.touchedSemanticNodes) ? value.touchedSemanticNodes.slice(0, 50) : [],
    nativeSpans: Array.isArray(value.nativeSpans) ? value.nativeSpans.slice(0, 50) : [],
    conflictKeys: Array.isArray(value.conflictKeys) ? value.conflictKeys.slice(0, 100) : [],
    reasons: Array.isArray(value.reasons) ? value.reasons.slice(0, 50) : []
  };
}
