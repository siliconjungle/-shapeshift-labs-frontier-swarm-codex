import type { FrontierSwarmJobResultInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions, FrontierCodexSemanticImportQuality, FrontierCodexSemanticImportSidecar } from './index.js';
import { isObject, nonNegativeNumber, numberRecord, readStringArray, uniqueStrings } from './common.js';
import { semanticImportFactSummary } from './semantic-import-facts.js';
import { semanticImportUniversalAstLayerSummary } from './semantic-import-layers.js';
import { semanticImportParadigmSemanticsSummary } from './semantic-import-paradigm.js';
import { semanticImportProofSpecSummary } from './semantic-import-proof.js';
import { semanticImportLineageSummary } from './semantic-import-lineage.js';
import { summarizeSemanticEditScript } from './semantic-edit-script.js';
import { summarizeSemanticEditProjection, emptySemanticEditProjectionSummary } from './semantic-edit-projection.js';
import { emptySemanticEditReplaySummary, summarizeSemanticEditReplay } from './semantic-edit-replay.js';
import { classifySemanticEditScriptAdmission } from './semantic-edit-admission.js';

import {
  semanticImportCandidateCount,
  semanticImportExpected,
  semanticImportExpectedMissingReasonCodes,
  semanticImportExpectedSatisfied,
  semanticImportNativeCompileSummary,
  semanticImportSliceAdmissionSummary,
  semanticImportSourceProjectionSummary,
  semanticLineageExpectedForBeforeSourceDiff,
  semanticSelectionSummary
} from './semantic-import-quality-helpers.js';

type SemanticMergeAdmissionQualitySummary = FrontierCodexSemanticImportQuality['semanticMergeAdmission'];
type JsTsSafeMergeApplyQualitySummary = FrontierCodexSemanticImportQuality['jsTsSafeMergeApply'];
type SemanticEditAdmissionQualityDecision = FrontierCodexSemanticImportQuality['semanticEditAdmission'];

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
  const lossCount = nonNegativeNumber((summary as { lossCount?: unknown } | undefined)?.lossCount);
  const lossesBySeverity = numberRecord((summary as { lossesBySeverity?: unknown } | undefined)?.lossesBySeverity);
  const semanticErrorLosses = nonNegativeNumber(lossesBySeverity.error);
  const semanticWarningLosses = nonNegativeNumber(lossesBySeverity.warning);
  const symbols = nonNegativeNumber(summary?.semanticIndex?.symbols);
  const ownershipRegions = nonNegativeNumber(summary?.semanticSidecars?.ownershipRegions);
  const patchHints = nonNegativeNumber(summary?.semanticSidecars?.patchHints);
  const semanticReadiness = numberRecord((summary as { readiness?: unknown } | undefined)?.readiness);
  const sourceProjections = semanticImportSourceProjectionSummary(summary);
  const nativeCompiles = semanticImportNativeCompileSummary(summary);
  const semanticFacts = semanticImportFactSummary(summary);
  const dependencyRelations = nonNegativeNumber((summary as { dependencies?: { total?: number } } | undefined)?.dependencies?.total);
  const dependencyPredicates = Array.isArray((summary as { dependencies?: { predicates?: unknown } } | undefined)?.dependencies?.predicates)
    ? uniqueStrings((summary as { dependencies: { predicates: string[] } }).dependencies.predicates)
    : [];
  const dependencyEdges = Array.isArray((summary as { dependencyEdges?: unknown } | undefined)?.dependencyEdges)
    ? uniqueStrings((summary as { dependencyEdges: string[] }).dependencyEdges)
    : [];
  const dependencyEdgeHints = Array.isArray((summary as { dependencyEdgeHints?: unknown } | undefined)?.dependencyEdgeHints)
    ? uniqueStrings((summary as { dependencyEdgeHints: string[] }).dependencyEdgeHints)
    : [];
  const sourceMapMappings = nonNegativeNumber(summary?.sourceMapMappingCount);
  const universalAstLayerSummary = semanticImportUniversalAstLayerSummary(summary);
  const universalAstLayers = universalAstLayerSummary.total;
  const universalAstLayerNames = universalAstLayerSummary.names;
  const proofSpec = semanticImportProofSpecSummary(summary);
  const paradigmSemantics = semanticImportParadigmSemanticsSummary(summary);
  const semanticSliceAdmissions = semanticImportSliceAdmissionSummary(summary);
  const semanticLineage = semanticImportLineageSummary(summary);
  const semanticEditScript = summarizeSemanticEditScript(summary) ?? summarizeSemanticEditScript({ semanticEditScripts: (summary as { semanticEditScripts?: unknown } | undefined)?.semanticEditScripts })!;
  const semanticEditProjection = summarizeSemanticEditProjection(summary) ?? emptySemanticEditProjectionSummary();
  const semanticEditReplay = summarizeSemanticEditReplay(summary) ?? emptySemanticEditReplaySummary();
  const semanticMergeAdmission = summarizeSemanticMergeAdmissionQuality(summary);
  const jsTsSafeMergeApply = summarizeJsTsSafeMergeApplyQuality(summary);
  const semanticEditAdmission = semanticEditAdmissionWithSafeMerge(
    classifySemanticEditScriptAdmission(semanticEditScript),
    semanticMergeAdmission,
    jsTsSafeMergeApply
  );
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
  if (present && semanticErrorLosses > 0) warnings.push('semantic import has error losses');
  if (present && semanticReadiness.blocked > 0) warnings.push('semantic import readiness is blocked');
  if (present && semanticReadiness['needs-review'] > 0) warnings.push('semantic import readiness needs review');
  if (present && sourceProjections.blocked > 0) warnings.push('semantic source projection is blocked');
  if (present && sourceProjections.stubs > 0) warnings.push('semantic source projection uses stubs');
  if (present && nativeCompiles.blocked > 0) warnings.push('semantic native compile is blocked');
  if (present && nativeCompiles.targetStubs > 0) warnings.push('semantic native compile emitted target stubs');
  if (present && selected === 0 && selection.includeFiltered > 0) warnings.push('semantic import include filters selected no files');
  if (present && selected === 0 && selection.unsupportedLanguage > 0) warnings.push('semantic import candidates had unsupported languages');
  if (present && selected > 0 && symbols === 0) warnings.push('semantic import has no symbols');
  if (present && selected > 0 && ownershipRegions === 0) warnings.push('semantic import has no ownership regions');
  if (present && selected > 0 && sourceMapMappings === 0) warnings.push('semantic import has no source-map mappings');
  if (present && selected > 0 && universalAstLayers === 0) warnings.push('semantic import has no universal AST layers');
  if (present && selected > 0 && symbols > 1 && dependencyRelations === 0) warnings.push('semantic import has no dependency relations');
  if (present && proofSpec.failed > 0) warnings.push('semantic import has failed proof obligations');
  if (present && proofSpec.stale > 0) warnings.push('semantic import has stale proof obligations');
  if (present && semanticSliceAdmissions.rejected > 0) warnings.push('semantic slice admission rejected candidates');
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
  if (present && semanticMergeAdmission.noOp > 0) warnings.push('semantic merge admission is no-op');
  if (present && semanticMergeAdmission.stale > 0) warnings.push('semantic merge admission is stale');
  if (present && semanticMergeAdmission.conflicts > 0) warnings.push('semantic merge admission has conflicts');
  if (present && semanticMergeAdmission.reviewRequired > 0) warnings.push('semantic merge admission needs review');
  if (present && semanticMergeAdmission.blocked > 0) warnings.push('semantic merge admission is blocked');
  if (present && jsTsSafeMergeApply.noOp > 0) warnings.push('semantic safe-merge apply is no-op');
  if (present && jsTsSafeMergeApply.stale > 0) warnings.push('semantic safe-merge apply is stale');
  if (present && jsTsSafeMergeApply.conflicts > 0) warnings.push('semantic safe-merge apply has conflicts');
  if (present && jsTsSafeMergeApply.needsReview > 0) warnings.push('semantic safe-merge apply needs review');
  if (present && jsTsSafeMergeApply.blocked > 0) warnings.push('semantic safe-merge apply is blocked');
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
    lossCount,
    lossesBySeverity,
    semanticErrorLosses,
    semanticWarningLosses,
    symbols,
    ownershipRegions,
    patchHints,
    semanticReadiness,
    sourceProjectionTotal: sourceProjections.total,
    sourceProjectionPreserved: sourceProjections.preserved,
    sourceProjectionStubs: sourceProjections.stubs,
    sourceProjectionReady: sourceProjections.ready,
    sourceProjectionNeedsReview: sourceProjections.needsReview,
    sourceProjectionBlocked: sourceProjections.blocked,
    nativeCompileTotal: nativeCompiles.total,
    nativeCompileEmitted: nativeCompiles.emitted,
    nativeCompilePreserved: nativeCompiles.preserved,
    nativeCompileTargetStubs: nativeCompiles.targetStubs,
    nativeCompileReady: nativeCompiles.ready,
    nativeCompileNeedsReview: nativeCompiles.needsReview,
    nativeCompileBlocked: nativeCompiles.blocked,
    semanticFacts: semanticFacts.total,
    semanticFactPredicates: semanticFacts.predicates,
    semanticFactSummary: semanticFacts.byPredicate,
    dependencyRelations,
    dependencyPredicates,
    dependencyEdges,
    dependencyEdgeHints,
    sourceMapMappings,
    universalAstLayers,
    universalAstLayerNames,
    proofSpecObligations: proofSpec.obligations,
    proofSpecFailedObligations: proofSpec.failed,
    paradigmSemanticsRecords: paradigmSemantics.total,
    paradigmSemanticsGroups: paradigmSemantics.groups.length,
    paradigmSemanticsLoweringRecords: paradigmSemantics.loweringRecords,
    semanticSliceAdmissionTotal: semanticSliceAdmissions.total,
    semanticSliceAdmissionAdmitted: semanticSliceAdmissions.admitted,
    semanticSliceAdmissionPrioritized: semanticSliceAdmissions.prioritized,
    semanticSliceAdmissionRejected: semanticSliceAdmissions.rejected,
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
    semanticMergeAdmission,
    jsTsSafeMergeApply,
    warnings: uniqueStrings(warnings)
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
    semanticImportLineageSummary(summary).inferredEvents,
    summarizeSemanticMergeAdmissionQuality(summary).total,
    summarizeJsTsSafeMergeApplyQuality(summary).total
  ];
  return values.reduce<number>((sum, value) => sum + nonNegativeNumber(value), 0);
}

export function semanticImportEnabled(input: boolean | FrontierCodexSemanticImportOptions | undefined): boolean {
  if (input === true) return true;
  if (!input) return false;
  return input.enabled !== false;
}

function semanticEditAdmissionWithSafeMerge(
  editAdmission: SemanticEditAdmissionQualityDecision,
  semanticMergeAdmission: SemanticMergeAdmissionQualitySummary,
  jsTsSafeMergeApply: JsTsSafeMergeApplyQualitySummary
): SemanticEditAdmissionQualityDecision {
  if (editAdmission.status === 'conflict' || editAdmission.status === 'stale' || editAdmission.status === 'blocked' || editAdmission.status === 'review-required') {
    return editAdmission;
  }
  if (jsTsSafeMergeApply.conflicts > 0 || semanticMergeAdmission.conflicts > 0) {
    return safeMergeAdmissionDecision('conflict', `semantic safe-merge conflict signals: ${jsTsSafeMergeApply.conflicts + semanticMergeAdmission.conflicts}`);
  }
  if (jsTsSafeMergeApply.stale > 0 || semanticMergeAdmission.stale > 0) {
    return safeMergeAdmissionDecision('stale', `semantic safe-merge stale signals: ${jsTsSafeMergeApply.stale + semanticMergeAdmission.stale}`);
  }
  if (jsTsSafeMergeApply.blocked > 0 || semanticMergeAdmission.blocked > 0) {
    return safeMergeAdmissionDecision('blocked', `semantic safe-merge blocked signals: ${jsTsSafeMergeApply.blocked + semanticMergeAdmission.blocked}`);
  }
  if (jsTsSafeMergeApply.needsReview > 0 || semanticMergeAdmission.reviewRequired > 0 || semanticMergeAdmission.safeWithLosses > 0) {
    return safeMergeAdmissionDecision('review-required', 'semantic safe-merge needs review');
  }
  if (safeMergeApplyClean(jsTsSafeMergeApply)) {
    return {
      status: 'auto-merge-candidate',
      autoMergeCandidate: true,
      cleanEligible: true,
      reasons: ['semantic safe-merge apply accepted clean']
    };
  }
  if (semanticMergeAdmissionClean(semanticMergeAdmission)) {
    return {
      status: 'auto-merge-candidate',
      autoMergeCandidate: true,
      cleanEligible: true,
      reasons: ['semantic merge admission is safe']
    };
  }
  return editAdmission;
}

function safeMergeAdmissionDecision(
  status: SemanticEditAdmissionQualityDecision['status'],
  reason: string
): SemanticEditAdmissionQualityDecision {
  return {
    status,
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: [reason]
  };
}

function safeMergeApplyClean(summary: JsTsSafeMergeApplyQualitySummary): boolean {
  return summary.total > 0 &&
    summary.acceptedClean + summary.alreadyApplied > 0 &&
    summary.noOp + summary.stale + summary.conflicts + summary.needsReview + summary.blocked === 0;
}

function semanticMergeAdmissionClean(summary: SemanticMergeAdmissionQualitySummary): boolean {
  return summary.total > 0 &&
    summary.autoMergeable + summary.safe > 0 &&
    summary.safeWithLosses + summary.noOp + summary.stale + summary.conflicts + summary.reviewRequired + summary.blocked === 0;
}

function summarizeSemanticMergeAdmissionQuality(value: unknown): SemanticMergeAdmissionQualitySummary {
  const direct = directSafeMergeValues(value, ['semanticMergeAdmissions', 'semanticMergeAdmission', 'semanticMergeAdmissionSummary']);
  if (direct.length > 0) return mergeSemanticMergeAdmissionSummaries(direct.map(normalizeSemanticMergeAdmissionRecord));
  const records = isObject(value) && Array.isArray(value.records) ? value.records.filter(isObject) : [];
  return mergeSemanticMergeAdmissionSummaries(records.flatMap((record) => {
    const sidecar = isObject(record.semanticSidecar) ? record.semanticSidecar : {};
    const mergeCandidate = isObject(record.mergeCandidate) ? record.mergeCandidate : {};
    return directSafeMergeValues({
      semanticMergeAdmission: record.semanticMergeAdmission,
      semanticMergeAdmissions: record.semanticMergeAdmissions,
      semanticMergeAdmissionSummary: record.semanticMergeAdmissionSummary,
      sidecarSemanticMergeAdmission: sidecar.semanticMergeAdmission,
      sidecarSemanticMergeAdmissions: sidecar.semanticMergeAdmissions,
      mergeCandidateAdmission: mergeCandidate.semanticMergeAdmission ?? mergeCandidate.mergeAdmission ?? mergeCandidate.admission
    }, [
      'semanticMergeAdmission',
      'semanticMergeAdmissions',
      'semanticMergeAdmissionSummary',
      'sidecarSemanticMergeAdmission',
      'sidecarSemanticMergeAdmissions',
      'mergeCandidateAdmission'
    ]).map(normalizeSemanticMergeAdmissionRecord);
  }));
}

function summarizeJsTsSafeMergeApplyQuality(value: unknown): JsTsSafeMergeApplyQualitySummary {
  const direct = directSafeMergeValues(value, ['jsTsSafeMergeApply', 'jsTsSafeMergeApplies', 'safeMergeApply', 'safeMergeApplies']);
  if (direct.length > 0) return mergeJsTsSafeMergeApplySummaries(direct.map(normalizeJsTsSafeMergeApplyRecord));
  const records = isObject(value) && Array.isArray(value.records) ? value.records.filter(isObject) : [];
  return mergeJsTsSafeMergeApplySummaries(records.flatMap((record) => {
    const sidecar = isObject(record.semanticSidecar) ? record.semanticSidecar : {};
    return directSafeMergeValues({
      jsTsSafeMergeApply: record.jsTsSafeMergeApply,
      jsTsSafeMergeApplies: record.jsTsSafeMergeApplies,
      safeMergeApply: record.safeMergeApply,
      safeMergeApplies: record.safeMergeApplies,
      sidecarJsTsSafeMergeApply: sidecar.jsTsSafeMergeApply,
      sidecarSafeMergeApply: sidecar.safeMergeApply
    }, [
      'jsTsSafeMergeApply',
      'jsTsSafeMergeApplies',
      'safeMergeApply',
      'safeMergeApplies',
      'sidecarJsTsSafeMergeApply',
      'sidecarSafeMergeApply'
    ]).map(normalizeJsTsSafeMergeApplyRecord);
  }));
}

function normalizeSemanticMergeAdmissionRecord(value: unknown): SemanticMergeAdmissionQualitySummary {
  const record = isObject(value) ? value : {};
  const summary = isObject(record.summary) ? record.summary : record;
  const byClassification = mergeNumberRecords(
    numberRecord(summary.byClassification),
    numberRecord(summary.classificationCounts)
  );
  const byDecision = mergeNumberRecords(
    numberRecord(summary.byDecision),
    numberRecord(summary.decisionCounts)
  );
  const classification = stringValue(summary.classification ?? record.classification);
  const decision = stringValue(summary.decision ?? record.decision ?? summary.status ?? record.status);
  if (classification) addSignalCount(byClassification, classification);
  if (decision) addSignalCount(byDecision, decision);
  if (Object.keys(byClassification).length === 0) {
    for (const entry of readStringArray(summary.classifications)) addSignalCount(byClassification, entry);
  }
  if (Object.keys(byDecision).length === 0) {
    for (const entry of readStringArray(summary.decisions)) addSignalCount(byDecision, entry);
  }
  const safe = Math.max(nonNegativeNumber(summary.safe), signalCount(byClassification, 'safe'));
  const safeWithLosses = Math.max(nonNegativeNumber(summary.safeWithLosses), signalCount(byClassification, 'safe-with-losses'));
  const reviewRequired = Math.max(
    nonNegativeNumber(summary.reviewRequired),
    nonNegativeNumber(summary.needsReview),
    signalCount(byClassification, 'review-required', 'needs-review', 'review', 'human-review'),
    signalCount(byDecision, 'review-required', 'needs-review', 'review', 'human-review')
  );
  const autoMergeable = Math.max(
    nonNegativeNumber(summary.autoMergeable),
    record.autoMergeable === true ? 1 : 0,
    signalCount(byDecision, 'auto-mergeable', 'auto-merge-candidate'),
    safe
  );
  const noOp = Math.max(nonNegativeNumber(summary.noOp), signalCount(byDecision, 'no-op', 'noop', 'no-change'));
  const stale = Math.max(nonNegativeNumber(summary.stale), signalCount(byDecision, 'stale', 'rerun-semantic-import'));
  const blocked = Math.max(
    nonNegativeNumber(summary.blocked),
    signalCount(byClassification, 'blocked', 'blocked-evidence'),
    signalCount(byDecision, 'blocked', 'blocked-evidence', 'block')
  );
  const conflicts = Math.max(nonNegativeNumber(summary.conflicts), signalCount(byDecision, 'conflict', 'conflicts', 'conflict-blocked'));
  const total = nonNegativeNumber(summary.total) ||
    sumRecord(byClassification) ||
    sumRecord(byDecision) ||
    (classification || decision || record.kind === 'frontier.lang.semanticMergeAdmission' ? 1 : 0);
  return {
    total,
    classifications: positiveRecordKeys(byClassification),
    byClassification,
    decisions: positiveRecordKeys(byDecision),
    byDecision,
    noOp,
    stale,
    needsReview: Math.max(nonNegativeNumber(summary.needsReview), reviewRequired),
    blocked,
    conflicts,
    conflictReasonCodes: uniqueStrings([...readStringArray(summary.conflictReasonCodes), ...readStringArray(record.conflictReasonCodes)]),
    conflictKeys: uniqueStrings([...readStringArray(summary.conflictKeys), ...readStringArray(record.conflictKeys)]),
    evidenceIds: uniqueStrings([...readStringArray(summary.evidenceIds), ...readStringArray(record.evidenceIds), ...objectIds(record.evidence)]),
    autoApplyable: Math.max(nonNegativeNumber(summary.autoApplyable), autoMergeable),
    autoApplyCandidates: Math.max(nonNegativeNumber(summary.autoApplyCandidates), autoMergeable),
    empty: total === 0,
    safe,
    safeWithLosses,
    reviewRequired,
    autoMergeable,
    reasonCodes: uniqueStrings([...readStringArray(summary.reasonCodes), ...readStringArray(record.reasonCodes), ...readStringArray(record.reasons)]),
    conflictKeyKinds: uniqueStrings([...readStringArray(summary.conflictKeyKinds), ...readStringArray(record.conflictKeyKinds)]),
    candidateIds: uniqueStrings([...readStringArray(summary.candidateIds), ...stringArray(record.candidateId)])
  };
}

function normalizeJsTsSafeMergeApplyRecord(value: unknown): JsTsSafeMergeApplyQualitySummary {
  const record = isObject(value) ? value : {};
  const summary = isObject(record.summary) ? record.summary : record;
  const admission = isObject(record.admission) ? record.admission : {};
  const byClassification = mergeNumberRecords(
    numberRecord(summary.byClassification),
    numberRecord(summary.classificationCounts)
  );
  const byDecision = mergeNumberRecords(
    numberRecord(summary.byDecision),
    numberRecord(summary.decisionCounts)
  );
  const byStatus = mergeNumberRecords(
    numberRecord(summary.byStatus),
    numberRecord(summary.statusCounts)
  );
  const byAction = mergeNumberRecords(
    numberRecord(summary.byAction),
    numberRecord(summary.actionCounts)
  );
  const classification = stringValue(summary.classification ?? record.classification);
  const decision = stringValue(summary.decision ?? record.decision ?? summary.decision ?? admission.decision);
  const status = stringValue(summary.status ?? record.status ?? admission.status);
  const action = stringValue(summary.action ?? record.action ?? admission.action);
  if (classification) addSignalCount(byClassification, classification);
  if (decision) addSignalCount(byDecision, decision);
  if (status) addSignalCount(byStatus, status);
  if (action) addSignalCount(byAction, action);
  if (Object.keys(byClassification).length === 0) {
    for (const entry of readStringArray(summary.classifications)) addSignalCount(byClassification, entry);
  }
  if (Object.keys(byDecision).length === 0) {
    for (const entry of readStringArray(summary.decisions)) addSignalCount(byDecision, entry);
  }
  if (Object.keys(byStatus).length === 0) {
    for (const entry of readStringArray(summary.statuses)) addSignalCount(byStatus, entry);
  }
  if (Object.keys(byAction).length === 0) {
    for (const entry of readStringArray(summary.actions)) addSignalCount(byAction, entry);
  }
  const acceptedClean = Math.max(nonNegativeNumber(summary.acceptedClean), signalCount(byStatus, 'accepted-clean'), signalCount(byClassification, 'accepted-clean'));
  const alreadyApplied = Math.max(nonNegativeNumber(summary.alreadyApplied), signalCount(byStatus, 'already-applied'), signalCount(byClassification, 'already-applied'));
  const noOp = Math.max(
    nonNegativeNumber(summary.noOp),
    signalCount(byStatus, 'no-op', 'noop', 'no-change'),
    signalCount(byClassification, 'no-op', 'noop', 'no-change'),
    signalCount(byDecision, 'no-op', 'noop', 'no-change')
  );
  const stale = Math.max(nonNegativeNumber(summary.stale), signalCount(byStatus, 'stale'), signalCount(byClassification, 'stale'), signalCount(byDecision, 'stale', 'rerun-semantic-import'));
  const needsReview = Math.max(
    nonNegativeNumber(summary.needsReview),
    signalCount(byStatus, 'needs-review', 'review-required', 'review', 'human-review'),
    signalCount(byClassification, 'needs-review', 'review-required', 'review', 'human-review'),
    signalCount(byDecision, 'needs-review', 'review-required', 'review', 'human-review')
  );
  const blocked = Math.max(nonNegativeNumber(summary.blocked), signalCount(byStatus, 'blocked', 'blocked-evidence'), signalCount(byClassification, 'blocked', 'blocked-evidence'), signalCount(byDecision, 'blocked', 'blocked-evidence', 'block'));
  const conflicts = Math.max(nonNegativeNumber(summary.conflicts), signalCount(byStatus, 'conflict', 'conflicts', 'conflict-blocked'), signalCount(byClassification, 'conflict', 'conflicts', 'conflict-blocked'));
  const applied = Math.max(nonNegativeNumber(summary.applied), signalCount(byAction, 'apply'), acceptedClean);
  const skipped = Math.max(nonNegativeNumber(summary.skipped), signalCount(byAction, 'skip'), alreadyApplied + noOp);
  const total = nonNegativeNumber(summary.total) ||
    sumRecord(byStatus) ||
    sumRecord(byClassification) ||
    sumRecord(byDecision) ||
    (classification || decision || status || action ? 1 : 0);
  return {
    total,
    classifications: positiveRecordKeys(byClassification),
    byClassification,
    decisions: positiveRecordKeys(byDecision),
    byDecision,
    noOp,
    stale,
    needsReview,
    blocked,
    conflicts,
    conflictReasonCodes: uniqueStrings([...readStringArray(summary.conflictReasonCodes), ...readStringArray(record.conflictReasonCodes)]),
    conflictKeys: uniqueStrings([...readStringArray(summary.conflictKeys), ...readStringArray(record.conflictKeys)]),
    evidenceIds: uniqueStrings([...readStringArray(summary.evidenceIds), ...readStringArray(record.evidenceIds), ...objectIds(record.evidence)]),
    autoApplyable: Math.max(nonNegativeNumber(summary.autoApplyable), acceptedClean + alreadyApplied),
    autoApplyCandidates: Math.max(nonNegativeNumber(summary.autoApplyCandidates), acceptedClean + alreadyApplied),
    empty: total === 0,
    acceptedClean,
    alreadyApplied,
    applied,
    skipped,
    scripts: nonNegativeNumber(summary.scripts) || readStringArray(summary.scriptIds).length,
    projections: nonNegativeNumber(summary.projections) || readStringArray(summary.projectionIds).length,
    replays: nonNegativeNumber(summary.replays) || readStringArray(summary.replayIds).length,
    statuses: positiveRecordKeys(byStatus),
    byStatus,
    actions: positiveRecordKeys(byAction),
    byAction,
    reasonCodes: uniqueStrings([...readStringArray(summary.reasonCodes), ...readStringArray(record.reasonCodes), ...readStringArray(admission.reasonCodes)]),
    sourcePaths: uniqueStrings([...readStringArray(summary.sourcePaths), ...readStringArray(record.sourcePaths), ...stringArray(record.sourcePath)]),
    scriptIds: uniqueStrings([...readStringArray(summary.scriptIds), ...stringArray(record.scriptId)]),
    projectionIds: uniqueStrings([...readStringArray(summary.projectionIds), ...stringArray(record.projectionId)]),
    replayIds: uniqueStrings([...readStringArray(summary.replayIds), ...stringArray(record.replayId)])
  };
}

function mergeSemanticMergeAdmissionSummaries(entries: readonly SemanticMergeAdmissionQualitySummary[]): SemanticMergeAdmissionQualitySummary {
  const merged = emptySemanticMergeAdmissionSummary();
  for (const entry of entries) {
    if (entry.empty && entry.total === 0) continue;
    addBaseSafeMergeSummary(merged, entry);
    for (const key of ['safe', 'safeWithLosses', 'reviewRequired', 'autoMergeable'] as const) merged[key] += nonNegativeNumber(entry[key]);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
    merged.conflictKeyKinds = uniqueStrings([...merged.conflictKeyKinds, ...entry.conflictKeyKinds]);
    merged.candidateIds = uniqueStrings([...merged.candidateIds, ...entry.candidateIds]);
  }
  merged.empty = merged.total === 0;
  return merged;
}

function mergeJsTsSafeMergeApplySummaries(entries: readonly JsTsSafeMergeApplyQualitySummary[]): JsTsSafeMergeApplyQualitySummary {
  const merged = emptyJsTsSafeMergeApplySummary();
  for (const entry of entries) {
    if (entry.empty && entry.total === 0) continue;
    addBaseSafeMergeSummary(merged, entry);
    for (const key of ['acceptedClean', 'alreadyApplied', 'applied', 'skipped', 'scripts', 'projections', 'replays'] as const) {
      merged[key] += nonNegativeNumber(entry[key]);
    }
    mergeIntoNumberRecord(merged.byStatus, entry.byStatus);
    mergeIntoNumberRecord(merged.byAction, entry.byAction);
    merged.statuses = positiveRecordKeys(merged.byStatus);
    merged.actions = positiveRecordKeys(merged.byAction);
    merged.reasonCodes = uniqueStrings([...merged.reasonCodes, ...entry.reasonCodes]);
    merged.sourcePaths = uniqueStrings([...merged.sourcePaths, ...entry.sourcePaths]);
    merged.scriptIds = uniqueStrings([...merged.scriptIds, ...entry.scriptIds]);
    merged.projectionIds = uniqueStrings([...merged.projectionIds, ...entry.projectionIds]);
    merged.replayIds = uniqueStrings([...merged.replayIds, ...entry.replayIds]);
  }
  merged.empty = merged.total === 0;
  return merged;
}

function addBaseSafeMergeSummary(
  target: FrontierCodexSemanticImportQuality['semanticMergeAdmission'] | FrontierCodexSemanticImportQuality['jsTsSafeMergeApply'],
  source: FrontierCodexSemanticImportQuality['semanticMergeAdmission'] | FrontierCodexSemanticImportQuality['jsTsSafeMergeApply']
): void {
  for (const key of ['total', 'noOp', 'stale', 'needsReview', 'blocked', 'conflicts', 'autoApplyable', 'autoApplyCandidates'] as const) {
    target[key] += nonNegativeNumber(source[key]);
  }
  mergeIntoNumberRecord(target.byClassification, source.byClassification);
  mergeIntoNumberRecord(target.byDecision, source.byDecision);
  target.classifications = positiveRecordKeys(target.byClassification);
  target.decisions = positiveRecordKeys(target.byDecision);
  target.conflictReasonCodes = uniqueStrings([...target.conflictReasonCodes, ...source.conflictReasonCodes]);
  target.conflictKeys = uniqueStrings([...target.conflictKeys, ...source.conflictKeys]);
  target.evidenceIds = uniqueStrings([...target.evidenceIds, ...source.evidenceIds]);
}

function emptySemanticMergeAdmissionSummary(): SemanticMergeAdmissionQualitySummary {
  return {
    total: 0,
    classifications: [],
    byClassification: {},
    decisions: [],
    byDecision: {},
    noOp: 0,
    stale: 0,
    needsReview: 0,
    blocked: 0,
    conflicts: 0,
    conflictReasonCodes: [],
    conflictKeys: [],
    evidenceIds: [],
    autoApplyable: 0,
    autoApplyCandidates: 0,
    empty: true,
    safe: 0,
    safeWithLosses: 0,
    reviewRequired: 0,
    autoMergeable: 0,
    reasonCodes: [],
    conflictKeyKinds: [],
    candidateIds: []
  };
}

function emptyJsTsSafeMergeApplySummary(): JsTsSafeMergeApplyQualitySummary {
  return {
    total: 0,
    classifications: [],
    byClassification: {},
    decisions: [],
    byDecision: {},
    noOp: 0,
    stale: 0,
    needsReview: 0,
    blocked: 0,
    conflicts: 0,
    conflictReasonCodes: [],
    conflictKeys: [],
    evidenceIds: [],
    autoApplyable: 0,
    autoApplyCandidates: 0,
    empty: true,
    acceptedClean: 0,
    alreadyApplied: 0,
    applied: 0,
    skipped: 0,
    scripts: 0,
    projections: 0,
    replays: 0,
    statuses: [],
    byStatus: {},
    actions: [],
    byAction: {},
    reasonCodes: [],
    sourcePaths: [],
    scriptIds: [],
    projectionIds: [],
    replayIds: []
  };
}

function directSafeMergeValues(value: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isObject(value)) return [];
  const out: unknown[] = [];
  for (const key of keys) {
    const entry = value[key];
    if (Array.isArray(entry)) out.push(...entry);
    else if (entry !== undefined) out.push(entry);
  }
  return out;
}

function addSignalCount(record: Record<string, number>, key: string): void {
  const normalized = normalizeSafeMergeSignal(key);
  if (!normalized) return;
  record[normalized] = (record[normalized] ?? 0) + 1;
}

function signalCount(record: Record<string, number>, ...keys: string[]): number {
  const aliases = new Set(keys.map(normalizeSafeMergeSignal));
  let count = 0;
  for (const [key, value] of Object.entries(record)) {
    if (aliases.has(normalizeSafeMergeSignal(key))) count += nonNegativeNumber(value);
  }
  return count;
}

function normalizeSafeMergeSignal(value: string): string {
  const normalized = value.trim().replace(/_/g, '-').toLowerCase();
  const compact = normalized.replace(/-/g, '');
  if (compact === 'safewithlosses') return 'safe-with-losses';
  if (compact === 'acceptedclean') return 'accepted-clean';
  if (compact === 'alreadyapplied') return 'already-applied';
  if (compact === 'noop' || compact === 'nochange' || compact === 'nooperation' || compact === 'unchanged') return 'no-op';
  if (compact === 'needsreview') return 'needs-review';
  if (compact === 'reviewrequired') return 'review-required';
  if (compact === 'humanreview') return 'human-review';
  if (compact === 'blockedevidence') return 'blocked-evidence';
  if (compact === 'conflictblocked') return 'conflict-blocked';
  if (compact === 'automergeable') return 'auto-mergeable';
  if (compact === 'automergecandidate') return 'auto-merge-candidate';
  return normalized;
}

function mergeNumberRecords(...records: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const record of records) mergeIntoNumberRecord(out, record);
  return out;
}

function mergeIntoNumberRecord(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    const normalized = normalizeSafeMergeSignal(key);
    if (!normalized) continue;
    target[normalized] = (target[normalized] ?? 0) + nonNegativeNumber(value);
  }
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + nonNegativeNumber(value), 0);
}

function positiveRecordKeys(record: Record<string, number>): string[] {
  return Object.keys(record).filter((key) => nonNegativeNumber(record[key]) > 0).sort();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return typeof value === 'string' && value.trim() ? [value] : [];
}

function objectIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => isObject(entry) ? stringArray(entry.id) : stringArray(entry))
    : [];
}
