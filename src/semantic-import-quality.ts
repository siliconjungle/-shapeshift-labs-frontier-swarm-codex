import type { FrontierSwarmJobResultInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions, FrontierCodexSemanticImportQuality, FrontierCodexSemanticImportSidecar } from './index.js';
import { nonNegativeNumber, uniqueStrings } from './common.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';


export function summarizeCodexSemanticImportQuality(
  summary: FrontierSwarmMergeBundle['semanticImport'] | FrontierCodexSemanticImportSidecar['summary'] | FrontierSwarmJobResultInput['semanticImport'] | undefined,
  expected = false
): FrontierCodexSemanticImportQuality {
  const selected = nonNegativeNumber(summary?.selected);
  const eligible = nonNegativeNumber(summary?.eligible);
  const imported = nonNegativeNumber(summary?.imported);
  const symbols = nonNegativeNumber(summary?.semanticIndex?.symbols);
  const ownershipRegions = nonNegativeNumber(summary?.semanticSidecars?.ownershipRegions);
  const patchHints = nonNegativeNumber(summary?.semanticSidecars?.patchHints);
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
  const selection = semanticSelectionSummary(summary);
  const present = !!summary;
  const empty = present && (nonNegativeNumber(summary?.total) === 0 || selected === 0 && eligible === 0 && imported === 0 && symbols === 0);
  const warnings: string[] = [];
  if (expected && !present) warnings.push('semantic import expected but missing');
  if (expected && empty) warnings.push('semantic import expected but empty');
  if (present && imported === 0) warnings.push('semantic import imported no files');
  if (present && selected === 0 && selection.includeFiltered > 0) warnings.push('semantic import include filters selected no files');
  if (present && selected === 0 && selection.unsupportedLanguage > 0) warnings.push('semantic import candidates had unsupported languages');
  if (present && selected > 0 && symbols === 0) warnings.push('semantic import has no symbols');
  if (present && selected > 0 && ownershipRegions === 0) warnings.push('semantic import has no ownership regions');
  if (present && selected > 0 && sourceMapMappings === 0) warnings.push('semantic import has no source-map mappings');
  if (present && selected > 0 && universalAstLayers === 0) warnings.push('semantic import has no universal AST layers');
  if (present && selected > 0 && symbols > 1 && dependencyRelations === 0) warnings.push('semantic import has no dependency relations');
  if (present && proofSpec.failed > 0) warnings.push('semantic import has failed proof obligations');
  if (present && proofSpec.stale > 0) warnings.push('semantic import has stale proof obligations');
  return {
    expected,
    present,
    empty,
    selected,
    eligible,
    imported,
    symbols,
    ownershipRegions,
    patchHints,
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
    warnings: uniqueStrings(warnings)
  };
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
    (summary as { dependencies?: { total?: number } }).dependencies?.total,
    summary.semanticSidecars?.ownershipRegions,
    summary.semanticSidecars?.patchHints,
    semanticImportUniversalAstLayerSummary(summary).total,
    semanticImportProofSpecSummary(summary).total,
    semanticImportParadigmSemanticsSummary(summary).total
  ];
  return values.reduce<number>((sum, value) => sum + nonNegativeNumber(value), 0);
}


export function semanticImportEnabled(input: boolean | FrontierCodexSemanticImportOptions | undefined): boolean {
  if (input === true) return true;
  if (!input) return false;
  return input.enabled !== false;
}
