import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  autonomousApplyCodexSwarmRun,
  buildCodexArgs,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
  collectCodexSwarmRun,
  createSwarmWorkspaceProof,
  createCodexResourceAllocation,
  deriveCodexAutonomousApplyLockKeys,
  discoverCodexHandoffArtifacts,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  readCodexPidManifest,
  renderCodexPrompt,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  stopCodexSwarmRun
} from '../dist/index.js';

const manifestInput = {
  id: 'inkwell',
  lanes: [{
    id: 'runtime',
    layer: 'implementation',
    allowedGlobs: ['src/runtime/**'],
    evidenceOutDirPrefix: 'evidence/runtime/'
  }],
  layers: [
    { id: 'parent', childCompute: { implementation: 'codex.deep' } },
    { id: 'implementation', parentId: 'parent' }
  ]
};
const tasksInput = {
  items: [{
    id: 'runtime-action',
    lane: 'runtime',
    surfaceKind: 'runtime action',
    ownedFiles: ['src/runtime/action.ts'],
    legacySourcePaths: ['/legacy/action.ts'],
    acceptanceChecks: [{ description: 'action parity passes' }],
    verification: [{ command: 'node', args: ['test/runtime.mjs'] }]
  }]
};

const manifest = coerceCodexSwarmManifestInput(manifestInput);
const tasks = coerceCodexSwarmTasksInput(tasksInput);
assert.strictEqual(manifest.compute?.[0]?.model, 'gpt-5.5');
assert.strictEqual(tasks[0].targetRefs?.[0], 'src/runtime/action.ts');

const plan = createCodexSwarmPlan({ manifest, tasks });
assert.strictEqual(plan.jobs.length, 1);
assert.strictEqual(plan.jobs[0].compute.model, 'gpt-5.5');
assert.strictEqual(plan.jobs[0].compute.reasoningEffort, 'xhigh');
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({
    changedRegions: ['src/apply.ts#apply', 'src/apply.ts#apply'],
    changedPaths: ['src/apply.ts']
  }),
  { scope: 'semantic', keys: ['region:src/apply.ts#apply'] }
);
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({
    changedRegions: [],
    changedPaths: ['src/apply.ts', './src/apply.ts']
  }),
  { scope: 'path', keys: ['path:src/apply.ts'] }
);
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({ changedRegions: [], changedPaths: [] }),
  { scope: 'repo', keys: ['repo:*'] }
);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-'));
const paths = {
  jobDir: tmp,
  promptPath: path.join(tmp, 'prompt.md'),
  eventsPath: path.join(tmp, 'events.jsonl'),
  stderrPath: path.join(tmp, 'stderr.log'),
  lastMessagePath: path.join(tmp, 'last.md'),
  evidenceDir: path.join(tmp, 'evidence'),
  resourceAllocationPath: path.join(tmp, 'resource-allocation.json'),
  workspaceProofPath: path.join(tmp, 'workspace-proof.json'),
  patchPath: path.join(tmp, 'changes.patch'),
  mergeBundlePath: path.join(tmp, 'merge.json'),
  pidManifestPath: path.join(tmp, 'pids.json')
};
await fs.writeFile(path.join(tmp, 'last-message.md'), 'handoff\n');
await fs.mkdir(path.join(tmp, 'evidence'), { recursive: true });
await fs.writeFile(path.join(tmp, 'evidence', 'debug-handoff.json'), '{}\n');
await fs.writeFile(path.join(tmp, 'evidence', 'trace.jsonl'), '{}\n');
await fs.writeFile(path.join(tmp, 'evidence', 'watchpoints.json'), '{}\n');
const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: tmp });
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'last-message'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'debug-handoff'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'trace'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'watchpoint'));
const args = buildCodexArgs(plan.jobs[0], { outDir: tmp, workspacePath: tmp, paths });
assert.ok(!args.includes('--model'));
assert.ok(!args.includes('gpt-5.5'));
assert.ok(!args.includes('model_reasoning_effort="xhigh"'));
assert.ok(!args.includes('--ask-for-approval'));
assert.ok(!args.includes('--skip-git-repo-check'));
const explicitArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh',
  approval: 'full-auto'
});
assert.ok(explicitArgs.includes('--model'));
assert.ok(explicitArgs.includes('gpt-5.5'));
assert.ok(explicitArgs.includes('model_reasoning_effort="xhigh"'));
assert.ok(explicitArgs.includes('--ask-for-approval'));
assert.strictEqual(explicitArgs[explicitArgs.indexOf('--ask-for-approval') + 1], 'never');
const forwardedArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  modelPolicy: 'plan'
});
assert.ok(forwardedArgs.includes('--model'));
assert.ok(forwardedArgs.includes('gpt-5.5'));
assert.ok(forwardedArgs.includes('model_reasoning_effort="xhigh"'));
assert.strictEqual(normalizeCodexModelFlag('default'), undefined);
assert.strictEqual(normalizeCodexApprovalPolicy('on_request'), 'on-request');
const copyArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  workspace: { mode: 'copy' }
});
assert.ok(copyArgs.includes('--skip-git-repo-check'));

const prompt = renderCodexPrompt(plan.jobs[0], { workspacePath: tmp, paths });
assert.ok(prompt.includes('Allowed write globs'));
assert.ok(prompt.includes('Resource allocation'));
assert.ok(prompt.includes('src/runtime/action.ts'));
assert.ok(prompt.includes('git status'));
assert.ok(prompt.includes('runner snapshot'));

const browserPlan = createCodexSwarmPlan({
  manifest: {
    id: 'browser-resources',
    lanes: [{
      id: 'browser',
      allowedGlobs: ['e2e.mjs'],
      capabilities: ['browser.playwright'],
      resourceRequirements: {
        resources: { browser: 1 },
        browser: {
          required: true,
          portPool: [4177, 4178],
          profileDirPrefix: 'agent-runs/browser-profiles',
          maxConcurrency: 1,
          headless: true
        }
      }
    }]
  },
  tasks: {
    items: [{
      id: 'browser-smoke',
      lane: 'browser',
      ownedFiles: ['e2e.mjs'],
      capabilities: ['dom.assertions']
    }]
  }
});
const browserJob = browserPlan.jobs[0];
const browserAllocation = createCodexResourceAllocation(browserJob, {
  cwd: tmp,
  outDir: path.join(tmp, 'browser-run'),
  workspacePath: tmp,
  lease: {
    kind: 'frontier.swarm.lease',
    version: 1,
    id: 'lease',
    jobId: browserJob.id,
    workerId: 'worker',
    token: 'token',
    leasedAt: 0,
    expiresAt: 1,
    fencingToken: 2,
    status: 'active'
  }
});
assert.strictEqual(browserAllocation.browser.port, '4178');
assert.strictEqual(browserAllocation.env.PORT, '4178');
assert.strictEqual(browserAllocation.env.FRONTIER_SWARM_BROWSER_HEADLESS, 'true');
assert.ok(browserAllocation.browser.profileDir.endsWith(path.join('agent-runs', 'browser-profiles', browserJob.id)));
const browserPrompt = renderCodexPrompt(browserJob, { workspacePath: tmp, paths, resourceAllocation: browserAllocation });
assert.ok(browserPrompt.includes('browser.port=4178'));
assert.ok(browserPrompt.includes('FRONTIER_SWARM_BROWSER_PROFILE_DIR'));

const result = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'run'),
  cwd: tmp,
  semanticImport: true,
  dryRun: false,
  executor: async (input) => {
    assert.strictEqual(input.resourceAllocation.env.FRONTIER_SWARM_JOB_ID, input.job.id);
    assert.strictEqual(input.env.FRONTIER_SWARM_TASK_ID, input.job.taskId);
    await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'action.ts'), 'export function action() { return 1; }\n');
    await fs.writeFile(input.paths.lastMessagePath, 'done\n');
    return { exitCode: 0, changedPaths: ['src/runtime/action.ts'], lastMessage: 'done' };
  }
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.run.results[0].ownershipViolations.length, 0);
assert.ok(result.proof.hash);
assert.ok(await exists(path.join(tmp, 'run', 'coordinator-dashboard.json')));
assert.ok(await exists(path.join(tmp, 'run', 'pids.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('resource-allocation.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('workspace-proof.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('merge.json')));
const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
assert.ok(semanticImportsPath);
const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
assert.strictEqual(semanticImports.kind, 'frontier.swarm-codex.semantic-imports');
assert.strictEqual(semanticImports.summary.total, 1);
assert.strictEqual(semanticImports.summary.selected, 1);
assert.strictEqual(semanticImports.summary.eligible, 1);
assert.strictEqual(semanticImports.summary.omitted, 0);
assert.strictEqual(semanticImports.summary.imported + semanticImports.summary.errors, 1);
assert.ok(semanticImports.summary.sourceMapCount >= 1);
assert.ok(semanticImports.summary.sourceMapMappingCount >= 1);
assert.ok(semanticImports.summary.lossCount >= 1);
assert.ok(semanticImports.summary.semanticIndex.symbols >= 1);
assert.ok(semanticImports.summary.readiness['ready-with-losses'] >= 1 || semanticImports.summary.readiness['ready'] >= 1);
assert.strictEqual(result.run.results[0].mergeReadiness, 'patch-candidate');
const mergeBundlePath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('merge.json'));
const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
assert.strictEqual(mergeBundle.disposition, 'needs-port');
assert.deepStrictEqual(mergeBundle.queueItemIds, ['runtime-action']);
assert.strictEqual(mergeBundle.metadata.semanticImport.total, 1);
assert.ok(mergeBundle.metadata.semanticImport.sourceMapCount >= 1);
const collection = await collectCodexSwarmRun({ run: path.join(tmp, 'run'), checkStale: false, branchPrefix: 'codex/swarm-slice' });
assert.strictEqual(collection.summary.total, 1);
assert.strictEqual(collection.summary['needs-human-port'], 1);
assert.strictEqual(collection.mergeIndex.summary.entryCount, 1);
assert.strictEqual(collection.mergeAdmission.summary.deferredCount, 1);
assert.strictEqual(collection.hierarchicalMergeQueue.summary.promoteCount, 1);
assert.strictEqual(collection.hierarchicalMergeQueue.summary.applyLocalCount, 0);
assert.strictEqual(collection.summary.mergeQueuePromoteCount, 1);
assert.strictEqual(collection.summary.mergeQueueRerunCount, 0);
assert.strictEqual(collection.summary.mergeQueueRejectCount, 0);
assert.strictEqual(collection.summary.mergeQueueBlockCount, 0);
assert.strictEqual(collection.summary.mergeQueueRecordOnlyCount, 0);
assert.strictEqual(collection.reviewerLanePlan.summary.taskCount, 1);
assert.strictEqual(collection.patchStackPlan.summary.jobCount, 1);
assert.strictEqual(collection.queueOverlay.summary.entryCount, 1);
assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));
assert.ok(await exists(path.join(collection.outDir, 'merge-index.json')));
assert.ok(await exists(path.join(collection.outDir, 'hierarchical-merge-queue.json')));
assert.ok(await exists(path.join(collection.outDir, 'merge-admission.json')));
assert.ok(await exists(path.join(collection.outDir, 'reviewer-lane-plan.json')));
assert.ok(await exists(path.join(collection.outDir, 'patch-stack-plan.json')));
assert.ok(await exists(path.join(collection.outDir, 'queue-overlay.json')));
assert.ok(collection.artifacts);
assert.strictEqual(collection.artifacts.hierarchicalMergeQueuePath, path.join(collection.outDir, 'hierarchical-merge-queue.json'));
assert.strictEqual(collection.artifacts.counts.mergeQueuePromoteCount, collection.hierarchicalMergeQueue.summary.promoteCount);
assert.strictEqual(collection.artifacts.counts.mergeQueueApplyLocalCount, collection.hierarchicalMergeQueue.summary.applyLocalCount);
assert.ok(await exists(collection.artifacts.hierarchicalMergeQueuePath));
const collectedMergeBundle = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json'), 'utf8'));
assert.strictEqual(collectedMergeBundle.branchName, 'codex/swarm-slice/runtime-runtime-action');

const queueMetadataRunDir = path.join(tmp, 'queue-metadata-run');
await writeSyntheticMergeBundle(queueMetadataRunDir, 'apply-local', {
  disposition: 'auto-mergeable',
  autoMergeable: true
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'queue-local', {
  disposition: 'auto-mergeable',
  autoMergeable: true,
  riskLevel: 'high'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'promote');
await writeSyntheticMergeBundle(queueMetadataRunDir, 'rerun', {
  disposition: 'auto-mergeable',
  autoMergeable: true,
  staleAgainstHead: true
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'reject', {
  status: 'failed',
  mergeReadiness: 'rejected',
  disposition: 'rejected'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'block', {
  status: 'blocked',
  mergeReadiness: 'blocked',
  disposition: 'blocked'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'record-only', {
  changedPaths: [],
  mergeReadiness: 'discovery-only',
  disposition: 'discovery-only'
});
const queueMetadataCollection = await collectCodexSwarmRun({
  run: queueMetadataRunDir,
  cwd: tmp,
  outDir: path.join(tmp, 'queue-metadata-collection'),
  checkStale: false
});
assert.deepStrictEqual({
  applyLocalCount: queueMetadataCollection.summary.mergeQueueApplyLocalCount,
  queueLocalCount: queueMetadataCollection.summary.mergeQueueQueueLocalCount,
  promoteCount: queueMetadataCollection.summary.mergeQueuePromoteCount,
  rerunCount: queueMetadataCollection.summary.mergeQueueRerunCount,
  rejectCount: queueMetadataCollection.summary.mergeQueueRejectCount,
  blockCount: queueMetadataCollection.summary.mergeQueueBlockCount,
  recordOnlyCount: queueMetadataCollection.summary.mergeQueueRecordOnlyCount
}, {
  applyLocalCount: 1,
  queueLocalCount: 1,
  promoteCount: 1,
  rerunCount: 1,
  rejectCount: 1,
  blockCount: 1,
  recordOnlyCount: 1
});
assert.deepStrictEqual({
  applyLocalCount: queueMetadataCollection.artifacts.counts.mergeQueueApplyLocalCount,
  queueLocalCount: queueMetadataCollection.artifacts.counts.mergeQueueQueueLocalCount,
  promoteCount: queueMetadataCollection.artifacts.counts.mergeQueuePromoteCount,
  rerunCount: queueMetadataCollection.artifacts.counts.mergeQueueRerunCount,
  rejectCount: queueMetadataCollection.artifacts.counts.mergeQueueRejectCount,
  blockCount: queueMetadataCollection.artifacts.counts.mergeQueueBlockCount,
  recordOnlyCount: queueMetadataCollection.artifacts.counts.mergeQueueRecordOnlyCount
}, {
  applyLocalCount: 1,
  queueLocalCount: 1,
  promoteCount: 1,
  rerunCount: 1,
  rejectCount: 1,
  blockCount: 1,
  recordOnlyCount: 1
});
const queueMetadataCollectionJson = JSON.parse(await fs.readFile(path.join(queueMetadataCollection.outDir, 'collection.json'), 'utf8'));
assert.strictEqual(queueMetadataCollectionJson.summary.mergeQueueBlockCount, 1);
assert.strictEqual(queueMetadataCollectionJson.summary.mergeQueueRecordOnlyCount, 1);

const browserRun = await runCodexSwarm(browserPlan, {
  outDir: path.join(tmp, 'browser-run'),
  cwd: tmp,
  dryRun: false,
  executor: async (input) => {
    assert.strictEqual(input.resourceAllocation.browser.port, '4177');
    assert.strictEqual(input.env.PORT, '4177');
    assert.ok(await exists(input.resourceAllocation.browser.profileDir));
    await fs.writeFile(input.paths.lastMessagePath, 'browser done\n');
    return { exitCode: 0, changedPaths: ['e2e.mjs'], lastMessage: 'browser done' };
  }
});
assert.strictEqual(browserRun.ok, true);
const browserResourcePath = browserRun.run.results[0].evidencePaths.find((entry) => entry.endsWith('resource-allocation.json'));
const browserResourceEvidence = JSON.parse(await fs.readFile(browserResourcePath, 'utf8'));
assert.strictEqual(browserResourceEvidence.browser.port, '4177');

const applyRepo = path.join(tmp, 'apply-repo');
await fs.mkdir(path.join(applyRepo, 'src'), { recursive: true });
await fs.writeFile(path.join(applyRepo, 'src', 'apply.ts'), 'old\n');
await execFileP('git', ['init'], { cwd: applyRepo });
const readyDir = path.join(tmp, 'ready-collection', 'ready-to-apply', 'apply-job');
await fs.mkdir(readyDir, { recursive: true });
await fs.writeFile(path.join(readyDir, 'changes.patch'), [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'));
await fs.writeFile(path.join(readyDir, 'merge.json'), JSON.stringify({
  ...mergeBundle,
  jobId: 'apply-job',
  taskId: 'apply-task',
  status: 'verified',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  riskLevel: 'low',
  autoMergeable: true,
  changedPaths: ['src/apply.ts'],
  changedRegions: [],
  ownedFilesTouched: ['src/apply.ts'],
  patchPath: 'changes.patch',
  commandsPassed: [],
  commandsFailed: [],
  queueItemIds: ['apply-task'],
  staleAgainstHead: false,
  reasons: []
}, null, 2) + '\n');
const applyDryRun = await applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo });
assert.strictEqual(applyDryRun.ok, true);
assert.strictEqual(applyDryRun.dryRun, true);
assert.strictEqual(applyDryRun.summary.checked, 1);
assert.strictEqual(applyDryRun.entries[0].dryRun, true);
assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const patchScore = await scoreCodexSwarmPatches({
  collection: path.join(tmp, 'ready-collection'),
  cwd: applyRepo,
  workspaceIncludes: ['src'],
  focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
});
assert.strictEqual(patchScore.ok, true);
assert.strictEqual(patchScore.summary['accepted-clean'], 1);
assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const cliScore = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'score',
  '--collection',
  path.join(tmp, 'ready-collection'),
  '--include',
  'src',
  '--focused-command',
  "node -e \"const fs=require('fs'); const label='a,b'; if(label !== 'a,b' || fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: applyRepo });
assert.strictEqual(JSON.parse(cliScore.stdout).ok, true);
await assert.rejects(
  () => applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo, dryRun: false }),
  /dirty worktree/
);

const autonomousRepo = await createApplyFixtureRepo(tmp, 'autonomous-apply-repo');
const autonomousResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: autonomousRepo,
  outDir: path.join(tmp, 'autonomous-apply-out'),
  focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
});
assert.strictEqual(autonomousResult.ok, true);
assert.strictEqual(autonomousResult.dryRun, false);
assert.strictEqual(autonomousResult.summary.applied, 1);
assert.strictEqual(autonomousResult.decisions[0].status, 'applied');
assert.strictEqual(autonomousResult.decisions[0].lockScope, 'path');
assert.deepStrictEqual(autonomousResult.decisions[0].lockKeys, ['path:src/apply.ts']);
assert.deepStrictEqual(autonomousResult.lockKeys, ['path:src/apply.ts']);
assert.strictEqual(autonomousResult.lockScopeCounts.path, 1);
assert.strictEqual(autonomousResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(await fs.readFile(path.join(autonomousRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual(await exists(autonomousResult.lockPath), false);
const autonomousDecisionLines = (await fs.readFile(autonomousResult.decisionLogPath, 'utf8')).trim().split(/\r?\n/);
assert.strictEqual(autonomousDecisionLines.length, 1);
const autonomousDecisionLogEntry = JSON.parse(autonomousDecisionLines[0]);
assert.strictEqual(autonomousDecisionLogEntry.jobId, 'apply-job');
assert.deepStrictEqual(autonomousDecisionLogEntry.lockKeys, ['path:src/apply.ts']);
const autonomousApplyArtifact = JSON.parse(await fs.readFile(path.join(tmp, 'autonomous-apply-out', 'autonomous-apply.json'), 'utf8'));
assert.deepStrictEqual(autonomousApplyArtifact.lockKeys, ['path:src/apply.ts']);

const rollbackRepo = await createApplyFixtureRepo(tmp, 'autonomous-rollback-repo');
const rollbackResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: rollbackRepo,
  outDir: path.join(tmp, 'autonomous-rollback-out'),
  focusedCommands: [{ name: 'reject-new', command: 'node', args: ['-e', 'process.exit(1)'] }]
});
assert.strictEqual(rollbackResult.ok, true);
assert.strictEqual(rollbackResult.summary.rejected, 1);
assert.strictEqual(rollbackResult.decisions[0].status, 'rejected');
assert.match(rollbackResult.decisions[0].reason, /verification failed: reject-new/);
assert.strictEqual(rollbackResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(await fs.readFile(path.join(rollbackRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: rollbackRepo })).stdout, '');

const cliAutonomousRepo = await createApplyFixtureRepo(tmp, 'cli-autonomous-apply-repo');
const cliAutonomous = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'autonomous-apply',
  '--collection',
  path.join(tmp, 'ready-collection'),
  '--outDir',
  path.join(tmp, 'cli-autonomous-apply-out'),
  '--focused-command',
  "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: cliAutonomousRepo });
const cliAutonomousResult = JSON.parse(cliAutonomous.stdout);
assert.strictEqual(cliAutonomousResult.ok, true);
assert.strictEqual(cliAutonomousResult.summary.applied, 1);
assert.strictEqual(await fs.readFile(path.join(cliAutonomousRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');

const autoDrainRepo = await createApplyFixtureRepo(tmp, 'auto-drain-run-repo');
const autoDrainOutDir = path.join(autoDrainRepo, 'agent-runs', 'auto-drain-run');
const autoDrainPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply'],
      verification: [{
        name: 'worker-sees-new',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainRun = await runCodexSwarm(autoDrainPlan, {
  outDir: autoDrainOutDir,
  cwd: autoDrainRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 3,
    focusedCommands: [{ name: 'coordinator-sees-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'auto drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'auto drained' };
  }
});
assert.strictEqual(autoDrainRun.ok, true);
assert.strictEqual(autoDrainRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].status, 'applied');
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].lockScope, 'semantic');
assert.deepStrictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].lockKeys, ['region:src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainRun.autoDrain.lockKeys, ['region:src/apply.ts#apply']);
assert.strictEqual(autoDrainRun.autoDrain.lockScopeCounts.semantic, 1);
assert.strictEqual(await fs.readFile(path.join(autoDrainRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain-groups-01.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'reviewer-lane-plan.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'patch-stack-plan.json')));
const autoDrainResults = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'swarm-results.json'), 'utf8'));
const autoDrainDashboard = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainDashboard.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.kind, 'frontier.swarm-codex.dashboard-queue-metadata');
assert.strictEqual(autoDrainDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.applyLocalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.queueLocalCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.promoteCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.rerunCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.rejectCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.blockCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.recordOnlyCount, 0);
assert.deepStrictEqual(autoDrainDashboard.queueHealth, autoDrainDashboard.queueMetadata.queueHealth);
assert.deepStrictEqual(autoDrainDashboard.humanQuestions, autoDrainDashboard.queueMetadata.humanQuestions);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.kind, 'frontier.swarm-codex.dashboard-queue-health');
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, autoDrainRun.autoDrainArtifacts.mergeQueue.count);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.leaseCount, autoDrainRun.autoDrainArtifacts.mergeQueue.scopeCount);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.lockKeyCount, 1);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.queueHealth.lockScopeCounts, { semantic: 1, path: 0, repo: 0 });
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.localQueueCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.promotedCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.appliedDecisionCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.staleOrRerunCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorReviewCount, autoDrainRun.autoDrainArtifacts.reviewer.taskCount);
assert.ok(!Object.hasOwn(autoDrainDashboard.queueMetadata.queueHealth, 'humanReviewCount'));
assert.ok(!Object.hasOwn(autoDrainDashboard.queueMetadata.queueHealth, 'humanPortCount'));
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.kind, 'frontier.swarm-codex.dashboard-human-questions');
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.count, 0);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.jobIds, []);
const autoDrainArtifact = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain.json'), 'utf8'));
assert.deepStrictEqual(autoDrainArtifact.lockKeys, ['region:src/apply.ts#apply']);
assert.strictEqual(autoDrainArtifact.iterations[0].lockScopeCounts.semantic, 1);
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts, autoDrainRun.autoDrain.artifacts);
assert.deepStrictEqual(autoDrainResults.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
assert.deepStrictEqual(autoDrainDashboard.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.collectionCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.admissionCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.mergeQueuePlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.mergeQueue.promoteCount, 0);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.paths.mergeQueues, autoDrainRun.autoDrainArtifacts.mergeQueue.paths);
assert.ok(await exists(autoDrainRun.autoDrainArtifacts.mergeQueue.paths[0]));
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.reviewerPlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.patchStackPlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].grouping.summary.readyCount, 1);
assert.strictEqual(typeof autoDrainRun.autoDrainArtifacts.generatedAt, 'number');
const autoDrainArtifactIteration = autoDrainRun.autoDrainArtifacts.iterations[0];
assert.strictEqual(autoDrainArtifactIteration.hierarchicalMergeQueuePath, path.join(autoDrainOutDir, 'auto-drain', 'collection-01', 'hierarchical-merge-queue.json'));
assert.ok(autoDrainRun.autoDrainArtifacts.mergeQueue.paths.includes(autoDrainArtifactIteration.hierarchicalMergeQueuePath));
assert.strictEqual(autoDrainArtifactIteration.mergeQueueApplyLocalCount, autoDrainRun.autoDrainArtifacts.mergeQueue.applyLocalCount);
assert.strictEqual(autoDrainArtifactIteration.mergeQueuePromoteCount, autoDrainRun.autoDrainArtifacts.mergeQueue.promoteCount);
assert.ok(await exists(autoDrainArtifactIteration.hierarchicalMergeQueuePath));

const autoDrainBudgetRepo = path.join(tmp, 'auto-drain-budget-repo');
await fs.mkdir(path.join(autoDrainBudgetRepo, 'src'), { recursive: true });
await execFileP('git', ['init'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: autoDrainBudgetRepo });
await fs.writeFile(path.join(autoDrainBudgetRepo, 'src', 'one.ts'), 'old-one\n');
await fs.writeFile(path.join(autoDrainBudgetRepo, 'src', 'two.ts'), 'old-two\n');
await execFileP('git', ['add', '--', 'src/one.ts', 'src/two.ts'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['commit', '-m', 'Initial budget fixture'], { cwd: autoDrainBudgetRepo });
const autoDrainBudgetPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-budget',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-one-task',
      lane: 'apply',
      ownedFiles: ['src/one.ts'],
      changedRegions: ['src/one.ts#one'],
      verification: [{
        name: 'worker-sees-one',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/one.ts','utf8')!=='new-one\\n') process.exit(1);"]
      }]
    }, {
      id: 'apply-two-task',
      lane: 'apply',
      ownedFiles: ['src/two.ts'],
      changedRegions: ['src/two.ts#two'],
      verification: [{
        name: 'worker-sees-two',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/two.ts','utf8')!=='new-two\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainBudgetRun = await runCodexSwarm(autoDrainBudgetPlan, {
  outDir: path.join(autoDrainBudgetRepo, 'agent-runs', 'auto-drain-budget-run'),
  cwd: autoDrainBudgetRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainBudgetRepo, 'agent-runs', 'auto-drain-budget-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxReady: 1,
    maxIterations: 4
  },
  executor: async (input) => {
    const file = input.job.taskId === 'apply-one-task' ? 'src/one.ts' : 'src/two.ts';
    const value = input.job.taskId === 'apply-one-task' ? 'new-one\n' : 'new-two\n';
    await fs.writeFile(path.join(input.workspacePath, file), value);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed\n`);
    return { exitCode: 0, changedPaths: [file], lastMessage: `${input.job.taskId} changed` };
  }
});
assert.strictEqual(autoDrainBudgetRun.ok, true);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.applyCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.terminalCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.remainingReadyCount, 0);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.admittedCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.deferredCount, 0);
assert.deepStrictEqual(autoDrainBudgetRun.autoDrain.iterations.map((iteration) => iteration.admittedJobIds.length), [1, 1]);
assert.deepStrictEqual(autoDrainBudgetRun.autoDrain.iterations.map((iteration) => iteration.deferredJobIds.length), [1, 0]);
assert.strictEqual(await fs.readFile(path.join(autoDrainBudgetRepo, 'src', 'one.ts'), 'utf8'), 'new-one\n');
assert.strictEqual(await fs.readFile(path.join(autoDrainBudgetRepo, 'src', 'two.ts'), 'utf8'), 'new-two\n');

const autoDrainConflictRepo = await createApplyFixtureRepo(tmp, 'auto-drain-conflict-repo');
const autoDrainConflictPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-conflict',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-first-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      verification: [{
        name: 'worker-sees-first',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='first\\n') process.exit(1);"]
      }]
    }, {
      id: 'apply-second-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      verification: [{
        name: 'worker-sees-second',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainConflictRun = await runCodexSwarm(autoDrainConflictPlan, {
  outDir: path.join(autoDrainConflictRepo, 'agent-runs', 'auto-drain-conflict-run'),
  cwd: autoDrainConflictRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainConflictRepo, 'agent-runs', 'auto-drain-conflict-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 3
  },
  executor: async (input) => {
    const value = input.job.taskId === 'apply-first-task' ? 'first\n' : 'second\n';
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), value);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed\n`);
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: `${input.job.taskId} changed` };
  }
});
assert.strictEqual(autoDrainConflictRun.ok, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admittedJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].deferredJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admission.metadata.conflictLeaderAdmission.enabled, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admission.metadata.conflictLeaderAdmission.selectedJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.summary.applyCount >= 1, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.summary.terminalCount >= 1, true);
const conflictDrainIteration = autoDrainConflictRun.autoDrain.iterations[0];
assert.ok(conflictDrainIteration.apply.decisions.some((decision) => decision.status === 'applied'));
assert.ok(await exists(conflictDrainIteration.postApplyCollectionPath));
assert.strictEqual(conflictDrainIteration.postApplyCollection.kind, 'frontier.swarm-codex.collection');
assert.ok(await exists(conflictDrainIteration.coordinatorAgentDrainPath));
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.kind, FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.assignmentCount, 2);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.selectedCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.deferredCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.promoteCount, 2);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.selectedPromoteCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.deferredPromoteCount, 1);
const selectedConflictDrain = conflictDrainIteration.coordinatorAgentDrain.assignments.find((assignment) => assignment.selected);
const deferredConflictDrain = conflictDrainIteration.coordinatorAgentDrain.assignments.find((assignment) => !assignment.selected);
assert.ok(selectedConflictDrain);
assert.ok(deferredConflictDrain);
assert.strictEqual(selectedConflictDrain.queueAction, 'promote');
assert.strictEqual(deferredConflictDrain.queueAction, 'promote');
assert.strictEqual(selectedConflictDrain.selectionReason, 'deterministic-promoted-queue-leader');
assert.strictEqual(deferredConflictDrain.selectionReason, 'serialized-behind-promoted-queue-leader');
assert.strictEqual(selectedConflictDrain.jobId < deferredConflictDrain.jobId, true);
assert.deepStrictEqual(deferredConflictDrain.serializesAfterJobIds, [selectedConflictDrain.jobId]);
const deferredConflictGroupingJob = conflictDrainIteration.grouping.jobs.find((job) => job.jobId === deferredConflictDrain.jobId);
assert.ok(deferredConflictGroupingJob);
assert.strictEqual(deferredConflictGroupingJob.placement, 'deferred');
assert.strictEqual(deferredConflictGroupingJob.coordinatorAgent.queueAction, 'promote');
assert.deepStrictEqual(deferredConflictGroupingJob.coordinatorAgent.leaderJobIds, [selectedConflictDrain.jobId]);
assert.strictEqual(autoDrainConflictRun.autoDrainArtifacts.coordinatorAgent.count >= 1, true);
assert.strictEqual(autoDrainConflictRun.autoDrainArtifacts.summary.coordinatorAgentDrainCount >= 1, true);
assert.ok(['first\n', 'second\n'].includes(await fs.readFile(path.join(autoDrainConflictRepo, 'src', 'apply.ts'), 'utf8')));

const autoDrainDryRunRepo = await createApplyFixtureRepo(tmp, 'auto-drain-dry-run-repo');
const autoDrainDryRun = await runCodexSwarm(autoDrainPlan, {
  outDir: path.join(autoDrainDryRunRepo, 'agent-runs', 'auto-drain-dry-run'),
  cwd: autoDrainDryRunRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainDryRunRepo, 'agent-runs', 'auto-drain-dry-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    dryRun: true,
    maxIterations: 2
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'dry-run drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'dry-run drained' };
  }
});
assert.strictEqual(autoDrainDryRun.ok, true);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainDryRun.autoDrain.iterations[0].apply.decisions[0].status, 'checked');
assert.strictEqual(await fs.readFile(path.join(autoDrainDryRunRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');

const autoDrainClassificationOutDir = path.join(tmp, 'auto-drain-classification-run');
const autoDrainClassificationPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-classification',
    lanes: [{ id: 'classification', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'classification-marker',
      lane: 'classification',
      ownedFiles: ['src/marker.ts']
    }]
  }
});
const autoDrainClassificationRun = await runCodexSwarm(autoDrainClassificationPlan, {
  outDir: autoDrainClassificationOutDir,
  cwd: tmp,
  dryRun: false,
  autoDrain: {
    maxIterations: 2,
    checkStale: false
  },
  executor: async (input) => {
    const runDir = path.dirname(input.paths.jobDir);
    await writeSyntheticMergeBundle(runDir, 'classification-coordinator-review');
    await writeSyntheticMergeBundle(runDir, 'classification-stale', {
      disposition: 'stale-against-head',
      staleAgainstHead: true
    });
    await writeSyntheticMergeBundle(runDir, 'classification-failed', {
      status: 'failed',
      mergeReadiness: 'rejected',
      disposition: 'rejected'
    });
    await writeSyntheticMergeBundle(runDir, 'classification-evidence', {
      changedPaths: [],
      mergeReadiness: 'discovery-only',
      disposition: 'discovery-only'
    });
    await writeSyntheticMergeBundle(runDir, 'classification-human-question', {
      status: 'blocked',
      mergeReadiness: 'blocked',
      disposition: 'blocked'
    });
    await fs.writeFile(input.paths.lastMessagePath, 'classification seeded\n');
    return { exitCode: 0, changedPaths: [], lastMessage: 'classification seeded' };
  }
});
assert.strictEqual(autoDrainClassificationRun.ok, true);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.applyCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.remainingReadyCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.promoteCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.rerunCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.rejectCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.recordOnlyCount, 2);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.blockCount, 1);
const autoDrainClassificationDashboard = JSON.parse(await fs.readFile(path.join(autoDrainClassificationOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.promoteCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.rerunCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.rejectCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.recordOnlyCount, 2);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.blockCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.trueBlockerCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.queueHealth.trueBlockerCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.readyToApplyCount, 0);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.needsHumanPortCount, 3);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.failedEvidenceCount, 2);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.staleAgainstHeadCount, 1);
const autoDrainClassificationQueue = JSON.parse(await fs.readFile(autoDrainClassificationDashboard.queueMetadata.paths.mergeQueues[0], 'utf8'));
const autoDrainClassificationAssignments = new Map(autoDrainClassificationQueue.assignments.map((assignment) => [assignment.jobId, assignment]));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-coordinator-review').action, 'promote');
assert.ok(autoDrainClassificationAssignments.get('classification-coordinator-review').reasons.includes('coordinator-queue-required'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-stale').action, 'rerun');
assert.ok(autoDrainClassificationAssignments.get('classification-stale').reasons.includes('stale-against-head'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-failed').action, 'reject');
assert.ok(autoDrainClassificationAssignments.get('classification-failed').reasons.includes('failed-or-invalid-evidence'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-evidence').action, 'record-only');
assert.ok(autoDrainClassificationAssignments.get('classification-evidence').reasons.includes('discovery-only'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-human-question').action, 'block');
assert.ok(autoDrainClassificationAssignments.get('classification-human-question').reasons.includes('true-blocker'));
assert.deepStrictEqual(autoDrainClassificationQueue.byAction.block, ['classification-human-question']);
assert.ok(!autoDrainClassificationQueue.byAction.promote.includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.byAction.rerun.includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.byAction['record-only'].includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.promotions.some((promotion) => promotion.jobId === 'classification-evidence'));

const cleanApplyRepo = path.join(tmp, 'clean-apply-repo');
await fs.mkdir(path.join(cleanApplyRepo, 'src'), { recursive: true });
await execFileP('git', ['init'], { cwd: cleanApplyRepo });
await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: cleanApplyRepo });
await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: cleanApplyRepo });
await fs.writeFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'old\n');
await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: cleanApplyRepo });
await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: cleanApplyRepo });
const committedApply = await applyCodexSwarmCollection({
  collection: path.join(tmp, 'ready-collection'),
  cwd: cleanApplyRepo,
  dryRun: false,
  branchPrefix: 'codex/tiny',
  commit: true
});
assert.strictEqual(committedApply.ok, true);
assert.strictEqual(committedApply.dryRun, false);
assert.strictEqual(committedApply.summary.committed, 1);
assert.strictEqual(committedApply.entries[0].status, 'committed');
assert.strictEqual(committedApply.entries[0].branchName, 'codex/tiny/apply-job');
assert.match(committedApply.entries[0].commit, /^[0-9a-f]{40}$/);
assert.strictEqual(await fs.readFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual((await execFileP('git', ['branch', '--show-current'], { cwd: cleanApplyRepo })).stdout.trim(), 'codex/tiny/apply-job');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: cleanApplyRepo })).stdout, '');

const hookEvents = [];
const hookedResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'hooked-run'),
  cwd: tmp,
  dryRun: false,
  prepareJobWorkspace: async (input) => {
    hookEvents.push(`prepare:${input.job.id}`);
    await fs.writeFile(path.join(input.workspacePath, 'prepared.txt'), 'prepared\n');
  },
  renderJobPrompt: (input) => {
    hookEvents.push(`prompt:${input.job.id}`);
    return `${input.prompt}\nHooked prompt context.\n`;
  },
  changedPathFilter: (paths) => paths.filter((entry) => !entry.startsWith('node_modules/')),
  onJobStarted: (input) => {
    hookEvents.push(`started:${input.job.id}:${input.args.includes('--json')}`);
  },
  onJobFinished: (input) => {
    hookEvents.push(`finished:${input.job.id}:${input.result.changedPaths.join(',')}`);
  },
  onSwarmFinished: (input) => {
    hookEvents.push(`swarm:${input.result.ok}`);
  },
  executor: async (input) => {
    assert.ok(input.prompt.includes('Hooked prompt context.'));
    assert.strictEqual(await fs.readFile(path.join(input.workspacePath, 'prepared.txt'), 'utf8'), 'prepared\n');
    await fs.writeFile(input.paths.lastMessagePath, 'hooked\n');
    return { exitCode: 0, changedPaths: ['src/runtime/action.ts', 'node_modules/cache.txt'], lastMessage: 'hooked' };
  }
});
assert.strictEqual(hookedResult.ok, true);
assert.deepStrictEqual(hookedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);
assert.deepStrictEqual(hookEvents, [
  'prepare:runtime-runtime-action',
  'prompt:runtime-runtime-action',
  'started:runtime-runtime-action:true',
  'finished:runtime-runtime-action:src/runtime/action.ts',
  'swarm:true'
]);

const orderedPlan = createCodexSwarmPlan({
  manifest: manifestInput,
  tasks: {
    items: [
      {
        id: 'runtime-parent',
        lane: 'runtime',
        ownedFiles: ['src/runtime/parent.ts']
      },
      {
        id: 'runtime-child',
        lane: 'runtime',
        dependsOn: ['runtime-parent'],
        ownedFiles: ['src/runtime/child.ts']
      }
    ]
  },
  plan: { maxLaneConcurrency: { runtime: 2 } }
});
const order = [];
const orderedResult = await runCodexSwarm(orderedPlan, {
  outDir: path.join(tmp, 'ordered-run'),
  cwd: tmp,
  maxConcurrency: 2,
  executor: async (input) => {
    order.push(input.job.taskId);
    await fs.writeFile(input.paths.lastMessagePath, input.job.taskId + '\n');
    return { exitCode: 0, changedPaths: input.job.task.targetRefs, lastMessage: input.job.taskId };
  }
});
assert.strictEqual(orderedResult.ok, true);
assert.deepStrictEqual(order, ['runtime-parent', 'runtime-child']);
assert.ok(orderedResult.run.results.every((entry) => typeof entry.metadata?.fencingToken === 'number'));

await fs.writeFile(path.join(tmp, 'fixture.txt'), 'fixture\n');
await fs.mkdir(path.join(tmp, 'skip'), { recursive: true });
await fs.writeFile(path.join(tmp, 'skip', 'large.bin'), 'skip\n');
await fs.mkdir(path.join(tmp, 'linked'), { recursive: true });
await fs.writeFile(path.join(tmp, 'linked', 'asset.txt'), 'asset\n');
const copyPlan = createCodexWorkspacePlan(plan.jobs[0], {
  outDir: path.join(tmp, 'copy-run'),
  cwd: tmp,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'minimal-workspaces'),
    replace: true,
    includes: ['fixture.txt', 'skip'],
    excludes: ['skip'],
    linkPaths: ['linked'],
    linkNodeModules: false
  }
});
assert.ok(copyPlan.includes.includes('fixture.txt'));
assert.ok(copyPlan.includes.includes('skip'));
const copyResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'copy-run'),
  cwd: tmp,
  dryRun: true,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'minimal-workspaces'),
    replace: true,
    includes: ['fixture.txt', 'skip'],
    excludes: ['skip'],
    linkPaths: ['linked'],
    linkNodeModules: false
  }
});
const workspacePath = path.join(tmp, 'minimal-workspaces', copyResult.plan.jobs[0].id);
assert.strictEqual(await fs.readFile(path.join(workspacePath, 'fixture.txt'), 'utf8'), 'fixture\n');
assert.strictEqual(await exists(path.join(workspacePath, 'skip', 'large.bin')), false);
assert.strictEqual((await fs.lstat(path.join(workspacePath, 'linked'))).isSymbolicLink(), true);
const workspaceProof = await createSwarmWorkspaceProof(copyPlan);
assert.ok(workspaceProof.copiedPaths.includes('fixture.txt'));
assert.ok(workspaceProof.linkedPaths.includes('linked'));

const changedResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'changed-run'),
  cwd: tmp,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'changed-workspaces'),
    replace: true,
    includes: ['fixture.txt'],
    linkNodeModules: false
  },
  executor: async (input) => {
    await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
    await fs.mkdir(path.join(input.workspacePath, 'agent-runs/noisy'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'agent-runs/noisy/evidence.json'), '{}\n');
    await fs.mkdir(path.join(input.workspacePath, 'packages/frontier-swarm/dist'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'packages/frontier-swarm/dist/index.js'), 'generated\n');
    await fs.mkdir(path.join(input.workspacePath, 'packages/frontier-swarm/node_modules/.cache'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'packages/frontier-swarm/node_modules/.cache/tsconfig.tsbuildinfo'), '{}\n');
    await fs.writeFile(input.paths.lastMessagePath, 'changed\n');
    return { exitCode: 0, lastMessage: 'changed' };
  }
});
assert.strictEqual(changedResult.ok, true);
assert.deepStrictEqual(changedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);
assert.ok(changedResult.run.results[0].metadata.codexHandoffArtifacts.some((artifact) => artifact.kind === 'last-message'));
assert.ok(changedResult.run.results[0].evidencePaths.some((entry) => entry.endsWith('last-message.md')));
const changedWorkspaceProofPath = changedResult.run.results[0].evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
const changedWorkspaceProof = JSON.parse(await fs.readFile(changedWorkspaceProofPath, 'utf8'));
assert.deepStrictEqual(changedWorkspaceProof.ignoredChangedPaths, [
  'agent-runs/noisy/evidence.json',
  'packages/frontier-swarm/dist/index.js',
  'packages/frontier-swarm/node_modules/.cache/tsconfig.tsbuildinfo'
]);

const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);

const cliSource = await fs.readFile(new URL('../dist/cli.js', import.meta.url), 'utf8');
assert.ok(cliSource.includes("from './index.js'"));
assert.ok(cliSource.includes('stopCodexSwarmRun'));
assert.ok(cliSource.includes('frontier-swarm <command> [options]'));
assert.ok(cliSource.includes('--semantic-import-include <glob>'));
assert.ok(cliSource.includes('--semantic-import-exclude <glob>'));
assert.ok(cliSource.includes('--semantic-import-max-files <n>'));
assert.ok(cliSource.includes('autonomous-apply'));
assert.ok(cliSource.includes('drain'));
assert.ok(cliSource.includes('--no-auto-drain'));
assert.ok(cliSource.includes('--auto-drain-out-dir <path>'));
assert.ok(cliSource.includes('--auto-drain-allow-dirty'));
assert.ok(cliSource.includes('--auto-drain-check-stale'));
assert.ok(cliSource.includes('--auto-drain-branch-prefix <prefix>'));
assert.ok(cliSource.includes('--auto-drain-limit <n>'));
assert.ok(cliSource.includes('--auto-drain-max-iterations <n>'));
assert.ok(cliSource.includes('--auto-drain-max-ready <n>'));
assert.ok(cliSource.includes('--auto-drain-max-changed-paths <n>'));
assert.ok(cliSource.includes('--auto-drain-max-changed-regions <n>'));
assert.ok(cliSource.includes('--auto-drain-decision-log <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-path <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-timeout-ms <n>'));
assert.ok(cliSource.includes('--auto-drain-lock-stale-ms <n>'));
assert.ok(cliSource.includes("args['auto-drain-limit']"));
assert.ok(cliSource.includes("args['auto-drain-max-iterations']"));
assert.ok(cliSource.includes("args['auto-drain-decision-log']"));
assert.ok(cliSource.includes("args['auto-drain-lock-path']"));
assert.ok(cliSource.includes('debug/replay/watchpoint/trace artifacts'));

const pidManifestPath = path.join(tmp, 'pid-test', 'pids.json');
await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: 'pid-test', startedAt: Date.now() }, 'pid-test');
assert.strictEqual((await readCodexPidManifest(pidManifestPath)).entries.length, 1);
const concurrentPidManifestPath = path.join(tmp, 'pid-test', 'pids-concurrent.json');
await Promise.all(Array.from({ length: 8 }, (_, index) => appendCodexPidManifest(concurrentPidManifestPath, {
  pid: 900000 + index,
  role: 'codex',
  runId: 'pid-test',
  jobId: `job-${index}`,
  startedAt: Date.now() + index
}, 'pid-test')));
assert.strictEqual((await readCodexPidManifest(concurrentPidManifestPath)).entries.length, 8);
const stopResult = await stopCodexSwarmRun({ run: pidManifestPath });
assert.strictEqual(stopResult.ok, true);
assert.deepStrictEqual(stopResult.stopped, []);

async function createApplyFixtureRepo(root, name) {
  const repo = path.join(root, name);
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: repo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: repo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: repo });
  return repo;
}

async function writeSyntheticMergeBundle(runDir, jobId, overrides = {}) {
  const changedPaths = Array.isArray(overrides.changedPaths) ? overrides.changedPaths : [`src/${jobId}.ts`];
  const queueItemIds = Array.isArray(overrides.queueItemIds) ? overrides.queueItemIds : [`${jobId}-task`];
  const jobDir = path.join(runDir, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    jobId,
    taskId: `${jobId}-task`,
    lane: 'queue-metadata',
    title: jobId,
    generatedAt: Date.now(),
    status: 'verified',
    mergeReadiness: changedPaths.length ? 'verified-patch' : 'discovery-only',
    disposition: 'needs-port',
    riskLevel: 'low',
    autoMergeable: false,
    changedPaths,
    changedRegions: [],
    ownedFilesTouched: changedPaths,
    allowedWrites: changedPaths,
    ownershipViolations: [],
    evidencePaths: [],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds,
    staleAgainstHead: false,
    reasons: [],
    ...overrides
  }, null, 2) + '\n');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function execFileP(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}
