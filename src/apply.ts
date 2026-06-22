import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND,
  FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION,
  applySwarmGitMergeCollection
} from '@shapeshift-labs/frontier-swarm-git';
import type { FrontierCodexApplyInput, FrontierCodexApplyResult } from './types-collection.js';
import { collectCodexSwarmRun } from './collect.js';
import {
  attachCodexApplyAdmission,
  createCodexApplyAdmission,
  createEmptyApplyResult
} from './apply-admission.js';
import { writeCodexApplyEvidence } from './apply-evidence.js';

export async function applyCodexSwarmCollection(input: FrontierCodexApplyInput): Promise<FrontierCodexApplyResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (!input.collection && !input.run) throw new Error('apply requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  const admission = await createCodexApplyAdmission({
    cwd,
    collectionDir,
    bucket: input.bucket,
    jobIds: input.jobIds,
    limit: input.limit,
    mode: input.admission ?? 'strict'
  });
  const applyJobIds = admission.mode === 'strict' ? admission.acceptedJobIds : input.jobIds;
  const result = admission.mode === 'strict' && admission.rejected.length > 0 && admission.acceptedJobIds.length === 0
    ? createEmptyApplyResult({
      cwd,
      collectionDir,
      outDir: input.outDir,
      dryRun: input.dryRun ?? true
    })
    : await applySwarmGitMergeCollection({
      cwd,
      collection: collectionDir,
      outDir: input.outDir,
      bucket: input.bucket,
      dryRun: input.dryRun,
      allowDirty: input.allowDirty,
      commit: input.commit,
      branchPrefix: input.branchPrefix,
      jobIds: applyJobIds,
      limit: input.limit,
      leaseStatePath: input.leaseStatePath,
      leaseTtlMs: input.leaseTtlMs
    }) as FrontierCodexApplyResult;
  const admitted = attachCodexApplyAdmission(result, admission);
  const evidence = await writeCodexApplyEvidence(admitted);
  const augmented: FrontierCodexApplyResult = {
    ...admitted,
    ...evidence,
    kind: FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND,
    version: FRONTIER_SWARM_GIT_APPLY_LEDGER_VERSION
  };
  await fs.writeFile(path.join(result.outDir, 'apply-ledger.json'), JSON.stringify(augmented, null, 2) + '\n');
  return augmented;
}
