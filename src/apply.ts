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
import { resolveContinuationProofParentApplyCandidateCollection } from './query-io.js';

export async function applyCodexSwarmCollection(input: FrontierCodexApplyInput): Promise<FrontierCodexApplyResult> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (!input.collection && !input.run && !input.continuation) throw new Error('apply requires --collection <dir>, --continuation <dir>, or --run <run-dir>');
  const continuationCollectionDir = await resolveContinuationProofParentApplyCandidateCollection({ cwd, continuation: input.continuation });
  if (input.continuation && !continuationCollectionDir) throw new Error(`apply could not find proof parent apply candidates for continuation: ${input.continuation}`);
  let collectionDir = continuationCollectionDir;
  if (input.collection) collectionDir = path.resolve(cwd, input.collection);
  if (!collectionDir) collectionDir = (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
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
