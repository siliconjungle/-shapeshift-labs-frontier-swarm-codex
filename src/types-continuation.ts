import type {
  FrontierSwarmBacklog,
  FrontierSwarmBacklogInput,
  FrontierSwarmBacklogTaskPlanInput,
  FrontierSwarmModelRoutingMode,
  FrontierSwarmModelRoutingPolicy,
  FrontierSwarmModelRoutingPolicyInput,
  FrontierSwarmPlan,
  FrontierSwarmPlanInput
} from '@shapeshift-labs/frontier-swarm';
import type { FrontierRunSyncDirection } from '@shapeshift-labs/frontier-run';
import type {
  FRONTIER_SWARM_CODEX_CONTINUATION_KIND,
  FRONTIER_SWARM_CODEX_CONTINUATION_VERSION
} from './constants.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type {
  FrontierCodexDistributedRunOptions,
  FrontierCodexDistributedRunResolvedOptions,
  FrontierCodexDistributedRunArtifactPaths
} from './types-distributed-run.js';

export interface FrontierCodexContinuationInput {
  run?: string;
  collection?: string;
  cwd?: string;
  outDir?: string;
  collectionOutDir?: string;
  checkStale?: boolean;
  semanticImportExpected?: boolean;
  branchPrefix?: string;
  runEventsPath?: string | false;
  runDashboardPath?: string | false;
  runSyncPeers?: readonly string[];
  runSyncDirection?: FrontierRunSyncDirection;
  runSyncEvidencePath?: string | false;
  runSyncHistoryPath?: string | false;
  distributedRun?: boolean | FrontierCodexDistributedRunOptions;
  backlog?: FrontierSwarmBacklog | FrontierSwarmBacklogInput | unknown;
  backlogPath?: string;
  routingPolicy?: FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | unknown;
  routingPolicyPath?: string;
  humanAnswers?: unknown;
  humanAnswersPath?: string;
  humanAnswerPaths?: readonly string[];
  manifest?: unknown;
  manifestPath?: string;
  tasks?: unknown;
  tasksPath?: string;
  plan?: FrontierSwarmPlanInput;
  routingMode?: FrontierSwarmModelRoutingMode;
  backlogPlan?: Omit<FrontierSwarmBacklogTaskPlanInput, 'backlog' | 'tasks'>;
  childBacklogNames?: readonly string[];
  repository?: string;
  package?: string;
  write?: boolean;
}

export interface FrontierCodexContinuationResult {
  kind: typeof FRONTIER_SWARM_CODEX_CONTINUATION_KIND;
  version: typeof FRONTIER_SWARM_CODEX_CONTINUATION_VERSION;
  ok: boolean;
  generatedAt: number;
  cwd: string;
  outDir: string;
  collectionDir?: string;
  runDir?: string;
  backlogPath: string;
  routingPolicyPath: string;
  humanActionStatePath: string;
  runEventsPath?: string;
  runDashboardPath?: string;
  distributedRun?: {
    enabled: true;
    options: FrontierCodexDistributedRunResolvedOptions;
    paths: FrontierCodexDistributedRunArtifactPaths;
  };
  nextTasksPath?: string;
  nextPlanPath?: string;
  childBacklogNames: string[];
  childBacklogPaths: string[];
  feedbackCount: number;
  nextBacklog: FrontierSwarmBacklog;
  nextRoutingPolicy: FrontierSwarmModelRoutingPolicy;
  humanActions: Record<string, unknown>[];
  humanAnswers: Record<string, unknown>[];
  nextPlan?: FrontierSwarmPlan;
  summary: {
    childBacklogCount: number;
    childBacklogEntryCount: number;
    feedbackCount: number;
    totalRoutingFeedbackCount: number;
    backlogEntryCount: number;
    terminalOutcomeProjection: {
      closedEntryCount: number;
      closedTaskCount: number;
      rerunEntryCount: number;
      rerunTaskCount: number;
      reviewEntryCount: number;
      reviewTaskCount: number;
      blockedEntryCount: number;
      blockedTaskCount: number;
      decisionCount: number;
      answeredHumanBlockerEntryCount: number;
      answeredHumanBlockerTaskCount: number;
    };
    humanActions: {
      actionCount: number;
      answerCount: number;
      answeredActionCount: number;
      openActionCount: number;
      unresolvedAnswerCount: number;
      answerPaths: string[];
      statePath: string;
    };
    routingPreferenceCount: number;
    routingPreferences: {
      defaultMode: FrontierSwarmModelRoutingPolicy['defaultMode'];
      signalCount: number;
      feedbackCount: number;
      preferenceCount: number;
      preferCount: number;
      avoidCount: number;
    };
    adaptiveRouting: {
      recommendationCount: number;
      signalCount: number;
      skippedRecommendationCount: number;
      preferCount: number;
      avoidCount: number;
      computeSignalCount: number;
      modelSignalCount: number;
      modelTierSignalCount: number;
      targetCounts: Record<string, number>;
    };
    routingCost: {
      feedbackCount: number;
      costSignalCount: number;
      pricedFeedbackCount: number;
      unknownPriceFeedbackCount: number;
      inputOnlyFeedbackCount: number;
      estimatedInputFeedbackCount: number;
      estimatedCostUsd: number;
      estimatedInputCostUsd: number;
      estimatedOutputCostUsd: number;
      estimatedCostMicroUsd: number;
      billableInputTokens: number;
      cachedInputTokens: number;
      uncachedInputTokens: number;
      outputTokens: number;
    };
    nextJobCount: number;
    nextJobIds: string[];
    nextJobTaskIds: string[];
    nextJobLaneCounts: Record<string, number>;
    nextJobRouting: {
      routedJobCount: number;
      changedComputeCount: number;
      policyFeedbackMatchCount: number;
      policyCostSignalCount: number;
      policyPreferenceMatchCount: number;
      selectedComputeCounts: Record<string, number>;
      fallbackComputeCounts: Record<string, number>;
      routedJobIds: string[];
      changedComputeJobIds: string[];
    };
    tournamentObservationCount: number;
    tournamentRecommendationCount: number;
    collectionBucketCounts?: FrontierCodexCollectResult['summary'];
    tournamentCounts?: Pick<
      FrontierCodexCollectResult['strategyTournament']['summary'],
      'strategyCount' | 'gameCount' | 'matchCount' | 'verifiedCount' | 'rejectedCount' | 'undefinedCount' | 'sampleConfidence' | 'decisionGrade'
    >;
    tournamentFeedbackCounts?: FrontierCodexCollectResult['tournamentAdaptiveFeedback']['summary'];
    paths: {
      outDir: string;
      collectionDir?: string;
      runDir?: string;
      backlogPath: string;
      routingPolicyPath: string;
      humanActionStatePath: string;
      runEventsPath?: string;
      runDashboardPath?: string;
      distributedRunDir?: string;
      nextTasksPath?: string;
      nextPlanPath?: string;
      childBacklogPaths: string[];
    };
  };
}
