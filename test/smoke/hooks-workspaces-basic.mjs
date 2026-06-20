import assert from 'node:assert';
import {
  createCodexSwarmPlan,
  createCodexWorkspacePlan,
  createSwarmWorkspaceProof,
  exists,
  fs,
  manifestInput,
  path,
  runCodexSwarm
} from './context.mjs';

export async function testHooks(plan, tmp) {
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
}

export async function testOrderedDependencies(tmp) {
  const orderedPlan = createCodexSwarmPlan({
    manifest: manifestInput,
    tasks: {
      items: [
        { id: 'runtime-parent', lane: 'runtime', ownedFiles: ['src/runtime/parent.ts'] },
        { id: 'runtime-child', lane: 'runtime', dependsOn: ['runtime-parent'], ownedFiles: ['src/runtime/child.ts'] }
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
}

export async function testWorkspaceCopy(plan, tmp) {
  await fs.writeFile(path.join(tmp, 'fixture.txt'), 'fixture\n');
  await fs.mkdir(path.join(tmp, 'skip'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'skip', 'large.bin'), 'skip\n');
  await fs.mkdir(path.join(tmp, 'linked'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'linked', 'asset.txt'), 'asset\n');
  const copyOptions = {
    mode: 'copy',
    root: path.join(tmp, 'minimal-workspaces'),
    replace: true,
    includes: ['fixture.txt', 'skip'],
    excludes: ['skip'],
    linkPaths: ['linked'],
    linkNodeModules: false
  };
  const copyPlan = createCodexWorkspacePlan(plan.jobs[0], { outDir: path.join(tmp, 'copy-run'), cwd: tmp, workspace: copyOptions });
  assert.ok(copyPlan.includes.includes('fixture.txt'));
  assert.ok(copyPlan.includes.includes('skip'));
  const copyResult = await runCodexSwarm(plan, { outDir: path.join(tmp, 'copy-run'), cwd: tmp, dryRun: true, workspace: copyOptions });
  const workspacePath = path.join(tmp, 'minimal-workspaces', copyResult.plan.jobs[0].id);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'fixture.txt'), 'utf8'), 'fixture\n');
  assert.strictEqual(await exists(path.join(workspacePath, 'skip', 'large.bin')), false);
  assert.strictEqual((await fs.lstat(path.join(workspacePath, 'linked'))).isSymbolicLink(), true);
  const workspaceProof = await createSwarmWorkspaceProof(copyPlan);
  assert.ok(workspaceProof.copiedPaths.includes('fixture.txt'));
  assert.ok(workspaceProof.linkedPaths.includes('linked'));
}

export async function testGeneratedWorkspaceRefresh(plan, tmp) {
  const root = path.join(tmp, 'refresh-workspaces');
  const workspace = { mode: 'copy', root, includes: ['refresh.txt'], linkNodeModules: false };
  const copyPlan = createCodexWorkspacePlan(plan.jobs[0], { outDir: path.join(tmp, 'refresh-run-plan'), cwd: tmp, workspace });
  assert.strictEqual(copyPlan.replace, true);
  assert.strictEqual(createCodexWorkspacePlan(plan.jobs[0], {
    outDir: path.join(tmp, 'refresh-run-plan'),
    cwd: tmp,
    workspace: { ...workspace, replace: false }
  }).replace, false);
  assert.strictEqual(createCodexWorkspacePlan(plan.jobs[0], {
    outDir: path.join(tmp, 'refresh-run-plan'),
    cwd: tmp,
    workspace: { mode: 'snapshot', root, linkNodeModules: false }
  }).replace, true);
  assert.strictEqual(createCodexWorkspacePlan(plan.jobs[0], {
    outDir: path.join(tmp, 'refresh-run-plan'),
    cwd: tmp,
    workspace: { mode: 'git-worktree', root, linkNodeModules: false }
  }).replace, false);

  await fs.writeFile(path.join(tmp, 'refresh.txt'), 'first\n');
  await runCodexSwarm(plan, { outDir: path.join(tmp, 'refresh-run-1'), cwd: tmp, dryRun: true, workspace });
  const workspacePath = path.join(root, plan.jobs[0].id);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'refresh.txt'), 'utf8'), 'first\n');
  await fs.writeFile(path.join(workspacePath, 'stale-only.txt'), 'stale\n');
  await fs.writeFile(path.join(tmp, 'refresh.txt'), 'second\n');
  await runCodexSwarm(plan, { outDir: path.join(tmp, 'refresh-run-2'), cwd: tmp, dryRun: true, workspace });
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'refresh.txt'), 'utf8'), 'second\n');
  assert.strictEqual(await exists(path.join(workspacePath, 'stale-only.txt')), false);
}
