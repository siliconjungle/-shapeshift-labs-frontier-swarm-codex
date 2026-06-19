import assert from 'node:assert';
import { collectCodexSwarmRun, exists, fs, path } from './context.mjs';

export async function testWorkspaceOnlyCollection(tmp) {
  const runDir = path.join(tmp, 'workspace-only-run');
  const jobId = 'workspace-only-recovered';
  const taskId = 'workspace-only-task';
  const workspacePath = path.join(tmp, 'workspace-only-workspace');
  const changedFile = 'src/workspace-only-recovered.ts';
  await fs.rm(path.join(tmp, changedFile), { force: true });
  await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspacePath, changedFile), 'export const workspaceOnlyRecovered = true;\n');
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
      allowedWrites: ['src/**'],
      targetRefs: [changedFile]
    }, null, 2)
  ].join('\n') + '\n');
  await fs.writeFile(path.join(evidenceDir, 'workspace-proof.json'), JSON.stringify({
    kind: 'frontier.swarm-codex.workspace-proof',
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
  const recoveredPatch = await fs.readFile(path.join(entry.outputDir, 'changes.patch'), 'utf8');
  assert.match(recoveredPatch, /diff --git a\/src\/workspace-only-recovered\.ts b\/src\/workspace-only-recovered\.ts/);
  assert.ok(await exists(path.join(collection.outDir, 'queue-outcome-model.json')));
  assert.ok(await exists(path.join(collection.outDir, 'terminal-state.json')));
}
