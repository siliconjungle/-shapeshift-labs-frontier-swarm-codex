import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  FrontierCodexArtifactStoreResult,
  FrontierCodexArtifactStoreStatus,
  FrontierCodexCollectInput,
  FrontierCodexCollectResult
} from './index.js';

const DEFAULT_ARTIFACT_STORE_TIMEOUT_MS = 30_000;
const COMPACT_ARTIFACT_STORE_MAX_BYTES = 1024 * 1024;
const ARTIFACT_STORE_STDERR_TAIL_CHARS = 8192;
const ARTIFACT_STORE_KILL_GRACE_MS = 2000;

type GuardModes = NonNullable<FrontierCodexArtifactStoreStatus['guard']['incompleteModes']>;

interface ArtifactStorePostProcessingInput {
  collection: FrontierCodexCollectResult;
  collectionPath: string;
  mode: NonNullable<FrontierCodexCollectInput['artifactStoreMode']>;
  timeoutMs?: number;
}

interface ArtifactStorePostProcessingResult {
  artifactStore?: FrontierCodexArtifactStoreResult;
  status: FrontierCodexArtifactStoreStatus;
}

export async function createBoundedCodexArtifactStore(input: ArtifactStorePostProcessingInput): Promise<ArtifactStorePostProcessingResult> {
  const timeoutMs = normalizeArtifactStoreTimeoutMs(input.timeoutMs);
  const startedAt = Date.now();
  if (input.mode === 'compact') {
    return runCompactArtifactStoreWorker(input.collection, input.collectionPath, {
      startedAt,
      timeoutMs,
      timedOut: false,
      reason: 'compact-artifact-store-requested'
    });
  }
  const fullResult = await runArtifactStoreWorker({
    collection: input.collection,
    collectionPath: input.collectionPath,
    mode: 'full',
    timeoutMs,
    options: { compress: true, sqlite: true }
  });
  if (fullResult.artifactStore) return fullResult;
  const compactResult = await runCompactArtifactStoreWorker(input.collection, input.collectionPath, {
    startedAt,
    timeoutMs,
    timedOut: fullResult.status.timedOut,
    reason: fullResult.status.reason ?? 'artifact-store-worker-failed',
    error: fullResult.status.error
  });
  return {
    ...compactResult,
    status: withArtifactStoreGuard(compactResult.status, {
      attemptedModes: ['full', 'compact'],
      fallbackUsed: true,
      outcome: compactResult.status.ok ? 'fallback-completed' : 'incomplete',
      timedOut: fullResult.status.timedOut || compactResult.status.timedOut,
      incompleteModes: uniqueArtifactStoreModes([...artifactStoreIncompleteModes(fullResult.status), ...artifactStoreIncompleteModes(compactResult.status)]),
      fallbackReason: fullResult.status.reason ?? fullResult.status.guard.reason,
      startedAt
    })
  };
}

async function runArtifactStoreWorker(input: {
  collection: FrontierCodexCollectResult;
  collectionPath: string;
  mode: NonNullable<FrontierCodexCollectInput['artifactStoreMode']>;
  timeoutMs: number;
  options: { compress: boolean; sqlite: boolean; maxArtifactBytes?: number };
}): Promise<ArtifactStorePostProcessingResult> {
  const startedAt = Date.now();
  const artifactStoreModuleUrl = new URL('./artifact-store.js', import.meta.url).href;
  const script = [
    "import fs from 'node:fs/promises';",
    `import { createCodexArtifactStore } from ${JSON.stringify(artifactStoreModuleUrl)};`,
    'const collectionPath = process.argv[1];',
    'const options = JSON.parse(process.argv[2]);',
    "const collection = JSON.parse(await fs.readFile(collectionPath, 'utf8'));",
    'await createCodexArtifactStore({ collection, ...options });'
  ].join('\n');
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stderrTail = '';
    const child = spawn(process.execPath, ['--input-type=module', '--eval', script, input.collectionPath, JSON.stringify(input.options)], {
      cwd: input.collection.outDir,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'ignore', 'pipe']
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      killArtifactStoreWorker(child);
      const incompleteGuard = setTimeout(() => {
        detachArtifactStoreWorker(child);
        settle({ status: artifactStoreStatus({ ok: false, mode: input.mode, startedAt, timeoutMs: input.timeoutMs, timedOut: true, guardIncomplete: true, reason: 'artifact-store-guard-incomplete', error: stderrTail || undefined }) });
      }, ARTIFACT_STORE_KILL_GRACE_MS + 500);
      incompleteGuard.unref?.();
      child.once('close', () => clearTimeout(incompleteGuard));
    }, input.timeoutMs);
    timeout.unref?.();
    child.stderr?.on('data', (chunk: Buffer) => { stderrTail = appendTail(stderrTail, chunk.toString('utf8'), ARTIFACT_STORE_STDERR_TAIL_CHARS); });
    child.on('error', (error) => settle({ status: artifactStoreStatus({ ok: false, mode: input.mode, startedAt, timeoutMs: input.timeoutMs, timedOut, reason: 'artifact-store-worker-error', error: formatUnknownError(error) }) }));
    child.on('close', (status, signal) => {
      void (async () => {
        if (status === 0 && !timedOut) {
          try {
            settle({ artifactStore: await readArtifactStoreResult(input.collection), status: artifactStoreStatus({ ok: true, mode: input.mode, startedAt, timeoutMs: input.timeoutMs, timedOut: false }) });
            return;
          } catch (error) {
            settle({ status: artifactStoreStatus({ ok: false, mode: input.mode, startedAt, timeoutMs: input.timeoutMs, timedOut: false, reason: 'artifact-store-missing-output', error: formatUnknownError(error) }) });
            return;
          }
        }
        settle({ status: artifactStoreStatus({ ok: false, mode: input.mode, startedAt, timeoutMs: input.timeoutMs, timedOut, reason: timedOut ? `${input.mode}-artifact-store-timeout` : `${input.mode}-artifact-store-worker-exited:${status ?? signal ?? 'unknown'}`, error: stderrTail || undefined }) });
      })();
    });

    function settle(result: ArtifactStorePostProcessingResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    }
  });
}

async function runCompactArtifactStoreWorker(
  collection: FrontierCodexCollectResult,
  collectionPath: string,
  input: { startedAt: number; timeoutMs: number; timedOut: boolean; reason: string; error?: string }
): Promise<ArtifactStorePostProcessingResult> {
  try {
    await fs.rm(path.join(collection.outDir, 'artifact-store', 'artifact-index.sqlite'), { force: true }).catch(() => {});
    const result = await runArtifactStoreWorker({ collection, collectionPath, mode: 'compact', timeoutMs: input.timeoutMs, options: { compress: false, sqlite: false, maxArtifactBytes: COMPACT_ARTIFACT_STORE_MAX_BYTES } });
    await fs.rm(path.join(collection.outDir, 'artifact-store', 'artifact-index.sqlite'), { force: true }).catch(() => {});
    return {
      ...result,
      status: withArtifactStoreGuard(result.status, {
        attemptedModes: ['compact'],
        fallbackUsed: input.reason !== 'compact-artifact-store-requested',
        outcome: result.status.ok ? 'completed' : 'incomplete',
        timedOut: input.timedOut || result.status.timedOut,
        reason: result.status.reason ?? input.reason,
        error: result.status.error ?? input.error,
        startedAt: input.startedAt
      })
    };
  } catch (error) {
    const status = artifactStoreStatus({ ok: false, mode: 'compact', startedAt: input.startedAt, timeoutMs: input.timeoutMs, timedOut: input.timedOut, reason: 'compact-artifact-store-failed', error: [input.error, formatUnknownError(error)].filter(Boolean).join('\n') });
    return { status: withArtifactStoreGuard(status, { attemptedModes: ['compact'], fallbackUsed: input.reason !== 'compact-artifact-store-requested', outcome: 'incomplete', timedOut: input.timedOut, fallbackReason: input.reason, startedAt: input.startedAt }) };
  }
}

async function readArtifactStoreResult(collection: FrontierCodexCollectResult): Promise<FrontierCodexArtifactStoreResult> {
  return JSON.parse(await fs.readFile(path.join(collection.outDir, 'artifact-store', 'artifact-store.json'), 'utf8')) as FrontierCodexArtifactStoreResult;
}

function artifactStoreStatus(input: { ok: boolean; mode: FrontierCodexArtifactStoreStatus['mode']; startedAt: number; timeoutMs: number; timedOut: boolean; guardIncomplete?: boolean; reason?: string; error?: string }): FrontierCodexArtifactStoreStatus {
  const durationMs = Date.now() - input.startedAt;
  const reason = input.reason ?? (input.guardIncomplete ? 'artifact-store-guard-incomplete' : undefined);
  const incompleteModes = input.guardIncomplete ? [input.mode] : [];
  return {
    ok: input.ok,
    mode: input.mode,
    timedOut: input.timedOut,
    timeoutMs: input.timeoutMs,
    durationMs,
    guard: { ok: input.ok && !input.guardIncomplete, complete: input.ok && !input.guardIncomplete, outcome: input.ok && !input.guardIncomplete ? 'completed' : 'incomplete', attemptedModes: [input.mode], ...(incompleteModes.length ? { incompleteModes } : {}), fallbackUsed: false, timedOut: input.timedOut, timeoutMs: input.timeoutMs, durationMs, ...(reason ? { reason } : {}) },
    ...(reason ? { reason } : {}),
    ...(input.error ? { error: input.error } : {})
  };
}

function withArtifactStoreGuard(status: FrontierCodexArtifactStoreStatus, input: { attemptedModes: FrontierCodexArtifactStoreStatus['guard']['attemptedModes']; fallbackUsed: boolean; outcome: FrontierCodexArtifactStoreStatus['guard']['outcome']; timedOut: boolean; startedAt: number; incompleteModes?: GuardModes; fallbackReason?: string; reason?: string; error?: string }): FrontierCodexArtifactStoreStatus {
  const durationMs = Date.now() - input.startedAt;
  const reason = input.reason ?? status.reason;
  const incompleteModes = uniqueArtifactStoreModes([...(status.guard.incompleteModes ?? []), ...(input.incompleteModes ?? [])]);
  const guardComplete = input.outcome !== 'incomplete' && incompleteModes.length === 0;
  return {
    ...status,
    timedOut: input.timedOut,
    durationMs,
    ...(reason ? { reason } : {}),
    ...(input.error && !status.error ? { error: input.error } : {}),
    guard: { ok: status.ok && guardComplete, complete: guardComplete, outcome: input.outcome, attemptedModes: input.attemptedModes, ...(incompleteModes.length ? { incompleteModes } : {}), fallbackUsed: input.fallbackUsed, ...(input.fallbackReason ? { fallbackReason: input.fallbackReason } : {}), timedOut: input.timedOut, timeoutMs: status.timeoutMs, durationMs, ...(reason ? { reason } : {}) }
  };
}

function artifactStoreIncompleteModes(status: FrontierCodexArtifactStoreStatus): GuardModes {
  return status.guard.incompleteModes ?? [];
}

function uniqueArtifactStoreModes(modes: readonly GuardModes[number][]): GuardModes {
  const out: GuardModes = [];
  for (const mode of modes) if (!out.includes(mode)) out.push(mode);
  return out;
}

function normalizeArtifactStoreTimeoutMs(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ARTIFACT_STORE_TIMEOUT_MS;
  return Math.max(1000, Math.floor(value));
}

function killArtifactStoreWorker(child: ChildProcess): void {
  const pid = child.pid;
  const send = (signal: 'SIGTERM' | 'SIGKILL') => {
    try {
      if (pid && process.platform !== 'win32') process.kill(-pid, signal);
      else child.kill(signal);
    } catch {
      try { child.kill(signal); } catch {}
    }
  };
  send('SIGTERM');
  const forceKill = setTimeout(() => send('SIGKILL'), ARTIFACT_STORE_KILL_GRACE_MS);
  forceKill.unref?.();
  child.once('close', () => clearTimeout(forceKill));
}

function detachArtifactStoreWorker(child: ChildProcess): void {
  child.stderr?.destroy();
  child.unref();
}

function appendTail(left: string, right: string, maxChars: number): string {
  const combined = left + right;
  return combined.length > maxChars ? combined.slice(-maxChars) : combined;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
