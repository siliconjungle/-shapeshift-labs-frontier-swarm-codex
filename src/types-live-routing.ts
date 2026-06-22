import type { FrontierSwarmModelRoutingMode } from '@shapeshift-labs/frontier-swarm';

export interface FrontierCodexLiveRoutingOptions {
  enabled?: boolean;
  routingMode?: FrontierSwarmModelRoutingMode;
  policyPath?: string | false;
  controllerPath?: string | false;
  historyPath?: string | false;
  minSamples?: number;
  preferSuccessRate?: number;
  avoidSuccessRate?: number;
  highCostUsd?: number;
  writeArtifacts?: boolean;
}
