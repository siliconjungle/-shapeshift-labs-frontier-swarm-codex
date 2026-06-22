import path from 'node:path';
import { applySwarmGitMergeCollection } from '@shapeshift-labs/frontier-swarm-git';
import type { FrontierCodexApplyInput, FrontierCodexApplyResult } from './index.js';
import { collectCodexSwarmRun } from './collect.js';

export async function applyCodexSwarmCollection(input: FrontierCodexApplyInput): Promise<FrontierCodexApplyResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (!input.collection && !input.run) throw new Error('apply requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  return applySwarmGitMergeCollection({
    cwd,
    collection: collectionDir,
    outDir: input.outDir,
    bucket: input.bucket,
    dryRun: input.dryRun,
    allowDirty: input.allowDirty,
    commit: input.commit,
    branchPrefix: input.branchPrefix,
    jobIds: input.jobIds,
    limit: input.limit
  }) as Promise<FrontierCodexApplyResult>;
}
