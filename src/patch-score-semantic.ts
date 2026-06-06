import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexPatchScoreSemanticEvidence } from './index.js';
import { nonNegativeNumber, numberRecord, uniqueStrings } from './common.js';
import { semanticImportSummaryFromBundle } from './semantic-import-quality.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';


export function summarizePatchScoreSemanticEvidence(bundle: FrontierSwarmMergeBundle): FrontierCodexPatchScoreSemanticEvidence {
  const summary = semanticImportSummaryFromBundle(bundle);
  const changed = bundle.changedPaths.length > 0;
  const reasons: string[] = [];
  let scoreAdjustment = 0;
  let cleanEligible = true;
  if (!summary) {
    if (changed) {
      reasons.push('missing semantic import sidecar');
      scoreAdjustment -= 10;
      cleanEligible = false;
    }
    return {
      present: false,
      total: 0,
      imported: 0,
      errors: 0,
      sourceMapMappings: 0,
      semanticSymbols: 0,
      ownershipRegions: 0,
      patchHints: 0,
      universalAstLayers: 0,
      universalAstLayerNames: [],
      proofSpecObligations: 0,
      proofSpecFailedObligations: 0,
      paradigmSemanticsRecords: 0,
      paradigmSemanticsGroups: 0,
      paradigmSemanticsLoweringRecords: 0,
      readiness: {},
      lossesBySeverity: {},
      scoreAdjustment,
      cleanEligible,
      reasons
    };
  }

  const readiness = numberRecord(summary.readiness);
  const lossesBySeverity = numberRecord(summary.lossesBySeverity);
  const total = nonNegativeNumber(summary.total);
  const imported = nonNegativeNumber(summary.imported);
  const selected = nonNegativeNumber(summary.selected);
  const errors = nonNegativeNumber(summary.errors);
  const sourceMapMappings = nonNegativeNumber(summary.sourceMapMappingCount);
  const semanticSymbols = nonNegativeNumber(summary.semanticIndex?.symbols);
  const ownershipRegions = nonNegativeNumber(summary.semanticSidecars?.ownershipRegions);
  const patchHints = nonNegativeNumber(summary.semanticSidecars?.patchHints);
  const universalAstLayerSummary = semanticImportUniversalAstLayerSummary(summary);
  const universalAstLayers = universalAstLayerSummary.total;
  const universalAstLayerNames = universalAstLayerSummary.names;
  const proofSpec = semanticImportProofSpecSummary(summary);
  const paradigmSemantics = semanticImportParadigmSemanticsSummary(summary);
  const errorLosses = nonNegativeNumber(lossesBySeverity.error);
  const warningLosses = nonNegativeNumber(lossesBySeverity.warning);
  const blocked = nonNegativeNumber(readiness.blocked);
  const needsReview = nonNegativeNumber(readiness['needs-review']);

  if (errors > 0) {
    reasons.push(`semantic import errors: ${errors}`);
    scoreAdjustment -= 25;
    cleanEligible = false;
  }
  if (errorLosses > 0) {
    reasons.push(`semantic error losses: ${errorLosses}`);
    scoreAdjustment -= 25;
    cleanEligible = false;
  }
  if (blocked > 0) {
    reasons.push(`blocked semantic imports: ${blocked}`);
    scoreAdjustment -= 20;
    cleanEligible = false;
  }
  if (total > 0 && imported === 0) {
    reasons.push('semantic sidecar imported no files');
    scoreAdjustment -= 15;
    cleanEligible = false;
  }
  if (selected > 0 && semanticSymbols === 0) {
    reasons.push('semantic sidecar has no symbols');
    scoreAdjustment -= 10;
    cleanEligible = false;
  }
  if (selected > 0 && ownershipRegions === 0) {
    reasons.push('semantic sidecar has no ownership regions');
    scoreAdjustment -= 10;
    cleanEligible = false;
  }
  if (selected > 0 && sourceMapMappings === 0) {
    reasons.push('semantic sidecar has no source-map mappings');
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (selected > 0 && universalAstLayers === 0) {
    reasons.push('semantic sidecar has no universal AST layers');
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (warningLosses > 0 || needsReview > 0) {
    reasons.push('semantic evidence needs review');
    scoreAdjustment -= Math.min(10, warningLosses + needsReview);
    cleanEligible = false;
  }
  if (proofSpec.failed > 0) {
    reasons.push(`failed proof obligations: ${proofSpec.failed}`);
    scoreAdjustment -= 30;
    cleanEligible = false;
  }
  if (proofSpec.stale > 0) {
    reasons.push(`stale proof obligations: ${proofSpec.stale}`);
    scoreAdjustment -= 20;
    cleanEligible = false;
  }
  if (proofSpec.open > 0 || proofSpec.unknown > 0) {
    reasons.push('proof evidence needs review');
    scoreAdjustment -= Math.min(10, proofSpec.open + proofSpec.unknown);
    cleanEligible = false;
  }
  if (sourceMapMappings > 0 && semanticSymbols > 0 && ownershipRegions > 0 && universalAstLayers > 0) {
    scoreAdjustment += 10;
  }
  if (patchHints > 0) scoreAdjustment += 5;
  if (proofSpec.discharged > 0 && proofSpec.failed === 0 && proofSpec.stale === 0 && proofSpec.open === 0 && proofSpec.unknown === 0) {
    scoreAdjustment += 5;
  }
  if (paradigmSemantics.total > 0) {
    scoreAdjustment += 3;
  }

  return {
    present: true,
    total,
    imported,
    errors,
    sourceMapMappings,
    semanticSymbols,
    ownershipRegions,
    patchHints,
    universalAstLayers,
    universalAstLayerNames,
    proofSpecObligations: proofSpec.obligations,
    proofSpecFailedObligations: proofSpec.failed,
    paradigmSemanticsRecords: paradigmSemantics.total,
    paradigmSemanticsGroups: paradigmSemantics.groups.length,
    paradigmSemanticsLoweringRecords: paradigmSemantics.loweringRecords,
    readiness,
    lossesBySeverity,
    scoreAdjustment: Math.max(-60, Math.min(15, scoreAdjustment)),
    cleanEligible,
    reasons: uniqueStrings(reasons)
  };
}
