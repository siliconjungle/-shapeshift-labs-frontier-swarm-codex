import type { FrontierCodexRunGraph, FrontierCodexRunGraphNode } from './types-run-graph.js';

export function createCodexRunGraphIndexes(nodes: readonly FrontierCodexRunGraphNode[]): FrontierCodexRunGraph['indexes'] {
  const byKind: Record<string, string[]> = {};
  const byJobId: Record<string, string[]> = {};
  const byTaskId: Record<string, string[]> = {};
  for (const node of nodes) {
    byKind[node.kind] = [...(byKind[node.kind] ?? []), node.id];
    if (node.jobId) byJobId[node.jobId] = [...(byJobId[node.jobId] ?? []), node.id];
    if (node.taskId) byTaskId[node.taskId] = [...(byTaskId[node.taskId] ?? []), node.id];
  }
  for (const group of [...Object.values(byKind), ...Object.values(byJobId), ...Object.values(byTaskId)]) group.sort();
  return { byKind, byJobId, byTaskId };
}

export function mergeCodexRunGraphNode(left: FrontierCodexRunGraphNode, right: FrontierCodexRunGraphNode): FrontierCodexRunGraphNode {
  return {
    ...left,
    ...right,
    refs: { ...(left.refs ?? {}), ...(right.refs ?? {}) },
    data: { ...(left.data ?? {}), ...(right.data ?? {}) }
  };
}

export function countCodexRunGraphValues(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function stableCodexRunGraphPart(value: string): string {
  return value.replace(/[^a-z0-9_.:-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || String(hashCodexRunGraphString(value));
}

export function stringFromUnknown(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

export function hashCodexRunGraphString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
