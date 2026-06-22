import type {
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_KIND,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_VERSION,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_KIND,
  FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_VERSION,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_KIND,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_KIND,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_VERSION,
  FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_VERSION
} from './constants.js';

export interface FrontierCodexModelTelemetryRecord {
  kind: typeof FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_KIND;
  version: typeof FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_VERSION;
  id: string;
  generatedAt: number;
  runId?: string;
  planId?: string;
  jobId: string;
  taskId?: string;
  lane?: string;
  title?: string;
  workKind?: string;
  taskKind?: string;
  layer?: string;
  computeId?: string;
  computeKind?: string;
  model?: string;
  modelTier?: string;
  reasoningEffort?: string;
  serviceTier?: string;
  status?: string;
  mergeReadiness?: string;
  mergeDisposition?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs: number;
  exitCode?: number;
  signal?: string;
  changedPathCount: number;
  ownershipViolationCount: number;
  evidencePathCount: number;
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  billableInputTokens: number;
  priceKnown: boolean;
  pricingModel?: string;
  pricingMatchedModel?: string;
  pricingSource?: string;
  pricingUpdatedAt?: string;
  estimatedCostUsd: number;
  estimatedInputCostUsd: number;
  estimatedCachedInputCostUsd: number;
  estimatedUncachedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedCostMicroUsd: number;
  costEstimateInputOnly: boolean;
  costEstimateEstimatedInput: boolean;
  costEstimateMissingOutputTokens: boolean;
  costEstimateLongContext: boolean;
  unknownPricingReason?: string;
  contextBudgetStatus?: string;
  contextBudgetWarningCount: number;
  contextBudgetErrorCount: number;
  verificationTotal: number;
  verificationPassed: number;
  verificationFailed: number;
  verificationRequiredFailed: number;
  gateExecutionsPath?: string;
  gateSummaryPath?: string;
  humanActionCount: number;
  openHumanActionCount: number;
  semanticImportPresent: boolean;
  semanticImportCandidateCount: number;
  semanticImportSelectedCount: number;
  metadata: Record<string, unknown>;
}

export interface FrontierCodexModelTelemetrySummary {
  kind: typeof FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_KIND;
  version: typeof FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_VERSION;
  generatedAt: number;
  runId?: string;
  planId?: string;
  telemetryPath?: string;
  recordCount: number;
  jobCount: number;
  statusCounts: Record<string, number>;
  laneCounts: Record<string, number>;
  computeCounts: Record<string, number>;
  modelCounts: Record<string, number>;
  modelTierCounts: Record<string, number>;
  taskKindCounts: Record<string, number>;
  workKindCounts: Record<string, number>;
  totalDurationMs: number;
  maxDurationMs: number;
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  billableInputTokens: number;
  priceKnownRecordCount: number;
  unknownPriceRecordCount: number;
  inputOnlyCostRecordCount: number;
  estimatedInputRecordCount: number;
  missingOutputTokenRecordCount: number;
  longContextRecordCount: number;
  estimatedCostUsd: number;
  estimatedInputCostUsd: number;
  estimatedOutputCostUsd: number;
  estimatedCostMicroUsd: number;
  verificationTotal: number;
  verificationPassed: number;
  verificationFailed: number;
  verificationRequiredFailed: number;
  humanActionCount: number;
  openHumanActionCount: number;
  semanticImportPresentCount: number;
}

export interface FrontierCodexHumanActionEvent {
  kind: typeof FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_KIND;
  version: typeof FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENT_VERSION;
  id: string;
  eventType: 'human-action.opened' | 'human-action.answered' | 'human-action.resolved' | 'human-action.dismissed';
  generatedAt: number;
  runId?: string;
  planId?: string;
  jobId: string;
  taskId?: string;
  lane?: string;
  actionId: string;
  code: string;
  status: string;
  priority?: string;
  title?: string;
  question?: string;
  action: Record<string, unknown>;
  evidencePaths: string[];
  changedPaths: string[];
}

export interface FrontierCodexHumanActionBrokerState {
  kind: typeof FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_KIND;
  version: typeof FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_VERSION;
  id: string;
  generatedAt: number;
  runId?: string;
  planId?: string;
  eventPath?: string;
  actionCount: number;
  openActionCount: number;
  answeredActionCount: number;
  resolvedActionCount: number;
  dismissedActionCount: number;
  statusCounts: Record<string, number>;
  codes: string[];
  actions: Record<string, unknown>[];
}
