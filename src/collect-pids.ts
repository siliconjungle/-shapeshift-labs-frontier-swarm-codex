import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmCoordinatorProcessInput } from '@shapeshift-labs/frontier-swarm';

export async function readCodexPidProcesses(file: string): Promise<FrontierSwarmCoordinatorProcessInput[]> {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { entries?: Array<{ pid: number; role: string; jobId?: string; runId?: string; startedAt: number; command?: string[] }> };
  return Promise.all((parsed.entries ?? []).map(async (entry) => ({
    pid: entry.pid,
    role: entry.role,
    ...(entry.jobId ? { jobId: entry.jobId } : {}),
    ...(entry.runId ? { runId: entry.runId } : {}),
    status: await pidIsAlive(entry.pid) ? 'running' : 'missing',
    startedAt: entry.startedAt,
    ...(entry.command ? { command: entry.command } : {})
  })));
}

export async function resolveRunDirectory(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return absolute;
  if (path.basename(absolute) === 'swarm-results.json' || path.basename(absolute) === 'pids.json') return path.dirname(absolute);
  return path.dirname(absolute);
}

async function pidIsAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
