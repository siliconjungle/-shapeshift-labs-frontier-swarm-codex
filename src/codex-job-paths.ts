import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexJobPaths, FrontierCodexSwarmRunOptions } from './index.js';

export async function createCodexJobPaths(
  outDir: string,
  job: FrontierSwarmJob,
  options: FrontierCodexSwarmRunOptions
): Promise<FrontierCodexJobPaths> {
  const jobDir = path.join(outDir, job.id);
  const paths = {
    jobDir,
    promptPath: path.join(jobDir, 'prompt.md'),
    eventsPath: path.join(jobDir, 'codex-events.jsonl'),
    stderrPath: path.join(jobDir, 'codex-stderr.log'),
    lastMessagePath: path.join(jobDir, 'last-message.md'),
    evidenceDir: path.join(jobDir, 'evidence'),
    resourceAllocationPath: path.join(jobDir, 'evidence', 'resource-allocation.json'),
    workspaceProofPath: path.join(jobDir, 'evidence', 'workspace-proof.json'),
    patchPath: path.join(jobDir, 'evidence', 'changes.patch'),
    mergeBundlePath: path.join(jobDir, 'evidence', 'merge.json'),
    patchIntentPath: path.join(jobDir, 'evidence', 'patch-intent.json'),
    logSummaryPath: path.join(jobDir, 'evidence', 'log-summary.json'),
    pidManifestPath: path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'))
  };
  await fs.mkdir(paths.evidenceDir, { recursive: true });
  return paths;
}
