import type {
  FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND,
  FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION
} from './constants.js';

export interface FrontierCodexSemanticImportOptions {
  enabled?: boolean;
  maxFiles?: number;
  maxBytes?: number;
  include?: readonly string[];
  exclude?: readonly string[];
  languages?: Readonly<Record<string, string>>;
}

export interface FrontierCodexSemanticImportRecord {
  path: string;
  requestedPath?: string;
  language?: string;
  status: 'imported' | 'skipped' | 'error';
  reason?: string;
  bytes?: number;
  importId?: string;
  universalAstHash?: string;
  nativeAstId?: string;
  nativeSourceId?: string;
  sourceMapCount?: number;
  sourceMapMappingCount?: number;
  evidenceCount?: number;
  lossCount?: number;
  losses?: unknown;
  semanticIndex?: {
    documents: number;
    symbols: number;
    occurrences: number;
    relations: number;
    facts: number;
  };
  dependencies?: FrontierCodexSemanticDependencySummary;
  semanticSidecar?: unknown;
  universalAstLayers?: FrontierCodexUniversalAstLayerSummary;
  proofSpec?: FrontierCodexProofSpecSummary;
  paradigmSemantics?: FrontierCodexParadigmSemanticsSummary;
  sourceProjection?: unknown;
  nativeCompile?: unknown;
  mergeCandidate?: unknown;
  semanticSlice?: unknown;
  semanticSliceAdmission?: unknown;
  error?: string;
}

export interface FrontierCodexSemanticDependencySummary {
  total: number;
  calls: number;
  uses: number;
  references: number;
  imports: number;
  depends: number;
  extends: number;
  implements: number;
  includes: number;
  requires: number;
  byPredicate: Record<string, number>;
  predicates: string[];
  ids: string[];
  sourceSymbolIds: string[];
  targetSymbolIds: string[];
}

export interface FrontierCodexUniversalAstLayerSummary {
  total: number;
  names: string[];
  ids: string[];
  byName: Record<string, number>;
  empty: boolean;
}

export interface FrontierCodexProofSpecSummary {
  total: number;
  ids: string[];
  contracts: number;
  refinements: number;
  invariants: number;
  termination: number;
  temporal: number;
  obligations: number;
  artifacts: number;
  assumptions: number;
  evidence: number;
  discharged: number;
  failed: number;
  open: number;
  unknown: number;
  stale: number;
  assumed: number;
  contractKinds: string[];
  artifactKinds: string[];
  byStatus: Record<string, number>;
  byContractKind: Record<string, number>;
  byArtifactKind: Record<string, number>;
  empty: boolean;
}

export interface FrontierCodexParadigmSemanticsSummary {
  total: number;
  ids: string[];
  groups: string[];
  kinds: string[];
  evidence: number;
  bindingScopes: number;
  bindings: number;
  patterns: number;
  typeConstraints: number;
  evaluationModels: number;
  memoryLocations: number;
  effectRegions: number;
  controlRegions: number;
  logicPrograms: number;
  actorSystems: number;
  stackEffects: number;
  arrayShapes: number;
  numericKernels: number;
  dataflowNetworks: number;
  clockModels: number;
  objectModels: number;
  macroExpansions: number;
  reflectionBoundaries: number;
  loweringRecords: number;
  byGroup: Record<string, number>;
  byKind: Record<string, number>;
  hasRuntimeSemantics: boolean;
  hasLogicSemantics: boolean;
  hasStackSemantics: boolean;
  hasArraySemantics: boolean;
  hasMacroOrReflection: boolean;
  hasLowering: boolean;
  empty: boolean;
}

export interface FrontierCodexSemanticImportSidecar {
  kind: typeof FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_VERSION;
  generatedAt: number;
  jobId: string;
  taskId?: string;
  records: FrontierCodexSemanticImportRecord[];
  summary: {
    total: number;
    selected: number;
    selection: {
      candidates: number;
      ignored: number;
      includeFiltered: number;
      excludeFiltered: number;
      unsupportedLanguage: number;
    };
    eligible: number;
    omitted: number;
    maxFiles: number;
    imported: number;
    skipped: number;
    errors: number;
    sourceMapCount: number;
    sourceMapMappingCount: number;
    lossCount: number;
    lossesBySeverity: Record<string, number>;
    semanticIndex: {
      documents: number;
      symbols: number;
      occurrences: number;
      relations: number;
      facts: number;
    };
    dependencies: FrontierCodexSemanticDependencySummary;
    semanticSidecars: {
      total: number;
      symbols: number;
      ownershipRegions: number;
      patchHints: number;
      empty: number;
    };
    universalAstLayers: FrontierCodexUniversalAstLayerSummary;
    proofSpec: FrontierCodexProofSpecSummary;
    paradigmSemantics: FrontierCodexParadigmSemanticsSummary;
    sourceProjections: {
      total: number;
      preserved: number;
      stubs: number;
      ready: number;
      needsReview: number;
      blocked: number;
    };
    nativeCompiles: {
      total: number;
      emitted: number;
      preserved: number;
      targetStubs: number;
      ready: number;
      needsReview: number;
      blocked: number;
    };
    semanticSliceAdmissions: {
      total: number;
      admitted: number;
      prioritized: number;
      rejected: number;
      averageScore: number;
      byAction: Record<string, number>;
      byRisk: Record<string, number>;
    };
    readiness: Record<string, number>;
    semanticImportExpected: boolean;
    semanticImportExpectedSatisfied: boolean;
    semanticImportExpectedMissingReasonCodes: string[];
  };
}

export interface FrontierCodexSemanticImportQuality {
  expected: boolean;
  expectedSatisfied: boolean;
  expectedMissingReasonCodes: string[];
  present: boolean;
  empty: boolean;
  selected: number;
  eligible: number;
  imported: number;
  symbols: number;
  ownershipRegions: number;
  patchHints: number;
  dependencyRelations: number;
  dependencyPredicates: string[];
  sourceMapMappings: number;
  universalAstLayers: number;
  universalAstLayerNames: string[];
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  paradigmSemanticsRecords: number;
  paradigmSemanticsGroups: number;
  paradigmSemanticsLoweringRecords: number;
  warnings: string[];
}
