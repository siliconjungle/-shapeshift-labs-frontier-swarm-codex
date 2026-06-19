import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexPatchScoreSemanticEvidence } from './index.js';
import { nonNegativeNumber, numberRecord, uniqueStrings } from './common.js';
import { semanticImportSummaryFromBundle } from './semantic-import-quality.js';
import { semanticImportFactSummary } from './semantic-import-facts.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';
import { semanticImportLineageSummary } from './semantic-import-lineage.js';
import { emptySemanticEditScriptSummary, summarizeSemanticEditScript } from './semantic-edit-script.js';
import { emptySemanticEditProjectionSummary, summarizeSemanticEditProjection } from './semantic-edit-projection.js';
import { emptySemanticEditReplaySummary, summarizeSemanticEditReplay } from './semantic-edit-replay.js';
import { semanticEditReplayScore } from './semantic-edit-replay-score.js';
import { classifySemanticEditScriptAdmission } from './semantic-edit-admission.js';
import { isCleanSemanticEditOperationScript, isCleanSemanticEditProjection } from './semantic-edit-clean-eligibility.js';


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
      semanticFacts: 0,
      semanticFactPredicates: [],
      semanticFactSummary: {},
      dependencyRelations: 0,
      dependencyPredicates: [],
      universalAstLayers: 0,
      universalAstLayerNames: [],
      proofSpecObligations: 0,
      proofSpecFailedObligations: 0,
      paradigmSemanticsRecords: 0,
      paradigmSemanticsGroups: 0,
      paradigmSemanticsLoweringRecords: 0,
      semanticLineageEvents: 0,
      semanticLineageMoved: 0,
      semanticLineageRenamed: 0,
      semanticLineageDeleted: 0,
      semanticLineageAmbiguous: 0,
      semanticLineageBlocked: 0,
      semanticLineageNeedsReview: 0,
      semanticLineageEventKinds: [],
      semanticLineageReasonCodes: [],
      semanticEditScript: emptySemanticEditScriptSummary(),
      semanticEditProjection: emptySemanticEditProjectionSummary(),
      semanticEditReplay: emptySemanticEditReplaySummary(),
      semanticEditAdmission: classifySemanticEditScriptAdmission(undefined),
      semanticEditOperationAutoMergeCandidate: false,
      semanticEditOperationCleanEligible: false,
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
  const semanticFacts = semanticImportFactSummary(summary);
  const dependencyRelations = nonNegativeNumber((summary as { dependencies?: { total?: number } }).dependencies?.total);
  const dependencyPredicates = uniqueStrings(((summary as { dependencies?: { predicates?: readonly string[] } }).dependencies?.predicates ?? []).map(String));
  const universalAstLayerSummary = semanticImportUniversalAstLayerSummary(summary);
  const universalAstLayers = universalAstLayerSummary.total;
  const universalAstLayerNames = universalAstLayerSummary.names;
  const proofSpec = semanticImportProofSpecSummary(summary);
  const paradigmSemantics = semanticImportParadigmSemanticsSummary(summary);
  const semanticLineage = semanticImportLineageSummary(summary);
  const semanticEditScript = summarizeSemanticEditScript(summary) ?? emptySemanticEditScriptSummary();
  const semanticEditProjection = summarizeSemanticEditProjection(summary) ?? emptySemanticEditProjectionSummary();
  const semanticEditReplay = summarizeSemanticEditReplay(summary) ?? emptySemanticEditReplaySummary();
  const semanticEditAdmission = classifySemanticEditScriptAdmission(semanticEditScript);
  const cleanSemanticEditScript = isCleanSemanticEditOperationScript(semanticEditScript);
  const semanticEditScriptScoreCreditEligible = cleanSemanticEditScript &&
    semanticEditScript.reviewRequired === 0 &&
    semanticEditScript.total <= semanticEditScript.operations;
  const semanticEditOperationCleanEligible = semanticEditScriptScoreCreditEligible && isCleanSemanticEditProjection(semanticEditProjection);
  const replayScore = semanticEditReplayScore(semanticEditReplay);
  const errorLosses = nonNegativeNumber(lossesBySeverity.error);
  const warningLosses = nonNegativeNumber(lossesBySeverity.warning);
  const blocked = nonNegativeNumber(readiness.blocked);
  const needsReview = nonNegativeNumber(readiness['needs-review']);

  if (total === 0) {
    reasons.push('empty semantic import sidecar');
    scoreAdjustment -= 30;
    cleanEligible = false;
  }
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
  if (imported > 0 && patchHints === 0) {
    reasons.push('semantic sidecar has no patch hints');
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
  if (selected > 0 && semanticSymbols > 1 && dependencyRelations === 0) {
    reasons.push('semantic sidecar has no dependency relations');
    scoreAdjustment -= 3;
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
  if (semanticLineage.blocked > 0) {
    reasons.push(`blocked semantic lineage: ${semanticLineage.blocked}`);
    scoreAdjustment -= 20;
    cleanEligible = false;
  }
  if (semanticLineage.ambiguous > 0) {
    reasons.push(`ambiguous semantic lineage: ${semanticLineage.ambiguous}`);
    scoreAdjustment -= 10;
    cleanEligible = false;
  }
  if (semanticLineage.needsReview > 0 || semanticLineage.reviewRequired) {
    reasons.push('semantic lineage needs review');
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (semanticEditScript.conflicts > 0) {
    reasons.push(`semantic edit script conflicts: ${semanticEditScript.conflicts}`);
    scoreAdjustment -= 20;
    cleanEligible = false;
  }
  if (semanticEditScript.stale > 0) {
    reasons.push(`semantic edit script stale anchors: ${semanticEditScript.stale}`);
    scoreAdjustment -= 15;
    cleanEligible = false;
  }
  if (semanticEditScript.blocked > 0) {
    reasons.push(`semantic edit script blocked: ${semanticEditScript.blocked}`);
    scoreAdjustment -= 20;
    cleanEligible = false;
  }
  if (semanticEditScript.reviewRequired > 0) {
    reasons.push('semantic edit script needs review');
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (semanticEditScript.needsPort > 0 || semanticEditScript.candidates > 0) {
    reasons.push('semantic edit script needs port');
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (cleanSemanticEditScript && semanticEditProjection.total === 0) {
    reasons.push('semantic edit projection missing');
    scoreAdjustment -= 10;
    cleanEligible = false;
  }
  if (semanticEditProjection.blocked > 0) {
    reasons.push(`semantic edit projection blocked: ${semanticEditProjection.blocked}`);
    scoreAdjustment -= 15;
    cleanEligible = false;
  }
  if (semanticEditProjection.total > 0 && semanticEditProjection.projected === 0 && semanticEditScript.autoMergeCandidates > 0) {
    reasons.push('semantic edit projection has no projected source');
    scoreAdjustment -= 10;
    cleanEligible = false;
  }
  if (semanticEditProjection.skippedOperations > 0) {
    reasons.push(`semantic edit projection skipped operations: ${semanticEditProjection.skippedOperations}`);
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  if (semanticEditProjection.projectedSourceMismatchesWorker > 0) {
    reasons.push(`semantic edit projection worker mismatch: ${semanticEditProjection.projectedSourceMismatchesWorker}`);
    scoreAdjustment -= 15;
    cleanEligible = false;
  }
  if (semanticEditProjection.projectedSourceMatchUnknown > 0) {
    reasons.push(`semantic edit projection worker match unknown: ${semanticEditProjection.projectedSourceMatchUnknown}`);
    scoreAdjustment -= 5;
    cleanEligible = false;
  }
  reasons.push(...replayScore.reasons);
  scoreAdjustment += replayScore.scoreAdjustment;
  if (semanticEditReplay.total > 0 && !replayScore.cleanEligible) cleanEligible = false;
  if (sourceMapMappings > 0 && semanticSymbols > 0 && ownershipRegions > 0 && universalAstLayers > 0) {
    scoreAdjustment += 10;
  }
  if (patchHints > 0) scoreAdjustment += 5;
  if (dependencyRelations > 0) scoreAdjustment += 3;
  if (semanticFacts.total > 0) scoreAdjustment += 2;
  if (proofSpec.discharged > 0 && proofSpec.failed === 0 && proofSpec.stale === 0 && proofSpec.open === 0 && proofSpec.unknown === 0) {
    scoreAdjustment += 5;
  }
  if (paradigmSemantics.total > 0) {
    scoreAdjustment += 3;
  }
  if (semanticLineage.inferredEvents > 0 && semanticLineage.blocked === 0) {
    scoreAdjustment += 2;
  }
  if (semanticEditScript.autoMergeCandidates > 0 && semanticEditScriptScoreCreditEligible) {
    scoreAdjustment += 5;
  } else if (
    semanticEditScript.autoMergeCandidates > 0 &&
    semanticEditScript.conflicts === 0 &&
    semanticEditScript.stale === 0 &&
    semanticEditScript.blocked === 0
  ) {
    reasons.push('semantic edit auto-merge candidate has review-only sidecar records');
  }
  if (!cleanEligible && scoreAdjustment > 0) {
    reasons.push('semantic evidence is review-only; positive score credit suppressed');
    scoreAdjustment = 0;
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
    semanticFacts: semanticFacts.total,
    semanticFactPredicates: semanticFacts.predicates,
    semanticFactSummary: semanticFacts.byPredicate,
    dependencyRelations,
    dependencyPredicates,
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
    semanticEditOperationAutoMergeCandidate: semanticEditOperationCleanEligible,
    semanticEditOperationCleanEligible,
    readiness,
    lossesBySeverity,
    scoreAdjustment: Math.max(-60, Math.min(15, scoreAdjustment)),
    cleanEligible,
    reasons: uniqueStrings(reasons)
  };
}
