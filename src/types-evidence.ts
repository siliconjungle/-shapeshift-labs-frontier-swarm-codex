import type {
  FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_KIND,
  FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_VERSION,
  FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_KIND,
  FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_VERSION,
  FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND,
  FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION,
  FRONTIER_SWARM_CODEX_PATCH_INTENT_KIND,
  FRONTIER_SWARM_CODEX_PATCH_INTENT_VERSION
} from './constants.js';
import type { FrontierCodexHandoffArtifact } from './types-collection.js';
import type {
  FrontierCodexSemanticEditAdmissionDecision,
  FrontierCodexSemanticEditScriptAdmissionSummary,
  FrontierCodexSemanticEditScriptSummary
} from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import type { FrontierCodexSemanticImportQuality, FrontierCodexSemanticImportSidecar } from './types-semantic.js';

export interface FrontierCodexPatchHunkSummary {
  file?: string;
  header: string;
  oldStart?: number;
  oldLines?: number;
  newStart?: number;
  newLines?: number;
}

export interface FrontierCodexTraceSummary {
  shardCount: number;
  rowWindowCount: number;
  hypothesisCount: number;
  executableOwnershipRegionCount: number;
  focusedTestCount: number;
  referenceEvidenceCount: number;
  divergenceCount: number;
  openDivergenceCount: number;
}

export interface FrontierCodexContextBudgetReport {
  kind: typeof FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_KIND;
  version: typeof FRONTIER_SWARM_CODEX_CONTEXT_BUDGET_VERSION;
  generatedAt: number;
  jobId: string;
  taskId: string;
  lane: string;
  status: 'ok' | 'warning' | 'failed';
  action: 'allow' | 'warn' | 'fail-before-launch' | 'fail-after-run';
  options: {
    enabled: boolean;
    mode: 'off' | 'warn' | 'fail';
    warnPromptBytes?: number;
    maxPromptBytes?: number;
    warnEstimatedInputTokens?: number;
    maxEstimatedInputTokens?: number;
    warnActualInputTokens?: number;
    maxActualInputTokens?: number;
    maxSourceRefs?: number;
    maxTargetRefs?: number;
    maxWorkspaceIncludes?: number;
  };
  measured: {
    promptBytes: number;
    promptChars: number;
    estimatedInputTokens: number;
    sourceRefCount: number;
    targetRefCount: number;
    allowedWriteCount: number;
    workspaceIncludeCount: number;
    workspaceMode: string;
  };
  usage?: {
    source: string;
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  warnings: string[];
  errors: string[];
}

export interface FrontierCodexJobEvidenceSummary {
  kind: typeof FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION;
  generatedAt: number;
  jobId: string;
  taskId: string;
  lane: string;
  status: string;
  mergeReadiness: string;
  disposition: string;
  riskLevel: string;
  changedPaths: string[];
  changedRegions: string[];
  ownershipViolations: string[];
  patchPath?: string;
  mergeBundlePath: string;
  patchIntentPath?: string;
  semanticImportPath?: string;
  evidencePaths: string[];
  handoffArtifacts: FrontierCodexHandoffArtifact[];
  commands: {
    passed: Array<{ name: string; command: string[]; status?: number }>;
    failed: Array<{ name: string; command: string[]; status?: number }>;
  };
  patchHunks: FrontierCodexPatchHunkSummary[];
  readyToPortHunkCount: number;
  semanticImport?: FrontierCodexSemanticImportSidecar['summary'];
  semanticImportQuality?: FrontierCodexSemanticImportQuality;
  semanticEditAdmission?: FrontierCodexSemanticEditAdmissionDecision;
  contextBudget?: FrontierCodexContextBudgetReport;
  traceSummary?: FrontierCodexTraceSummary;
  sourceCitations: Array<{ path: string; kind: string; language?: string; hash?: string }>;
  metadata?: Record<string, unknown>;
}

export interface FrontierCodexPatchIntent {
  kind: typeof FRONTIER_SWARM_CODEX_PATCH_INTENT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_PATCH_INTENT_VERSION;
  generatedAt: number;
  jobId: string;
  taskId: string;
  lane: string;
  changedPaths: string[];
  changedRegions: string[];
  intent: string;
  why: string;
  riskLevel: string;
  mergeReadiness: string;
  disposition: string;
  safeToPortManually: boolean;
  verification: Array<{ name: string; command: string[]; status?: number; required: boolean }>;
  evidencePaths: string[];
  semanticImportQuality: FrontierCodexSemanticImportQuality;
  contextBudget?: FrontierCodexContextBudgetReport;
  patchHunks: FrontierCodexPatchHunkSummary[];
  warnings: string[];
}

export interface FrontierCodexLogSummary {
  eventsPath: string;
  stderrPath: string;
  eventBytes: number;
  stderrBytes: number;
  eventBytesWritten: number;
  stderrBytesWritten: number;
  eventBytesTruncated: number;
  stderrBytesTruncated: number;
}

export interface FrontierCodexSemanticEditAdmissionSummary {
  statusCounts: Record<string, number>;
  statuses: string[];
  autoMergeCandidateCount: number;
  cleanEligibleCount: number;
}

export interface FrontierCodexCompactDashboard {
  kind: typeof FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_KIND;
  version: typeof FRONTIER_SWARM_CODEX_COMPACT_DASHBOARD_VERSION;
  generatedAt: number;
  runDir: string;
  total: number;
  activeJobs: number;
  usefulPatchCount: number;
  stalePatchCount: number;
  duplicateDiscoveryCount: number;
  semanticEditAdmission: FrontierCodexSemanticEditAdmissionSummary;
  semanticEditScriptAdmission: FrontierCodexSemanticEditScriptAdmissionSummary;
  tournament: {
    strategyCount: number;
    gameCount: number;
    matchCount: number;
    averageScore: number;
    topStrategyId?: string;
    topScore?: number;
    outcomeCounts: Record<string, number>;
  };
  semanticImport: {
    expected: boolean;
    expectedSatisfiedCount: number;
    expectedUnsatisfiedCount: number;
    expectedMissingReasonCodes: string[];
    selectedCount: number;
    eligibleCount: number;
    importedCount: number;
    candidateCount: number;
    presentCount: number;
    emptyCount: number;
    weakCount: number;
    warningCount: number;
    warnings: string[];
    symbolCount: number;
    ownershipRegionCount: number;
    patchHintCount: number;
    semanticFactCount: number;
    semanticFactPredicates: string[];
    semanticFactSummary: Record<string, number>;
    dependencyRelationCount: number;
    dependencyPredicates: string[];
    universalAstLayerCount: number;
    universalAstLayerNames: string[];
    proofSpecObligations: number;
    proofSpecFailedObligations: number;
    paradigmSemanticsRecords: number;
    paradigmSemanticsGroups: number;
    paradigmSemanticsLoweringRecords: number;
    semanticLineageEvents: number;
    semanticLineageMoved: number;
    semanticLineageRenamed: number;
    semanticLineageDeleted: number;
    semanticLineageAmbiguous: number;
    semanticLineageBlocked: number;
    semanticLineageNeedsReview: number;
    semanticLineageEventKinds: string[];
    semanticLineageReasonCodes: string[];
    semanticEditScripts: FrontierCodexSemanticEditScriptSummary;
    semanticEditProjections: FrontierCodexSemanticEditProjectionSummary;
    semanticEditAdmission: FrontierCodexSemanticEditAdmissionSummary;
    semanticEditScriptAdmission: FrontierCodexSemanticEditScriptAdmissionSummary;
  };
  trace: {
    shardCount: number;
    jobsWithTraceShards: number;
    rowWindowCount: number;
    hypothesisCount: number;
    executableOwnershipRegionCount: number;
    focusedTestCount: number;
    referenceEvidenceCount: number;
    divergenceCount: number;
    openDivergenceCount: number;
  };
  contextBudget: {
    warningCount: number;
    failedCount: number;
    jobsWithActualUsage: number;
    maxPromptBytes: number;
    maxEstimatedInputTokens: number;
    maxActualInputTokens: number;
    warnings: string[];
  };
  evidence: {
    readyToApply: number;
    needsHumanPort: number;
    failedEvidence: number;
    averageMergeScore: number;
  };
  topJobs: Array<{
    jobId: string;
    lane?: string;
    disposition: string;
    mergeScore: number;
    changedPaths: string[];
    semanticImportQuality?: FrontierCodexSemanticImportQuality;
    semanticEditAdmission?: FrontierCodexSemanticEditAdmissionDecision;
    contextBudget?: FrontierCodexContextBudgetReport;
    traceSummary?: FrontierCodexTraceSummary;
    staleAgainstHead: boolean;
    duplicateGroupId?: string;
    evidencePaths: string[];
  }>;
}
