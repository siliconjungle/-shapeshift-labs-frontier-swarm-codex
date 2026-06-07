import fs from 'node:fs/promises';
import path from 'node:path';
import {
  checkSwarmOwnership,
  completeSwarmJob,
  createSwarmEventStream,
  createSwarmMergeBundle,
  createSwarmProof,
  createSwarmRun,
  recordSwarmEvent,
  type FrontierSwarmJob,
  type FrontierSwarmJobResultInput,
  type FrontierSwarmLease,
  type FrontierSwarmMergeBundle,
  type FrontierSwarmPlan
} from '@shapeshift-labs/frontier-swarm';
import { isObject, uniqueStrings } from './common.js';
import { createCodexSemanticImportSidecar } from './semantic-import.js';
import { semanticImportEnabled } from './semantic-import-quality.js';
import { writeCodexJobEvidenceSummary, writeCodexPatchIntent } from './codex-evidence.js';
import { discoverCodexHandoffArtifacts } from './handoff-artifacts.js';
import {
  appendCodexPidManifest,
  appendFileSwarmEvent,
  initFileSwarmEventStream,
  writeSwarmCoordinatorSnapshot
} from './codex-events.js';
import { createEmptyCodexLogSummary, normalizeCompactLogOptions, spawnCodexExecutor } from './codex-executor.js';
import { buildCodexArgs, createCodexResourceAllocation, renderCodexPrompt } from './codex-prompt.js';
import { createCodexJobPaths } from './codex-job-paths.js';
import { runCodexDependencyHealthPreflight } from './codex-run-health.js';
import { runScheduledJobPool } from './codex-run-scheduler.js';
import {
  createCodexWorkspacePlan,
  createSwarmWorkspaceProof,
  prepareCodexWorkspace
} from './codex-workspace.js';
import {
  collectChangedPaths,
  filterWorkspaceChangedPaths,
  runVerification,
  shouldSnapshotWorkspaceChanges,
  snapshotWorkspaceFiles,
  writeCodexPatchFile
} from './codex-workspace-changes.js';
import type {
  FrontierCodexJobPaths,
  FrontierCodexSemanticImportSidecar,
  FrontierCodexSwarmRunOptions,
  FrontierCodexSwarmRunResult
} from './index.js';
export async function runCodexSwarm(plan: FrontierSwarmPlan, options: FrontierCodexSwarmRunOptions): Promise<FrontierCodexSwarmRunResult> {
  const outDir = path.resolve(options.cwd ?? process.cwd(), options.outDir);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  await runCodexDependencyHealthPreflight(plan, options, outDir);
  const eventStream = options.eventStream ?? createSwarmEventStream({
    runId: plan.runId,
    root: path.join(outDir, 'streams'),
    lanes: Array.from(new Set(plan.jobs.map((job) => job.lane)))
  });
  await initFileSwarmEventStream(eventStream);
  const pidManifestPath = path.resolve(options.cwd ?? process.cwd(), options.pidManifestPath ?? path.join(outDir, 'pids.json'));
  await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: plan.runId, startedAt: Date.now() }, plan.runId);
  let run = createSwarmRun({ plan, status: 'running', startedAt: Date.now() });
  const startedEvent = { type: 'swarm.started', runId: run.id, at: run.startedAt, data: { jobCount: plan.jobs.length } };
  run = recordSwarmEvent(run, startedEvent);
  await appendFileSwarmEvent(eventStream, startedEvent);
  const runOptions = { ...options, eventStream, pidManifestPath };
  const results = await runScheduledJobPool(plan, {
    concurrency: Math.max(1, options.maxConcurrency ?? 1),
    adaptive: options.adaptiveConcurrency,
    outDir,
    eventStream
  }, (job, lease) => runCodexJob(job, runOptions, outDir, lease));
  for (const result of results) {
    const job = plan.jobs.find((entry) => entry.id === result.jobId);
    if (job) {
      await options.onJobFinished?.({ job, result });
      await appendFileSwarmEvent(eventStream, {
        type: 'agent.finished',
        runId: run.id,
        jobId: job.id,
        taskId: job.taskId,
        lane: job.lane,
        data: { status: result.status, mergeReadiness: result.mergeReadiness, changedPathCount: result.changedPaths?.length ?? 0 }
      });
    }
  }
  for (const result of results) run = completeSwarmJob(run, result);
  const proof = createSwarmProof(run, { validation: plan.validation });
  const ok = run.summary.failedCount === 0 && run.summary.blockedCount === 0 && run.summary.ownershipViolationCount === 0;
  await appendFileSwarmEvent(eventStream, {
    type: 'swarm.finished',
    runId: run.id,
    data: { ok, summary: run.summary }
  });
  await fs.writeFile(path.join(outDir, 'swarm-results.json'), JSON.stringify({ ok, outDir, run, proof }, null, 2) + '\n');
  await writeSwarmCoordinatorSnapshot(options.coordinatorSnapshotPath ? path.resolve(options.cwd ?? process.cwd(), options.coordinatorSnapshotPath) : path.join(outDir, 'coordinator-dashboard.json'), {
    ok,
    outDir,
    plan,
    run,
    proof,
    eventStream,
    pidManifestPath
  });
  const result = { ok, outDir, plan, run, proof };
  await options.onSwarmFinished?.({ result });
  return result;
}

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
  const fileSnapshot = shouldSnapshotWorkspaceChanges(workspacePlan, options)
    ? await snapshotWorkspaceFiles(workspace)
    : undefined;
  await fs.writeFile(paths.resourceAllocationPath, JSON.stringify(resourceAllocation, null, 2) + '\n');
  const basePrompt = renderCodexPrompt(job, { workspacePath: workspace, paths, resourceAllocation });
  const prompt = options.renderJobPrompt
    ? await options.renderJobPrompt({ ...hookInput, prompt: basePrompt })
    : basePrompt;
  await fs.writeFile(paths.promptPath, prompt);
  const args = buildCodexArgs(job, { ...options, workspacePath: workspace, paths });
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
      resourceAllocation
    }
  });
  const startedAt = Date.now();
  const execution = options.dryRun
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
      timeoutMs: job.compute.timeoutMs ?? options.jobTimeoutMs ?? 7200000,
      compactLogs: normalizeCompactLogOptions(options.compactLogs)
    });
  const logSummary = execution.logSummary ?? createEmptyCodexLogSummary(paths);
  if (!execution.logSummary) await fs.writeFile(paths.logSummaryPath, JSON.stringify(logSummary, null, 2) + '\n');
  const collected = execution.changedPaths
    ? filterWorkspaceChangedPaths(execution.changedPaths, workspacePlan)
    : options.collectGitStatus === false
      ? { changedPaths: [], ignoredChangedPaths: [] }
      : await collectChangedPaths(workspace, fileSnapshot, workspacePlan);
  const rawChangedPaths = collected.changedPaths;
  const changedPaths = options.changedPathFilter ? [...options.changedPathFilter(rawChangedPaths, hookInput)] : rawChangedPaths;
  const workspaceProof = await createSwarmWorkspaceProof(workspacePlan, { ignoredChangedPaths: collected.ignoredChangedPaths });
  await fs.writeFile(paths.workspaceProofPath, JSON.stringify(workspaceProof, null, 2) + '\n');
  const ownership = checkSwarmOwnership(job, changedPaths);
  const verification = options.runVerification ? await runVerification(job.verification, workspace) : [];
  const failedVerification = verification.some((entry) => entry.required !== false && entry.status !== 0);
  const status = ownership.ok && execution.exitCode === 0 && !failedVerification ? 'completed' : 'failed';
  const patchPath = await writeCodexPatchFile({
    workspace,
    sourceRoot: path.resolve(options.cwd ?? process.cwd()),
    paths,
    workspacePlan,
    changedPaths
  });
  const semanticImport = await createCodexSemanticImportSidecar({
    job,
    workspace,
    changedPaths,
    evidenceDir: paths.evidenceDir,
    options: options.semanticImport
  });
  const semanticImportSummary = semanticImport?.sidecar.summary;
  const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: paths.jobDir });
  const evidenceSummaryPath = path.join(paths.evidenceDir, 'evidence.json');
  const evidencePaths = uniqueStrings([
    paths.evidenceDir,
    evidenceSummaryPath,
    paths.resourceAllocationPath,
    paths.workspaceProofPath,
    paths.mergeBundlePath,
    ...(patchPath ? [patchPath] : []),
    ...(semanticImport ? [semanticImport.path] : []),
    paths.patchIntentPath,
    paths.logSummaryPath,
    ...handoffArtifacts.map((artifact) => artifact.path)
  ]);
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
    ...(semanticImportSummary ? { semanticImport: semanticImportSummary } : {}),
    lastMessage: execution.lastMessage,
    error: execution.error,
    metadata: {
      ...(lease ? { leaseId: lease.id, leaseToken: lease.token, fencingToken: lease.fencingToken } : {}),
      resourceAllocation,
      logSummary,
      ...(semanticImportSummary ? { semanticImport: semanticImportSummary } : {}),
      codexHandoffArtifacts: handoffArtifacts
    }
  };
  const mergeBundle = createSwarmMergeBundle({
    runId: options.eventStream?.runId,
    job,
    result,
    ...(patchPath ? { patchPath } : {}),
    evidencePaths: uniqueStrings([
      paths.evidenceDir,
      evidenceSummaryPath,
      paths.resourceAllocationPath,
      paths.workspaceProofPath,
      paths.patchIntentPath,
      paths.logSummaryPath,
      ...(semanticImport ? [semanticImport.path] : []),
      ...handoffArtifacts.map((artifact) => artifact.path)
    ]),
    queueItemIds: [job.taskId],
    ...(semanticImportSummary ? { semanticImport: semanticImportSummary as unknown as FrontierSwarmMergeBundle['semanticImport'] } : {}),
    ...(semanticImportSummary ? { metadata: { semanticImport: semanticImportSummary } } : {})
  });
  if (semanticImportSummary) {
    (mergeBundle as unknown as { semanticImport: FrontierCodexSemanticImportSidecar['summary'] }).semanticImport = semanticImportSummary;
    mergeBundle.metadata = {
      ...(isObject(mergeBundle.metadata) ? mergeBundle.metadata : {}),
      semanticImport: semanticImportSummary
    } as unknown as FrontierSwarmMergeBundle['metadata'];
  }
  await fs.writeFile(paths.mergeBundlePath, JSON.stringify(mergeBundle, null, 2) + '\n');
  await writeCodexPatchIntent({
    file: paths.patchIntentPath,
    job,
    result,
    mergeBundle,
    patchPath,
    semanticImport: semanticImport?.sidecar,
    semanticImportExpected: options.semanticImportExpected ?? semanticImportEnabled(options.semanticImport),
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
    semanticImportPath: semanticImport?.path,
    semanticImport: semanticImport?.sidecar,
    handoffArtifacts
  });
  return result;
}
