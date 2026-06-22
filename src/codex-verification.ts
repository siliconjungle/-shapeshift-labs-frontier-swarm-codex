import path from 'node:path';
import { type FrontierSwarmCommand, type FrontierSwarmJob, type FrontierSwarmVerificationResultInput } from '@shapeshift-labs/frontier-swarm';
import { runTestGateSuite, type FrontierTestNodeGateSuiteResult } from '@shapeshift-labs/frontier-test/node';
import { isObject, slug, uniqueStrings } from './common.js';
import type { FrontierCodexJobPaths } from './index.js';

export interface CodexJobVerificationEvidence {
  verification: FrontierSwarmVerificationResultInput[];
  evidencePaths: string[];
  metadata: {
    kind: 'frontier-swarm-codex.verification-gate-evidence';
    gateExecutionCount: number;
    gateSummaryPath?: string;
    gateExecutionsPath?: string;
    ok: boolean;
    failed: number;
    blocked: number;
    unknown: number;
  };
}

export async function runCodexJobVerification(
  job: FrontierSwarmJob,
  workspace: string,
  paths: FrontierCodexJobPaths
): Promise<CodexJobVerificationEvidence> {
  if (!job.verification.length) {
    return {
      verification: [],
      evidencePaths: [],
      metadata: {
        kind: 'frontier-swarm-codex.verification-gate-evidence',
        gateExecutionCount: 0,
        ok: true,
        failed: 0,
        blocked: 0,
        unknown: 0
      }
    };
  }
  const suite = await runTestGateSuite({
    outDir: path.join(paths.evidenceDir, 'gates'),
    stopOnRequiredFailure: true,
    packageScope: ['@shapeshift-labs/frontier-swarm-codex'],
    gates: job.verification.map((command, index) => ({
      id: `gate.verify.${slug(job.id)}.${index + 1}.${slug(command.name)}`,
      kind: inferVerificationGateKind(command),
      command: command.command,
      args: command.args,
      cwd: command.cwd ? path.resolve(workspace, command.cwd) : workspace,
      required: command.required,
      package: '@shapeshift-labs/frontier-swarm-codex',
      packageScope: ['@shapeshift-labs/frontier-swarm-codex', job.lane],
      metadata: {
        source: 'frontier-swarm-codex.verification',
        jobId: job.id,
        taskId: job.taskId,
        lane: job.lane,
        commandName: command.name,
        ...(isObject(command.metadata) ? command.metadata : {})
      }
    }))
  });
  return {
    verification: suite.executions.map((execution, index) => verificationResultFromGateExecution(execution, job.verification[index], suite)),
    evidencePaths: uniqueStrings([
      ...(suite.files ? [suite.files.gateExecutionsPath, suite.files.gateSummaryPath] : [])
    ]),
    metadata: {
      kind: 'frontier-swarm-codex.verification-gate-evidence',
      gateExecutionCount: suite.executions.length,
      ...(suite.files?.gateExecutionsPath ? { gateExecutionsPath: suite.files.gateExecutionsPath } : {}),
      ...(suite.files?.gateSummaryPath ? { gateSummaryPath: suite.files.gateSummaryPath } : {}),
      ok: suite.ok,
      failed: suite.summary.failed,
      blocked: suite.summary.blocked,
      unknown: suite.summary.unknown
    }
  };
}

function verificationResultFromGateExecution(
  execution: FrontierTestNodeGateSuiteResult['executions'][number],
  command: FrontierSwarmCommand | undefined,
  suite: FrontierTestNodeGateSuiteResult
): FrontierSwarmVerificationResultInput {
  return {
    name: command?.name ?? execution.id,
    command: execution.command,
    commandLine: execution.command.join(' '),
    cwd: execution.cwd,
    status: execution.status === 'passed' ? 0 : execution.exitCode ?? 1,
    durationMs: execution.durationMs,
    stdoutTail: execution.stdoutTail,
    stderrTail: execution.stderrTail,
    required: execution.required,
    metadata: {
      ...(isObject(command?.metadata) ? command.metadata : {}),
      source: 'frontier-swarm-codex.verification',
      gateExecutionId: execution.id,
      gateKind: execution.gateKind,
      gateStatus: execution.status,
      ...(suite.files?.gateExecutionsPath ? { gateExecutionsPath: suite.files.gateExecutionsPath } : {}),
      ...(suite.files?.gateSummaryPath ? { gateSummaryPath: suite.files.gateSummaryPath } : {})
    }
  };
}

function inferVerificationGateKind(command: FrontierSwarmCommand): string {
  const metadataKind = isObject(command.metadata) && typeof command.metadata.gateKind === 'string'
    ? command.metadata.gateKind
    : undefined;
  if (metadataKind) return metadataKind;
  const text = [command.name, command.command, ...command.args].join(' ').toLowerCase();
  if (text.includes('playwright') || text.includes('browser')) return 'browser';
  if (text.includes('fuzz')) return 'fuzz';
  if (text.includes('smoke')) return 'smoke';
  if (text.includes('oracle')) return 'oracle';
  if (text.includes('build') || text.includes('typecheck')) return 'build';
  if (text.includes('test')) return 'test';
  return 'test';
}
