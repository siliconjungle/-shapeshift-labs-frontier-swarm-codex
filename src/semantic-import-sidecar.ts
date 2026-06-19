import { type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND, FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION } from './constants.js';
import type { FrontierCodexSemanticImportRecord, FrontierCodexSemanticImportSidecar } from './index.js';
import type { SemanticImportSelection } from './semantic-import-select.js';
import { readStringArray, uniqueStrings } from './common.js';
import { summarizeSemanticImportUniversalAstLayers } from './semantic-import-layers.js';
import { summarizeSemanticImportParadigmSemantics, summarizeParadigmSemantics } from './semantic-import-paradigm.js';
import { summarizeSemanticImportProofSpec, summarizeProofSpec } from './semantic-import-proof.js';
import { mergeDependencySummaries, summarizeSemanticDependencies } from './semantic-import-dependencies.js';
import { mergeSemanticFactSummaries, summarizeLangSidecarSemanticFacts } from './semantic-import-facts.js';
import { summarizeSemanticImportLineage, summarizeSemanticLineageEvidence } from './semantic-import-lineage.js';
import { mergeSemanticEditScriptSummaries, summarizeSemanticEditScript } from './semantic-edit-script.js';
import { mergeSemanticEditProjectionSummaries, summarizeSemanticEditProjection } from './semantic-edit-projection.js';
import { mergeSemanticEditReplaySummaries, summarizeSemanticEditReplay } from './semantic-edit-replay.js';
export function createSemanticImportSidecar(
  job: FrontierSwarmJob,
  records: FrontierCodexSemanticImportRecord[],
  selection?: SemanticImportSelection,
  expected = false
): FrontierCodexSemanticImportSidecar {
  const semanticIndex = records.reduce((totals, record) => {
    totals.documents += record.semanticIndex?.documents ?? 0;
    totals.symbols += record.semanticIndex?.symbols ?? 0;
    totals.occurrences += record.semanticIndex?.occurrences ?? 0;
    totals.relations += record.semanticIndex?.relations ?? 0;
    totals.facts += record.semanticIndex?.facts ?? 0;
    return totals;
  }, { documents: 0, symbols: 0, occurrences: 0, relations: 0, facts: 0 });
  const dependencies = mergeDependencySummaries(records
    .map((record) => record.dependencies)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined));
  const semanticFacts = mergeSemanticFactSummaries(records.map((record) => record.semanticFacts));
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
  const semanticLineage = summarizeSemanticImportLineage(records);
  const semanticEditScripts = mergeSemanticEditScriptSummaries(records.map((record) => record.semanticEditScript));
  const semanticEditProjections = mergeSemanticEditProjectionSummaries(records.map((record) => record.semanticEditProjection));
  const semanticEditReplays = mergeSemanticEditReplaySummaries(records.map((record) => record.semanticEditReplay));
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
  const semanticSliceAdmissions = records.reduce((totals, record) => {
    const admission = record.semanticSliceAdmission as { action?: string; risk?: string; mergeScore?: { value?: number } } | undefined;
    if (!admission) return totals;
    totals.total += 1;
    totals.scoreTotal += typeof admission.mergeScore?.value === 'number' ? admission.mergeScore.value : 0;
    const action = admission.action ?? 'unknown';
    const risk = admission.risk ?? 'unknown';
    totals.byAction[action] = (totals.byAction[action] ?? 0) + 1;
    totals.byRisk[risk] = (totals.byRisk[risk] ?? 0) + 1;
    if (action === 'admit') totals.admitted += 1;
    else if (action === 'reject') totals.rejected += 1;
    else if (action === 'prioritize') totals.prioritized += 1;
    return totals;
  }, { total: 0, admitted: 0, prioritized: 0, rejected: 0, scoreTotal: 0, byAction: {} as Record<string, number>, byRisk: {} as Record<string, number> });
  const proofSpec = summarizeSemanticImportProofSpec(records);
  const imported = records.filter((record) => record.status === 'imported').length;
  const expectedQuality = summarizeExpectedSemanticImport(records, selection, expected, {
    imported,
    symbols: semanticIndex.symbols,
    ownershipRegions: semanticSidecars.ownershipRegions,
    patchHints: semanticSidecars.patchHints,
    evidence: records.reduce((sum, record) => sum + (record.evidenceCount ?? 0), 0)
  });
  const lossesBySeverity: Record<string, number> = {};
  const readiness: Record<string, number> = {};
  for (const record of records) {
    for (const loss of Array.isArray(record.losses) ? record.losses as any[] : []) {
      const severity = String(loss?.severity ?? 'unknown');
      lossesBySeverity[severity] = (lossesBySeverity[severity] ?? 0) + 1;
    }
    for (const key of semanticImportReadinessKeys(record)) {
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
          unsupportedLanguage: selection.unsupportedLanguageCount,
          fallback: selection.fallbackCount,
          ...(selection.fallbackReason ? { fallbackReason: selection.fallbackReason } : {})
        }
      : {
          candidates: records.length,
          ignored: 0,
          includeFiltered: 0,
          excludeFiltered: 0,
          unsupportedLanguage: 0,
          fallback: 0
        },
      eligible: selection?.eligibleCount ?? records.length,
      omitted: selection?.omittedCount ?? 0,
      maxFiles: selection?.maxFiles ?? records.length,
      imported,
      skipped: records.filter((record) => record.status === 'skipped').length,
      errors: records.filter((record) => record.status === 'error').length,
      sourceMapCount: records.reduce((sum, record) => sum + (record.sourceMapCount ?? 0), 0),
      sourceMapMappingCount: records.reduce((sum, record) => sum + (record.sourceMapMappingCount ?? 0), 0),
      lossCount: records.reduce((sum, record) => sum + (record.lossCount ?? 0), 0),
      lossesBySeverity,
      semanticIndex,
      semanticFacts,
      dependencies,
      semanticSidecars,
      universalAstLayers,
      proofSpec,
      paradigmSemantics,
      semanticLineage,
      semanticEditScripts,
      semanticEditProjections,
      semanticEditReplays,
      sourceProjections,
      nativeCompiles,
      semanticSliceAdmissions: {
        total: semanticSliceAdmissions.total,
        admitted: semanticSliceAdmissions.admitted,
        prioritized: semanticSliceAdmissions.prioritized,
        rejected: semanticSliceAdmissions.rejected,
        averageScore: semanticSliceAdmissions.total ? Math.round(semanticSliceAdmissions.scoreTotal / semanticSliceAdmissions.total) : 0,
        byAction: semanticSliceAdmissions.byAction,
        byRisk: semanticSliceAdmissions.byRisk
      },
      readiness,
      semanticImportExpected: expectedQuality.expected,
      semanticImportExpectedSatisfied: expectedQuality.satisfied,
      semanticImportExpectedMissingReasonCodes: expectedQuality.missingReasonCodes
    }
  };
}

function semanticImportReadinessKeys(record: FrontierCodexSemanticImportRecord): string[] {
  const keys: string[] = [];
  const candidate = record.mergeCandidate as { readiness?: unknown } | undefined;
  addRawReadinessKey(keys, candidate?.readiness);
  if (record.status === 'skipped') {
    if (record.reason === 'frontier-lang-unavailable') {
      keys.push('tooling-unavailable', 'semantic-sidecar-unavailable', 'universal-ast-unavailable', 'proof-spec-unavailable');
    } else {
      keys.push('semantic-import-skipped');
      addPrefixedReadinessKey(keys, 'semantic-import-skipped', record.reason);
    }
    return uniqueStrings(keys);
  }
  if (record.status === 'error') return uniqueStrings([...keys, 'semantic-import-error']);
  if (record.status !== 'imported') return uniqueStrings(keys);

  addSemanticSidecarReadiness(keys, record.semanticSidecar);
  addUniversalAstReadiness(keys, record.universalAstLayers);
  addProofSpecReadiness(keys, record.proofSpec);
  addSourceProjectionReadiness(keys, record.sourceProjection);
  addNativeCompileReadiness(keys, record.nativeCompile);
  return uniqueStrings(keys);
}

function addSemanticSidecarReadiness(keys: string[], value: unknown): void {
  const sidecar = objectRecord(value);
  if (!sidecar) {
    keys.push('semantic-sidecar-unavailable');
    return;
  }
  addPrefixedReadinessKey(keys, 'semantic-sidecar', sidecar.readiness);
  const symbols = nonNegativeValue(sidecar.symbols);
  const ownershipRegions = nonNegativeValue(sidecar.ownershipRegions);
  const patchHints = nonNegativeValue(sidecar.patchHints);
  if (sidecar.emptySemanticIndex === true || symbols === 0) {
    keys.push('semantic-sidecar-empty');
  } else if (ownershipRegions > 0 && patchHints > 0) {
    keys.push('semantic-sidecar-ready');
  } else {
    keys.push('semantic-sidecar-partial');
  }
}

function addUniversalAstReadiness(keys: string[], value: unknown): void {
  const layers = objectRecord(value);
  if (!layers) {
    keys.push('universal-ast-unavailable');
    return;
  }
  keys.push(semanticUniversalAstLayerCount(layers) > 0 && layers.empty !== true
    ? 'universal-ast-ready'
    : 'universal-ast-empty');
}

function addProofSpecReadiness(keys: string[], value: unknown): void {
  const proofSpec = objectRecord(value);
  if (!proofSpec) {
    keys.push('proof-spec-unavailable');
    return;
  }
  keys.push(semanticProofSpecCount(proofSpec) > 0 ? 'proof-spec-present' : 'proof-spec-empty');
  if (nonNegativeValue(proofSpec.failed) > 0) keys.push('proof-spec-failed');
  if (nonNegativeValue(proofSpec.stale) > 0) keys.push('proof-spec-stale');
  if (nonNegativeValue(proofSpec.open) > 0) keys.push('proof-spec-open');
  if (nonNegativeValue(proofSpec.assumed) > 0) keys.push('proof-spec-assumed');
}

function addSourceProjectionReadiness(keys: string[], value: unknown): void {
  const projection = objectRecord(value);
  if (!projection) {
    keys.push('source-projection-unavailable');
    return;
  }
  if (!addPrefixedReadinessKey(keys, 'source-projection', projection.readiness)) keys.push('source-projection-unknown');
  if (projection.mode === 'preserved-source') keys.push('source-projection-preserved');
  if (projection.mode === 'native-source-stubs') keys.push('source-projection-stubbed');
}

function addNativeCompileReadiness(keys: string[], value: unknown): void {
  const nativeCompile = objectRecord(value);
  if (!nativeCompile) {
    keys.push('native-compile-unavailable');
    return;
  }
  if (!addPrefixedReadinessKey(keys, 'native-compile', nativeCompile.readiness)) keys.push('native-compile-unknown');
  if (nativeCompile.ok === true) keys.push('native-compile-emitted');
  if (nativeCompile.ok === false) keys.push('native-compile-failed');
  if (nativeCompile.outputMode === 'preserved-source') keys.push('native-compile-preserved');
  if (nativeCompile.outputMode === 'target-stubs') keys.push('native-compile-target-stubs');
}

function addRawReadinessKey(keys: string[], value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const key = String(value).trim();
  if (!key) return false;
  keys.push(key);
  return true;
}

function addPrefixedReadinessKey(keys: string[], prefix: string, value: unknown): boolean {
  const segment = readinessSegment(value);
  if (!segment) return false;
  keys.push(`${prefix}-${segment}`);
  return true;
}

function readinessSegment(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function semanticUniversalAstLayerCount(value: Record<string, unknown>): number {
  const names = Array.isArray(value.names) ? value.names.length : 0;
  const ids = Array.isArray(value.ids) ? value.ids.length : 0;
  const byName = objectRecord(value.byName);
  const byNameTotal = byName ? Object.values(byName).reduce<number>((sum, count) => sum + nonNegativeValue(count), 0) : 0;
  return Math.max(nonNegativeValue(value.total), names, ids, byNameTotal);
}

function semanticProofSpecCount(value: Record<string, unknown>): number {
  const byStatus = objectRecord(value.byStatus);
  const statusTotal = byStatus ? Object.values(byStatus).reduce<number>((sum, count) => sum + nonNegativeValue(count), 0) : 0;
  return Math.max(
    nonNegativeValue(value.total),
    nonNegativeValue(value.contracts) +
      nonNegativeValue(value.refinements) +
      nonNegativeValue(value.invariants) +
      nonNegativeValue(value.termination) +
      nonNegativeValue(value.temporal) +
      nonNegativeValue(value.obligations) +
      nonNegativeValue(value.artifacts) +
      nonNegativeValue(value.assumptions),
    statusTotal
  );
}

function summarizeExpectedSemanticImport(
  records: FrontierCodexSemanticImportRecord[],
  selection: SemanticImportSelection | undefined,
  expected: boolean,
  totals: { imported: number; symbols: number; ownershipRegions: number; patchHints: number; evidence: number }
): { expected: boolean; satisfied: boolean; missingReasonCodes: string[] } {
  const selected = selection?.selected.length ?? records.length;
  const explicitCodes = records.flatMap((record) => {
    const sidecar = record.semanticSidecar as { semanticImportExpectedMissingReasonCodes?: unknown } | undefined;
    return readStringArray(sidecar?.semanticImportExpectedMissingReasonCodes);
  });
  const explicitUnsatisfied = records.some((record) => {
    const sidecar = record.semanticSidecar as { semanticImportExpectedSatisfied?: unknown } | undefined;
    return sidecar?.semanticImportExpectedSatisfied === false;
  });
  const frontierLangUnavailable = records.some((record) => record.reason === 'frontier-lang-unavailable');
  const inferredCodes: string[] = [];
  if (expected && selected === 0) inferredCodes.push('expected-semantic-import-missing');
  if (expected && selected > 0 && totals.imported === 0) {
    inferredCodes.push('missing-imports');
    if (frontierLangUnavailable) inferredCodes.push('frontier-lang-unavailable');
  }
  if (expected && totals.imported > 0 && totals.symbols === 0) {
    inferredCodes.push('expected-semantic-import-empty', 'empty-semantic-index');
  }
  if (expected && totals.imported > 0 && totals.ownershipRegions === 0) inferredCodes.push('missing-ownership-regions');
  if (expected && totals.imported > 0 && totals.patchHints === 0) inferredCodes.push('missing-patch-hints');
  if (expected && totals.imported > 0 && totals.evidence === 0) inferredCodes.push('empty-evidence');
  const includeRecordMissingCodes = expected && totals.imported > 0 && (
    totals.symbols === 0 ||
    totals.ownershipRegions === 0 ||
    totals.patchHints === 0
  );
  const missingReasonCodes = uniqueStrings([
    ...explicitCodes,
    ...inferredCodes,
    ...(includeRecordMissingCodes ? records.flatMap(semanticSidecarExpectedMissingReasonCodes) : [])
  ]);
  const satisfied = !expected || (
    totals.imported > 0 &&
    totals.symbols > 0 &&
    totals.ownershipRegions > 0 &&
    totals.patchHints > 0 &&
    totals.evidence > 0 &&
    missingReasonCodes.length === 0 &&
    !explicitUnsatisfied
  );
  return { expected, satisfied, missingReasonCodes };
}

function semanticSidecarExpectedMissingReasonCodes(record: FrontierCodexSemanticImportRecord): string[] {
  if (record.status !== 'imported') return [];
  const sidecar = objectRecord(record.semanticSidecar);
  if (!sidecar) return ['semantic-sidecar-unavailable'];
  const symbols = nonNegativeValue(sidecar.symbols);
  if (sidecar.emptySemanticIndex === true || symbols === 0) return ['semantic-sidecar-empty'];
  const codes: string[] = [];
  if (nonNegativeValue(sidecar.ownershipRegions) === 0) codes.push('semantic-sidecar-missing-ownership-regions');
  if (nonNegativeValue(sidecar.patchHints) === 0) codes.push('semantic-sidecar-missing-patch-hints');
  return codes.length ? ['semantic-sidecar-partial', ...codes] : [];
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
  const dependencies = summarizeSemanticDependencies(undefined, value);
  const semanticFacts = summarizeLangSidecarSemanticFacts(value);
  const expectedMissingReasonCodes = readStringArray(
    value.summary?.semanticImportExpectedMissingReasonCodes ??
    value.quality?.expectedMissingReasonCodes ??
    value.admission?.expectedMissingReasonCodes
  );
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
    semanticLineage: summarizeSemanticLineageEvidence(value),
    semanticEditScript: summarizeSemanticEditScript(value),
    semanticEditProjection: summarizeSemanticEditProjection(value),
    semanticEditReplay: summarizeSemanticEditReplay(value),
    semanticFacts,
    semanticFactCount: semanticFacts.total,
    semanticFactPredicates: semanticFacts.predicates,
    semanticFactSummary: semanticFacts.byPredicate,
    dependencies,
    dependencyRelations: value.summary?.dependencyRelations ?? dependencies.total,
    dependencyPredicates: Array.isArray(value.summary?.dependencyPredicates)
      ? value.summary.dependencyPredicates
      : dependencies.predicates,
    readiness: value.summary?.readiness,
    emptySemanticIndex: value.summary?.emptySemanticIndex,
    semanticImportExpected: value.summary?.semanticImportExpected ?? value.quality?.expected ?? value.admission?.expected,
    semanticImportExpectedSatisfied: value.summary?.semanticImportExpectedSatisfied ?? value.quality?.expectedSatisfied ?? value.admission?.expectedSatisfied,
    semanticImportExpectedMissingReasonCodes: expectedMissingReasonCodes,
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

export function summarizeSemanticSlice(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    readiness: value.summary?.readiness ?? value.mergeAdmission?.readiness,
    symbols: value.summary?.symbols,
    ownershipRegions: value.summary?.ownershipRegions,
    sourceMapLinks: value.summary?.sourceMapLinks,
    sourceFiles: value.summary?.sourceFiles,
    conflictKeys: Array.isArray(value.mergeAdmission?.conflictKeys) ? value.mergeAdmission.conflictKeys.slice(0, 24) : [],
    autoMergeClaim: value.mergeAdmission?.autoMergeClaim === true
  };
}

export function summarizeSemanticSliceAdmission(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return {
    kind: value.kind,
    id: value.id,
    action: value.action,
    priority: value.priority,
    risk: value.risk,
    readiness: value.readiness,
    reviewRequired: value.reviewRequired,
    autoMergeClaim: value.autoMergeClaim === true,
    mergeScore: value.mergeScore
      ? {
        schema: value.mergeScore.schema,
        value: value.mergeScore.value,
        sortKey: value.mergeScore.sortKey,
        penalties: Array.isArray(value.mergeScore.penalties) ? value.mergeScore.penalties.slice(0, 12) : []
      }
      : undefined
  };
}
