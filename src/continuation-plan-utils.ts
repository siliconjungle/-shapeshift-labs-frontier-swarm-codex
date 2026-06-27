import {
  type FrontierSwarmBacklog,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import { uniqueStrings } from './common.js';

export function countByString(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function sanitizeContinuationBacklogForPlan(
  backlog: FrontierSwarmBacklog,
  explicitTasks: readonly FrontierSwarmTaskInput[]
): FrontierSwarmBacklog {
  const entryTaskIds = new Map(backlog.entries.map((entry) => [entry.id, entry.taskId ?? entry.id]));
  const plannedTaskIds = new Set([...explicitTasks.map((task) => task.id), ...entryTaskIds.values()]);
  const normalizeTaskId = (value: string) => entryTaskIds.get(value) ?? value;
  return {
    ...backlog,
    entries: backlog.entries.map((entry) => {
      const parentTaskId = entry.parentEntryId ? normalizeTaskId(entry.parentEntryId) : undefined;
      const dependsOn = uniqueStrings(entry.dependsOn.map(normalizeTaskId).filter((dependency) => plannedTaskIds.has(dependency)));
      const { parentEntryId: _parentEntryId, ...rest } = entry;
      return {
        ...rest,
        ...(parentTaskId && plannedTaskIds.has(parentTaskId) ? { parentEntryId: parentTaskId } : {}),
        dependsOn
      };
    })
  };
}
