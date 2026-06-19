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
import type {
  FRONTIER_SWARM_CODEX_CONTINUATION_KIND,
  FRONTIER_SWARM_CODEX_CONTINUATION_VERSION
} from './constants.js';
import type { FrontierCodexCollectResult } from './types-collection.js';

export interface FrontierCodexContinuationInput {
  run?: string;
  collection?: string;
  cwd?: string;
  outDir?: string;
  collectionOutDir?: string;
  checkStale?: boolean;
  semanticImportExpected?: boolean;
  branchPrefix?: string;
  backlog?: FrontierSwarmBacklog | FrontierSwarmBacklogInput | unknown;
  backlogPath?: string;
  routingPolicy?: FrontierSwarmModelRoutingPolicyInput | FrontierSwarmModelRoutingPolicy | unknown;
  routingPolicyPath?: string;
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
  nextPlanPath?: string;
  childBacklogNames: string[];
  childBacklogPaths: string[];
  feedbackCount: number;
  nextBacklog: FrontierSwarmBacklog;
  nextRoutingPolicy: FrontierSwarmModelRoutingPolicy;
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
      nextPlanPath?: string;
      childBacklogPaths: string[];
    };
  };
}
