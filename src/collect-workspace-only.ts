import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { FRONTIER_SWARM_MERGE_BUNDLE_KIND, FRONTIER_SWARM_MERGE_BUNDLE_VERSION, matchesGlob, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { FRONTIER_SWARM_CODEX_COLLECTION_KIND } from './constants.js';
import { isObject, isWorkspaceNoisePath, normalizeWorkspacePath, pathExists, pathHasIgnoredSegment, readOptionalText, slug, stableHash, uniqueStrings, uniqueWorkspacePaths } from './common.js';
import { noIndexWorkspacePatch } from './codex-workspace-changes.js';
import { discoverCodexHandoffArtifacts } from './handoff-artifacts.js';
import { readFrontierCodexWorkspaceProof } from './collect-workspace-proof.js';
import type { CodexCollectMergeRecord } from './collect-workspace-recovery.js';
import type { FrontierCodexWorkspaceProof } from './types-workspace.js';

export async function collectWorkspaceOnlyMergeRecords(input: {
  runDir: string; cwd: string; outDir: string; ignoredCollectionSegments: readonly string[];
  existingJobIds: ReadonlySet<string>; generatedAt: number; pidManifestPath?: string;
}): Promise<CodexCollectMergeRecord[]> {
  const records: CodexCollectMergeRecord[] = [];
  const seenJobIds = new Set(input.existingJobIds);
  const workerStates = await readWorkspaceOnlyPidStates(input.pidManifestPath);
  const jobDirs = await collectWorkspaceOnlyJobDirs(input.runDir, input.ignoredCollectionSegments);
  for (const jobDir of jobDirs) {
    const record = await synthesizeWorkspaceOnlyMergeRecord({ ...input, jobDir, workerStates });
    if (!record || seenJobIds.has(record.bundle.jobId)) continue;
    seenJobIds.add(record.bundle.jobId);
    records.push(record);
  }
  return records;
}

async function collectWorkspaceOnlyJobDirs(runDir: string, ignoredCollectionSegments: readonly string[]): Promise<string[]> {
  const entries = await fs.readdir(runDir, { withFileTypes: true }).catch(() => []);
  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const absolute = path.join(runDir, entry.name);
    const relative = path.relative(runDir, absolute);
    if (pathHasIgnoredSegment(relative, ignoredCollectionSegments)) continue;
    if (entry.name === 'streams' || entry.name === 'generated-by-collector') continue;
    if (!await pathExists(path.join(absolute, 'prompt.md'))) continue;
    if (await pathExists(path.join(absolute, 'evidence', 'merge.json'))) continue;
    if (await pathExists(path.join(absolute, 'evidence', 'changes.patch'))) continue;
    dirs.push(absolute);
  }
  return dirs.sort();
}

async function synthesizeWorkspaceOnlyMergeRecord(input: {
  runDir: string; cwd: string; outDir: string; jobDir: string; generatedAt: number;
  workerStates: ReadonlyMap<string, WorkspaceOnlyPidState>;
}): Promise<CodexCollectMergeRecord | undefined> {
  const promptPath = path.join(input.jobDir, 'prompt.md');
  const prompt = await readOptionalText(promptPath);
  if (!prompt) return undefined;
  const promptTask = readPromptTask(prompt);
  const jobId = readFirstString(promptTask.jobId) ?? path.basename(input.jobDir);
  const workerState = await readWorkspaceOnlyWorkerState({ jobDir: input.jobDir, pidState: input.workerStates.get(jobId) });
  const workspaceProofPath = path.join(input.jobDir, 'evidence', 'workspace-proof.json');
  const workspaceProof = await readFrontierCodexWorkspaceProof(workspaceProofPath);
  const workspacePath = workspaceProof?.manifest.path ?? readPromptHeader(prompt, 'Workspace');
  if (!workspacePath || !await pathExists(workspacePath)) return undefined;
  const allowedWrites = uniqueStrings([...stringArray(promptTask.allowedWrites), ...stringArray(promptTask.allowedWriteGlobs)]).sort();
  const candidateGlobs = uniqueStrings([...allowedWrites, ...stringArray(promptTask.targetRefs), ...stringArray(promptTask.sourceRefs)]).sort();
  if (!candidateGlobs.length) return undefined;
  const changedPaths = await collectWorkspaceOnlyChangedPaths({ cwd: input.cwd, workspacePath, workspaceProof, candidateGlobs, allowedWrites });
  if (!changedPaths.length) return undefined;
  const diff = await noIndexWorkspacePatch(input.cwd, workspacePath, changedPaths);
  const hasPatch = diff.trim().length > 0;
  const generatedDir = path.join(input.outDir, 'generated-by-collector', slug(jobId));
  await fs.mkdir(generatedDir, { recursive: true });
  const patchPath = hasPatch ? path.join(generatedDir, 'changes.patch') : undefined;
  const mergePath = path.join(generatedDir, 'merge.json');
  if (patchPath) await fs.writeFile(patchPath, diff);
  const ownershipViolations = allowedWrites.length ? changedPaths.filter((file) => !allowedWrites.some((glob) => matchesGlob(file, glob))).sort() : [];
  const bundle = await workspaceOnlyMergeBundle({
    ...input,
    promptPath,
    promptTask,
    jobId,
    workspacePath,
    workspaceProof,
    workspaceProofPath,
    ...(patchPath ? { patchPath } : {}),
    diff,
    changedPaths,
    allowedWrites,
    ownershipViolations,
    workerState,
    recoveryFailureReasons: hasPatch ? [] : ['empty patch', 'collector-workspace-only-recovery-failed-patch']
  });
  await fs.writeFile(mergePath, JSON.stringify(bundle, null, 2) + '\n');
  return { mergePath, bundle, generatedByCollector: true, ...(patchPath ? { patchPath } : {}) };
}

async function workspaceOnlyMergeBundle(input: {
  runDir: string;
  cwd: string;
  jobDir: string;
  generatedAt: number;
  promptPath: string;
  promptTask: Record<string, unknown>;
  jobId: string;
  workspacePath: string;
  workspaceProof?: FrontierCodexWorkspaceProof;
  workspaceProofPath: string;
  patchPath?: string;
  diff: string;
  changedPaths: string[];
  allowedWrites: string[];
  ownershipViolations: string[];
  workerState: WorkspaceOnlyWorkerState;
  recoveryFailureReasons: string[];
}): Promise<FrontierSwarmMergeBundle> {
  const taskId = readFirstString(input.promptTask.taskId);
  const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: input.jobDir }).catch(() => []);
  const evidencePaths = uniqueStrings([
    path.join(input.jobDir, 'evidence'),
    input.promptPath,
    ...(input.patchPath ? [input.patchPath] : []),
    ...(await pathExists(input.workspaceProofPath) ? [input.workspaceProofPath] : []),
    ...(await pathExists(path.join(input.jobDir, 'last-message.md')) ? [path.join(input.jobDir, 'last-message.md')] : []),
    ...handoffArtifacts.map((artifact) => artifact.path)
  ]).sort();
  const stoppedStale = input.workerState.stale;
  const failed = input.ownershipViolations.length > 0 || input.recoveryFailureReasons.length > 0 || stoppedStale;
  const status: FrontierSwarmMergeBundle['status'] = failed ? 'failed' : 'completed';
  const recoveredStoppedPatch = stoppedStale && Boolean(input.patchPath);
  return {
    kind: FRONTIER_SWARM_MERGE_BUNDLE_KIND,
    version: FRONTIER_SWARM_MERGE_BUNDLE_VERSION,
    id: `swarm-merge-bundle:${stableHash(['workspace-only', input.jobId, input.patchPath, input.diff, input.recoveryFailureReasons])}`,
    runId: path.basename(input.runDir),
    jobId: input.jobId,
    ...(taskId ? { taskId } : {}),
    ...(readFirstString(input.promptTask.lane) ? { lane: readFirstString(input.promptTask.lane) } : {}),
    ...(readFirstString(input.promptTask.title) ? { title: readFirstString(input.promptTask.title) } : {}),
    generatedAt: input.generatedAt,
    status,
    mergeReadiness: recoveredStoppedPatch ? 'patch-candidate' : failed ? 'rejected' : 'patch-candidate',
    disposition: recoveredStoppedPatch ? 'needs-port' : failed ? 'rejected' : 'needs-port',
    riskLevel: failed ? 'high' : 'unknown',
    autoMergeable: false,
    changedPaths: input.changedPaths,
    changedRegions: uniqueStrings([
      ...stringArray(input.promptTask.changedRegions),
      ...stringArray(input.promptTask.ownedRegions),
      ...stringArray(input.promptTask.ownershipRegions)
    ]).sort(),
    ownedFilesTouched: input.ownershipViolations.length === 0 ? [...input.changedPaths] : [],
    allowedWrites: input.allowedWrites,
    ownershipViolations: input.ownershipViolations,
    ...(input.patchPath ? { patchPath: input.patchPath, patchHash: stableHash(input.diff) } : {}),
    evidencePaths,
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: taskId ? [taskId] : [],
    staleAgainstHead: false,
    reasons: uniqueStrings([
      recoveredStoppedPatch
        ? 'collector-stale-worker-partial-recovery-needs-coordinator-review'
        : failed ? 'rejected' : 'collector-workspace-only-recovery-needs-coordinator-review',
      'collector-workspace-only-recovery',
      ...(recoveredStoppedPatch ? ['collector-partial-source-recovery'] : []),
      ...(!input.patchPath && stoppedStale ? ['collector-partial-source-recovery-rejected'] : []),
      ...input.workerState.reasons,
      ...input.recoveryFailureReasons,
      ...input.ownershipViolations.map((file) => `ownership-violation:${file}`)
    ]).sort(),
    metadata: { frontierSwarmCodex: { workspaceOnlyCollection: workspaceOnlyMetadata(input) } } as FrontierSwarmMergeBundle['metadata']
  };
}

function workspaceOnlyMetadata(input: {
  cwd: string;
  jobDir: string;
  promptPath: string;
  patchPath?: string;
  workspacePath: string;
  workspaceProof?: FrontierCodexWorkspaceProof;
  workspaceProofPath: string;
  changedPaths: string[];
  allowedWrites: string[];
  workerState: WorkspaceOnlyWorkerState;
  recoveryFailureReasons: string[];
}): Record<string, unknown> {
  return {
    source: FRONTIER_SWARM_CODEX_COLLECTION_KIND,
    reason: 'worker checkout changed source files but emitted no merge.json or changes.patch',
    jobDir: input.jobDir,
    promptPath: input.promptPath,
    ...(input.patchPath ? { patchPath: input.patchPath } : {}),
    workspacePath: input.workspacePath,
    workspaceMode: input.workspaceProof?.manifest.mode ?? 'unknown',
    changedPathSource: 'worker-checkout',
    recoveryStatus: input.workerState.stale
      ? input.patchPath ? 'stale-worker-patch-generated' : 'stale-worker-rejected'
      : input.patchPath ? 'patch-generated' : 'failed-patch',
    changedPaths: input.changedPaths,
    allowedWrites: input.allowedWrites,
    workerState: input.workerState,
    ...(input.recoveryFailureReasons.length ? { recoveryFailureReasons: input.recoveryFailureReasons } : {}),
    ...(input.workspaceProof ? { workspaceProofPath: input.workspaceProofPath } : {}),
    cwd: input.cwd
  };
}

interface WorkspaceOnlyPidState {
  pids: number[];
  stoppedAt?: number;
  stopSignal?: string;
  stopReason?: string;
}

interface WorkspaceOnlyWorkerState {
  outcome: 'stopped' | 'unknown';
  stale: boolean;
  noOutputProgress: boolean;
  outputBytes: number;
  eventBytes: number;
  stderrBytes: number;
  hasLastMessage: boolean;
  reasons: string[];
  pids: number[];
  stoppedAt?: number;
  stopSignal?: string;
  stopReason?: string;
}

async function readWorkspaceOnlyPidStates(file: string | undefined): Promise<Map<string, WorkspaceOnlyPidState>> {
  const states = new Map<string, WorkspaceOnlyPidState>();
  if (!file) return states;
  const parsed = await readJsonIfExists(file);
  const entries = Array.isArray(parsed?.entries) ? parsed.entries.filter(isObject) : [];
  for (const entry of entries) {
    const jobId = typeof entry.jobId === 'string' ? entry.jobId : undefined;
    if (!jobId) continue;
    const current = states.get(jobId) ?? { pids: [] };
    const pid = Number(entry.pid);
    const stoppedAt = Number(entry.stoppedAt);
    states.set(jobId, {
      pids: Number.isFinite(pid) ? uniqueNumbers([...current.pids, pid]) : current.pids,
      stoppedAt: Number.isFinite(stoppedAt) ? Math.max(current.stoppedAt ?? 0, stoppedAt) : current.stoppedAt,
      stopSignal: typeof entry.stopSignal === 'string' ? entry.stopSignal : current.stopSignal,
      stopReason: typeof entry.stopReason === 'string' ? entry.stopReason : current.stopReason
    });
  }
  return states;
}

async function readWorkspaceOnlyWorkerState(input: {
  jobDir: string;
  pidState?: WorkspaceOnlyPidState;
}): Promise<WorkspaceOnlyWorkerState> {
  const logState = await readWorkspaceOnlyLogState(input.jobDir);
  const lastMessage = await readOptionalText(path.join(input.jobDir, 'last-message.md'));
  const hasLastMessage = Boolean(lastMessage?.trim());
  const stopped = Boolean(input.pidState?.stoppedAt || input.pidState?.stopSignal || input.pidState?.stopReason);
  const noOutputProgress = stopped && logState.outputBytes === 0 && !hasLastMessage;
  const reasons = uniqueStrings([
    ...(stopped ? ['stale-worker-stopped'] : []),
    ...(noOutputProgress ? ['worker-no-output-progress'] : []),
    ...(input.pidState?.stopSignal ? [`worker-signal:${input.pidState.stopSignal}`] : []),
    ...(input.pidState?.stopReason ? [`worker-stop-reason:${input.pidState.stopReason}`] : []),
    ...(stopped || noOutputProgress ? ['stale-worker-state'] : [])
  ]);
  return {
    outcome: stopped ? 'stopped' : 'unknown',
    stale: stopped || noOutputProgress,
    noOutputProgress,
    outputBytes: logState.outputBytes,
    eventBytes: logState.eventBytes,
    stderrBytes: logState.stderrBytes,
    hasLastMessage,
    reasons,
    pids: input.pidState?.pids ?? [],
    ...(input.pidState?.stoppedAt ? { stoppedAt: input.pidState.stoppedAt } : {}),
    ...(input.pidState?.stopSignal ? { stopSignal: input.pidState.stopSignal } : {}),
    ...(input.pidState?.stopReason ? { stopReason: input.pidState.stopReason } : {})
  };
}

async function readWorkspaceOnlyLogState(jobDir: string): Promise<{ outputBytes: number; eventBytes: number; stderrBytes: number }> {
  const summary = await readJsonIfExists(path.join(jobDir, 'evidence', 'log-summary.json'));
  const summaryEventBytes = numberValue(summary?.eventBytes);
  const summaryStderrBytes = numberValue(summary?.stderrBytes);
  if (summaryEventBytes || summaryStderrBytes) {
    return {
      outputBytes: summaryEventBytes + summaryStderrBytes,
      eventBytes: summaryEventBytes,
      stderrBytes: summaryStderrBytes
    };
  }
  const eventBytes = await fileSize(path.join(jobDir, 'codex-events.jsonl'));
  const stderrBytes = await fileSize(path.join(jobDir, 'codex-stderr.log'));
  return { outputBytes: eventBytes + stderrBytes, eventBytes, stderrBytes };
}

async function readJsonIfExists(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function fileSize(file: string): Promise<number> {
  const stat = await fs.stat(file).catch(() => undefined);
  return stat?.isFile() ? stat.size : 0;
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

async function collectWorkspaceOnlyChangedPaths(input: {
  cwd: string; workspacePath: string; workspaceProof?: FrontierCodexWorkspaceProof;
  candidateGlobs: readonly string[]; allowedWrites: readonly string[];
}): Promise<string[]> {
  const proofPaths = uniqueWorkspacePaths([
    ...(input.workspaceProof?.observedChangedPaths ?? []),
    ...(input.workspaceProof?.reportedChangedPaths ?? [])
  ]).filter((file) => workspaceOnlyPathIsCandidate(file, input.candidateGlobs, input.allowedWrites));
  if (proofPaths.length) return proofPaths.sort();
  const candidates = await workspaceOnlyCandidatePaths(input);
  const changed: string[] = [];
  for (const file of candidates) {
    const sourceMarker = await workspaceOnlyFileMarker(path.join(input.cwd, file));
    const targetMarker = await workspaceOnlyFileMarker(path.join(input.workspacePath, file));
    if (sourceMarker !== targetMarker) changed.push(file);
  }
  return uniqueWorkspacePaths(changed).sort();
}

async function workspaceOnlyCandidatePaths(input: {
  cwd: string;
  workspacePath: string;
  candidateGlobs: readonly string[];
  allowedWrites: readonly string[];
}): Promise<string[]> {
  const candidates = new Set<string>();
  for (const glob of input.candidateGlobs) {
    const normalizedGlob = glob.trim().replace(/\\/g, '/');
    if (!normalizedGlob || normalizedGlob.includes('\0')) continue;
    if (!globHasMagic(normalizedGlob)) {
      const normalized = normalizeWorkspacePath(normalizedGlob);
      if (normalized) candidates.add(normalized);
      continue;
    }
    const prefix = globStaticPrefix(normalizedGlob);
    if (!prefix) continue;
    for (const root of [input.cwd, input.workspacePath]) {
      for (const file of await listWorkspaceOnlyFiles(path.join(root, prefix), root)) {
        if (matchesGlob(file, normalizedGlob)) candidates.add(file);
      }
    }
  }
  return uniqueWorkspacePaths([...candidates]).filter((file) => workspaceOnlyPathIsCandidate(file, input.candidateGlobs, input.allowedWrites)).sort();
}

function workspaceOnlyPathIsCandidate(file: string, candidateGlobs: readonly string[], allowedWrites: readonly string[]): boolean {
  if (isWorkspaceNoisePath(file)) return false;
  if (allowedWrites.length && !allowedWrites.some((glob) => matchesGlob(file, glob))) return false;
  return candidateGlobs.some((glob) => matchesGlob(file, glob) || file === normalizeWorkspacePath(glob));
}

async function listWorkspaceOnlyFiles(root: string, base: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(base, absolute).replace(/\\/g, '/');
      if (isWorkspaceNoisePath(relative)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile() || entry.isSymbolicLink()) out.push(relative);
    }
  }
  await walk(root);
  return out;
}

async function workspaceOnlyFileMarker(file: string): Promise<string> {
  const stat = await fs.lstat(file).catch(() => undefined);
  if (!stat) return 'missing';
  if (stat.isSymbolicLink()) return `link:${await fs.readlink(file).catch(() => '')}`;
  if (stat.isFile()) {
    const hash = createHash('sha256').update(await fs.readFile(file)).digest('hex');
    return `file:${stat.size}:${hash}`;
  }
  return stat.isDirectory() ? 'directory' : 'other';
}

function readPromptTask(prompt: string): Record<string, unknown> {
  const markerIndex = prompt.indexOf('Raw task JSON:');
  const rawTask = markerIndex >= 0 ? parsePromptRawTaskJson(prompt.slice(markerIndex + 'Raw task JSON:'.length)) : {};
  return {
    ...rawTask,
    jobId: readPromptHeader(prompt, 'Job') ?? readStringField(rawTask, ['jobId']),
    taskId: readPromptHeader(prompt, 'Task') ?? readStringField(rawTask, ['id', 'taskId']),
    lane: readPromptHeader(prompt, 'Lane') ?? readStringField(rawTask, ['lane']),
    title: readStringField(rawTask, ['title'])
  };
}

function parsePromptRawTaskJson(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text.trim());
    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

function readPromptHeader(prompt: string, name: string): string | undefined {
  const match = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*(.+)$`, 'm').exec(prompt);
  return match?.[1]?.trim() || undefined;
}

function readStringField(value: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function readFirstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function stringArray(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function globHasMagic(value: string): boolean {
  return /[*?[\]{}]/.test(value);
}

function globStaticPrefix(glob: string): string {
  const magic = glob.search(/[*?[\]{}]/);
  const staticPart = magic < 0 ? glob : glob.slice(0, magic);
  const slash = staticPart.lastIndexOf('/');
  const prefix = magic < 0 ? staticPart : slash >= 0 ? staticPart.slice(0, slash) : '';
  return normalizeWorkspacePath(prefix) ?? '';
}
