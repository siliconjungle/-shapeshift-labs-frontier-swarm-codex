import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  buildCodexArgs,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  collectCodexSwarmRun,
  createSwarmWorkspaceProof,
  createCodexResourceAllocation,
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
assert.strictEqual(collection.queueOverlay.summary.entryCount, 1);
assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));
assert.ok(await exists(path.join(collection.outDir, 'merge-index.json')));
assert.ok(await exists(path.join(collection.outDir, 'queue-overlay.json')));
const collectedMergeBundle = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json'), 'utf8'));
assert.strictEqual(collectedMergeBundle.branchName, 'codex/swarm-slice/runtime-runtime-action');

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
