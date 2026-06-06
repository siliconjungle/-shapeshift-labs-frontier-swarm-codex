import { type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND, FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION } from './constants.js';
import type { FrontierCodexSemanticImportRecord, FrontierCodexSemanticImportSidecar } from './index.js';
import type { SemanticImportSelection } from './semantic-import-select.js';
import { summarizeSemanticImportUniversalAstLayers } from './semantic-import-layers.js';
import { summarizeSemanticImportParadigmSemantics, summarizeParadigmSemantics } from './semantic-import-paradigm.js';
import { summarizeSemanticImportProofSpec, summarizeProofSpec } from './semantic-import-proof.js';



export function createSemanticImportSidecar(
  job: FrontierSwarmJob,
  records: FrontierCodexSemanticImportRecord[],
  selection?: SemanticImportSelection
): FrontierCodexSemanticImportSidecar {
  const semanticIndex = records.reduce((totals, record) => {
    totals.documents += record.semanticIndex?.documents ?? 0;
    totals.symbols += record.semanticIndex?.symbols ?? 0;
    totals.occurrences += record.semanticIndex?.occurrences ?? 0;
    totals.relations += record.semanticIndex?.relations ?? 0;
    totals.facts += record.semanticIndex?.facts ?? 0;
    return totals;
  }, { documents: 0, symbols: 0, occurrences: 0, relations: 0, facts: 0 });
  const semanticSidecars = records.reduce((totals, record) => {
    const summary = record.semanticSidecar as { symbols?: number; ownershipRegions?: number; patchHints?: number; emptySemanticIndex?: boolean } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    totals.symbols += summary.symbols ?? 0;
    totals.ownershipRegions += summary.ownershipRegions ?? 0;
    totals.patchHints += summary.patchHints ?? 0;
    if (summary.emptySemanticIndex) totals.empty += 1;
    return totals;
  }, { total: 0, symbols: 0, ownershipRegions: 0, patchHints: 0, empty: 0 });
  const universalAstLayers = summarizeSemanticImportUniversalAstLayers(records);
  const paradigmSemantics = summarizeSemanticImportParadigmSemantics(records);
  const sourceProjections = records.reduce((totals, record) => {
    const summary = record.sourceProjection as { mode?: string; readiness?: string } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    if (summary.mode === 'preserved-source') totals.preserved += 1;
    if (summary.mode === 'native-source-stubs') totals.stubs += 1;
    if (summary.readiness === 'ready' || summary.readiness === 'ready-with-losses') totals.ready += 1;
    else if (summary.readiness === 'blocked') totals.blocked += 1;
    else totals.needsReview += 1;
    return totals;
  }, { total: 0, preserved: 0, stubs: 0, ready: 0, needsReview: 0, blocked: 0 });
  const nativeCompiles = records.reduce((totals, record) => {
    const summary = record.nativeCompile as { ok?: boolean; outputMode?: string; readiness?: string } | undefined;
    if (!summary) return totals;
    totals.total += 1;
    if (summary.ok) totals.emitted += 1;
    if (summary.outputMode === 'preserved-source') totals.preserved += 1;
    if (summary.outputMode === 'target-stubs') totals.targetStubs += 1;
    if (summary.readiness === 'ready' || summary.readiness === 'ready-with-losses') totals.ready += 1;
    else if (summary.readiness === 'blocked') totals.blocked += 1;
    else totals.needsReview += 1;
    return totals;
  }, { total: 0, emitted: 0, preserved: 0, targetStubs: 0, ready: 0, needsReview: 0, blocked: 0 });
  const proofSpec = summarizeSemanticImportProofSpec(records);
  const lossesBySeverity: Record<string, number> = {};
  const readiness: Record<string, number> = {};
  for (const record of records) {
    for (const loss of Array.isArray(record.losses) ? record.losses as any[] : []) {
      const severity = String(loss?.severity ?? 'unknown');
      lossesBySeverity[severity] = (lossesBySeverity[severity] ?? 0) + 1;
    }
    const candidate = record.mergeCandidate as { readiness?: unknown } | undefined;
    if (candidate?.readiness !== undefined) {
      const key = String(candidate.readiness);
      readiness[key] = (readiness[key] ?? 0) + 1;
    }
  }
  return {
    kind: FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND,
    version: FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION,
    generatedAt: Date.now(),
    jobId: job.id,
    taskId: job.taskId,
    records,
    summary: {
      total: records.length,
      selected: selection?.selected.length ?? records.length,
      selection: selection
        ? {
          candidates: selection.candidateCount,
          ignored: selection.ignoredCount,
          includeFiltered: selection.includeFilteredCount,
          excludeFiltered: selection.excludeFilteredCount,
          unsupportedLanguage: selection.unsupportedLanguageCount
        }
        : {
          candidates: records.length,
          ignored: 0,
          includeFiltered: 0,
          excludeFiltered: 0,
          unsupportedLanguage: 0
        },
      eligible: selection?.eligibleCount ?? records.length,
      omitted: selection?.omittedCount ?? 0,
      maxFiles: selection?.maxFiles ?? records.length,
      imported: records.filter((record) => record.status === 'imported').length,
      skipped: records.filter((record) => record.status === 'skipped').length,
      errors: records.filter((record) => record.status === 'error').length,
      sourceMapCount: records.reduce((sum, record) => sum + (record.sourceMapCount ?? 0), 0),
      sourceMapMappingCount: records.reduce((sum, record) => sum + (record.sourceMapMappingCount ?? 0), 0),
      lossCount: records.reduce((sum, record) => sum + (record.lossCount ?? 0), 0),
      lossesBySeverity,
      semanticIndex,
      semanticSidecars,
      universalAstLayers,
      proofSpec,
      paradigmSemantics,
      sourceProjections,
      nativeCompiles,
      readiness
    }
  };
}



export function summarizeSemanticIndex(value: any): FrontierCodexSemanticImportRecord['semanticIndex'] {
  if (!value || typeof value !== 'object') return undefined;
  return {
    documents: Array.isArray(value.documents) ? value.documents.length : 0,
    symbols: Array.isArray(value.symbols) ? value.symbols.length : 0,
    occurrences: Array.isArray(value.occurrences) ? value.occurrences.length : 0,
    relations: Array.isArray(value.relations) ? value.relations.length : 0,
    facts: Array.isArray(value.facts) ? value.facts.length : 0
  };
}



export function summarizeLangSemanticImportSidecar(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    imports: value.summary?.imports,
    symbols: value.summary?.symbols,
    ownershipRegions: value.summary?.ownershipRegions,
    sourceMapMappings: value.summary?.sourceMapMappings,
    universalAstLayers: value.summary?.universalAstLayers ?? value.universalAstLayers?.total,
    universalAstLayerNames: Array.isArray(value.summary?.universalAstLayerNames)
      ? value.summary.universalAstLayerNames
      : Array.isArray(value.universalAstLayers?.names)
        ? value.universalAstLayers.names
        : [],
    proofSpec: summarizeProofSpec(undefined, value),
    paradigmSemantics: summarizeParadigmSemantics(undefined, value),
    readiness: value.summary?.readiness,
    emptySemanticIndex: value.summary?.emptySemanticIndex,
    patchHints: Array.isArray(value.patchHints) ? value.patchHints.length : 0,
    sampleOwnershipRegions: Array.isArray(value.ownershipRegions)
      ? value.ownershipRegions.slice(0, 12).map((region: any) => ({
        id: region?.id,
        key: region?.key,
        sourcePath: region?.sourcePath,
        symbolName: region?.symbolName,
        symbolKind: region?.symbolKind,
        sourceSpan: region?.sourceSpan,
        precision: region?.precision
      }))
      : []
  };
}
