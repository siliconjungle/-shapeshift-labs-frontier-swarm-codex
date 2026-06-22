import fs from 'node:fs/promises';
import path from 'node:path';
import {
  acquireSwarmCoordinatorSemanticLease,
  createSwarmHierarchicalMergeQueue,
  createSwarmMergeAdmission,
  createSwarmMergeIndex,
  createSwarmSemanticLeaseStateForMergeQueue,
  validateSwarmCoordinatorSemanticLeaseFence,
  type FrontierSwarmMergeBundle
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND, FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION } from './constants.js';
import type { FrontierCodexApplyEntry, FrontierCodexApplyInput, FrontierCodexApplyResult, FrontierCodexApplySemanticLeaseEvidence } from './index.js';
import { findFilesByName, gitDirty, pathExists, resolveBundlePatchPath, runLoggedProcess, slug } from './common.js';
import { collectCodexSwarmRun } from './collect.js';


export async function applyCodexSwarmCollection(input: FrontierCodexApplyInput): Promise<FrontierCodexApplyResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const dryRun = input.dryRun ?? true;
  if (!input.collection && !input.run) throw new Error('apply requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  const outDir = path.resolve(cwd, input.outDir ?? path.join(collectionDir, 'apply-ledger'));
  if (!dryRun && !input.allowDirty) {
    const dirty = await gitDirty(cwd);
    if (dirty.length) throw new Error(`refusing to apply into dirty worktree; pass allowDirty to override (${dirty.slice(0, 8).join(', ')})`);
  }
  const bucket = input.bucket ?? 'ready-to-apply';
  const roots = bucket === 'all'
    ? ['ready-to-apply', 'research-complete', 'needs-human-port', 'rerun-work', 'failed-evidence', 'stale-against-head'].map((entry) => path.join(collectionDir, entry))
    : [path.join(collectionDir, bucket)];
  const wanted = new Set(input.jobIds ?? []);
  const mergePaths = (await Promise.all(roots.map((root) => findFilesByName(root, 'merge.json')))).flat().sort();
  const entries: FrontierCodexApplyEntry[] = [];
  let semanticLeaseState = createSwarmSemanticLeaseStateForMergeQueue(createSwarmHierarchicalMergeQueue({
    index: createSwarmMergeIndex({ bundles: [], generatedAt }),
    generatedAt,
    metadata: { repository: path.basename(cwd) }
  }), {
    id: `frontier-swarm-codex-apply:${collectionDir}`,
    repository: path.basename(cwd),
    now: generatedAt
  });
  for (const mergePath of mergePaths.slice(0, input.limit ? Math.max(0, Math.floor(input.limit)) : undefined)) {
    const bundle = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
    if (wanted.size && !wanted.has(bundle.jobId)) continue;
    const applied = await applyCodexMergeBundle({
      cwd,
      bundle,
      mergePath,
      dryRun,
      commit: input.commit ?? false,
      branchPrefix: input.branchPrefix,
      semanticLeaseState
    });
    semanticLeaseState = applied.semanticLeaseState;
    entries.push(applied.entry);
  }
  const summary = {
    total: entries.length,
    checked: entries.filter((entry) => entry.status === 'checked').length,
    applied: entries.filter((entry) => entry.status === 'applied').length,
    committed: entries.filter((entry) => entry.status === 'committed').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    failed: entries.filter((entry) => entry.status === 'failed').length
  };
  const result: FrontierCodexApplyResult = {
    kind: FRONTIER_SWARM_CODEX_APPLY_LEDGER_KIND,
    version: FRONTIER_SWARM_CODEX_APPLY_LEDGER_VERSION,
    ok: summary.failed === 0,
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    dryRun,
    entries,
    summary
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'apply-ledger.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}


async function applyCodexMergeBundle(input: {
  cwd: string;
  bundle: FrontierSwarmMergeBundle;
  mergePath: string;
  dryRun: boolean;
  commit: boolean;
  branchPrefix?: string;
  semanticLeaseState: ReturnType<typeof createSwarmSemanticLeaseStateForMergeQueue>;
}): Promise<{ entry: FrontierCodexApplyEntry; semanticLeaseState: ReturnType<typeof createSwarmSemanticLeaseStateForMergeQueue> }> {
  const commands: FrontierCodexApplyEntry['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const branchName = input.branchPrefix ? `${input.branchPrefix}/${slug(input.bundle.jobId)}` : input.bundle.branchName;
  const base = {
    jobId: input.bundle.jobId,
    bundlePath: input.mergePath,
    ...(patchPath ? { patchPath } : {}),
    ...(branchName ? { branchName } : {}),
    dryRun: input.dryRun,
    commands
  };
  if (!patchPath) {
    return {
      entry: {
        ...base,
        status: input.bundle.disposition === 'discovery-only' ? 'skipped' : 'failed',
        error: 'missing patch'
      },
      semanticLeaseState: input.semanticLeaseState
    };
  }
  const semanticLease = createApplySemanticLeaseEvidence({
    cwd: input.cwd,
    bundle: input.bundle,
    mergePath: input.mergePath,
    state: input.semanticLeaseState
  });
  if (!semanticLease.entry.granted) {
    return {
      entry: {
        ...base,
        semanticLease: semanticLease.entry,
        status: 'failed',
        error: 'semantic lease denied'
      },
      semanticLeaseState: semanticLease.state
    };
  }
  if (!semanticLease.entry.fence.ok) {
    return {
      entry: {
        ...base,
        semanticLease: semanticLease.entry,
        status: 'failed',
        error: 'semantic lease fence validation failed'
      },
      semanticLeaseState: semanticLease.state
    };
  }
  const check = await runLoggedProcess('git', ['apply', '--check', patchPath], input.cwd);
  commands.push(check);
  if (check.status !== 0) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'failed', error: 'git apply --check failed' }, semanticLeaseState: semanticLease.state };
  if (input.dryRun) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'checked' }, semanticLeaseState: semanticLease.state };
  if (branchName) {
    const branch = await runLoggedProcess('git', ['switch', '-c', branchName], input.cwd);
    commands.push(branch);
    if (branch.status !== 0) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'failed', error: 'git switch -c failed' }, semanticLeaseState: semanticLease.state };
  }
  const apply = await runLoggedProcess('git', ['apply', patchPath], input.cwd);
  commands.push(apply);
  if (apply.status !== 0) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'failed', error: 'git apply failed' }, semanticLeaseState: semanticLease.state };
  if (!input.commit) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'applied' }, semanticLeaseState: semanticLease.state };
  const add = await runLoggedProcess('git', ['add', '--', ...input.bundle.changedPaths], input.cwd);
  commands.push(add);
  if (add.status !== 0) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'failed', error: 'git add failed' }, semanticLeaseState: semanticLease.state };
  const commit = await runLoggedProcess('git', ['commit', '-m', `Apply swarm bundle ${input.bundle.jobId}`], input.cwd);
  commands.push(commit);
  if (commit.status !== 0) return { entry: { ...base, semanticLease: semanticLease.entry, status: 'failed', error: 'git commit failed' }, semanticLeaseState: semanticLease.state };
  const rev = await runLoggedProcess('git', ['rev-parse', 'HEAD'], input.cwd);
  commands.push(rev);
  return {
    entry: {
      ...base,
      semanticLease: semanticLease.entry,
      status: 'committed',
      commit: rev.stdoutTail[0]
    },
    semanticLeaseState: semanticLease.state
  };
}

function createApplySemanticLeaseEvidence(input: {
  cwd: string;
  bundle: FrontierSwarmMergeBundle;
  mergePath: string;
  state: ReturnType<typeof createSwarmSemanticLeaseStateForMergeQueue>;
}): { entry: FrontierCodexApplySemanticLeaseEvidence; state: ReturnType<typeof createSwarmSemanticLeaseStateForMergeQueue> } {
  const generatedAt = Date.now();
  const index = createSwarmMergeIndex({ bundles: [input.bundle], generatedAt });
  const admission = createSwarmMergeAdmission({
    index,
    maxReady: 1,
    maxChangedPaths: Math.max(1, input.bundle.changedPaths.length),
    maxChangedRegions: Math.max(1, input.bundle.changedRegions.length),
    generatedAt
  });
  const queue = createSwarmHierarchicalMergeQueue({
    index,
    admission,
    generatedAt,
    metadata: {
      repository: path.basename(input.cwd),
      collectionBundlePath: input.mergePath
    }
  });
  const assignment = queue.assignments.find((entry) => entry.jobId === input.bundle.jobId) ?? queue.assignments[0];
  if (!assignment) {
    return {
      state: input.state,
      entry: {
        source: 'derived-from-merge-bundle',
        queueId: queue.id,
        stateId: input.state.id,
        granted: false,
        requiredLeaseScopeIds: [],
        requiredLeaseKeys: [],
        scopes: [],
        fence: { ok: false, reasons: ['missing-queue-assignment'] }
      }
    };
  }
  const acquire = acquireSwarmCoordinatorSemanticLease({
    queue,
    assignment,
    state: input.state,
    ownerId: 'frontier-swarm-codex-apply',
    holderId: String(process.pid),
    now: generatedAt,
    ttlMs: 15 * 60 * 1000,
    repository: path.basename(input.cwd),
    metadata: { bundlePath: input.mergePath }
  });
  const fence = acquire.lease
    ? validateSwarmCoordinatorSemanticLeaseFence({
      assignment,
      state: acquire.state,
      lease: acquire.lease,
      token: acquire.lease.token,
      fencingToken: acquire.lease.fencingToken,
      now: generatedAt
    })
    : { ok: false, reasons: ['missing-lease'], conflicts: [] };
  return {
    state: acquire.state,
    entry: {
      source: 'derived-from-merge-bundle',
      queueId: queue.id,
      assignmentId: assignment.jobId,
      stateId: acquire.state.id,
      granted: acquire.mutation.granted,
      ...(acquire.lease ? {
        leaseId: acquire.lease.id,
        token: acquire.lease.token,
        fencingToken: acquire.lease.fencingToken
      } : {}),
      requiredLeaseScopeIds: acquire.requiredLeaseScopeIds,
      requiredLeaseKeys: acquire.requiredLeaseKeys,
      scopes: acquire.scopes.map((scope) => ({
        key: scope.key,
        scopeKind: scope.scopeKind,
        ...(scope.path ? { path: scope.path } : {}),
        ...(scope.regionId ? { regionId: scope.regionId } : {}),
        ...(scope.lane ? { lane: scope.lane } : {}),
        parentKeys: [...scope.parentKeys]
      })),
      fence: {
        ok: fence.ok,
        reasons: [...fence.reasons]
      },
      evidence: acquire.mutation.evidence as unknown as Record<string, unknown>
    }
  };
}


async function resolveApplyPatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): Promise<string | undefined> {
  const sibling = path.join(path.dirname(mergePath), 'changes.patch');
  if (await pathExists(sibling)) return sibling;
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (patchPath && await pathExists(patchPath)) return patchPath;
  return undefined;
}
