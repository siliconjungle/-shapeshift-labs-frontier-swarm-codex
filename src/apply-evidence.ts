import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createRunEvent,
  createRunNodeEvent,
  defineRunDecision,
  defineRunVerification,
  type FrontierRunDecisionKind,
  type FrontierRunEvent,
  type FrontierRunVerificationStatus
} from '@shapeshift-labs/frontier-run';
import {
  recordTestGateExecution,
  summarizeTestGateExecutions,
  type FrontierTestGateExecutionRecord
} from '@shapeshift-labs/frontier-test';
import { writeCodexRunDashboard, writeCodexRunEvents } from './run-events.js';
import type { FrontierCodexApplyResult } from './types-collection.js';

type RunEventPayload = NonNullable<Parameters<typeof createRunEvent>[0]['payload']>;

const APPLY_GATE_EXECUTIONS_FILE = 'gate-executions.jsonl';
const APPLY_GATE_SUMMARY_FILE = 'gate-summary.json';
const APPLY_RUN_EVENTS_FILE = 'run-events.jsonl';
const APPLY_RUN_DASHBOARD_FILE = 'run-dashboard.json';

export async function writeCodexApplyEvidence(
  result: FrontierCodexApplyResult
): Promise<Pick<FrontierCodexApplyResult, 'gateExecutionsPath' | 'gateSummaryPath' | 'runEventsPath' | 'runDashboardPath' | 'evidence'>> {
  await fs.mkdir(result.outDir, { recursive: true });
  const applyLedgerPath = path.join(result.outDir, 'apply-ledger.json');
  const gateExecutionsPath = path.join(result.outDir, APPLY_GATE_EXECUTIONS_FILE);
  const gateSummaryPath = path.join(result.outDir, APPLY_GATE_SUMMARY_FILE);
  const runEventsPath = path.join(result.outDir, APPLY_RUN_EVENTS_FILE);
  const runDashboardPath = path.join(result.outDir, APPLY_RUN_DASHBOARD_FILE);
  const gateExecutions = createCodexApplyGateExecutions(result, applyLedgerPath);
  await fs.writeFile(gateExecutionsPath, gateExecutions.map((record) => JSON.stringify(record)).join('\n') + (gateExecutions.length ? '\n' : ''));
  await fs.writeFile(gateSummaryPath, JSON.stringify(summarizeTestGateExecutions({
    executions: gateExecutions,
    packageScope: ['@shapeshift-labs/frontier-swarm-codex'],
    artifacts: [relativePath(result.cwd, applyLedgerPath)]
  }), null, 2) + '\n');
  const runEvents = createCodexApplyRunEvents(result, gateExecutions, {
    applyLedgerPath,
    gateExecutionsPath,
    gateSummaryPath
  });
  await writeCodexRunEvents(runEventsPath, runEvents);
  await writeCodexRunDashboard(runDashboardPath, runEvents, {
    runId: codexApplyRunId(result),
    goal: `Apply Frontier swarm collection ${relativePath(result.cwd, result.collectionDir)}`,
    metadata: {
      source: 'frontier-swarm-codex.apply',
      collectionDir: relativePath(result.cwd, result.collectionDir),
      applyLedgerPath: relativePath(result.cwd, applyLedgerPath),
      gateExecutionsPath: relativePath(result.cwd, gateExecutionsPath)
    }
  });
  return {
    gateExecutionsPath,
    gateSummaryPath,
    runEventsPath,
    runDashboardPath,
    evidence: {
      gateExecutionCount: gateExecutions.length,
      runEventCount: runEvents.length
    }
  };
}

function createCodexApplyGateExecutions(
  result: FrontierCodexApplyResult,
  applyLedgerPath: string
): FrontierTestGateExecutionRecord[] {
  const artifact = relativePath(result.cwd, applyLedgerPath);
  const records: FrontierTestGateExecutionRecord[] = [];
  for (const entry of result.entries) {
    if (!entry.commands.length) {
      records.push(recordTestGateExecution({
        id: `gate.apply.${slug(entry.jobId)}.admission`,
        kind: 'apply-admission',
        status: entry.status === 'skipped' ? 'skipped' : entry.status === 'failed' ? 'failed' : 'unknown',
        required: entry.status !== 'skipped',
        startedAt: result.generatedAt,
        finishedAt: result.generatedAt,
        command: ['frontier-swarm-codex', 'apply'],
        artifacts: [artifact],
        package: '@shapeshift-labs/frontier-swarm-codex',
        packageScope: ['@shapeshift-labs/frontier-swarm-codex'],
        message: entry.error ?? `apply ${entry.status}`,
        metadata: applyGateMetadata(result, entry, applyLedgerPath, 0)
      }));
      continue;
    }
    entry.commands.forEach((command, index) => {
      records.push(recordTestGateExecution({
        id: `gate.apply.${slug(entry.jobId)}.${index + 1}.${slug(command.command.join('-'))}`,
        kind: applyGateKind(command.command),
        status: command.status === 0 ? 'passed' : 'failed',
        required: true,
        startedAt: result.generatedAt,
        finishedAt: result.generatedAt,
        command: command.command,
        exitCode: command.status,
        stdoutTail: command.stdoutTail,
        stderrTail: command.stderrTail,
        failureTail: command.status === 0 ? [] : command.stderrTail,
        artifacts: [artifact],
        package: '@shapeshift-labs/frontier-swarm-codex',
        packageScope: ['@shapeshift-labs/frontier-swarm-codex'],
        message: command.status === 0 ? `apply command passed for ${entry.jobId}` : entry.error ?? `apply command failed for ${entry.jobId}`,
        metadata: applyGateMetadata(result, entry, applyLedgerPath, index)
      }));
    });
  }
  return records;
}

function createCodexApplyRunEvents(
  result: FrontierCodexApplyResult,
  gateExecutions: readonly FrontierTestGateExecutionRecord[],
  paths: { applyLedgerPath: string; gateExecutionsPath: string; gateSummaryPath: string }
): FrontierRunEvent[] {
  const runId = codexApplyRunId(result);
  const actorId = 'coordinator:apply';
  const events: FrontierRunEvent[] = [];
  let actorSeq = 1;
  const push = (event: FrontierRunEvent): FrontierRunEvent => {
    events.push(event);
    return event;
  };
  const created = push(createRunEvent({
    runId,
    actorId,
    actorSeq: actorSeq++,
    time: new Date(result.generatedAt).toISOString(),
    type: 'run.created',
    payload: {
      goal: `Apply Frontier swarm collection ${relativePath(result.cwd, result.collectionDir)}`,
      metadata: {
        source: 'frontier-swarm-codex.apply',
        dryRun: result.dryRun,
        collectionDir: relativePath(result.cwd, result.collectionDir),
        applyLedgerPath: relativePath(result.cwd, paths.applyLedgerPath),
        gateExecutionsPath: relativePath(result.cwd, paths.gateExecutionsPath),
        gateSummaryPath: relativePath(result.cwd, paths.gateSummaryPath),
        summary: result.summary
      }
    }
  }));
  let parentId = created.id;
  for (const gate of gateExecutions) {
    const verification = defineRunVerification({
      id: `verification:${gate.id}`,
      title: gate.command.join(' ') || gate.gateKind,
      status: runVerificationStatus(gate.status),
      command: gate.command[0],
      args: gate.command.slice(1),
      cwd: gate.cwd,
      exitCode: gate.exitCode,
      startedAt: new Date(gate.startedAt).toISOString(),
      endedAt: new Date(gate.finishedAt).toISOString(),
      required: gate.required,
      summary: gate.message,
      metadata: {
        gateExecutionId: gate.id,
        gateKind: gate.gateKind,
        gateExecutionsPath: relativePath(result.cwd, paths.gateExecutionsPath),
        applyLedgerPath: relativePath(result.cwd, paths.applyLedgerPath),
        ...(gate.metadata ?? {})
      }
    });
    parentId = push(createRunNodeEvent(runId, actorId, actorSeq++, verification, {
      parents: [parentId],
      time: new Date(gate.finishedAt).toISOString()
    })).id;
  }
  for (const entry of result.entries) {
    const gateIds = gateExecutions
      .filter((gate) => String(gate.metadata?.jobId ?? '') === entry.jobId)
      .map((gate) => gate.id);
    const decision = defineRunDecision({
      id: `decision:apply:${slug(entry.jobId)}`,
      title: `Apply ${entry.jobId}`,
      decision: applyDecisionKind(entry.status),
      subjectIds: [`job:${entry.jobId}`, ...gateIds.map((id) => `verification:${id}`), ...(entry.patchPath ? [`patch:${entry.jobId}`] : [])],
      actorId,
      reason: entry.error ?? applyDecisionReason(entry.status, result.dryRun),
      requiredActions: applyDecisionRequiredActions(entry.status, entry.error),
      metadata: jsonObject({
        source: 'frontier-swarm-codex.apply',
        jobId: entry.jobId,
        applyStatus: entry.status,
        dryRun: entry.dryRun,
        bundlePath: relativePath(result.cwd, entry.bundlePath),
        ...(entry.patchPath ? { patchPath: relativePath(result.cwd, entry.patchPath) } : {}),
        ...(entry.commit ? { commit: entry.commit } : {}),
        applyLedgerPath: relativePath(result.cwd, paths.applyLedgerPath),
        gateExecutionsPath: relativePath(result.cwd, paths.gateExecutionsPath),
        gateExecutionIds: gateIds,
        ...(entry.semanticLease ? { semanticLease: entry.semanticLease } : {}),
        ...(entry.admission ? { admission: entry.admission } : {})
      })
    });
    parentId = push(createRunEvent({
      runId,
      actorId,
      actorSeq: actorSeq++,
      parents: [parentId],
      time: new Date(result.generatedAt).toISOString(),
      type: 'decision.recorded',
      payload: { decision: decision as unknown as RunEventPayload } as RunEventPayload
    })).id;
  }
  return events;
}

function applyGateMetadata(
  result: FrontierCodexApplyResult,
  entry: FrontierCodexApplyResult['entries'][number],
  applyLedgerPath: string,
  commandIndex: number
): Record<string, unknown> {
  return {
    source: 'frontier-swarm-codex.apply',
    jobId: entry.jobId,
    applyStatus: entry.status,
    dryRun: entry.dryRun,
    commandIndex,
    collectionDir: relativePath(result.cwd, result.collectionDir),
    bundlePath: relativePath(result.cwd, entry.bundlePath),
    ...(entry.patchPath ? { patchPath: relativePath(result.cwd, entry.patchPath) } : {}),
    applyLedgerPath: relativePath(result.cwd, applyLedgerPath),
    semanticLease: entry.semanticLease,
    admission: entry.admission
  };
}

function applyGateKind(command: readonly string[]): string {
  const normalized = command.map((part) => part.toLowerCase());
  if (normalized[0] === 'git' && normalized[1] === 'apply' && normalized.includes('--check')) return 'git-apply-check';
  if (normalized[0] === 'git' && normalized[1] === 'apply') return 'git-apply';
  if (normalized[0] === 'git' && normalized[1] === 'commit') return 'git-commit';
  if (normalized[0] === 'git' && normalized[1] === 'add') return 'git-add';
  if (normalized[0] === 'git' && normalized[1] === 'switch') return 'git-branch';
  return normalized.filter(Boolean).slice(0, 2).join('-') || 'apply-command';
}

function applyDecisionKind(status: FrontierCodexApplyResult['entries'][number]['status']): FrontierRunDecisionKind {
  if (status === 'applied' || status === 'committed') return 'apply';
  if (status === 'failed') return 'rerun';
  return 'record-only';
}

function applyDecisionReason(status: FrontierCodexApplyResult['entries'][number]['status'], dryRun: boolean): string {
  if (status === 'checked') return dryRun ? 'Patch passed apply check in dry run.' : 'Patch was checked.';
  if (status === 'applied') return 'Patch applied.';
  if (status === 'committed') return 'Patch applied and committed.';
  if (status === 'skipped') return 'Apply skipped for record-only bundle.';
  return 'Apply failed; rerun or rebase is required.';
}

function applyDecisionRequiredActions(status: FrontierCodexApplyResult['entries'][number]['status'], error: string | undefined): string[] {
  if (status !== 'failed') return [];
  if (error?.includes('semantic lease')) return ['resolve-lease'];
  if (error?.includes('git apply')) return ['rerun-or-rebase'];
  return ['coordinator-review'];
}

function runVerificationStatus(status: FrontierTestGateExecutionRecord['status']): FrontierRunVerificationStatus {
  if (status === 'passed') return 'passed';
  if (status === 'failed' || status === 'blocked') return 'failed';
  if (status === 'skipped') return 'skipped';
  return 'pending';
}

function codexApplyRunId(result: FrontierCodexApplyResult): string {
  return `frontier-swarm-codex:apply:${relativePath(result.cwd, result.collectionDir)}`;
}

function relativePath(cwd: string, file: string): string {
  return path.relative(cwd, file).replaceAll(path.sep, '/') || '.';
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function jsonObject(value: unknown): RunEventPayload {
  return JSON.parse(JSON.stringify(value)) as RunEventPayload;
}
