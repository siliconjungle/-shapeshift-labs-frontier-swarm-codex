import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmTaskInput } from '@shapeshift-labs/frontier-swarm';

export async function writeContinuationTaskSource(input: {
  cwd: string;
  outDir: string;
  tasks?: unknown;
  tasksPath?: string;
  write?: boolean;
  projectedTasks: readonly FrontierSwarmTaskInput[];
}): Promise<string | undefined> {
  if (input.tasks === undefined && input.tasksPath === undefined) return undefined;
  const file = path.resolve(input.cwd, input.write && input.tasksPath ? input.tasksPath : path.join(input.outDir, 'tasks.next.json'));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ items: input.projectedTasks }, null, 2) + '\n');
  return file;
}
