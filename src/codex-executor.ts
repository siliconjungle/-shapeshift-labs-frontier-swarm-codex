import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { readOptionalText } from './common.js';
import { appendCodexPidManifest } from './codex-events.js';
import type {
  FrontierCodexCompactLogOptions,
  FrontierCodexExecutorInput,
  FrontierCodexExecutorResult,
  FrontierCodexJobPaths,
  FrontierCodexLogSummary
} from './index.js';

export async function spawnCodexExecutor(input: FrontierCodexExecutorInput): Promise<FrontierCodexExecutorResult> {
  await fs.writeFile(input.paths.eventsPath, '');
  await fs.writeFile(input.paths.stderrPath, '');
  const logOptions = normalizeCompactLogOptions(input.compactLogs);
  const eventLimit = logOptions.enabled === false ? Number.POSITIVE_INFINITY : logOptions.maxEventBytes ?? 1_000_000;
  const stderrLimit = logOptions.enabled === false ? Number.POSITIVE_INFINITY : logOptions.maxStderrBytes ?? 256_000;
  const logSummary = createEmptyCodexLogSummary(input.paths);
  const eventLogState = createEventLogState();
  return new Promise((resolve) => {
    const child = spawn(input.codexPath, input.args, {
      cwd: input.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...input.env }
    });
    if (child.pid) {
      appendCodexPidManifest(input.paths.pidManifestPath, {
        pid: child.pid,
        role: 'codex',
        jobId: input.job.id,
        startedAt: Date.now(),
        command: [input.codexPath, ...input.args]
      }).catch(() => {});
    }
    const timer = setTimeout(() => child.kill('SIGTERM'), input.timeoutMs);
    let stdoutWrites = Promise.resolve();
    let stderrWrites = Promise.resolve();
    const deferredFailureDetector = createCodexDeferredFailureDetector();
    child.stdout.on('data', (chunk: Buffer) => {
      deferredFailureDetector.read(chunk);
      stdoutWrites = stdoutWrites
        .then(() => appendLimitedLogChunk(input.paths.eventsPath, chunk, eventLimit, logSummary, 'event', eventLogState))
        .catch(() => {});
    });
    child.stderr.on('data', (chunk: Buffer) => {
      deferredFailureDetector.read(chunk);
      stderrWrites = stderrWrites
        .then(() => appendLimitedLogChunk(input.paths.stderrPath, chunk, stderrLimit, logSummary, 'stderr'))
        .catch(() => {});
    });
    child.stdin.end(input.prompt);
    child.on('close', async (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timer);
      await Promise.all([stdoutWrites, stderrWrites]);
      await flushEventLogRemainder(input.paths.eventsPath, eventLimit, logSummary, eventLogState).catch(() => {});
      await fs.writeFile(input.paths.logSummaryPath, JSON.stringify(logSummary, null, 2) + '\n').catch(() => {});
      const lastMessage = await readOptionalText(input.paths.lastMessagePath);
      deferredFailureDetector.read(lastMessage);
      const deferredReason = deferredFailureDetector.reason();
      resolve({
        exitCode: code ?? 1,
        ...(signal ? { signal } : {}),
        lastMessage,
        logSummary,
        ...(deferredReason ? { deferredReason } : {})
      });
    });
    child.on('error', async (error: Error) => {
      clearTimeout(timer);
      await Promise.all([stdoutWrites, stderrWrites]);
      await flushEventLogRemainder(input.paths.eventsPath, eventLimit, logSummary, eventLogState).catch(() => {});
      await fs.writeFile(input.paths.logSummaryPath, JSON.stringify(logSummary, null, 2) + '\n').catch(() => {});
      deferredFailureDetector.read(error.message);
      const deferredReason = deferredFailureDetector.reason();
      resolve({ exitCode: 1, logSummary, ...(deferredReason ? { deferredReason } : {}), error });
    });
  });
}

export function normalizeCompactLogOptions(input: boolean | FrontierCodexCompactLogOptions | undefined): FrontierCodexCompactLogOptions {
  if (input === false) return { enabled: false };
  if (input === true || input === undefined) return { enabled: true, maxEventBytes: 1_000_000, maxStderrBytes: 256_000 };
  return {
    enabled: input.enabled ?? true,
    maxEventBytes: positiveInteger(input.maxEventBytes, 1_000_000),
    maxStderrBytes: positiveInteger(input.maxStderrBytes, 256_000)
  };
}

export function createEmptyCodexLogSummary(paths: FrontierCodexJobPaths): FrontierCodexLogSummary {
  return {
    eventsPath: paths.eventsPath,
    stderrPath: paths.stderrPath,
    eventBytes: 0,
    stderrBytes: 0,
    eventBytesWritten: 0,
    stderrBytesWritten: 0,
    eventBytesTruncated: 0,
    stderrBytesTruncated: 0
  };
}

async function appendLimitedLogChunk(
  file: string,
  chunk: Buffer,
  limit: number,
  summary: FrontierCodexLogSummary,
  kind: 'event' | 'stderr',
  eventState?: LimitedEventLogState
): Promise<void> {
  const bytes = chunk.byteLength;
  if (kind === 'event') summary.eventBytes += bytes;
  else summary.stderrBytes += bytes;
  if (kind === 'event') return appendLimitedEventLogChunk(file, chunk, limit, summary, eventState);
  const available = Math.max(0, limit - summary.stderrBytesWritten);
  if (available <= 0) {
    summary.stderrBytesTruncated += bytes;
    return;
  }
  const slice = bytes > available ? chunk.subarray(0, available) : chunk;
  await fs.appendFile(file, slice);
  summary.stderrBytesWritten += slice.byteLength;
  summary.stderrBytesTruncated += bytes - slice.byteLength;
}

interface LimitedEventLogState {
  pending: string;
}

function createEventLogState(): LimitedEventLogState {
  return { pending: '' };
}

async function appendLimitedEventLogChunk(
  file: string,
  chunk: Buffer,
  limit: number,
  summary: FrontierCodexLogSummary,
  state = createEventLogState()
): Promise<void> {
  if (summary.eventBytesWritten >= limit) {
    summary.eventBytesTruncated += chunk.byteLength;
    return;
  }
  state.pending += chunk.toString('utf8');
  const newline = state.pending.lastIndexOf('\n');
  if (newline < 0) {
    await dropOversizedPendingEvent(state, limit, summary);
    return;
  }
  const complete = state.pending.slice(0, newline + 1);
  state.pending = state.pending.slice(newline + 1);
  await appendCompleteEventLines(file, complete, limit, summary, state);
}

async function appendCompleteEventLines(
  file: string,
  text: string,
  limit: number,
  summary: FrontierCodexLogSummary,
  state: LimitedEventLogState
): Promise<void> {
  for (const line of text.match(/[^\n]*\n/g) ?? []) {
    const bytes = Buffer.byteLength(line);
    const available = Math.max(0, limit - summary.eventBytesWritten);
    if (bytes > available) {
      summary.eventBytesTruncated += bytes + Buffer.byteLength(state.pending);
      state.pending = '';
      return;
    }
    await fs.appendFile(file, line);
    summary.eventBytesWritten += bytes;
  }
}

async function flushEventLogRemainder(
  file: string,
  limit: number,
  summary: FrontierCodexLogSummary,
  state: LimitedEventLogState
): Promise<void> {
  if (!state.pending) return;
  const line = state.pending;
  state.pending = '';
  if (!isJsonLine(line)) {
    summary.eventBytesTruncated += Buffer.byteLength(line);
    return;
  }
  const bytes = Buffer.byteLength(line);
  if (bytes > Math.max(0, limit - summary.eventBytesWritten)) {
    summary.eventBytesTruncated += bytes;
    return;
  }
  await fs.appendFile(file, line);
  summary.eventBytesWritten += bytes;
}

async function dropOversizedPendingEvent(
  state: LimitedEventLogState,
  limit: number,
  summary: FrontierCodexLogSummary
): Promise<void> {
  const pendingBytes = Buffer.byteLength(state.pending);
  if (pendingBytes <= Math.max(0, limit - summary.eventBytesWritten)) return;
  summary.eventBytesTruncated += pendingBytes;
  state.pending = '';
}

function isJsonLine(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

interface CodexDeferredFailureDetector {
  read(value: unknown): void;
  reason(): 'usage-limit' | undefined;
}

function createCodexDeferredFailureDetector(): CodexDeferredFailureDetector {
  let sample = '';
  return {
    read(value: unknown) {
      if (value === undefined || value === null) return;
      sample += Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
      if (sample.length > 128_000) sample = sample.slice(-128_000);
    },
    reason() {
      const normalized = sample.toLowerCase();
      if (normalized.includes('usage limit') || normalized.includes('purchase more credits')) return 'usage-limit';
      return undefined;
    }
  };
}
