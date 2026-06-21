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
import { semanticImportReadinessKeys, summarizeExpectedSemanticImport } from './semantic-import-readiness.js';
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
  const dependencyEdges = uniqueStrings(records.flatMap((record) => readStringArray(record.dependencyEdges))).slice(0, 48);
  const dependencyEdgeHints = uniqueStrings(records.flatMap((record) => readStringArray(record.dependencyEdgeHints))).slice(0, 48);
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
  const semanticMergeAdmissions = records.reduce((totals, record) => {
    const admission = record.semanticMergeAdmission as {
      classification?: string;
      autoMergeable?: boolean;
      conflictKeys?: string[];
      conflictKeyKinds?: string[];
      error?: string;
    } | undefined;
    if (!admission) return totals;
    totals.total += 1;
    const classification = admission.classification ?? (admission.error ? 'error' : 'unknown');
    totals.byClassification[classification] = (totals.byClassification[classification] ?? 0) + 1;
    if (classification === 'safe') totals.safe += 1;
    else if (classification === 'safe-with-losses') totals.safeWithLosses += 1;
    else if (classification === 'review-required') totals.reviewRequired += 1;
    else if (classification === 'blocked') totals.blocked += 1;
    if (admission.autoMergeable === true) totals.autoMergeable += 1;
    if (admission.error) totals.errors += 1;
    totals.conflictKeys.push(...readStringArray(admission.conflictKeys));
    totals.conflictKeyKinds.push(...readStringArray(admission.conflictKeyKinds));
    return totals;
  }, {
    total: 0,
    safe: 0,
    safeWithLosses: 0,
    reviewRequired: 0,
    blocked: 0,
    autoMergeable: 0,
    errors: 0,
    conflictKeys: [] as string[],
    conflictKeyKinds: [] as string[],
    byClassification: {} as Record<string, number>
  });
  const safeMergeApplies = records.reduce((totals, record) => {
    const apply = record.safeMergeApply as {
      status?: string;
      action?: string;
      readiness?: string;
      applied?: boolean;
      skipped?: boolean;
      blocked?: boolean;
      conflictKeys?: string[];
      conflictCount?: number;
      stale?: boolean;
      staleCount?: number;
      needsPort?: boolean;
      needsPortCount?: number;
      error?: string;
    } | undefined;
    if (!apply) return totals;
    totals.total += 1;
    const status = apply.status ?? (apply.error ? 'error' : 'unknown');
    const action = apply.action ?? 'unknown';
    const readiness = apply.readiness ?? 'unknown';
    totals.byStatus[status] = (totals.byStatus[status] ?? 0) + 1;
    totals.byAction[action] = (totals.byAction[action] ?? 0) + 1;
    totals.byReadiness[readiness] = (totals.byReadiness[readiness] ?? 0) + 1;
    if (apply.applied === true || status === 'applied' || status === 'accepted-clean') totals.applied += 1;
    if (apply.skipped === true || status === 'skipped') totals.skipped += 1;
    if (apply.blocked === true || status === 'blocked' || readiness === 'blocked') totals.blocked += 1;
    if ((apply.conflictCount ?? 0) > 0 || status === 'conflict') totals.conflicts += 1;
    if (apply.stale === true || (apply.staleCount ?? 0) > 0 || status === 'stale') totals.stale += 1;
    if (apply.needsPort === true || (apply.needsPortCount ?? 0) > 0 || status === 'needs-port') totals.needsPort += 1;
    if (apply.error) totals.errors += 1;
    totals.conflictKeys.push(...readStringArray(apply.conflictKeys));
    return totals;
  }, {
    total: 0,
    applied: 0,
    skipped: 0,
    blocked: 0,
    conflicts: 0,
    stale: 0,
    needsPort: 0,
    errors: 0,
    conflictKeys: [] as string[],
    byStatus: {} as Record<string, number>,
    byAction: {} as Record<string, number>,
    byReadiness: {} as Record<string, number>
  });
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
      dependencyEdges,
      dependencyEdgeHints,
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
      semanticMergeAdmissions: {
        total: semanticMergeAdmissions.total,
        safe: semanticMergeAdmissions.safe,
        safeWithLosses: semanticMergeAdmissions.safeWithLosses,
        reviewRequired: semanticMergeAdmissions.reviewRequired,
        blocked: semanticMergeAdmissions.blocked,
        autoMergeable: semanticMergeAdmissions.autoMergeable,
        errors: semanticMergeAdmissions.errors,
        conflictKeys: uniqueStrings(semanticMergeAdmissions.conflictKeys).slice(0, 48),
        conflictKeyKinds: uniqueStrings(semanticMergeAdmissions.conflictKeyKinds).slice(0, 24),
        byClassification: semanticMergeAdmissions.byClassification
      },
      safeMergeApplies: {
        total: safeMergeApplies.total,
        applied: safeMergeApplies.applied,
        skipped: safeMergeApplies.skipped,
        blocked: safeMergeApplies.blocked,
        conflicts: safeMergeApplies.conflicts,
        stale: safeMergeApplies.stale,
        needsPort: safeMergeApplies.needsPort,
        errors: safeMergeApplies.errors,
        conflictKeys: uniqueStrings(safeMergeApplies.conflictKeys).slice(0, 48),
        byStatus: safeMergeApplies.byStatus,
        byAction: safeMergeApplies.byAction,
        byReadiness: safeMergeApplies.byReadiness
      },
      readiness,
      semanticImportExpected: expectedQuality.expected,
      semanticImportExpectedSatisfied: expectedQuality.satisfied,
      semanticImportExpectedMissingReasonCodes: expectedQuality.missingReasonCodes
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

export function summarizeSemanticMergeAdmission(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const evidence = Array.isArray(value.evidence) ? value.evidence : [];
  const losses = Array.isArray(value.losses) ? value.losses : [];
  const metadata = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  return {
    kind: value.kind,
    id: value.id,
    candidateId: value.candidateId,
    classification: value.classification,
    autoMergeable: value.autoMergeable === true,
    conflictKeys: readStringArray(value.conflictKeys).slice(0, 24),
    conflictKeyKinds: readStringArray(value.conflictKeyKinds).slice(0, 24),
    reasonCodes: readStringArray(value.reasonCodes).slice(0, 24),
    reasons: readStringArray(value.reasons).slice(0, 12),
    evidenceCount: evidence.length,
    evidenceStatuses: countObjectStringField(evidence, 'status'),
    lossCount: losses.length,
    lossesBySeverity: countObjectStringField(losses, 'severity'),
    candidateReadiness: metadata.candidateReadiness,
    requiredConflictKeyKinds: readStringArray(metadata.requiredConflictKeyKinds).slice(0, 24),
    missingRequiredConflictKeyKinds: readStringArray(metadata.missingRequiredConflictKeyKinds).slice(0, 24),
    ...(value.error ? { error: String(value.error) } : {})
  };
}

export function summarizeSafeMergeApplyRecord(value: any): unknown {
  if (!value || typeof value !== 'object') return undefined;
  const evidence = Array.isArray(value.evidence) ? value.evidence : [];
  const edits = Array.isArray(value.edits) ? value.edits : Array.isArray(value.appliedEdits) ? value.appliedEdits : [];
  const operations = Array.isArray(value.operations) ? value.operations : Array.isArray(value.appliedOperations) ? value.appliedOperations : [];
  const status = firstString(value.status, value.admission, value.result?.status);
  const action = firstString(value.action, value.result?.action);
  const readiness = firstString(value.readiness, value.result?.readiness, value.mergeScore?.readiness);
  const conflictKeys = readStringArray(value.conflictKeys ?? value.result?.conflictKeys).slice(0, 24);
  const reasonCodes = readStringArray(value.reasonCodes ?? value.result?.reasonCodes).slice(0, 24);
  return {
    kind: value.kind,
    id: value.id,
    status,
    action,
    readiness,
    language: value.language,
    sourcePath: value.sourcePath,
    candidateId: value.candidateId,
    admissionId: value.admissionId,
    applied: value.applied === true || status === 'applied' || status === 'accepted-clean',
    skipped: value.skipped === true || status === 'skipped',
    blocked: value.blocked === true || status === 'blocked' || readiness === 'blocked',
    stale: value.stale === true || status === 'stale',
    needsPort: value.needsPort === true || status === 'needs-port',
    conflictCount: nonNegativeNumber(value.conflictCount ?? value.conflicts ?? conflictKeys.length),
    staleCount: nonNegativeNumber(value.staleCount),
    needsPortCount: nonNegativeNumber(value.needsPortCount),
    editCount: nonNegativeNumber(value.editCount ?? edits.length),
    operationCount: nonNegativeNumber(value.operationCount ?? operations.length),
    appliedEditCount: nonNegativeNumber(value.appliedEditCount ?? value.appliedEdits?.length),
    skippedOperationCount: nonNegativeNumber(value.skippedOperationCount ?? value.skippedOperations?.length),
    conflictKeys,
    reasonCodes,
    evidenceCount: evidence.length,
    evidenceStatuses: countObjectStringField(evidence, 'status'),
    currentHash: value.currentHash,
    outputHash: value.outputHash,
    mergeScore: value.mergeScore
      ? {
        schema: value.mergeScore.schema,
        value: value.mergeScore.value,
        sortKey: value.mergeScore.sortKey,
        penalties: Array.isArray(value.mergeScore.penalties) ? value.mergeScore.penalties.slice(0, 12) : []
      }
      : undefined,
    ...(value.error ? { error: String(value.error) } : {})
  };
}

function countObjectStringField(values: any[], field: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = firstString(value?.[field]) ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
