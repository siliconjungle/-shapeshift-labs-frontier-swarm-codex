import fs from 'node:fs/promises';
import path from 'node:path';
import { FRONTIER_SWARM_CODEX_CLEANUP_PLAN_KIND, FRONTIER_SWARM_CODEX_CLEANUP_PLAN_VERSION } from './constants.js';
import type { FrontierCodexCleanupInput, FrontierCodexCleanupPlan } from './index.js';
import { findFilesByName, isObject, pathExists } from './common.js';
import { readCodexPidProcesses } from './collect.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export async function createCodexCleanupPlan(input: FrontierCodexCleanupInput): Promise<FrontierCodexCleanupPlan> {
  const generatedAt = Date.now();
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const runDir = path.resolve(cwd, input.run);
  const collectionDir = await resolveCollectionDir(runDir);
  const markerPath = collectionDir ? path.join(collectionDir, 'collected-and-indexed.json') : undefined;
  const indexed = !!markerPath && await pathExists(markerPath);
  const processes = await readCodexPidProcesses(path.join(runDir, 'pids.json')).catch(() => []);
  const active = processes.some((process) => process.status === 'running');
  const blockedReasons = [
    ...(!indexed ? ['missing-collected-and-indexed-marker'] : []),
    ...(active && input.keepActive !== false ? ['active-pids-present'] : [])
  ];
  const failedJobIds = input.keepFailed === false ? new Set<string>() : await readFailedJobIds(collectionDir);
  const candidates = await workspaceCleanupCandidates(runDir, failedJobIds, generatedAt, input.maxAgeHours);
  let deletedCount = 0;
  if (input.dryRun === false && blockedReasons.length === 0) {
    for (const candidate of candidates) {
      if (candidate.active || candidate.failed) continue;
      await fs.rm(candidate.path, { recursive: true, force: true });
      candidate.deleted = true;
      deletedCount += 1;
    }
  }
  return {
    kind: FRONTIER_SWARM_CODEX_CLEANUP_PLAN_KIND,
    version: FRONTIER_SWARM_CODEX_CLEANUP_PLAN_VERSION,
    ok: blockedReasons.length === 0,
    dryRun: input.dryRun !== false,
    runDir,
    generatedAt,
    indexed,
    candidates,
    blockedReasons,
    summary: {
      candidateCount: candidates.length,
      deletedCount,
      reclaimableBytes: candidates.reduce((sum, candidate) => sum + candidate.bytes, 0)
    }
  };
}

export async function handleCodexCleanupCommand(args: CliArgs): Promise<void> {
  const run = stringArg(args.run);
  if (!run) throw new Error('cleanup requires --run <run-dir>');
  const result = await createCodexCleanupPlan({
    cwd: process.cwd(),
    run,
    maxAgeHours: numberArg(args.maxAgeHours ?? args['max-age-hours'] ?? args.maxAge ?? args['max-age']),
    keepFailed: boolArg(args.keepFailed ?? args['keep-failed'], true),
    keepActive: boolArg(args.keepActive ?? args['keep-active'], true),
    dryRun: !boolArg(args.write, false)
  });
  await writeMaybe(args, result);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

async function workspaceCleanupCandidates(runDir: string, failedJobIds: ReadonlySet<string>, now: number, maxAgeHours?: number) {
  const proofs = await findFilesByName(runDir, 'workspace-proof.json');
  const out: Array<{ path: string; reason: string; bytes: number; active: boolean; failed: boolean; deleted?: boolean }> = [];
  const seen = new Set<string>();
  for (const proofPath of proofs) {
    const proof = await readJsonIfExists<{ manifest?: unknown }>(proofPath);
    const manifest = isObject(proof?.manifest) ? proof.manifest : {};
    const workspacePath = typeof manifest.path === 'string' ? manifest.path : undefined;
    const mode = typeof manifest.mode === 'string' ? manifest.mode : 'current';
    if (!workspacePath || mode === 'current' || seen.has(workspacePath) || !await pathExists(workspacePath)) continue;
    const stat = await fs.stat(workspacePath);
    if (maxAgeHours !== undefined && now - stat.mtimeMs < maxAgeHours * 3600_000) continue;
    const jobId = path.basename(workspacePath);
    seen.add(workspacePath);
    out.push({
      path: workspacePath,
      reason: `${mode}-workspace-collected-and-indexed`,
      bytes: await directoryBytes(workspacePath),
      active: false,
      failed: failedJobIds.has(jobId)
    });
  }
  return out.sort((left, right) => left.path.localeCompare(right.path));
}

async function readFailedJobIds(collectionDir: string | undefined): Promise<Set<string>> {
  if (!collectionDir) return new Set();
  const collection = await readJsonIfExists<{ buckets?: Record<string, Array<{ jobId?: string }>> }>(path.join(collectionDir, 'collection.json'));
  const failed = [
    ...(collection?.buckets?.['failed-evidence'] ?? []),
    ...(collection?.buckets?.['stale-against-head'] ?? [])
  ].map((entry) => entry.jobId).filter((entry): entry is string => typeof entry === 'string');
  return new Set(failed);
}

async function resolveCollectionDir(runDir: string): Promise<string | undefined> {
  for (const candidate of [path.join(runDir, 'collected'), path.join(runDir, 'collection'), runDir]) {
    if (await pathExists(path.join(candidate, 'collected-and-indexed.json')) || await pathExists(path.join(candidate, 'collection.json'))) return candidate;
  }
  return undefined;
}

async function directoryBytes(root: string): Promise<number> {
  const stat = await fs.stat(root).catch(() => undefined);
  if (!stat) return 0;
  if (stat.isFile()) return stat.size;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  let total = 0;
  for (const entry of entries) total += await directoryBytes(path.join(root, entry.name));
  return total;
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!await pathExists(file)) return undefined;
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

async function writeMaybe(args: CliArgs, result: unknown): Promise<void> {
  const out = stringArg(args.out ?? args.outFile ?? args['out-file']);
  if (out) await fs.writeFile(path.resolve(process.cwd(), out), JSON.stringify(result, null, 2) + '\n');
}

function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolArg(value: CliValue | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}
