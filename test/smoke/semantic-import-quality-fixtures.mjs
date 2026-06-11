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
      evidenceIds: ['evidence_semantic_edit_script']
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
      evidenceIds: ['evidence_semantic_edit_script_clean']
    }),
    semanticEditProjections: semanticEditProjectionSummary({
      file: 'src/runtime/edit-script-clean.ts',
      symbolName: 'cleanRun',
      deletedBytes: 8,
      replacementBytes: 10,
      workerMismatch: false
    })
  };
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
    editContentHashes: [`hash:edit-content-${suffix}`],
    projectedSourceMatchesWorker: input.workerMismatch ? 0 : 1,
    projectedSourceMismatchesWorker: input.workerMismatch ? 1 : 0,
    projectedSourceMatchUnknown: 0,
    reasonCodes: [],
    admission: { projected: 1 }
  };
}
