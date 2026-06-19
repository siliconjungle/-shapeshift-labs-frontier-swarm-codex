import type { FrontierSwarmJobResultInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions, FrontierCodexSemanticImportQuality, FrontierCodexSemanticImportSidecar } from './index.js';
import { nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';
import { semanticImportFactSummary } from './semantic-import-facts.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';
import { semanticImportLineageSummary } from './semantic-import-lineage.js';
import { summarizeSemanticEditScript } from './semantic-edit-script.js';
import { summarizeSemanticEditProjection, emptySemanticEditProjectionSummary } from './semantic-edit-projection.js';
import { emptySemanticEditReplaySummary, summarizeSemanticEditReplay } from './semantic-edit-replay.js';
import { classifySemanticEditScriptAdmission } from './semantic-edit-admission.js';

export function summarizeCodexSemanticImportQuality(
  summary: FrontierSwarmMergeBundle['semanticImport'] | FrontierCodexSemanticImportSidecar['summary'] | FrontierSwarmJobResultInput['semanticImport'] | undefined,
  expected = false
): FrontierCodexSemanticImportQuality {
  const total = nonNegativeNumber(summary?.total);
  const candidates = semanticImportCandidateCount(summary);
  const selected = nonNegativeNumber(summary?.selected);
  const eligible = nonNegativeNumber(summary?.eligible);
  const imported = nonNegativeNumber(summary?.imported);
  const errors = nonNegativeNumber(summary?.errors);
  const symbols = nonNegativeNumber(summary?.semanticIndex?.symbols);
  const ownershipRegions = nonNegativeNumber(summary?.semanticSidecars?.ownershipRegions);
  const patchHints = nonNegativeNumber(summary?.semanticSidecars?.patchHints);
  const semanticFacts = semanticImportFactSummary(summary);
  const dependencyRelations = nonNegativeNumber((summary as { dependencies?: { total?: number } } | undefined)?.dependencies?.total);
  const dependencyPredicates = Array.isArray((summary as { dependencies?: { predicates?: unknown } } | undefined)?.dependencies?.predicates)
    ? uniqueStrings((summary as { dependencies: { predicates: string[] } }).dependencies.predicates)
    : [];
  const sourceMapMappings = nonNegativeNumber(summary?.sourceMapMappingCount);
  const universalAstLayerSummary = semanticImportUniversalAstLayerSummary(summary);
  const universalAstLayers = universalAstLayerSummary.total;
  const universalAstLayerNames = universalAstLayerSummary.names;
  const proofSpec = semanticImportProofSpecSummary(summary);
  const paradigmSemantics = semanticImportParadigmSemanticsSummary(summary);
  const semanticLineage = semanticImportLineageSummary(summary);
  const semanticEditScript = summarizeSemanticEditScript(summary) ?? summarizeSemanticEditScript({ semanticEditScripts: (summary as { semanticEditScripts?: unknown } | undefined)?.semanticEditScripts })!;
  const semanticEditProjection = summarizeSemanticEditProjection(summary) ?? emptySemanticEditProjectionSummary();
  const semanticEditReplay = summarizeSemanticEditReplay(summary) ?? emptySemanticEditReplaySummary();
  const semanticEditAdmission = classifySemanticEditScriptAdmission(semanticEditScript);
  const semanticLineageExpected = semanticLineageExpectedForBeforeSourceDiff(summary, semanticLineage.beforeSymbols);
  const selection = semanticSelectionSummary(summary);
  const present = !!summary;
  const empty = present && (total === 0 || selected === 0 && eligible === 0 && imported === 0 && symbols === 0);
  const effectiveExpected = semanticImportExpected(summary, expected);
  const expectedMissingReasonCodes = semanticImportExpectedMissingReasonCodes(summary, {
    expected: effectiveExpected,
    present,
    empty,
    selected,
    imported,
    symbols,
    ownershipRegions,
    patchHints
  });
  const expectedSatisfied = semanticImportExpectedSatisfied(summary, {
    expected: effectiveExpected,
    present,
    empty,
    imported,
    symbols,
    ownershipRegions,
    patchHints,
    reasonCodes: expectedMissingReasonCodes
  });
  const warnings: string[] = [];
  if (effectiveExpected && !present) warnings.push('semantic import expected but missing');
  if (effectiveExpected && empty) warnings.push('semantic import expected but empty');
  if (effectiveExpected && !expectedSatisfied) warnings.push('semantic import expected evidence was not satisfied');
  if (present && candidates === 0) warnings.push('semantic import has no candidates');
  if (present && imported === 0) warnings.push('semantic import imported no files');
  if (present && errors > 0) warnings.push('semantic import has errors');
  if (present && selected === 0 && selection.includeFiltered > 0) warnings.push('semantic import include filters selected no files');
  if (present && selected === 0 && selection.unsupportedLanguage > 0) warnings.push('semantic import candidates had unsupported languages');
  if (present && selected > 0 && symbols === 0) warnings.push('semantic import has no symbols');
  if (present && selected > 0 && ownershipRegions === 0) warnings.push('semantic import has no ownership regions');
  if (present && selected > 0 && sourceMapMappings === 0) warnings.push('semantic import has no source-map mappings');
  if (present && selected > 0 && universalAstLayers === 0) warnings.push('semantic import has no universal AST layers');
  if (present && selected > 0 && symbols > 1 && dependencyRelations === 0) warnings.push('semantic import has no dependency relations');
  if (present && proofSpec.failed > 0) warnings.push('semantic import has failed proof obligations');
  if (present && proofSpec.stale > 0) warnings.push('semantic import has stale proof obligations');
  if (present && symbols > 0 && semanticLineageExpected && semanticLineage.inferredEvents === 0) {
    warnings.push('semantic import has symbols but no inferred semantic lineage for expected before-source diff');
  }
  if (present && semanticLineage.blocked > 0) warnings.push('semantic lineage inference is blocked');
  if (present && semanticLineage.ambiguous > 0) warnings.push('semantic lineage inference has ambiguous matches');
  if (present && semanticEditScript.conflicts > 0) warnings.push('semantic edit script has conflicts');
  if (present && semanticEditScript.stale > 0) warnings.push('semantic edit script is stale against head');
  if (present && semanticEditScript.blocked > 0) warnings.push('semantic edit script is blocked');
  if (present && semanticEditScript.autoMergeCandidates > 0 && semanticEditProjection.total === 0) {
    warnings.push('semantic edit projection is missing');
  }
  if (present && semanticEditProjection.blocked > 0) warnings.push('semantic edit projection is blocked');
  if (present && semanticEditProjection.projectedSourceMismatchesWorker > 0) warnings.push('semantic edit projection does not match worker source');
  if (present && semanticEditProjection.projectedSourceMatchUnknown > 0) warnings.push('semantic edit projection worker match is unknown');
  if (present && semanticEditReplay.conflicts > 0) warnings.push('semantic edit replay has conflicts');
  if (present && semanticEditReplay.stale > 0) warnings.push('semantic edit replay is stale against current source');
  if (present && semanticEditReplay.blocked > 0) warnings.push('semantic edit replay is blocked');
  if (present && semanticEditReplay.needsPort > 0) warnings.push('semantic edit replay needs port');
  return {
    expected: effectiveExpected,
    expectedSatisfied,
    expectedMissingReasonCodes,
    present,
    empty,
    total,
    candidates,
    selected,
    eligible,
    imported,
    errors,
    symbols,
    ownershipRegions,
    patchHints,
    semanticFacts: semanticFacts.total,
    semanticFactPredicates: semanticFacts.predicates,
    semanticFactSummary: semanticFacts.byPredicate,
    dependencyRelations,
    dependencyPredicates,
    sourceMapMappings,
    universalAstLayers,
    universalAstLayerNames,
    proofSpecObligations: proofSpec.obligations,
    proofSpecFailedObligations: proofSpec.failed,
    paradigmSemanticsRecords: paradigmSemantics.total,
    paradigmSemanticsGroups: paradigmSemantics.groups.length,
    paradigmSemanticsLoweringRecords: paradigmSemantics.loweringRecords,
    semanticLineageEvents: semanticLineage.inferredEvents,
    semanticLineageMoved: semanticLineage.moved,
    semanticLineageRenamed: semanticLineage.renamed,
    semanticLineageDeleted: semanticLineage.deleted,
    semanticLineageAmbiguous: semanticLineage.ambiguous,
    semanticLineageBlocked: semanticLineage.blocked,
    semanticLineageNeedsReview: semanticLineage.needsReview,
    semanticLineageEventKinds: semanticLineage.eventKinds,
    semanticLineageReasonCodes: semanticLineage.reasonCodes,
    semanticEditScript,
    semanticEditProjection,
    semanticEditReplay,
    semanticEditAdmission,
    warnings: uniqueStrings(warnings)
  };
}

function semanticImportCandidateCount(summary: unknown): number {
  const record = summaryRecord(summary);
  return nonNegativeNumber((record?.selection as { candidates?: unknown } | undefined)?.candidates ?? record?.total);
}

function semanticImportExpected(summary: unknown, fallback: boolean): boolean {
  if (fallback) return true;
  const record = summaryRecord(summary);
  if (!record) return false;
  return record.semanticImportExpected === true ||
    record.expected === true ||
    (record.quality as { expected?: unknown } | undefined)?.expected === true ||
    (record.admission as { expected?: unknown } | undefined)?.expected === true;
}

function semanticImportExpectedSatisfied(
  summary: unknown,
  input: {
    expected: boolean;
    present: boolean;
    empty: boolean;
    imported: number;
    symbols: number;
    ownershipRegions: number;
    patchHints: number;
    reasonCodes: readonly string[];
  }
): boolean {
  if (!input.expected) return true;
  const explicit = semanticImportExplicitExpectedSatisfied(summary);
  if (explicit !== undefined) return explicit && input.reasonCodes.length === 0;
  return input.present &&
    !input.empty &&
    input.imported > 0 &&
    input.symbols > 0 &&
    input.ownershipRegions > 0 &&
    input.patchHints > 0 &&
    input.reasonCodes.length === 0;
}

function semanticImportExpectedMissingReasonCodes(
  summary: unknown,
  input: {
    expected: boolean;
    present: boolean;
    empty: boolean;
    selected: number;
    imported: number;
    symbols: number;
    ownershipRegions: number;
    patchHints: number;
  }
): string[] {
  const record = summaryRecord(summary);
  const explicitCodes = uniqueStrings([
    ...readStringArray(record?.semanticImportExpectedMissingReasonCodes),
    ...readStringArray((record?.quality as { expectedMissingReasonCodes?: unknown } | undefined)?.expectedMissingReasonCodes),
    ...readStringArray((record?.admission as { expectedMissingReasonCodes?: unknown } | undefined)?.expectedMissingReasonCodes)
  ]);
  if (!input.expected) return explicitCodes;
  const inferredCodes: string[] = [];
  if (!input.present) inferredCodes.push('expected-semantic-import-missing');
  if (input.present && input.selected === 0) inferredCodes.push('expected-semantic-import-missing');
  if (input.present && input.selected > 0 && input.imported === 0) inferredCodes.push('missing-imports');
  if (input.present && input.imported > 0 && input.symbols === 0) {
    inferredCodes.push('expected-semantic-import-empty', 'empty-semantic-index');
  }
  if (input.present && input.imported > 0 && input.ownershipRegions === 0) inferredCodes.push('missing-ownership-regions');
  if (input.present && input.imported > 0 && input.patchHints === 0) inferredCodes.push('missing-patch-hints');
  if (input.empty && !inferredCodes.includes('expected-semantic-import-empty')) {
    inferredCodes.push('expected-semantic-import-empty');
  }
  return uniqueStrings([...explicitCodes, ...inferredCodes]);
}

function semanticImportExplicitExpectedSatisfied(summary: unknown): boolean | undefined {
  const record = summaryRecord(summary);
  const candidates = [
    record?.semanticImportExpectedSatisfied,
    (record?.quality as { expectedSatisfied?: unknown } | undefined)?.expectedSatisfied,
    (record?.admission as { expectedSatisfied?: unknown } | undefined)?.expectedSatisfied
  ];
  for (const value of candidates) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function semanticLineageExpectedForBeforeSourceDiff(summary: unknown, beforeSymbols: number): boolean {
  if (beforeSymbols > 0) return true;
  const record = summaryRecord(summary);
  if (!record) return false;
  const quality = record.quality as { semanticLineageExpected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const admission = record.admission as { semanticLineageExpected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const lineage = record.semanticLineage as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const inference = record.semanticLineageInference as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const lineageInference = record.lineageInference as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  return [
    record.semanticLineageExpected,
    record.semanticLineageInferenceExpected,
    record.beforeSourceDiffExpected,
    record.beforeSourceExpected,
    quality?.semanticLineageExpected,
    quality?.beforeSourceDiffExpected,
    admission?.semanticLineageExpected,
    admission?.beforeSourceDiffExpected,
    lineage?.expected,
    lineage?.beforeSourceDiffExpected,
    inference?.expected,
    inference?.beforeSourceDiffExpected,
    lineageInference?.expected,
    lineageInference?.beforeSourceDiffExpected
  ].some((value) => value === true);
}

function summaryRecord(summary: unknown): Record<string, unknown> | undefined {
  return summary && typeof summary === 'object' && !Array.isArray(summary)
    ? summary as Record<string, unknown>
    : undefined;
}

function semanticSelectionSummary(summary: unknown): {
  includeFiltered: number;
  unsupportedLanguage: number;
} {
  const selection = summary && typeof summary === 'object'
    ? (summary as { selection?: { includeFiltered?: unknown; unsupportedLanguage?: unknown } }).selection
    : undefined;
  return {
    includeFiltered: nonNegativeNumber(selection?.includeFiltered),
    unsupportedLanguage: nonNegativeNumber(selection?.unsupportedLanguage)
  };
}

export function semanticImportSummaryFromBundle(bundle: FrontierSwarmMergeBundle): FrontierSwarmMergeBundle['semanticImport'] | undefined {
  const metadata = bundle.metadata as { semanticImport?: FrontierSwarmMergeBundle['semanticImport'] } | undefined;
  return richerSemanticImportSummary(bundle.semanticImport, metadata?.semanticImport);
}

function richerSemanticImportSummary(
  first: FrontierSwarmMergeBundle['semanticImport'] | undefined,
  second: FrontierSwarmMergeBundle['semanticImport'] | undefined
): FrontierSwarmMergeBundle['semanticImport'] | undefined {
  if (!first) return second;
  if (!second) return first;
  return semanticImportSummaryRichness(second) > semanticImportSummaryRichness(first) ? second : first;
}

function semanticImportSummaryRichness(summary: FrontierSwarmMergeBundle['semanticImport'] | undefined): number {
  if (!summary) return 0;
  const values = [
    summary.total,
    summary.selected,
    summary.imported,
    summary.sourceMapMappingCount,
    summary.semanticIndex?.symbols,
    semanticImportFactSummary(summary).total,
    (summary as { dependencies?: { total?: number } }).dependencies?.total,
    summary.semanticSidecars?.ownershipRegions,
    summary.semanticSidecars?.patchHints,
    semanticImportUniversalAstLayerSummary(summary).total,
    semanticImportProofSpecSummary(summary).total,
    semanticImportParadigmSemanticsSummary(summary).total,
    semanticImportLineageSummary(summary).inferredEvents
  ];
  return values.reduce<number>((sum, value) => sum + nonNegativeNumber(value), 0);
}

export function semanticImportEnabled(input: boolean | FrontierCodexSemanticImportOptions | undefined): boolean {
  if (input === true) return true;
  if (!input) return false;
  return input.enabled !== false;
}
