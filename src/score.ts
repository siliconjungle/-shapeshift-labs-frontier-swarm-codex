import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { matchesGlob, type FrontierSwarmCommand, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND, FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION } from './constants.js';
import type { FrontierCodexCollectBucket, FrontierCodexCollectResult, FrontierCodexPatchScoreEntry, FrontierCodexPatchScoreInput, FrontierCodexPatchScoreResult, FrontierCodexPatchScoreStatus } from './index.js';
import { copyWorkspacePath, findFilesByName, pathExists, pathHasIgnoredSegment, resolveBundlePatchPath, runLoggedProcess, slug, uniqueStrings, uniqueWorkspacePaths } from './common.js';
import { collectCodexSwarmRun } from './collect.js';
import { summarizePatchScoreSemanticEvidence } from './patch-score-semantic.js';
import { contextBudgetFromBundle } from './context-budget.js';
import { calibratePatchScores } from './score-calibration.js';


export async function scoreCodexSwarmPatches(input: FrontierCodexPatchScoreInput): Promise<FrontierCodexPatchScoreResult> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  if (!input.collection && !input.run) throw new Error('score requires --collection <dir> or --run <run-dir>');
  const collectionDir = input.collection
    ? path.resolve(cwd, input.collection)
    : (await collectCodexSwarmRun({ run: String(input.run ?? ''), cwd, outDir: input.outDir })).outDir;
  const outDir = path.resolve(cwd, input.outDir ?? path.join(collectionDir, 'patch-scores'));
  const bucket = input.bucket ?? 'all';
  const roots = bucket === 'all'
    ? collectBuckets().map((entry) => path.join(collectionDir, entry))
    : [path.join(collectionDir, bucket)];
  const wanted = new Set(input.jobIds ?? []);
  const mergeTargets = await scoreMergeTargets(collectionDir, await scoreMergePaths(collectionDir, roots, bucket));
  const entries: FrontierCodexPatchScoreEntry[] = [];
  for (const { mergePath, bundle } of mergeTargets.slice(0, input.limit ? Math.max(0, Math.floor(input.limit)) : undefined)) {
    if (wanted.size && !wanted.has(bundle.jobId)) continue;
    entries.push(await scoreCodexMergeBundle({ cwd, mergePath, bundle, outDir, input }));
  }
  const statuses: FrontierCodexPatchScoreStatus[] = ['accepted-clean', 'accepted-needs-port', 'conflict', 'test-fail', 'stale', 'evidence-only'];
  const summary = Object.fromEntries(statuses.map((status) => [status, entries.filter((entry) => entry.status === status).length])) as Record<FrontierCodexPatchScoreStatus, number>;
  const sortedEntries = entries.sort((left, right) => right.score - left.score || left.jobId.localeCompare(right.jobId));
  const calibration = await calibratePatchScores({ collectionDir, entries: sortedEntries });
  const result: FrontierCodexPatchScoreResult = {
    kind: FRONTIER_SWARM_CODEX_PATCH_SCORE_KIND,
    version: FRONTIER_SWARM_CODEX_PATCH_SCORE_VERSION,
    ok: entries.every((entry) => entry.status === 'accepted-clean' || entry.status === 'accepted-needs-port' || entry.status === 'evidence-only'),
    cwd,
    collectionDir,
    outDir,
    generatedAt,
    entries: sortedEntries,
    summary: { ...summary, total: entries.length },
    calibration
  };
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'patch-score.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}


type ScoreMergeTarget = {
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
};


async function scoreMergeTargets(collectionDir: string, mergePaths: readonly string[]): Promise<ScoreMergeTarget[]> {
  const byJobId = new Map<string, ScoreMergeTarget>();
  for (const mergePath of mergePaths) {
    const bundle = JSON.parse(await fs.readFile(mergePath, 'utf8')) as FrontierSwarmMergeBundle;
    const key = bundle.jobId || mergePath;
    const next = { mergePath, bundle };
    const current = byJobId.get(key);
    if (!current || preferScoreMergeTarget(collectionDir, next, current)) byJobId.set(key, next);
  }
  return Array.from(byJobId.values()).sort((left, right) => left.mergePath.localeCompare(right.mergePath));
}


function preferScoreMergeTarget(collectionDir: string, next: ScoreMergeTarget, current: ScoreMergeTarget): boolean {
  const nextCollected = isInsideCollection(collectionDir, next.mergePath);
  const currentCollected = isInsideCollection(collectionDir, current.mergePath);
  if (nextCollected !== currentCollected) return nextCollected;
  return next.mergePath.localeCompare(current.mergePath) < 0;
}


function isInsideCollection(collectionDir: string, file: string): boolean {
  const relative = path.relative(collectionDir, file).replace(/\\/g, '/');
  return !!relative && relative !== '..' && !relative.startsWith('../') && !path.isAbsolute(relative);
}


async function scoreMergePaths(collectionDir: string, roots: string[], bucket: FrontierCodexPatchScoreInput['bucket']): Promise<string[]> {
  const paths = new Set<string>();
  for (const mergePath of (await Promise.all(roots.map((root) => findFilesByName(root, 'merge.json')))).flat()) {
    paths.add(mergePath);
  }
  const indexed = await readCollectionMergePaths(collectionDir, bucket ?? 'all');
  for (const mergePath of indexed) paths.add(mergePath);
  return Array.from(paths).sort();
}


async function readCollectionMergePaths(collectionDir: string, bucket: FrontierCodexCollectBucket | 'all'): Promise<string[]> {
  const file = path.join(collectionDir, 'collection.json');
  const parsed = await fs.readFile(file, 'utf8')
    .then((text) => JSON.parse(text) as FrontierCodexCollectResult)
    .catch(() => undefined);
  if (!parsed?.buckets) return [];
  const buckets = bucket === 'all' ? collectBuckets() : [bucket];
  const out: string[] = [];
  for (const name of buckets) {
    for (const entry of parsed.buckets[name] ?? []) {
      const mergePath = path.isAbsolute(entry.mergePath) ? entry.mergePath : path.resolve(collectionDir, entry.mergePath);
      if (await pathExists(mergePath)) out.push(mergePath);
      else {
        const fallback = path.join(path.isAbsolute(entry.outputDir) ? entry.outputDir : path.resolve(collectionDir, entry.outputDir), 'merge.json');
        if (await pathExists(fallback)) out.push(fallback);
      }
    }
  }
  return out;
}


function collectBuckets(): FrontierCodexCollectBucket[] {
  return ['ready-to-apply', 'needs-human-port', 'failed-evidence', 'stale-against-head'];
}


async function scoreCodexMergeBundle(input: {
  cwd: string;
  mergePath: string;
  bundle: FrontierSwarmMergeBundle;
  outDir: string;
  input: FrontierCodexPatchScoreInput;
}): Promise<FrontierCodexPatchScoreEntry> {
  const commands: FrontierCodexPatchScoreEntry['commands'] = [];
  const patchPath = await resolveApplyPatchPath(input.bundle, input.mergePath);
  const semanticEvidence = summarizePatchScoreSemanticEvidence(input.bundle);
  const contextBudget = contextBudgetFromBundle(input.bundle);
  const contextReasons = contextBudgetReasons(contextBudget);
  const contextPenalty = contextBudgetPenalty(contextBudget);
  const base = {
    jobId: input.bundle.jobId,
    bundlePath: input.mergePath,
    ...(patchPath ? { patchPath } : {}),
    changedPaths: [...input.bundle.changedPaths],
    semanticEvidence,
    ...(contextBudget ? { contextBudget } : {}),
    commands
  };
  if (!patchPath || input.bundle.disposition === 'discovery-only' || input.bundle.changedPaths.length === 0) {
    return {
      ...base,
      status: 'evidence-only',
      score: clampPatchScore(20 + Math.min(0, semanticEvidence.scoreAdjustment) - contextPenalty),
      reasons: uniqueStrings(['no patch to apply', ...semanticEvidence.reasons, ...contextReasons])
    };
  }
  if (input.bundle.staleAgainstHead || input.bundle.disposition === 'stale-against-head') {
    return { ...base, status: 'stale', score: 0, reasons: uniqueStrings(['stale-against-head', ...semanticEvidence.reasons, ...contextReasons]) };
  }
  const workspacePath = await createScoreWorkspace(input.cwd, input.bundle.jobId, input.input);
  try {
    const check = await runLoggedProcess('git', ['apply', '--check', patchPath], workspacePath);
    commands.push(check);
    if (check.status !== 0) {
      return { ...base, workspacePath, status: 'conflict', score: 0, reasons: uniqueStrings(['git apply --check failed', ...semanticEvidence.reasons, ...contextReasons]) };
    }
    const apply = await runLoggedProcess('git', ['apply', patchPath], workspacePath);
    commands.push(apply);
    if (apply.status !== 0) return { ...base, workspacePath, status: 'conflict', score: 0, reasons: uniqueStrings(['git apply failed', ...semanticEvidence.reasons, ...contextReasons]) };
    const gates = scoreCommands(input.bundle, input.input);
    for (const gate of gates) {
      const run = await runLoggedProcess(gate.command, gate.args, gate.cwd ? path.resolve(workspacePath, gate.cwd) : workspacePath);
      commands.push(run);
      if (run.status !== 0 && gate.required !== false) {
        return {
          ...base,
          workspacePath,
          status: 'test-fail',
          score: clampPatchScore(10 + Math.min(0, semanticEvidence.scoreAdjustment) - contextPenalty),
          reasons: uniqueStrings([`gate failed: ${gate.name}`, ...semanticEvidence.reasons, ...contextReasons])
        };
      }
    }
    const bundleAutoMergeable = input.bundle.disposition === 'auto-mergeable' && input.bundle.autoMergeable;
    const operationAutoMergeable = semanticEvidence.semanticEditOperationCleanEligible;
    const semanticAutoMergeable = semanticEvidence.semanticEditAdmission.autoMergeCandidate &&
      semanticEvidence.semanticEditAdmission.cleanEligible &&
      operationAutoMergeable;
    const clean = (semanticEvidence.cleanEligible || operationAutoMergeable)
      && (bundleAutoMergeable || semanticAutoMergeable || operationAutoMergeable);
    const reasons = uniqueStrings([
      ...(operationAutoMergeable && !semanticEvidence.cleanEligible
        ? ['semantic edit operation auto-merge candidate accepted with review-only sidecar records']
        : []),
      ...(bundleAutoMergeable
        ? []
        : semanticAutoMergeable
          ? ['semantic edit script promoted bundle to auto-merge candidate']
          : operationAutoMergeable
            ? ['semantic edit operation promoted bundle to auto-merge candidate']
            : ['patch applies but bundle is not auto-mergeable']),
      ...semanticEvidence.reasons,
      ...contextReasons
    ]);
    return {
      ...base,
      workspacePath,
      status: clean ? 'accepted-clean' : 'accepted-needs-port',
      score: clampPatchScore((clean ? 100 : 70) + semanticEvidence.scoreAdjustment - contextPenalty),
      reasons
    };
  } finally {
    if (!input.input.keepWorkspaces) await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => {});
  }
}

function contextBudgetReasons(contextBudget: ReturnType<typeof contextBudgetFromBundle>): string[] {
  if (!contextBudget) return [];
  return uniqueStrings([
    ...contextBudget.warnings.map((warning) => `context budget warning: ${warning}`),
    ...contextBudget.errors.map((error) => `context budget failed: ${error}`)
  ]);
}

function contextBudgetPenalty(contextBudget: ReturnType<typeof contextBudgetFromBundle>): number {
  if (!contextBudget) return 0;
  return (contextBudget.status === 'failed' ? 35 : contextBudget.status === 'warning' ? 10 : 0)
    + Math.min(20, Math.floor((contextBudget.usage?.inputTokens ?? 0) / 500_000));
}


function clampPatchScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}


async function createScoreWorkspace(cwd: string, jobId: string, input: FrontierCodexPatchScoreInput): Promise<string> {
  const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), `frontier-swarm-score-${slug(jobId)}-`));
  const excludes = uniqueWorkspacePaths([
    '.git',
    'node_modules',
    'dist',
    'coverage',
    'agent-runs',
    '.frontier-framework',
    ...(input.workspaceExcludes ?? [])
  ]);
  const includes = uniqueWorkspacePaths(input.workspaceIncludes ?? []);
  if (includes.length) {
    for (const include of includes) await copyWorkspacePath(cwd, workspacePath, include, excludes);
  } else {
    await fs.cp(cwd, workspacePath, {
      recursive: true,
      force: true,
      filter: (source) => {
        if (source === cwd) return true;
        const relative = path.relative(cwd, source).replace(/\\/g, '/');
        if (!relative) return true;
        if (pathHasIgnoredSegment(relative, excludes)) return false;
        return !excludes.some((entry) => relative === entry || relative.startsWith(entry.replace(/\/$/, '') + '/'));
      }
    });
  }
  return workspacePath;
}


function scoreCommands(bundle: FrontierSwarmMergeBundle, input: FrontierCodexPatchScoreInput): FrontierSwarmCommand[] {
  const focused = normalizeScoreCommands(input.focusedCommands ?? []);
  const global = bundle.changedPaths.some((file) => (input.globalGlobs ?? []).some((glob) => matchesGlob(file, glob)))
    ? normalizeScoreCommands(input.globalCommands ?? [])
    : [];
  return [...focused, ...global];
}


function normalizeScoreCommands(input: readonly (string | FrontierSwarmCommand)[]): FrontierSwarmCommand[] {
  return input.map((entry) => {
    if (typeof entry === 'string') return { name: entry, command: 'sh', args: ['-c', entry], required: true };
    return {
      name: entry.name,
      command: entry.command,
      args: [...entry.args],
      required: entry.required,
      ...(entry.cwd ? { cwd: entry.cwd } : {}),
      ...(entry.metadata ? { metadata: entry.metadata } : {})
    };
  }).filter((entry) => entry.command.length > 0);
}


async function resolveApplyPatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): Promise<string | undefined> {
  const sibling = path.join(path.dirname(mergePath), 'changes.patch');
  if (await pathExists(sibling)) return sibling;
  const patchPath = resolveBundlePatchPath(bundle, mergePath);
  if (patchPath && await pathExists(patchPath)) return patchPath;
  return undefined;
}
