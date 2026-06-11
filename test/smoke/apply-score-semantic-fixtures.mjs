export function emptySemanticImport() {
  return {
    total: 0,
    selected: 0,
    eligible: 0,
    omitted: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    sourceMapCount: 0,
    sourceMapMappingCount: 0,
    lossCount: 0,
    lossesBySeverity: {},
    semanticIndex: { documents: 0, symbols: 0, occurrences: 0, relations: 0, facts: 0 },
    dependencies: { total: 0, predicates: [] },
    semanticSidecars: { total: 0, symbols: 0, ownershipRegions: 0, patchHints: 0, empty: 1 },
    universalAstLayers: { total: 0, names: [], ids: [], byName: {}, empty: true },
    proofSpec: { total: 0, obligations: 0, failed: 0, stale: 0, open: 0, unknown: 0, discharged: 0 },
    paradigmSemantics: { total: 0, groups: [], loweringRecords: 0 },
    readiness: {},
    semanticImportExpected: true,
    semanticImportExpectedSatisfied: false,
    semanticImportExpectedMissingReasonCodes: ['expected-semantic-import-empty']
  };
}

export function weakPatchHintSemanticImport(readySemanticImport) {
  const semanticImport = clone(readySemanticImport);
  semanticImport.semanticSidecars.patchHints = 0;
  semanticImport.semanticImportExpected = true;
  semanticImport.semanticImportExpectedSatisfied = false;
  semanticImport.semanticImportExpectedMissingReasonCodes = ['missing-patch-hints'];
  return semanticImport;
}

export function semanticEditConflictImport(readySemanticImport) {
  const semanticImport = clone(readySemanticImport);
  semanticImport.semanticEditScripts = {
    total: 1,
    operations: 1,
    autoMergeCandidates: 0,
    portable: 0,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: 1,
    autoApplyCandidates: 0,
    byStatus: { conflict: 1 },
    byKind: { replaceBody: 1 },
    admission: { conflict: 1 },
    actions: ['block'],
    reasonCodes: ['head-anchor-changed-since-base'],
    conflictKeys: ['region:source#src/apply.ts#body#apply'],
    evidenceIds: ['evidence_semantic_edit_conflict'],
    empty: false
  };
  return semanticImport;
}

export function semanticEditPortableImport(readySemanticImport) {
  const semanticImport = clone(readySemanticImport);
  semanticImport.semanticEditScripts = {
    total: 1,
    operations: 1,
    autoMergeCandidates: 1,
    portable: 1,
    alreadyApplied: 0,
    needsPort: 0,
    conflicts: 0,
    stale: 0,
    blocked: 0,
    candidates: 0,
    reviewRequired: 0,
    autoApplyCandidates: 1,
    byStatus: { portable: 1 },
    byKind: { replaceBody: 1 },
    admission: { 'auto-merge-candidate': 1, portable: 1 },
    actions: ['apply'],
    reasonCodes: [],
    conflictKeys: [],
    evidenceIds: ['evidence_semantic_edit_portable'],
    empty: false
  };
  return semanticImport;
}

export function semanticEditBlockedProjectionImport(readySemanticImport) {
  const semanticImport = semanticEditPortableImport(readySemanticImport);
  semanticImport.semanticEditProjections = semanticEditProjection({
    projected: 0,
    blocked: 1,
    autoMergeCandidates: 0,
    appliedOperations: 0,
    skippedOperations: 1,
    editCount: 0,
    appliedEditCount: 0,
    alreadyAppliedEditCount: 0,
    deletedBytes: 0,
    replacementBytes: 0,
    statusCounts: { blocked: 1 },
    admission: { blocked: 1 },
    reasonCodes: ['head-span-hash-mismatch:semantic_edit_op_apply']
  });
  return semanticImport;
}

export function semanticEditProjectedPortableImport(readySemanticImport) {
  const semanticImport = semanticEditPortableImport(readySemanticImport);
  semanticImport.semanticEditProjections = semanticEditProjection();
  return semanticImport;
}

export function semanticEditMismatchProjectionImport(readySemanticImport) {
  const semanticImport = semanticEditProjectedPortableImport(readySemanticImport);
  semanticImport.semanticEditProjections.projectedSourceMatchesWorker = 0;
  semanticImport.semanticEditProjections.projectedSourceMismatchesWorker = 1;
  semanticImport.semanticEditProjections.reasonCodes = ['projected-source-worker-hash-mismatch'];
  return semanticImport;
}

export function semanticEditMixedReviewImport(readySemanticImport) {
  const semanticImport = semanticEditProjectedPortableImport(readySemanticImport);
  semanticImport.semanticEditScripts.total = 4;
  semanticImport.semanticEditScripts.reviewRequired = 3;
  semanticImport.semanticEditScripts.admission = { 'auto-merge-candidate': 1, 'evidence-only': 3 };
  semanticImport.semanticEditScripts.actions = ['run-gates-and-apply', 'record-evidence'];
  semanticImport.semanticEditScripts.reasonCodes = ['head-source-matches-base'];
  return semanticImport;
}

function semanticEditProjection(overrides = {}) {
  return {
    total: 1,
    projected: 1,
    blocked: 0,
    autoMergeCandidates: 1,
    appliedOperations: 1,
    skippedOperations: 0,
    editCount: 1,
    appliedEditCount: 1,
    alreadyAppliedEditCount: 0,
    deletedBytes: 4,
    replacementBytes: 4,
    anchorKeys: ['source#src/apply.ts#function#apply'],
    conflictKeys: ['region:source#src/apply.ts#function#apply'],
    symbolNames: ['apply'],
    sourcePaths: ['src/apply.ts'],
    semanticKeys: ['semantic-edit:replaceBody:modified:function:apply'],
    semanticIdentityHashes: ['hash:semantic-identity-apply'],
    sourceIdentityHashes: ['hash:source-identity-apply'],
    editContentHashes: ['hash:edit-content-apply'],
    projectedSourceMatchesWorker: 1,
    projectedSourceMismatchesWorker: 0,
    projectedSourceMatchUnknown: 0,
    statusCounts: { projected: 1 },
    admission: { 'auto-merge-candidate': 1 },
    reasonCodes: [],
    empty: false,
    ...overrides
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
