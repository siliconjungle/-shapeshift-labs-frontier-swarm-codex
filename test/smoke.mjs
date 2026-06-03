import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCodexPidManifest,
  buildCodexArgs,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  collectCodexSwarmRun,
  createSwarmWorkspaceProof,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  readCodexPidManifest,
  renderCodexPrompt,
  runCodexSwarm,
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
  workspaceProofPath: path.join(tmp, 'workspace-proof.json'),
  patchPath: path.join(tmp, 'changes.patch'),
  mergeBundlePath: path.join(tmp, 'merge.json'),
  pidManifestPath: path.join(tmp, 'pids.json')
};
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
assert.ok(prompt.includes('src/runtime/action.ts'));

const result = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'run'),
  cwd: tmp,
  dryRun: false,
  executor: async (input) => {
    await fs.writeFile(input.paths.lastMessagePath, 'done\n');
    return { exitCode: 0, changedPaths: ['src/runtime/action.ts'], lastMessage: 'done' };
  }
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.run.results[0].ownershipViolations.length, 0);
assert.ok(result.proof.hash);
assert.ok(await exists(path.join(tmp, 'run', 'coordinator-dashboard.json')));
assert.ok(await exists(path.join(tmp, 'run', 'pids.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('workspace-proof.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('merge.json')));
assert.strictEqual(result.run.results[0].mergeReadiness, 'patch-candidate');
const mergeBundlePath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('merge.json'));
const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
assert.strictEqual(mergeBundle.disposition, 'needs-port');
assert.deepStrictEqual(mergeBundle.queueItemIds, ['runtime-action']);
const collection = await collectCodexSwarmRun({ run: path.join(tmp, 'run'), checkStale: false, branchPrefix: 'codex/swarm-slice' });
assert.strictEqual(collection.summary.total, 1);
assert.strictEqual(collection.summary['needs-human-port'], 1);
assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));

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
    await fs.writeFile(input.paths.lastMessagePath, 'changed\n');
    return { exitCode: 0, lastMessage: 'changed' };
  }
});
assert.strictEqual(changedResult.ok, true);
assert.deepStrictEqual(changedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);
const changedWorkspaceProofPath = changedResult.run.results[0].evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
const changedWorkspaceProof = JSON.parse(await fs.readFile(changedWorkspaceProofPath, 'utf8'));
assert.deepStrictEqual(changedWorkspaceProof.ignoredChangedPaths, ['agent-runs/noisy/evidence.json']);

const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);

const cliSource = await fs.readFile(new URL('../dist/cli.js', import.meta.url), 'utf8');
assert.ok(cliSource.includes("from './index.js'"));
assert.ok(cliSource.includes('stopCodexSwarmRun'));

const pidManifestPath = path.join(tmp, 'pid-test', 'pids.json');
await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: 'pid-test', startedAt: Date.now() }, 'pid-test');
assert.strictEqual((await readCodexPidManifest(pidManifestPath)).entries.length, 1);
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
