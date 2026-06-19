import type { FrontierCodexParadigmSemanticsSummary, FrontierCodexSemanticImportRecord } from './index.js';
import { isObject, nonNegativeNumber, numberRecord, uniqueStrings } from './common.js';
import { proofStringList } from './semantic-import-proof.js';

export function semanticImportParadigmSemanticsSummary(summary: unknown): FrontierCodexParadigmSemanticsSummary {
  const input = isObject(summary) && isObject((summary as { paradigmSemantics?: unknown }).paradigmSemantics)
    ? (summary as { paradigmSemantics?: unknown }).paradigmSemantics
    : undefined;
  return input ? normalizeParadigmSemanticsSummary(input) : emptyParadigmSemanticsSummary();
}

const paradigmSemanticsSummaryGroups = [
  'bindingScopes',
  'bindings',
  'patterns',
  'typeConstraints',
  'evaluationModels',
  'memoryLocations',
  'effectRegions',
  'controlRegions',
  'logicPrograms',
  'actorSystems',
  'stackEffects',
  'arrayShapes',
  'numericKernels',
  'dataflowNetworks',
  'clockModels',
  'objectModels',
  'macroExpansions',
  'reflectionBoundaries',
  'loweringRecords'
] as const;


export function summarizeSemanticImportParadigmSemantics(records: FrontierCodexSemanticImportRecord[]): FrontierCodexParadigmSemanticsSummary {
  const summary = emptyParadigmSemanticsSummary();
  for (const record of records) {
    mergeParadigmSemanticsSummary(summary, record.paradigmSemantics);
  }
  summary.empty = summary.total === 0;
  return summary;
}


export function summarizeParadigmSemantics(paradigmSemantics?: any, semanticSidecar?: any): FrontierCodexParadigmSemanticsSummary {
  const sidecarSummary = semanticSidecar?.paradigmSemantics ?? semanticSidecar?.summary?.paradigmSemantics;
  if (sidecarSummary && typeof sidecarSummary === 'object' && hasParadigmSemanticsSummaryShape(sidecarSummary)) {
    return normalizeParadigmSemanticsSummary(sidecarSummary);
  }
  const raw = paradigmSemantics && typeof paradigmSemantics === 'object' ? paradigmSemantics : {};
  const summary = emptyParadigmSemanticsSummary();
  summary.ids = uniqueStrings([raw.id].filter(Boolean).map(String));
  for (const group of paradigmSemanticsSummaryGroups) {
    const records = Array.isArray(raw[group]) ? raw[group] : [];
    summary[group] += records.length;
    summary.total += records.length;
    if (records.length > 0) summary.byGroup[group] = (summary.byGroup[group] ?? 0) + records.length;
    for (const record of records) {
      if (record?.id) summary.ids.push(String(record.id));
      if (record?.kind) {
        const kind = String(record.kind);
        summary.kinds.push(kind);
        summary.byKind[kind] = (summary.byKind[kind] ?? 0) + 1;
      }
    }
  }
  summary.evidence = Array.isArray(raw.evidence) ? raw.evidence.length : 0;
  summary.ids = uniqueStrings([
    ...summary.ids,
    ...(Array.isArray(raw.evidence) ? raw.evidence.map((record: any) => record?.id).filter(Boolean).map(String) : [])
  ]);
  summary.groups = uniqueStrings(Object.keys(summary.byGroup));
  summary.kinds = uniqueStrings(summary.kinds);
  fillParadigmSemanticsBooleans(summary);
  summary.empty = summary.total === 0;
  return summary;
}


export function normalizeParadigmSemanticsSummary(input: any): FrontierCodexParadigmSemanticsSummary {
  const summary = emptyParadigmSemanticsSummary();
  mergeParadigmSemanticsSummary(summary, input);
  summary.empty = summary.total === 0;
  return summary;
}


function hasParadigmSemanticsSummaryShape(value: Record<string, unknown>): boolean {
  return typeof value.total === 'number' ||
    typeof value.loweringRecords === 'number' ||
    typeof value.logicPrograms === 'number' ||
    typeof value.stackEffects === 'number';
}


function emptyParadigmSemanticsSummary(): FrontierCodexParadigmSemanticsSummary {
  return {
    total: 0,
    ids: [],
    groups: [],
    kinds: [],
    evidence: 0,
    bindingScopes: 0,
    bindings: 0,
    patterns: 0,
    typeConstraints: 0,
    evaluationModels: 0,
    memoryLocations: 0,
    effectRegions: 0,
    controlRegions: 0,
    logicPrograms: 0,
    actorSystems: 0,
    stackEffects: 0,
    arrayShapes: 0,
    numericKernels: 0,
    dataflowNetworks: 0,
    clockModels: 0,
    objectModels: 0,
    macroExpansions: 0,
    reflectionBoundaries: 0,
    loweringRecords: 0,
    byGroup: {},
    byKind: {},
    hasRuntimeSemantics: false,
    hasLogicSemantics: false,
    hasStackSemantics: false,
    hasArraySemantics: false,
    hasMacroOrReflection: false,
    hasLowering: false,
    empty: true
  };
}


function mergeParadigmSemanticsSummary(target: FrontierCodexParadigmSemanticsSummary, input: any): void {
  if (!input || typeof input !== 'object') return;
  const declaredTotal = nonNegativeNumber(input.total);
  let groupedTotal = 0;
  target.evidence += nonNegativeNumber(input.evidence);
  for (const group of paradigmSemanticsSummaryGroups) {
    const count = nonNegativeNumber(input[group]);
    target[group] += count;
    groupedTotal += count;
  }
  target.total += declaredTotal || groupedTotal;
  target.ids = uniqueStrings([...target.ids, ...proofStringList(input.ids)]);
  target.groups = uniqueStrings([...target.groups, ...proofStringList(input.groups)]);
  target.kinds = uniqueStrings([...target.kinds, ...proofStringList(input.kinds)]);
  for (const [group, count] of Object.entries(numberRecord(input.byGroup))) {
    target.byGroup[group] = (target.byGroup[group] ?? 0) + count;
  }
  for (const [kind, count] of Object.entries(numberRecord(input.byKind))) {
    target.byKind[kind] = (target.byKind[kind] ?? 0) + count;
  }
  target.hasRuntimeSemantics ||= input.hasRuntimeSemantics === true;
  target.hasLogicSemantics ||= input.hasLogicSemantics === true;
  target.hasStackSemantics ||= input.hasStackSemantics === true;
  target.hasArraySemantics ||= input.hasArraySemantics === true;
  target.hasMacroOrReflection ||= input.hasMacroOrReflection === true;
  target.hasLowering ||= input.hasLowering === true;
  fillParadigmSemanticsBooleans(target);
}


function fillParadigmSemanticsBooleans(summary: FrontierCodexParadigmSemanticsSummary): void {
  summary.hasRuntimeSemantics ||= summary.evaluationModels > 0 || summary.memoryLocations > 0 || summary.effectRegions > 0 || summary.controlRegions > 0 || summary.actorSystems > 0 || summary.clockModels > 0;
  summary.hasLogicSemantics ||= summary.logicPrograms > 0;
  summary.hasStackSemantics ||= summary.stackEffects > 0;
  summary.hasArraySemantics ||= summary.arrayShapes > 0 || summary.numericKernels > 0;
  summary.hasMacroOrReflection ||= summary.macroExpansions > 0 || summary.reflectionBoundaries > 0;
  summary.hasLowering ||= summary.loweringRecords > 0;
}
