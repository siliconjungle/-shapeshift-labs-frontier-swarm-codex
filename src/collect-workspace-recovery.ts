import fs from 'node:fs/promises';
import path from 'node:path';
import {
  matchesGlob,
  type FrontierSwarmMergeBundle
} from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COLLECTION_KIND } from './constants.js';
import {
  isObject,
  pathExists,
  resolveBundlePatchPath,
  slug,
  stableHash,
  uniqueStrings,
  uniqueWorkspacePaths
} from './common.js';
import { noIndexWorkspacePatch } from './codex-workspace-changes.js';
import { readFrontierCodexWorkspaceProof } from './collect-workspace-proof.js';
import type {
  FrontierCodexCollectBucket,
  FrontierCodexCollectedBundle
} from './types-collection.js';
import type { FrontierCodexWorkspaceProof } from './types-workspace.js';

export type CodexCollectMergeRecord = {
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  generatedByCollector?: boolean;
  patchPath?: string;
};

export async function resolveOrSynthesizeCollectedPatch(input: {
  runDir: string;
  cwd: string;
  outDir: string;
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  generatedAt: number;
}): Promise<{ bundle: FrontierSwarmMergeBundle; patchPath?: string; generatedByCollector?: boolean }> {
  const existingPatchPath = await resolveCollectedBundlePatchPath(input.bundle, input.mergePath);
  if (existingPatchPath) return { bundle: input.bundle, patchPath: existingPatchPath };
  const generated = await synthesizeCollectorPatchFromWorkerCheckout(input);
  if (!generated) return { bundle: input.bundle };
  return { bundle: generated.bundle, patchPath: generated.patchPath, generatedByCollector: true };
}

export function collectedGeneratedPatchCount(buckets: Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]>): number {
  return Object.values(buckets).flat().filter((entry) => entry.generatedByCollector).length;
}

async function resolveCollectedBundlePatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): Promise<string | undefined> {
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (patchPath && await pathExists(patchPath)) return patchPath;
  const sibling = path.join(path.dirname(mergePath), 'changes.patch');
  return await pathExists(sibling) ? sibling : undefined;
}

async function synthesizeCollectorPatchFromWorkerCheckout(input: {
  runDir: string;
  cwd: string;
  outDir: string;
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  generatedAt: number;
}): Promise<{ bundle: FrontierSwarmMergeBundle; patchPath: string } | undefined> {
  const changedPaths = uniqueWorkspacePaths(input.bundle.changedPaths);
  const scopedChangedPaths = input.bundle.allowedWrites.length
    ? changedPaths.filter((file) => input.bundle.allowedWrites.some((glob) => matchesGlob(file, glob)))
    : changedPaths;
  if (!scopedChangedPaths.length) return undefined;
  const workspaceProof = await readCollectedWorkspaceProof(input.bundle, input.mergePath);
  const workspacePath = workspaceProof?.proof.manifest.path;
  if (!workspacePath || !await pathExists(workspacePath)) return undefined;
  const diff = await noIndexWorkspacePatch(input.cwd, workspacePath, scopedChangedPaths);
  if (!diff.trim()) return undefined;
  const generatedDir = path.join(input.outDir, 'generated-by-collector', slug(input.bundle.jobId));
  const patchPath = path.join(generatedDir, 'changes.patch');
  await fs.mkdir(generatedDir, { recursive: true });
  await fs.writeFile(patchPath, diff);
  return {
    patchPath,
    bundle: {
      ...input.bundle,
      patchPath,
      patchHash: stableHash(diff),
      evidencePaths: uniqueStrings([...input.bundle.evidencePaths, patchPath, ...(workspaceProof?.path ? [workspaceProof.path] : [])]),
      metadata: collectorPatchMetadata(input, workspaceProof, patchPath, scopedChangedPaths)
    }
  };
}

function collectorPatchMetadata(
  input: {
    runDir: string;
    mergePath: string;
    bundle: FrontierSwarmMergeBundle;
    generatedAt: number;
  },
  workspaceProof: { path: string; proof: FrontierCodexWorkspaceProof },
  patchPath: string,
  changedPaths: readonly string[]
): FrontierSwarmMergeBundle['metadata'] {
  const metadata = isObject(input.bundle.metadata) ? input.bundle.metadata : {};
  const codex = isObject(metadata.frontierSwarmCodex) ? metadata.frontierSwarmCodex : {};
  return {
    ...metadata,
    frontierSwarmCodex: {
      ...codex,
      generatedPatch: {
        source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
        classifier: 'generated-by-collector',
        reason: 'changes.patch missing; synthesized from worker checkout',
        generatedAt: input.generatedAt,
        runDir: input.runDir,
        mergePath: input.mergePath,
        patchPath,
        workspacePath: workspaceProof.proof.manifest.path,
        workspaceMode: workspaceProof.proof.manifest.mode,
        changedPaths: [...changedPaths].sort(),
        allowedWrites: [...input.bundle.allowedWrites],
        ...(input.bundle.patchPath ? { originalPatchPath: input.bundle.patchPath } : {}),
        workspaceProofPath: workspaceProof.path
      }
    }
  } as FrontierSwarmMergeBundle['metadata'];
}

async function readCollectedWorkspaceProof(
  bundle: FrontierSwarmMergeBundle,
  mergePath: string
): Promise<{ path: string; proof: FrontierCodexWorkspaceProof } | undefined> {
  const candidates = uniqueStrings([
    ...bundle.evidencePaths.filter((entry) => path.basename(entry) === 'workspace-proof.json'),
    path.join(path.dirname(mergePath), 'workspace-proof.json'),
    path.join(path.dirname(path.dirname(mergePath)), 'evidence', 'workspace-proof.json')
  ]);
  for (const candidate of candidates) {
    const proof = await readFrontierCodexWorkspaceProof(candidate);
    if (proof) return { path: candidate, proof };
  }
  return undefined;
}
