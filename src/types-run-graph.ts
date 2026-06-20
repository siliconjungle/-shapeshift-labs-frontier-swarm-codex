import type { FrontierCodexCollectBucket } from './types-collection.js';

export type FrontierCodexRunGraphNodeKind =
  | 'run'
  | 'task'
  | 'job'
  | 'candidate'
  | 'evidence'
  | 'gate'
  | 'decision'
  | 'merge'
  | 'replay'
  | 'rsi'
  | 'bucket'
  | 'ledger'
  | string;

export type FrontierCodexRunGraphEdgeKind =
  | 'contains'
  | 'dependsOn'
  | 'produces'
  | 'verifies'
  | 'classifiedAs'
  | 'decides'
  | 'supersedes'
  | 'mergesInto'
  | 'blocks'
  | string;

export interface FrontierCodexRunGraphNode {
  id: string;
  kind: FrontierCodexRunGraphNodeKind;
  label?: string;
  jobId?: string;
  taskId?: string;
  bucket?: FrontierCodexCollectBucket;
  status?: string;
  outcome?: string;
  path?: string;
  generatedAt?: number;
  refs?: Record<string, string>;
  data?: Record<string, unknown>;
}

export interface FrontierCodexRunGraphEdge {
  id: string;
  kind: FrontierCodexRunGraphEdgeKind;
  from: string;
  to: string;
  label?: string;
  data?: Record<string, unknown>;
}

export interface FrontierCodexRunGraph {
  kind: 'frontier.swarm-codex.run-graph';
  version: 1;
  id: string;
  generatedAt: number;
  runDir: string;
  outDir: string;
  nodes: FrontierCodexRunGraphNode[];
  edges: FrontierCodexRunGraphEdge[];
  indexes: {
    byKind: Record<string, string[]>;
    byJobId: Record<string, string[]>;
    byTaskId: Record<string, string[]>;
  };
  summary: {
    nodeCount: number;
    edgeCount: number;
    nodeKinds: Record<string, number>;
    edgeKinds: Record<string, number>;
    taskCount: number;
    jobCount: number;
    candidateCount: number;
    evidenceCount: number;
    decisionCount: number;
    gateCount: number;
  };
}
