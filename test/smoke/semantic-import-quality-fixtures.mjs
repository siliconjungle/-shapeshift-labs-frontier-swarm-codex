export function emptyExpectedSemanticImportSummary() {
  return {
    total: 0,
    selected: 0,
    eligible: 0,
    imported: 0,
    sourceMapMappingCount: 0,
    semanticIndex: { symbols: 0 },
    semanticSidecars: { ownershipRegions: 0, patchHints: 0 },
    dependencies: { total: 0, predicates: [] },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: false,
    semanticImportExpectedMissingReasonCodes: ['expected-semantic-import-empty']
  };
}

export function factSemanticImportSummary() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 2, facts: 3 },
    semanticFacts: {
      total: 3,
      predicates: ['controlFlow', 'effect', 'mutation'],
      byPredicate: { controlFlow: 1, effect: 1, mutation: 1 }
    },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    dependencies: { total: 1, predicates: ['calls'] },
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: true,
    semanticImportExpectedMissingReasonCodes: []
  };
}

export function zeroLineageSemanticImportSummary() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 2, facts: 0 },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    dependencies: { total: 1, predicates: ['calls'] },
    universalAstLayers: { total: 1, names: ['program'], ids: ['layer:program'] },
    semanticLineage: emptySemanticLineage(),
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: true,
    semanticImportExpectedMissingReasonCodes: []
  };
}

export function editScriptSemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    semanticEditScripts: semanticEditScriptSummary({
      total: 2,
      conflicts: 1,
      reviewRequired: 1,
      byStatus: { conflict: 1, portable: 1 },
      admission: { conflict: 1, 'auto-merge-candidate': 1 },
      actions: ['block', 'apply'],
      reasonCodes: ['head-anchor-changed-since-base'],
      conflictKeys: ['region:source#src/runtime/edit-script.ts#body#run'],
      evidenceIds: ['evidence_semantic_edit_script'],
      symbolName: 'run'
    }),
    semanticEditProjections: semanticEditProjectionSummary({
      file: 'src/runtime/edit-script.ts',
      symbolName: 'run',
      deletedBytes: 12,
      replacementBytes: 16,
      workerMismatch: true
    })
  };
}

export function cleanEditScriptSemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    semanticEditScripts: semanticEditScriptSummary({
      total: 1,
      byStatus: { portable: 1 },
      admission: { 'auto-merge-candidate': 1 },
      actions: ['apply'],
      evidenceIds: ['evidence_semantic_edit_script_clean'],
      symbolName: 'cleanRun'
    }),
    semanticEditProjections: semanticEditProjectionSummary({
      file: 'src/runtime/edit-script-clean.ts',
      symbolName: 'cleanRun',
      deletedBytes: 8,
      replacementBytes: 10,
      workerMismatch: false
    }),
    semanticEditReplays: semanticEditReplaySummary({
      file: 'src/runtime/edit-script-clean.ts',
      symbolName: 'cleanRun'
    })
  };
}

export function acceptedSafeMergeSemanticImportSummary() {
  return safeMergeSemanticImportSummary({
    mergeAdmission: semanticMergeAdmissionSummary({
      classification: 'safe',
      decision: 'auto-mergeable',
      safe: 1,
      autoMergeable: 1,
      autoApplyable: 1,
      candidateId: 'candidate_safe'
    }),
    apply: safeMergeApplySummary({
      classification: 'accepted-clean',
      status: 'accepted-clean',
      decision: 'apply',
      action: 'apply',
      acceptedClean: 1,
      applied: 1,
      autoApplyable: 1
    })
  });
}

export function reviewSafeMergeSemanticImportSummary() {
  return safeMergeSemanticImportSummary({
    mergeAdmission: semanticMergeAdmissionSummary({
      classification: 'review-required',
      decision: 'review-required',
      reviewRequired: 1,
      needsReview: 1,
      reasonCodes: ['dynamic-effect-review-required'],
      candidateId: 'candidate_review'
    }),
    apply: safeMergeApplySummary({
      classification: 'needs-review',
      status: 'needs-review',
      decision: 'human-review',
      action: 'human-review',
      needsReview: 1,
      reasonCodes: ['safe-merge-review-required']
    })
  });
}

export function blockedSafeMergeSemanticImportSummary() {
  return safeMergeSemanticImportSummary({
    mergeAdmission: semanticMergeAdmissionSummary({
      classification: 'blocked',
      decision: 'blocked',
      blocked: 1,
      reasonCodes: ['blocked-evidence'],
      candidateId: 'candidate_blocked'
    }),
    apply: safeMergeApplySummary({
      classification: 'blocked',
      status: 'blocked',
      decision: 'block',
      action: 'block',
      blocked: 1,
      reasonCodes: ['safe-merge-apply-blocked']
    })
  });
}

export function noopSafeMergeSemanticImportSummary() {
  return safeMergeSemanticImportSummary({
    apply: safeMergeApplySummary({
      classification: 'no-op',
      status: 'none',
      decision: 'no-op',
      action: 'none',
      noOp: 1,
      skipped: 1
    })
  });
}

export function staleSafeMergeSemanticImportSummary() {
  return safeMergeSemanticImportSummary({
    apply: safeMergeApplySummary({
      classification: 'stale',
      status: 'stale',
      decision: 'rerun-semantic-import',
      action: 'rerun-semantic-import',
      stale: 1,
      reasonCodes: ['current-source-hash-mismatch']
    })
  });
}

function emptySemanticLineage() {
  return {
    total: 0,
    inferredEvents: 0,
    moved: 0,
    renamed: 0,
    deleted: 0,
    ambiguous: 0,
    unmatchedAdded: 0,
    unchangedAnchors: 1,
    beforeSymbols: 2,
    afterSymbols: 2,
    blocked: 0,
    needsReview: 0,
    ready: 0,
    readiness: {},
    eventKinds: [],
    reasonCodes: [],
    reviewRequired: false,
    empty: false
  };
}

function safeMergeSemanticImportSummary({ mergeAdmission, apply }) {
  return {
    ...factSemanticImportSummary(),
    ...(mergeAdmission ? { semanticMergeAdmissions: mergeAdmission } : {}),
    ...(apply ? { jsTsSafeMergeApply: apply } : {})
  };
}

function semanticMergeAdmissionSummary(overrides) {
  const classification = overrides.classification;
  const decision = overrides.decision;
  const conflictKeys = overrides.conflictKeys ?? ['symbol:src/runtime/safe.ts#run'];
  return {
    total: 1,
    classifications: [classification],
    byClassification: { [classification]: 1 },
    decisions: [decision],
    byDecision: { [decision]: 1 },
    noOp: overrides.noOp ?? 0,
    stale: overrides.stale ?? 0,
    needsReview: overrides.needsReview ?? 0,
    blocked: overrides.blocked ?? 0,
    conflicts: overrides.conflicts ?? 0,
    conflictReasonCodes: overrides.conflictReasonCodes ?? [],
    conflictKeys,
    evidenceIds: [`evidence_${classification}`],
    autoApplyable: overrides.autoApplyable ?? 0,
    autoApplyCandidates: overrides.autoApplyCandidates ?? overrides.autoApplyable ?? 0,
    empty: false,
    safe: overrides.safe ?? 0,
    safeWithLosses: overrides.safeWithLosses ?? 0,
    reviewRequired: overrides.reviewRequired ?? 0,
    autoMergeable: overrides.autoMergeable ?? 0,
    reasonCodes: overrides.reasonCodes ?? [],
    conflictKeyKinds: ['symbol'],
    candidateIds: [overrides.candidateId]
  };
}

function safeMergeApplySummary(overrides) {
  const classification = overrides.classification;
  const status = overrides.status;
  const decision = overrides.decision;
  const action = overrides.action;
  return {
    total: 1,
    classifications: [classification],
    byClassification: { [classification]: 1 },
    decisions: [decision],
    byDecision: { [decision]: 1 },
    noOp: overrides.noOp ?? 0,
    stale: overrides.stale ?? 0,
    needsReview: overrides.needsReview ?? 0,
    blocked: overrides.blocked ?? 0,
    conflicts: overrides.conflicts ?? 0,
    conflictReasonCodes: overrides.conflictReasonCodes ?? [],
    conflictKeys: overrides.conflictKeys ?? [],
    evidenceIds: [`evidence_apply_${classification}`],
    autoApplyable: overrides.autoApplyable ?? 0,
    autoApplyCandidates: overrides.autoApplyCandidates ?? overrides.autoApplyable ?? 0,
    empty: false,
    acceptedClean: overrides.acceptedClean ?? 0,
    alreadyApplied: overrides.alreadyApplied ?? 0,
    applied: overrides.applied ?? 0,
    skipped: overrides.skipped ?? 0,
    scripts: 1,
    projections: 1,
    replays: 1,
    statuses: [status],
    byStatus: { [status]: 1 },
    actions: [action],
    byAction: { [action]: 1 },
    reasonCodes: overrides.reasonCodes ?? [],
    sourcePaths: ['src/runtime/safe.ts'],
    scriptIds: ['safe_merge_script'],
    projectionIds: ['safe_merge_projection'],
    replayIds: ['safe_merge_replay']
  };
}

function semanticEditScriptSummary(overrides) {
  return {
    total: overrides.total,
    operations: overrides.total,
    autoMergeCandidates: 1,
    portable: 1,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: overrides.conflicts ?? 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: overrides.reviewRequired ?? 0,
    autoApplyCandidates: 1,
    byStatus: overrides.byStatus,
    byKind: { replaceBody: overrides.total },
    admission: overrides.admission,
    actions: overrides.actions,
    reasonCodes: overrides.reasonCodes ?? [],
    conflictKeys: overrides.conflictKeys ?? [],
    evidenceIds: overrides.evidenceIds,
    semanticKeys: semanticEditIdentityValues(overrides.symbolName, 'semantic-edit'),
    semanticIdentityHashes: semanticEditIdentityValues(overrides.symbolName, 'hash:semantic-identity'),
    sourceIdentityHashes: semanticEditIdentityValues(overrides.symbolName, 'hash:source-identity'),
    operationContentHashes: semanticEditIdentityValues(overrides.symbolName, 'hash:operation-content'),
    empty: false
  };
}

function semanticEditProjectionSummary(input) {
  const suffix = input.symbolName === 'cleanRun' ? 'clean' : input.symbolName;
  return {
    projected: 1,
    blocked: 0,
    editCount: 1,
    appliedEditCount: 1,
    alreadyAppliedEditCount: 0,
    deletedBytes: input.deletedBytes,
    replacementBytes: input.replacementBytes,
    anchorKeys: [`source#${input.file}#function#${input.symbolName}`],
    conflictKeys: [`region:source#${input.file}#body#${input.symbolName}`],
    symbolNames: [input.symbolName],
    sourcePaths: [input.file],
    semanticKeys: [`semantic-edit:replaceBody:modified:function:${input.symbolName}`],
    semanticIdentityHashes: [`hash:semantic-identity-${suffix}`],
    sourceIdentityHashes: [`hash:source-identity-${suffix}`],
    operationContentHashes: [`hash:operation-content-${suffix}`],
    editContentHashes: [`hash:edit-content-${suffix}`],
    semanticTransformKeys: [`transform:javascript:typescript:${input.symbolName}`],
    semanticTransformIdentityHashes: [`hash:transform-identity-${suffix}`],
    semanticTransformContentHashes: [`hash:transform-content-${suffix}`],
    projectionIdentityHashes: [`hash:projection-identity-${suffix}`],
    transformSourceLanguages: ['javascript'],
    transformTargetLanguages: ['typescript'],
    transformSourcePaths: [input.file],
    transformTargetPaths: [input.file],
    projectedSourceMatchesWorker: input.workerMismatch ? 0 : 1,
    projectedSourceMismatchesWorker: input.workerMismatch ? 1 : 0,
    projectedSourceMatchUnknown: 0,
    reasonCodes: [],
    admission: { projected: 1 }
  };
}

function semanticEditReplaySummary(input) {
  const suffix = input.symbolName === 'cleanRun' ? 'clean' : input.symbolName;
  return {
    total: 1,
    acceptedClean: 1,
    alreadyApplied: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    needsPort: 0,
    evidenceOnly: 0,
    appliedOperations: 1,
    skippedOperations: 0,
    editCount: 1,
    appliedEditCount: 1,
    alreadyAppliedEditCount: 0,
    statusCounts: { 'accepted-clean': 1 },
    admission: { 'accepted-clean': 1 },
    actions: ['apply'],
    operationIds: [`semantic_edit_op_${suffix}`],
    semanticKeys: [`semantic-edit:replaceBody:modified:function:${input.symbolName}`],
    semanticIdentityHashes: [`hash:semantic-identity-${suffix}`],
    sourceIdentityHashes: [`hash:source-identity-${suffix}`],
    editContentHashes: [`hash:edit-content-${suffix}`],
    sourcePaths: [input.file],
    symbolNames: [input.symbolName],
    currentHashes: [`hash:current-${suffix}`],
    outputHashes: [`hash:output-${suffix}`],
    reasonCodes: [],
    empty: false
  };
}

function semanticEditIdentityValues(symbolName, prefix) {
  if (!symbolName) return [];
  const suffix = symbolName === 'cleanRun' ? 'clean' : symbolName;
  if (prefix === 'semantic-edit') return [`semantic-edit:replaceBody:modified:function:${symbolName}`];
  return [`${prefix}-${suffix}`];
}
