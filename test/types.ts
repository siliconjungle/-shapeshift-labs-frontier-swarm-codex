import {
  applyCodexSwarmCollection,
  buildCodexArgs,
  classifySemanticEditScriptAdmission,
  collectCodexSwarmRun,
  createCodexResourceAllocation,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  createSwarmWorkspaceManifest,
  discoverCodexHandoffArtifacts,
  estimateCodexModelCost,
  continueCodexSwarmLoop,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  summarizeSemanticEditReplay,
  type FrontierCodexContinuationResult,
  type FrontierCodexHandoffArtifact,
  type FrontierCodexWorkspacePlan,
  type FrontierCodexWorkspaceManifest,
  type FrontierCodexSwarmCliInput,
  type FrontierCodexCollectResult,
  type FrontierCodexApplyResult,
  type FrontierCodexSemanticEditAdmissionDecision,
  type FrontierCodexSemanticEditReplaySummary,
  type FrontierCodexPatchScoreResult,
  type FrontierCodexResourceAllocation,
  type FrontierCodexResourceSchedulingOptions,
  type FrontierCodexModelCostEstimate,
  type FrontierCodexSwarmRunOptions,
  type FrontierCodexSwarmRunResult
} from '../dist/index.js';

const plan = createCodexSwarmPlan({
  manifest: { lanes: [{ id: 'runtime', allowedWrites: ['src/**'] }] },
  tasks: [{ id: 'task', lane: 'runtime', targetRefs: ['src/index.ts'] }]
});

const job = plan.jobs[0];
const args = buildCodexArgs(job, {
  outDir: '.',
  workspacePath: '.',
  paths: {
    jobDir: '.',
    promptPath: 'prompt.md',
    eventsPath: 'events.jsonl',
    stderrPath: 'stderr.log',
    lastMessagePath: 'last.md',
    evidenceDir: 'evidence',
    resourceAllocationPath: 'evidence/resource-allocation.json',
    contextBudgetPath: 'evidence/context-budget.json',
    workspaceProofPath: 'evidence/workspace-proof.json',
    patchPath: 'evidence/changes.patch',
    mergeBundlePath: 'evidence/merge.json',
    patchIntentPath: 'evidence/patch-intent.json',
    logSummaryPath: 'evidence/log-summary.json',
    pidManifestPath: 'pids.json'
  }
});

const resultPromise: Promise<FrontierCodexSwarmRunResult> = runCodexSwarm(plan, {
  outDir: '.',
  dryRun: true,
  adaptiveConcurrency: true,
  resourceScheduling: {
    browserConcurrency: 1,
    staticCheckConcurrency: 4,
    apiCheckConcurrency: 1,
    fuzzerConcurrency: 1
  },
  compactLogs: true,
  contextBudget: { mode: 'warn', warnEstimatedInputTokens: 32000 },
  semanticImportExpected: true,
  workspace: {
    mode: 'copy',
    includes: ['package.json'],
    excludes: ['node_modules'],
    linkPaths: ['packages'],
    artifactIncludes: ['agent-runs/latest/evidence.json'],
    skipGitRepoCheck: true
  }
});
const workspacePlan: FrontierCodexWorkspacePlan = createCodexWorkspacePlan(job, {
  outDir: '.',
  workspace: { mode: 'snapshot', includes: ['src'], linkNodeModules: false }
});
const resourceAllocation: FrontierCodexResourceAllocation = createCodexResourceAllocation(job, {
  outDir: '.',
  workspacePath: '.'
});
const resourceScheduling: FrontierCodexResourceSchedulingOptions = {
  capabilityConcurrency: { browser: 1, 'static-check': 4 },
  resourceQuotas: { browser: 1, 'api-check': 1 }
};
const runOptions: FrontierCodexSwarmRunOptions = {
  outDir: '.',
  dryRun: true,
  maxConcurrency: 2
};
const cliInput: FrontierCodexSwarmCliInput = {
  manifest: { lanes: [{ id: 'runtime', allowedWrites: ['src/**'] }] },
  tasks: [],
  backlog: { id: 'runtime-backlog', entries: [] },
  backlogPlan: { recursive: true, childArtifactPath: 'backlog-children.json' },
  routingPolicy: { id: 'routing-policy', defaultMode: 'fill' },
  routingMode: 'observe',
  routingContext: { repository: 'repo', package: '@scope/pkg' }
};
const workspaceManifest: FrontierCodexWorkspaceManifest = createSwarmWorkspaceManifest(workspacePlan);
const collectPromise: Promise<FrontierCodexCollectResult> = collectCodexSwarmRun({ run: '.', checkStale: false });
const applyPromise: Promise<FrontierCodexApplyResult> = applyCodexSwarmCollection({ collection: '.', dryRun: true });
const scorePromise: Promise<FrontierCodexPatchScoreResult> = scoreCodexSwarmPatches({ collection: '.', focusedCommands: ['npm test'] });
const handoffArtifactsPromise: Promise<FrontierCodexHandoffArtifact[]> = discoverCodexHandoffArtifacts({ root: '.' });
const continuationPromise: Promise<FrontierCodexContinuationResult> = continueCodexSwarmLoop({
  collection: '.',
  backlog: { id: 'runtime-backlog', entries: [] },
  routingPolicy: { id: 'routing-policy', defaultMode: 'fill' },
  routingMode: 'fill'
});
const semanticEditAdmission: FrontierCodexSemanticEditAdmissionDecision = classifySemanticEditScriptAdmission(undefined);
const semanticEditReplay: FrontierCodexSemanticEditReplaySummary | undefined = summarizeSemanticEditReplay(undefined);
const costEstimate: FrontierCodexModelCostEstimate = estimateCodexModelCost({
  model: 'gpt-5.1-codex-mini',
  actualInputTokens: 1000,
  cachedInputTokens: 100,
  uncachedInputTokens: 900
});

args satisfies string[];
workspacePlan satisfies FrontierCodexWorkspacePlan;
resourceAllocation.env satisfies Record<string, string>;
resourceScheduling satisfies FrontierCodexResourceSchedulingOptions;
runOptions satisfies FrontierCodexSwarmRunOptions;
cliInput satisfies FrontierCodexSwarmCliInput;
workspaceManifest.kind satisfies string;
resultPromise satisfies Promise<FrontierCodexSwarmRunResult>;
collectPromise satisfies Promise<FrontierCodexCollectResult>;
collectPromise.then((collection) => {
  collection.queueOutcomeModel?.summary.visibleReviewDebtCount satisfies number | undefined;
  collection.terminalState?.summary.activeItemCount satisfies number | undefined;
  collection.summary.collectorGeneratedPatchCount satisfies number | undefined;
  collection.buckets['needs-human-port'][0]?.generatedByCollector satisfies boolean | undefined;
  collection.buckets['needs-human-port'][0]?.patchPath satisfies string | undefined;
});
applyPromise satisfies Promise<FrontierCodexApplyResult>;
scorePromise satisfies Promise<FrontierCodexPatchScoreResult>;
handoffArtifactsPromise satisfies Promise<readonly { kind: string; path: string }[]>;
continuationPromise satisfies Promise<FrontierCodexContinuationResult>;
continuationPromise.then((continuation) => {
  continuation.summary.terminalOutcomeProjection.closedEntryCount satisfies number;
  continuation.summary.terminalOutcomeProjection.reviewTaskCount satisfies number;
});
semanticEditAdmission.status satisfies string;
semanticEditReplay?.acceptedClean satisfies number | undefined;
costEstimate.estimatedCostUsd satisfies number;
costEstimate.pricingModel satisfies string | undefined;
scorePromise.then((score) => {
  const proofFailures: number | undefined = score.entries[0]?.semanticEvidence.proofSpecFailedObligations;
  const paradigmRecords: number | undefined = score.entries[0]?.semanticEvidence.paradigmSemanticsRecords;
  const lineageEvents: number | undefined = score.entries[0]?.semanticEvidence.semanticLineageEvents;
  const dependencyEdges: string[] | undefined = score.entries[0]?.semanticEvidence.dependencyEdges;
  const dependencyEdgeHints: string[] | undefined = score.entries[0]?.semanticEvidence.dependencyEdgeHints;
  dependencyEdges?.forEach((edge) => edge satisfies string);
  dependencyEdgeHints?.forEach((edge) => edge satisfies string);
  return (proofFailures ?? 0) + (paradigmRecords ?? 0) + (lineageEvents ?? 0);
});
