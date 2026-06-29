import {
  applyCodexSwarmCollection,
  buildCodexArgs,
  classifySemanticEditScriptAdmission,
  collectCodexSwarmRun,
  createCodexResourceAllocation,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  createCodexRunProjection,
  createSwarmWorkspaceManifest,
  discoverCodexHandoffArtifacts,
  estimateCodexModelCost,
  continueCodexSwarmLoop,
  createContinuationMergeMetricsFeedback,
  createCodexLiveRoutingController,
  readCodexHumanActionBrokerState,
  readCodexModelTelemetrySummary,
  normalizeCodexLiveRoutingOptions,
  resolveCodexLiveRoutingPaths,
  resolveCodexRunEventsPath,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  summarizeSemanticEditReplay,
  type FrontierCodexContinuationResult,
  type FrontierCodexContinuationMergeMetricsFeedback,
  type FrontierCodexHandoffArtifact,
  type FrontierCodexWorkspacePlan,
  type FrontierCodexWorkspaceManifest,
  type FrontierCodexSwarmCliInput,
  type FrontierCodexCollectResult,
  type FrontierCodexApplyResult,
  type FrontierCodexJsTsSafeMergeApplySummary,
  type FrontierCodexSemanticEditAdmissionDecision,
  type FrontierCodexSemanticEditReplaySummary,
  type FrontierCodexSemanticImportRecord,
  type FrontierCodexSemanticImportQuality,
  type FrontierCodexSemanticMergeAdmissionSummary,
  type FrontierCodexPatchScoreResult,
  type FrontierCodexResourceAllocation,
  type FrontierCodexResourceSchedulingOptions,
  type FrontierCodexModelCostEstimate,
  type FrontierCodexHumanActionBrokerState,
  type FrontierCodexLiveRoutingPaths,
  type FrontierCodexLiveRoutingResolvedOptions,
  type FrontierCodexModelTelemetrySummary,
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
  maxConcurrency: 2,
  runEventsPath: 'run-events.jsonl',
  runDashboardPath: 'run-dashboard.json',
  queueStatePath: 'queue-state.json',
  queueEventsPath: 'queue-events.jsonl',
  queueSummaryPath: 'queue-summary.json',
  modelTelemetryPath: 'model-telemetry.jsonl',
  modelTelemetrySummaryPath: 'model-telemetry-summary.json',
  humanActionEventsPath: 'human-actions.jsonl',
  humanActionStatePath: 'human-actions-state.json',
  liveRouting: { enabled: true, routingMode: 'fill', minSamples: 1, writeArtifacts: true },
  liveRoutingPolicyPath: 'model-routing-policy.live.json',
  liveRoutingControllerPath: 'routing-controller.json',
  liveRoutingHistoryPath: 'routing-controller-history.json'
};
resultPromise.then((result) => {
  result.queueStatePath satisfies string | undefined;
  result.queueEventsPath satisfies string | undefined;
  result.queueSummaryPath satisfies string | undefined;
  result.modelTelemetryPath satisfies string | undefined;
  result.modelTelemetrySummaryPath satisfies string | undefined;
  result.humanActionEventsPath satisfies string | undefined;
  result.humanActionStatePath satisfies string | undefined;
  result.liveRoutingPolicyPath satisfies string | undefined;
  result.liveRoutingControllerPath satisfies string | undefined;
  result.liveRoutingHistoryPath satisfies string | undefined;
  result.liveRoutingController?.summary.changedComputeCount satisfies number | undefined;
});
const runEventsPath: string | undefined = resolveCodexRunEventsPath({ outDir: '.' });
const runProjection = createCodexRunProjection([]);
const liveRoutingOptions: FrontierCodexLiveRoutingResolvedOptions = normalizeCodexLiveRoutingOptions(runOptions.liveRouting);
const liveRoutingPaths: FrontierCodexLiveRoutingPaths = resolveCodexLiveRoutingPaths(runOptions, '.');
const liveRoutingController = createCodexLiveRoutingController({
  plan,
  records: [],
  options: liveRoutingOptions,
  generatedAt: Date.now()
});
const modelTelemetrySummaryPromise: Promise<FrontierCodexModelTelemetrySummary | undefined> = readCodexModelTelemetrySummary('model-telemetry-summary.json');
const humanActionStatePromise: Promise<FrontierCodexHumanActionBrokerState | undefined> = readCodexHumanActionBrokerState('human-actions-state.json');
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
const continuationMergeMetrics: FrontierCodexContinuationMergeMetricsFeedback = createContinuationMergeMetricsFeedback({ generatedAt: Date.now(), repository: 'repo' });
const semanticEditAdmission: FrontierCodexSemanticEditAdmissionDecision = classifySemanticEditScriptAdmission(undefined);
const semanticEditReplay: FrontierCodexSemanticEditReplaySummary | undefined = summarizeSemanticEditReplay(undefined);
const semanticMergeAdmission: FrontierCodexSemanticMergeAdmissionSummary = {
  total: 1,
  classifications: ['safe'],
  byClassification: { safe: 1 },
  decisions: ['auto-mergeable'],
  byDecision: { 'auto-mergeable': 1 },
  noOp: 0,
  stale: 0,
  needsReview: 0,
  blocked: 0,
  conflicts: 0,
  conflictReasonCodes: [],
  conflictKeys: ['symbol:FrontierThing'],
  evidenceIds: ['evidence:semantic-admission'],
  autoApplyable: 1,
  autoApplyCandidates: 1,
  empty: false,
  safe: 1,
  safeWithLosses: 0,
  reviewRequired: 0,
  autoMergeable: 1,
  reasonCodes: ['semantic-merge-safe'],
  conflictKeyKinds: ['symbol'],
  candidateIds: ['candidate:FrontierThing']
};
const jsTsSafeMergeApply: FrontierCodexJsTsSafeMergeApplySummary = {
  total: 1,
  classifications: ['accepted-clean'],
  byClassification: { 'accepted-clean': 1 },
  decisions: ['apply'],
  byDecision: { apply: 1 },
  noOp: 0,
  stale: 0,
  needsReview: 0,
  blocked: 0,
  conflicts: 0,
  conflictReasonCodes: [],
  conflictKeys: ['symbol:FrontierThing'],
  evidenceIds: ['evidence:js-ts-safe-merge-apply'],
  autoApplyable: 1,
  autoApplyCandidates: 1,
  empty: false,
  acceptedClean: 1,
  alreadyApplied: 0,
  applied: 1,
  skipped: 0,
  scripts: 1,
  projections: 1,
  replays: 1,
  statuses: ['accepted-clean'],
  byStatus: { 'accepted-clean': 1 },
  actions: ['apply'],
  byAction: { apply: 1 },
  reasonCodes: ['semantic-edit-replay-accepted-clean'],
  sourcePaths: ['src/index.ts'],
  scriptIds: ['script:1'],
  projectionIds: ['projection:1'],
  replayIds: ['replay:1']
};
const semanticImportRecord: FrontierCodexSemanticImportRecord = {
  path: 'src/index.ts',
  status: 'imported',
  semanticMergeAdmission,
  safeMergeApply: jsTsSafeMergeApply
};
const semanticImportQuality: Partial<FrontierCodexSemanticImportQuality> = {
  semanticMergeAdmission,
  jsTsSafeMergeApply
};
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
liveRoutingPaths.liveRoutingPolicyPath satisfies string | undefined;
liveRoutingController.summary.telemetryRecordCount satisfies number;
cliInput satisfies FrontierCodexSwarmCliInput;
workspaceManifest.kind satisfies string;
resultPromise satisfies Promise<FrontierCodexSwarmRunResult>;
collectPromise satisfies Promise<FrontierCodexCollectResult>;
collectPromise.then((collection) => {
  collection.queueOutcomeModel?.summary.visibleReviewDebtCount satisfies number | undefined;
  collection.terminalState?.summary.activeItemCount satisfies number | undefined;
  collection.summary.collectorGeneratedPatchCount satisfies number | undefined;
  collection.mergeMetricsFeedback.summary.eventCount satisfies number;
  collection.metadata?.modelTelemetrySummary satisfies unknown;
  collection.metadata?.humanActionState satisfies unknown;
  collection.buckets['needs-human-port'][0]?.generatedByCollector satisfies boolean | undefined;
  collection.buckets['needs-human-port'][0]?.patchPath satisfies string | undefined;
});
modelTelemetrySummaryPromise satisfies Promise<FrontierCodexModelTelemetrySummary | undefined>;
humanActionStatePromise satisfies Promise<FrontierCodexHumanActionBrokerState | undefined>;
applyPromise satisfies Promise<FrontierCodexApplyResult>;
scorePromise satisfies Promise<FrontierCodexPatchScoreResult>;
handoffArtifactsPromise satisfies Promise<readonly { kind: string; path: string }[]>;
continuationPromise satisfies Promise<FrontierCodexContinuationResult>;
continuationPromise.then((continuation) => {
  continuation.summary.terminalOutcomeProjection.closedEntryCount satisfies number;
  continuation.summary.terminalOutcomeProjection.reviewTaskCount satisfies number;
  continuation.summary.routingCost.estimatedCostUsd satisfies number;
  continuation.summary.routingCost.pricedFeedbackCount satisfies number;
  continuation.summary.adaptiveRouting.signalCount satisfies number;
  continuation.summary.adaptiveRouting.skippedRecommendationCount satisfies number;
  continuation.summary.mergeMetrics.backlogEntryCount satisfies number;
  continuation.summary.nextJobRouting.routedJobCount satisfies number;
  continuation.summary.nextJobRouting.changedComputeCount satisfies number;
  continuation.summary.nextJobRouting.selectedComputeCounts satisfies Record<string, number>;
  continuation.nextTasksPath satisfies string | undefined;
});
continuationMergeMetrics.summary.routingFeedbackCount satisfies number;
semanticEditAdmission.status satisfies string;
semanticEditReplay?.acceptedClean satisfies number | undefined;
semanticMergeAdmission.byClassification.safe satisfies number | undefined;
jsTsSafeMergeApply.acceptedClean satisfies number;
const recordSemanticMergeAdmission = semanticImportRecord.semanticMergeAdmission as FrontierCodexSemanticMergeAdmissionSummary | undefined;
recordSemanticMergeAdmission?.conflictKeys satisfies string[] | undefined;
semanticImportQuality.jsTsSafeMergeApply?.autoApplyable satisfies number | undefined;
costEstimate.estimatedCostUsd satisfies number;
costEstimate.pricingModel satisfies string | undefined;
costEstimate.costEstimateLongContext satisfies boolean;
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
