import assert from 'node:assert';
import { collectCodexSwarmRun, exists, fs, path } from './context.mjs';

export async function testWorkspaceOnlyCollection(tmp) {
  const runDir = path.join(tmp, 'workspace-only-run');
  const jobId = 'workspace-only-recovered';
  const taskId = 'workspace-only-task';
  const workspacePath = path.join(tmp, 'workspace-only-workspace');
  const changedFile = 'src/workspace-only-recovered.ts';
  const noiseFiles = ['dist/cache.tsbuildinfo', '.cache/workspace-only.json'];
  await fs.rm(path.join(tmp, changedFile), { force: true });
  await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspacePath, changedFile), 'export const workspaceOnlyRecovered = true;\n');
  for (const noiseFile of noiseFiles) {
    await fs.mkdir(path.dirname(path.join(workspacePath, noiseFile)), { recursive: true });
    await fs.writeFile(path.join(workspacePath, noiseFile), `${noiseFile}\n`);
  }
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'last-message.md'), 'workspace-only done\n');
  await fs.writeFile(path.join(jobDir, 'prompt.md'), [
    '# Frontier Swarm Codex Job',
    '',
    `Job: ${jobId}`,
    `Task: ${taskId}`,
    'Lane: workspace-only',
    `Workspace: ${workspacePath}`,
    '',
    'Raw task JSON:',
    '',
    JSON.stringify({
      id: taskId,
      lane: 'workspace-only',
      title: 'Recover workspace-only output',
      allowedWrites: ['src/**', 'dist/**', '.cache/**'],
      targetRefs: [changedFile, ...noiseFiles]
    }, null, 2)
  ].join('\n') + '\n');
  await fs.writeFile(path.join(evidenceDir, 'workspace-proof.json'), JSON.stringify({
    kind: 'frontier.swarm-git.workspace-proof',
    version: 1,
    id: 'workspace-proof:workspace-only-recovered',
    generatedAt: Date.now(),
    manifest: { mode: 'copy', path: workspacePath },
    copiedPaths: [],
    linkedPaths: [],
    missingRequired: [],
    missingOptional: [],
    ignoredChangedPaths: [],
    ignoredChangedPathReasons: [],
    observedChangedPaths: [changedFile, ...noiseFiles],
    reportedChangedPaths: [changedFile, ...noiseFiles],
    summary: {
      copiedCount: 0,
      linkedCount: 0,
      missingRequiredCount: 0,
      missingOptionalCount: 0,
      ignoredChangedPathCount: 0,
      ignoredChangedPathReasonCounts: {},
      observedChangedPathCount: 3,
      reportedChangedPathCount: 3
    }
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({ run: runDir, cwd: tmp, checkStale: false, artifactStoreMode: 'compact' });
  assert.strictEqual(collection.summary.total, 1);
  assert.strictEqual(collection.summary.collectorGeneratedPatchCount, 1);
  assert.strictEqual(collection.summary['needs-human-port'], 1);
  assert.strictEqual(collection.queueOutcomeModel.summary.visibleReviewDebtCount, 1);
  assert.strictEqual(collection.terminalState.summary.activeItemCount, 1);
  const entry = collection.buckets['needs-human-port'].find((item) => item.jobId === jobId);
  assert.ok(entry);
  assert.strictEqual(entry.generatedByCollector, true);
  assert.ok(entry.patchPath);
  assert.ok(await exists(path.join(entry.outputDir, 'changes.patch')));
  const recoveredBundle = JSON.parse(await fs.readFile(path.join(entry.outputDir, 'merge.json'), 'utf8'));
  assert.deepStrictEqual(recoveredBundle.changedPaths, [changedFile]);
  assert.strictEqual(recoveredBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.changedPathSource, 'worker-checkout');
  assert.strictEqual(recoveredBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.recoveryStatus, 'patch-generated');
  const recoveredPatch = await fs.readFile(path.join(entry.outputDir, 'changes.patch'), 'utf8');
  assert.match(recoveredPatch, /diff --git a\/src\/workspace-only-recovered\.ts b\/src\/workspace-only-recovered\.ts/);
  assert.doesNotMatch(recoveredPatch, /cache\.tsbuildinfo|\.cache\/workspace-only\.json/);
  const dashboardJob = collection.dashboard.jobs.find((item) => item.jobId === jobId);
  assert.ok(dashboardJob);
  assert.deepStrictEqual(dashboardJob.changedPaths, [changedFile]);
  const compactJob = collection.compactDashboard.topJobs.find((item) => item.jobId === jobId);
  assert.ok(compactJob);
  assert.deepStrictEqual(compactJob.changedPaths, [changedFile]);
  assert.ok(await exists(path.join(collection.outDir, 'queue-outcome-model.json')));
  assert.ok(await exists(path.join(collection.outDir, 'terminal-state.json')));

  await assertWorkspaceOnlyFailedPatch(tmp);
  await assertWorkspaceOnlyStoppedPartialRecovery(tmp);
}

async function assertWorkspaceOnlyFailedPatch(tmp) {
  const runDir = path.join(tmp, 'workspace-only-failed-patch-run');
  const jobId = 'workspace-only-failed-patch';
  const taskId = 'workspace-only-failed-patch-task';
  const workspacePath = path.join(tmp, 'workspace-only-failed-patch-workspace');
  const changedFile = 'src/workspace-only-failed-patch.ts';
  const content = 'export const workspaceOnlyFailedPatch = true;\n';
  await fs.mkdir(path.dirname(path.join(tmp, changedFile)), { recursive: true });
  await fs.mkdir(path.dirname(path.join(workspacePath, changedFile)), { recursive: true });
  await fs.writeFile(path.join(tmp, changedFile), content);
  await fs.writeFile(path.join(workspacePath, changedFile), content);
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'prompt.md'), [
    '# Frontier Swarm Codex Job',
    '',
    `Job: ${jobId}`,
    `Task: ${taskId}`,
    'Lane: workspace-only',
    `Workspace: ${workspacePath}`,
    '',
    'Raw task JSON:',
    '',
    JSON.stringify({
      id: taskId,
      lane: 'workspace-only',
      title: 'Recover workspace-only failed patch output',
      allowedWrites: ['src/**'],
      targetRefs: [changedFile]
    }, null, 2)
  ].join('\n') + '\n');
  await fs.writeFile(path.join(evidenceDir, 'workspace-proof.json'), JSON.stringify({
    kind: 'frontier.swarm-git.workspace-proof',
    version: 1,
    id: 'workspace-proof:workspace-only-failed-patch',
    generatedAt: Date.now(),
    manifest: { mode: 'copy', path: workspacePath },
    copiedPaths: [],
    linkedPaths: [],
    missingRequired: [],
    missingOptional: [],
    ignoredChangedPaths: [],
    ignoredChangedPathReasons: [],
    observedChangedPaths: [changedFile],
    reportedChangedPaths: [changedFile],
    summary: {
      copiedCount: 0,
      linkedCount: 0,
      missingRequiredCount: 0,
      missingOptionalCount: 0,
      ignoredChangedPathCount: 0,
      ignoredChangedPathReasonCounts: {},
      observedChangedPathCount: 1,
      reportedChangedPathCount: 1
    }
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({ run: runDir, cwd: tmp, checkStale: false, artifactStoreMode: 'compact' });
  assert.strictEqual(collection.summary.total, 1);
  assert.strictEqual(collection.summary.collectorGeneratedPatchCount, 0);
  assert.strictEqual(collection.summary['failed-evidence'], 1);
  const entry = collection.buckets['failed-evidence'].find((item) => item.jobId === jobId);
  assert.ok(entry);
  assert.strictEqual(entry.generatedByCollector, true);
  assert.strictEqual(entry.patchPath, undefined);
  assert.strictEqual(await exists(path.join(entry.outputDir, 'changes.patch')), false);
  const failedBundle = JSON.parse(await fs.readFile(path.join(entry.outputDir, 'merge.json'), 'utf8'));
  assert.deepStrictEqual(failedBundle.changedPaths, [changedFile]);
  assert.strictEqual(failedBundle.status, 'failed');
  assert.strictEqual(failedBundle.disposition, 'rejected');
  assert.ok(failedBundle.reasons.includes('collector-workspace-only-recovery-failed-patch'));
  assert.ok(failedBundle.reasons.includes('empty patch'));
  assert.strictEqual(failedBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.recoveryStatus, 'failed-patch');
  assert.deepStrictEqual(failedBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.recoveryFailureReasons, [
    'empty patch',
    'collector-workspace-only-recovery-failed-patch'
  ]);
  const dashboardJob = collection.dashboard.jobs.find((item) => item.jobId === jobId);
  assert.ok(dashboardJob);
  assert.deepStrictEqual(dashboardJob.changedPaths, [changedFile]);
  assert.strictEqual(dashboardJob.changedPaths.length, 1);
}

async function assertWorkspaceOnlyStoppedPartialRecovery(tmp) {
  const runDir = path.join(tmp, 'workspace-only-stopped-run');
  const jobId = 'workspace-only-stopped-partial';
  const taskId = 'workspace-only-stopped-task';
  const workspacePath = path.join(tmp, 'workspace-only-stopped-workspace');
  const changedFile = 'src/workspace-only-stopped.ts';
  await fs.rm(path.join(tmp, changedFile), { force: true });
  await fs.mkdir(path.dirname(path.join(workspacePath, changedFile)), { recursive: true });
  await fs.writeFile(path.join(workspacePath, changedFile), 'export const stoppedPartialRecovery = true;\n');
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'codex-events.jsonl'), '');
  await fs.writeFile(path.join(jobDir, 'codex-stderr.log'), '');
  await fs.writeFile(path.join(runDir, 'pids.json'), JSON.stringify({
    kind: 'frontier.swarm-codex.pid-manifest',
    version: 1,
    runId: 'workspace-only-stopped-run',
    entries: [{
      pid: 987654,
      role: 'codex',
      jobId,
      startedAt: Date.now() - 600000,
      stoppedAt: Date.now(),
      stopSignal: 'SIGTERM',
      stopReason: 'stop-command'
    }]
  }, null, 2) + '\n');
  await fs.writeFile(path.join(jobDir, 'prompt.md'), [
    '# Frontier Swarm Codex Job',
    '',
    `Job: ${jobId}`,
    `Task: ${taskId}`,
    'Lane: workspace-only',
    `Workspace: ${workspacePath}`,
    '',
    'Raw task JSON:',
    '',
    JSON.stringify({
      id: taskId,
      lane: 'workspace-only',
      title: 'Recover stopped workspace-only output',
      allowedWrites: ['src/**'],
      targetRefs: [changedFile]
    }, null, 2)
  ].join('\n') + '\n');
  await fs.writeFile(path.join(evidenceDir, 'workspace-proof.json'), JSON.stringify({
    kind: 'frontier.swarm-git.workspace-proof',
    version: 1,
    id: 'workspace-proof:workspace-only-stopped-partial',
    generatedAt: Date.now(),
    manifest: { mode: 'copy', path: workspacePath },
    copiedPaths: [],
    linkedPaths: [],
    missingRequired: [],
    missingOptional: [],
    ignoredChangedPaths: [],
    ignoredChangedPathReasons: [],
    observedChangedPaths: [changedFile],
    reportedChangedPaths: [],
    summary: {
      copiedCount: 0,
      linkedCount: 0,
      missingRequiredCount: 0,
      missingOptionalCount: 0,
      ignoredChangedPathCount: 0,
      ignoredChangedPathReasonCounts: {},
      observedChangedPathCount: 1,
      reportedChangedPathCount: 0
    }
  }, null, 2) + '\n');
  const collection = await collectCodexSwarmRun({ run: runDir, cwd: tmp, checkStale: false, artifactStoreMode: 'compact' });
  assert.strictEqual(collection.summary.total, 1);
  assert.strictEqual(collection.summary.collectorGeneratedPatchCount, 1);
  assert.strictEqual(collection.summary['rerun-work'], 1);
  const entry = collection.buckets['rerun-work'].find((item) => item.jobId === jobId);
  assert.ok(entry);
  assert.strictEqual(entry.generatedByCollector, true);
  assert.ok(entry.patchPath);
  const recoveredBundle = JSON.parse(await fs.readFile(path.join(entry.outputDir, 'merge.json'), 'utf8'));
  assert.deepStrictEqual(recoveredBundle.changedPaths, [changedFile]);
  assert.strictEqual(recoveredBundle.status, 'failed');
  assert.strictEqual(recoveredBundle.disposition, 'needs-port');
  assert.ok(recoveredBundle.reasons.includes('stale-worker-stopped'));
  assert.ok(recoveredBundle.reasons.includes('worker-no-output-progress'));
  assert.ok(recoveredBundle.reasons.includes('collector-partial-source-recovery'));
  assert.strictEqual(recoveredBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.recoveryStatus, 'stale-worker-patch-generated');
  assert.strictEqual(recoveredBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.workerState.outcome, 'stopped');
  assert.strictEqual(recoveredBundle.metadata.frontierSwarmCodex.workspaceOnlyCollection.workerState.noOutputProgress, true);
  const recoveredPatch = await fs.readFile(path.join(entry.outputDir, 'changes.patch'), 'utf8');
  assert.match(recoveredPatch, /diff --git a\/src\/workspace-only-stopped\.ts b\/src\/workspace-only-stopped\.ts/);
  const dashboardJob = collection.dashboard.jobs.find((item) => item.jobId === jobId);
  assert.ok(dashboardJob);
  assert.deepStrictEqual(dashboardJob.changedPaths, [changedFile]);
  assert.notStrictEqual(dashboardJob.disposition, 'evidence-only');
  assert.notStrictEqual(dashboardJob.mergeReadiness, 'evidence-only');
  const compactJob = collection.compactDashboard.topJobs.find((item) => item.jobId === jobId);
  assert.ok(compactJob);
  assert.deepStrictEqual(compactJob.changedPaths, [changedFile]);
  assert.notStrictEqual(compactJob.disposition, 'evidence-only');
}
