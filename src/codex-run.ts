import fs from 'node:fs/promises';
import path from 'node:path';
import { checkSwarmOwnership, createSwarmMergeBundle, type FrontierSwarmJob, type FrontierSwarmJobResultInput, type FrontierSwarmLease, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { isObject, uniqueStrings } from './common.js';
import { createCodexSemanticImportSidecar } from './semantic-import.js';
import { snapshotCodexSemanticImportBaseSources } from './semantic-import-snapshot.js';
import { semanticImportEnabled } from './semantic-import-quality.js';
import { writeCodexJobEvidenceSummary, writeCodexPatchIntent } from './codex-evidence.js';
import { discoverCodexHandoffArtifacts } from './handoff-artifacts.js';
import { appendFileSwarmEvent } from './codex-events.js';
import { createEmptyCodexLogSummary, normalizeCompactLogOptions, spawnCodexExecutor } from './codex-executor.js';
import { buildCodexArgs, createCodexResourceAllocation, renderCodexPrompt } from './codex-prompt.js';
import { createCodexJobPaths } from './codex-job-paths.js';
import { createCodexTournamentStrategyMetadata } from './codex-tournament-strategy.js';
import { createCodexContextBudgetReport, finalizeCodexContextBudgetReport } from './context-budget.js';
import { createCodexRunMetadata } from './codex-run-metadata.js';
import { createCodexWorkspacePlan, createSwarmWorkspaceProof, prepareCodexWorkspace } from './codex-workspace.js';
import { readCodexHumanActionArtifacts } from './human-actions.js';
import { applyWorkspacePreExecWriteFence, collectChangedPaths, emptyChangedPathCollection, filterWorkspaceChangedPaths, mergeWorkspaceChangedPathCollections, quarantineWorkspacePatchCandidatePaths, restoreWorkspaceChangedPaths, restoreWorkspacePreExecWriteFence, runVerification, shouldSnapshotWorkspaceChanges, snapshotWorkspaceFiles, writeCodexPatchFile } from './codex-workspace-changes.js';
import { appendCodexJobResultTimelineEvents } from './codex-run-timeline.js';
import type { FrontierCodexJobPaths, FrontierCodexSemanticImportSidecar, FrontierCodexSwarmRunOptions } from './index.js';

export { runCodexSwarm } from './codex-run-swarm.js';

export async function runCodexJob(
  job: FrontierSwarmJob,
  options: FrontierCodexSwarmRunOptions,
  outDir: string,
  lease?: FrontierSwarmLease
): Promise<FrontierSwarmJobResultInput> {
  const paths = await createCodexJobPaths(outDir, job, options);
  const workspace = await prepareCodexWorkspace(job, options);
  const workspacePlan = createCodexWorkspacePlan(job, options);
  const resourceAllocation = createCodexResourceAllocation(job, {
    cwd: options.cwd ?? process.cwd(),
    outDir,
    workspacePath: workspace,
    lease
  });
  if (resourceAllocation.browser?.profileDir) await fs.mkdir(resourceAllocation.browser.profileDir, { recursive: true });
  const hookInput = {
    job,
    cwd: options.cwd ?? process.cwd(),
    outDir,
    workspacePath: workspace,
    workspacePlan,
    paths,
    resourceAllocation
  };
  await options.prepareJobWorkspace?.(hookInput);
  const strictRestoreNeedsSnapshot = workspacePlan.allowedWritePolicy.mode === 'strict'
    && (workspacePlan.mode === 'copy' || workspacePlan.mode === 'snapshot');
  const fileSnapshot = shouldSnapshotWorkspaceChanges(workspacePlan, options) || strictRestoreNeedsSnapshot
    ? await snapshotWorkspaceFiles(workspace)
    : undefined;
  const semanticImportExpected = options.semanticImportExpected ?? semanticImportEnabled(options.semanticImport);
  const semanticImportBaseSources = await snapshotCodexSemanticImportBaseSources({ job, workspace, options: options.semanticImport, semanticImportExpected });
  await fs.writeFile(paths.resourceAllocationPath, JSON.stringify(resourceAllocation, null, 2) + '\n');
  const basePrompt = renderCodexPrompt(job, { workspacePath: workspace, paths, resourceAllocation });
  const prompt = options.renderJobPrompt
    ? await options.renderJobPrompt({ ...hookInput, prompt: basePrompt })
    : basePrompt;
  await fs.writeFile(paths.promptPath, prompt);
  let contextBudget = createCodexContextBudgetReport({ job, prompt, workspacePlan, options: options.contextBudget });
  await fs.writeFile(paths.contextBudgetPath, JSON.stringify(contextBudget, null, 2) + '\n');
  const args = buildCodexArgs(job, { ...options, workspacePath: workspace, paths });
  const startedAt = Date.now();
  await options.onJobStarted?.({ ...hookInput, prompt, args });
  await appendFileSwarmEvent(options.eventStream, {
    type: 'agent.scheduled',
    jobId: job.id,
    taskId: job.taskId,
    lane: job.lane,
    data: {
      workspace: workspacePlan.path,
      capabilities: job.capabilities,
      resourceRequirements: job.resourceRequirements,
      resourceAllocation,
      contextBudget
    }
  });
  const blockedByContextBudget = contextBudget.action === 'fail-before-launch';
  const writeFence = await applyWorkspacePreExecWriteFence({
    workspace,
    workspacePlan,
    allowedWrites: job.allowedWrites,
    writableRoots: [...job.allowedWrites, paths.evidenceDir],
    enabled: !blockedByContextBudget && !options.dryRun
  });
  let preExecWriteFence = writeFence.summary;
  const execution = await (async () => {
    const timeoutMs = job.compute.timeoutMs ?? options.jobTimeoutMs ?? 7200000;
    const noOutputTimeoutMs = resolveNoOutputTimeoutMs(job, options);
    try {
      return blockedByContextBudget
        ? { exitCode: 1, changedPaths: [], lastMessage: 'blocked by context budget', error: contextBudget.errors.join('; ') }
        : options.dryRun
        ? { exitCode: 0, changedPaths: [] }
        : await (options.executor ?? spawnCodexExecutor)({
          job,
          prompt,
          args,
          cwd: options.cwd ?? process.cwd(),
          workspacePath: workspace,
          codexPath: options.codexPath ?? 'codex',
          paths,
          resourceAllocation,
          env: resourceAllocation.env,
          timeoutMs,
          ...(noOutputTimeoutMs ? { noOutputTimeoutMs } : {}),
          compactLogs: normalizeCompactLogOptions(options.compactLogs)
        });
    } finally {
      preExecWriteFence = await restoreWorkspacePreExecWriteFence(writeFence);
    }
  })();
  const logSummary = execution.logSummary ?? createEmptyCodexLogSummary(paths);
  if (!execution.logSummary) await fs.writeFile(paths.logSummaryPath, JSON.stringify(logSummary, null, 2) + '\n');
  contextBudget = await finalizeCodexContextBudgetReport(contextBudget, logSummary);
  await fs.writeFile(paths.contextBudgetPath, JSON.stringify(contextBudget, null, 2) + '\n');
  const reportedChangedPaths = execution.changedPaths ? filterWorkspaceChangedPaths(execution.changedPaths, workspacePlan) : emptyChangedPathCollection();
  const hostObservedChangedPaths = options.collectGitStatus === false
    ? emptyChangedPathCollection()
    : await collectChangedPaths(workspace, fileSnapshot, workspacePlan);
  const collected = mergeWorkspaceChangedPathCollections([hostObservedChangedPaths, reportedChangedPaths]);
  const rawChangedPaths = collected.changedPaths;
  const changedPaths = options.changedPathFilter ? [...options.changedPathFilter(rawChangedPaths, hookInput)] : rawChangedPaths;
  const ownershipChangedPaths = workspacePlan.allowedWritePolicy.mode === 'strict'
    ? rawChangedPaths
    : changedPaths;
  const workspaceProof = await createSwarmWorkspaceProof(workspacePlan, {
    ignoredChangedPaths: collected.ignoredChangedPaths,
    ignoredChangedPathReasons: collected.ignoredChangedPathReasons,
    observedChangedPaths: collected.observedChangedPaths,
    reportedChangedPaths: reportedChangedPaths.observedChangedPaths,
    preExecWriteFence
  });
  await fs.writeFile(paths.workspaceProofPath, JSON.stringify(workspaceProof, null, 2) + '\n');
  const ownership = checkSwarmOwnership(job, ownershipChangedPaths);
  const workspacePatchQuarantine = quarantineWorkspacePatchCandidatePaths(changedPaths, ownership.violations);
  const ownershipRestore = workspacePlan.allowedWritePolicy.mode === 'strict'
    ? await restoreWorkspaceChangedPaths({
      workspace,
      sourceRoot: path.resolve(options.cwd ?? process.cwd()),
      workspacePlan,
      baseline: fileSnapshot,
      changedPaths: ownership.violations
    })
    : [];
  const strictOwnershipBlocked = workspacePlan.allowedWritePolicy.mode === 'strict' && ownership.violations.length > 0;
  const strictOwnershipBlockReason = 'strict-out-of-scope-source-writes-restored-before-verification';
  const strictOwnershipBlockMessage = strictOwnershipBlocked
    ? `${strictOwnershipBlockReason}: ${ownership.violations.join(', ')}`
    : undefined;
  const verificationSkippedReason = strictOwnershipBlocked
    ? 'strict-out-of-scope-source-writes-skipped-verification'
    : undefined;
  const verificationSkipReasons = verificationSkippedReason ? [verificationSkippedReason] : [];
  const verificationSkippedCommands = strictOwnershipBlocked && options.runVerification
    ? job.verification.map((command) => ({
      name: command.name,
      command: [command.command, ...command.args],
      required: command.required,
      reason: verificationSkippedReason ?? 'strict-out-of-scope-source-writes-skipped-verification'
    }))
    : [];
  const verification = options.runVerification && !strictOwnershipBlocked ? await runVerification(job.verification, workspace) : [];
  const failedVerification = verification.some((entry) => entry.required !== false && entry.status !== 0);
  const codexDeferredFailure = execution.deferredReason
    ? {
      reason: execution.deferredReason,
      exitCode: execution.exitCode
    }
    : undefined;
  const workerTermination = createCodexWorkerTermination(execution, logSummary);
  const status = codexDeferredFailure
    ? 'blocked'
    : strictOwnershipBlocked
    ? 'blocked'
    : ownership.ok && execution.exitCode === 0 && !failedVerification ? 'completed' : 'failed';
  const patchPath = await writeCodexPatchFile({
    workspace,
    sourceRoot: path.resolve(options.cwd ?? process.cwd()),
    paths,
    workspacePlan,
    changedPaths: workspacePatchQuarantine.patchCandidateChangedPaths
  });
  const semanticImport = await createCodexSemanticImportSidecar({
    job,
    workspace,
    changedPaths: workspacePatchQuarantine.patchCandidateChangedPaths,
    evidenceDir: paths.evidenceDir,
    baseCwd: path.resolve(options.cwd ?? process.cwd()),
    baseSources: semanticImportBaseSources,
    options: options.semanticImport,
    semanticImportExpected
  });
  const semanticImportSummary = semanticImport?.summary;
  const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: paths.jobDir });
  const humanActions = await readCodexHumanActionArtifacts({ evidenceDir: paths.evidenceDir, jobId: job.id, taskId: job.taskId, lane: job.lane });
  const tournamentStrategy = createCodexTournamentStrategyMetadata(
    { job, workspaceMode: workspacePlan.mode, customPrompt: !!options.renderJobPrompt, semanticImportSummary, logSummary }
  );
  const evidenceSummaryPath = path.join(paths.evidenceDir, 'evidence.json');
  const evidencePaths = uniqueStrings([
    paths.evidenceDir, evidenceSummaryPath, paths.resourceAllocationPath, paths.contextBudgetPath,
    paths.workspaceProofPath, paths.mergeBundlePath,
    ...(patchPath ? [patchPath] : []),
    ...(semanticImport ? semanticImport.evidencePaths : []),
    paths.patchIntentPath, paths.logSummaryPath,
    ...humanActions.paths,
    ...handoffArtifacts.map((artifact) => artifact.path)
  ]);
  const strictOwnership = strictOwnershipBlocked ? {
    blockReason: strictOwnershipBlockReason,
    blockMessage: strictOwnershipBlockMessage ?? strictOwnershipBlockReason,
    skippedReason: verificationSkippedReason,
    skipReasons: verificationSkipReasons,
    skippedCommands: verificationSkippedCommands
  } : undefined;
  const sharedMetadata = {
    contextBudget,
    logSummary,
    tournamentStrategy,
    workspacePatchQuarantine,
    ownershipRestore,
    preExecWriteFence,
    codexDeferredFailure,
    workerTermination,
    allowedWritePolicy: workspacePlan.allowedWritePolicy,
    observedChangedPaths: collected.observedChangedPaths,
    reportedChangedPaths: reportedChangedPaths.observedChangedPaths,
    humanActions,
    strictOwnership,
    semanticImportSummary
  };
  const result: FrontierSwarmJobResultInput = {
    jobId: job.id,
    status,
    startedAt,
    finishedAt: Date.now(),
    exitCode: execution.exitCode,
    signal: execution.signal,
    changedPaths,
    changedRegions: job.changedRegions,
    ownershipViolations: ownership.violations,
    evidencePaths,
    ...(patchPath ? { patchPath } : {}),
    queueItemIds: [job.taskId],
    verification,
    ...(codexDeferredFailure ? { mergeReadiness: 'blocked', mergeDisposition: 'rerun-work' } : {}),
    ...(semanticImportSummary ? { semanticImport: semanticImportSummary } : {}),
    lastMessage: execution.lastMessage,
    error: strictOwnershipBlockMessage ?? execution.error,
    metadata: createCodexRunMetadata({ ...sharedMetadata, lease, resourceAllocation, codexHandoffArtifacts: handoffArtifacts })
  };
  const mergeBundle = createSwarmMergeBundle({
    runId: options.eventStream?.runId,
    job,
    result: {
      ...result,
      changedPaths: workspacePatchQuarantine.patchCandidateChangedPaths
    },
    ...(patchPath ? { patchPath } : {}),
    evidencePaths: uniqueStrings([
      paths.evidenceDir, evidenceSummaryPath, paths.resourceAllocationPath, paths.contextBudgetPath,
      paths.workspaceProofPath, paths.patchIntentPath, paths.logSummaryPath,
      ...humanActions.paths,
      ...(semanticImport ? semanticImport.evidencePaths : []),
      ...handoffArtifacts.map((artifact) => artifact.path)
    ]),
    queueItemIds: [job.taskId],
    ...(semanticImportSummary ? { semanticImport: semanticImportSummary as unknown as FrontierSwarmMergeBundle['semanticImport'] } : {}),
    metadata: createCodexRunMetadata({ ...sharedMetadata, workspaceMode: workspacePlan.mode })
  });
  if (semanticImportSummary) {
    (mergeBundle as unknown as { semanticImport: FrontierCodexSemanticImportSidecar['summary'] }).semanticImport = semanticImportSummary;
    mergeBundle.metadata = {
      ...(isObject(mergeBundle.metadata) ? mergeBundle.metadata : {}),
      semanticImport: semanticImportSummary
    } as unknown as FrontierSwarmMergeBundle['metadata'];
  }
  mergeBundle.reasons = uniqueStrings([
    ...mergeBundle.reasons,
    ...(codexDeferredFailure ? [`codex-deferred:${codexDeferredFailure.reason}`] : []),
    ...(preExecWriteFence.applied ? ['preexec-write-fence'] : []),
    ...(workspacePatchQuarantine.quarantinedChangedPaths.length ? ['quarantined-disallowed-changes'] : []),
    ...(ownershipRestore.length ? ['restored-disallowed-changes'] : []),
    ...(strictOwnershipBlocked ? [strictOwnershipBlockReason] : []),
    ...(workerTermination ? workerTermination.reasons : []),
    ...verificationSkipReasons,
    ...contextBudget.warnings,
    ...contextBudget.errors
  ]);
  await fs.writeFile(paths.mergeBundlePath, JSON.stringify(mergeBundle, null, 2) + '\n');
  await writeCodexPatchIntent({
    file: paths.patchIntentPath,
    job,
    result,
    mergeBundle,
    patchPath,
    semanticImport: semanticImport?.sidecar,
    semanticImportExpected,
    contextBudget,
    evidencePaths
  });
  await writeCodexJobEvidenceSummary({
    file: evidenceSummaryPath,
    job,
    result,
    mergeBundle,
    mergeBundlePath: paths.mergeBundlePath,
    patchPath,
    patchIntentPath: paths.patchIntentPath,
    logSummary,
    contextBudget,
    semanticImportPath: semanticImport?.path,
    semanticImport: semanticImport?.sidecar,
    semanticImportExpected,
    handoffArtifacts
  });
  await appendCodexJobResultTimelineEvents({ options, outDir, job, result, mergeBundle });
  return result;
}

function resolveNoOutputTimeoutMs(job: FrontierSwarmJob, options: FrontierCodexSwarmRunOptions): number | undefined {
  const compute = job.compute as unknown as Record<string, unknown>;
  return positiveOptionalInteger(
    compute.noOutputTimeoutMs ?? compute.idleTimeoutMs ?? compute.stalledTimeoutMs ?? options.jobNoOutputTimeoutMs
  );
}

function createCodexWorkerTermination(
  execution: { signal?: string; timedOut?: boolean; timeoutKind?: string; timeoutMs?: number; noOutputMs?: number; lastOutputAt?: number; outputProgress?: unknown; lastMessage?: string },
  logSummary: ReturnType<typeof createEmptyCodexLogSummary>
): { outcome: string; stale: boolean; reasons: string[]; signal?: string; timedOut?: boolean; timeoutKind?: string; timeoutMs?: number; noOutputMs?: number; lastOutputAt?: number; outputProgress?: unknown; outputBytes: number; hasLastMessage: boolean } | undefined {
  const reasons: string[] = [];
  if (execution.timedOut) reasons.push(`worker-timeout:${execution.timeoutKind ?? 'unknown'}`);
  if (execution.timeoutKind === 'no-output') reasons.push('worker-no-output-progress');
  if (execution.signal) reasons.push(`worker-signal:${execution.signal}`);
  const outputBytes = logSummary.eventBytes + logSummary.stderrBytes;
  const hasLastMessage = Boolean(execution.lastMessage?.trim());
  if ((execution.signal || execution.timedOut) && outputBytes === 0 && !hasLastMessage) reasons.push('worker-no-output-progress');
  const stale = reasons.includes('worker-no-output-progress') || execution.timeoutKind === 'no-output';
  if (stale) reasons.push('stale-worker-state');
  if (!reasons.length) return undefined;
  return {
    outcome: execution.timedOut ? 'timed-out' : 'stopped',
    stale,
    reasons: uniqueStrings(reasons),
    ...(execution.signal ? { signal: execution.signal } : {}),
    ...(execution.timedOut ? { timedOut: true } : {}),
    ...(execution.timeoutKind ? { timeoutKind: execution.timeoutKind } : {}),
    ...(execution.timeoutMs ? { timeoutMs: execution.timeoutMs } : {}),
    ...(execution.noOutputMs ? { noOutputMs: execution.noOutputMs } : {}),
    ...(execution.lastOutputAt ? { lastOutputAt: execution.lastOutputAt } : {}),
    ...(execution.outputProgress ? { outputProgress: execution.outputProgress } : {}),
    outputBytes,
    hasLastMessage
  };
}

function positiveOptionalInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}
