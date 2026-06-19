import assert from 'node:assert';
import {
  createCodexSwarmPlan,
  createCodexWorkspacePlan,
  createSwarmWorkspaceProof,
  exists,
  execFileP,
  fs,
  manifestInput,
  path,
  runCodexSwarm,
  tasksInput
} from './context.mjs';

export async function testHooksAndWorkspaces({ plan, tmp }) {
  await testHooks(plan, tmp);
  await testOrderedDependencies(tmp);
  await testWorkspaceCopy(plan, tmp);
  await testGeneratedWorkspaceRefresh(plan, tmp);
  await testChangedPathDiscovery(plan, tmp);
  await testReportedWorkspaceNoiseFiltering(plan, tmp);
  await testStrictAllowedWritePolicy(plan, tmp);
  await testDeferredCodexFailure(plan, tmp);

  const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
  await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
  assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);
}

async function testHooks(plan, tmp) {
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

async function testOrderedDependencies(tmp) {
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
}

async function testWorkspaceCopy(plan, tmp) {
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
  const copyPlan = createCodexWorkspacePlan(plan.jobs[0], {
    outDir: path.join(tmp, 'copy-run'),
    cwd: tmp,
    workspace: copyOptions
  });
  assert.ok(copyPlan.includes.includes('fixture.txt'));
  assert.ok(copyPlan.includes.includes('skip'));
  const copyResult = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'copy-run'),
    cwd: tmp,
    dryRun: true,
    workspace: copyOptions
  });
  const workspacePath = path.join(tmp, 'minimal-workspaces', copyResult.plan.jobs[0].id);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'fixture.txt'), 'utf8'), 'fixture\n');
  assert.strictEqual(await exists(path.join(workspacePath, 'skip', 'large.bin')), false);
  assert.strictEqual((await fs.lstat(path.join(workspacePath, 'linked'))).isSymbolicLink(), true);
  const workspaceProof = await createSwarmWorkspaceProof(copyPlan);
  assert.ok(workspaceProof.copiedPaths.includes('fixture.txt'));
  assert.ok(workspaceProof.linkedPaths.includes('linked'));
}

async function testGeneratedWorkspaceRefresh(plan, tmp) {
  const root = path.join(tmp, 'refresh-workspaces');
  const workspace = {
    mode: 'copy',
    root,
    includes: ['refresh.txt'],
    linkNodeModules: false
  };
  const copyPlan = createCodexWorkspacePlan(plan.jobs[0], {
    outDir: path.join(tmp, 'refresh-run-plan'),
    cwd: tmp,
    workspace
  });
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
  await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'refresh-run-1'),
    cwd: tmp,
    dryRun: true,
    workspace
  });
  const workspacePath = path.join(root, plan.jobs[0].id);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'refresh.txt'), 'utf8'), 'first\n');
  await fs.writeFile(path.join(workspacePath, 'stale-only.txt'), 'stale\n');
  await fs.writeFile(path.join(tmp, 'refresh.txt'), 'second\n');
  await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'refresh-run-2'),
    cwd: tmp,
    dryRun: true,
    workspace
  });
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'refresh.txt'), 'utf8'), 'second\n');
  assert.strictEqual(await exists(path.join(workspacePath, 'stale-only.txt')), false);
}

async function testChangedPathDiscovery(plan, tmp) {
  await fs.writeFile(path.join(tmp, 'fixture.txt'), 'fixture\n');
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
      await fs.writeFile(path.join(input.workspacePath, 'fixture.txt'), 'fixture\n');
      await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
      await fs.writeFile(path.join(input.workspacePath, 'loom.json'), '{}\n');
      await fs.writeFile(path.join(input.workspacePath, '.loomignore'), '.loom\n');
      await fs.writeFile(path.join(input.workspacePath, '.gitignore'), '.loom\n');
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
  assert.ok(!changedResult.run.results[0].metadata.observedChangedPaths.includes('fixture.txt'));
  const changedPatchPath = changedResult.run.results[0].patchPath;
  assert.ok(changedPatchPath);
  const changedPatch = await fs.readFile(changedPatchPath, 'utf8');
  assert.ok(changedPatch.includes('diff --git a/src/runtime/action.ts b/src/runtime/action.ts'));
  assert.ok(changedPatch.includes('+++ b/src/runtime/action.ts'));
  assert.ok(!changedPatch.includes(tmp));
  await execFileP('git', ['apply', '--check', changedPatchPath], { cwd: tmp });
  assert.ok(changedResult.run.results[0].metadata.codexHandoffArtifacts.some((artifact) => artifact.kind === 'last-message'));
  assert.ok(changedResult.run.results[0].evidencePaths.some((entry) => entry.endsWith('last-message.md')));
  const changedWorkspaceProofPath = changedResult.run.results[0].evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  const changedWorkspaceProof = JSON.parse(await fs.readFile(changedWorkspaceProofPath, 'utf8'));
  assert.deepStrictEqual(changedWorkspaceProof.ignoredChangedPaths, [
    '.gitignore',
    '.loomignore',
    'agent-runs',
    'loom.json',
    'packages/frontier-swarm/dist',
    'packages/frontier-swarm/node_modules'
  ]);
  assert.deepStrictEqual(changedWorkspaceProof.summary.ignoredChangedPathReasonCounts, {
    agent_runs: 1,
    build_output: 1,
    generated_setup: 3,
    node_modules: 1
  });
  for (const noisyPath of [
    'agent-runs/noisy/evidence.json',
    'packages/frontier-swarm/dist/index.js',
    'packages/frontier-swarm/node_modules/.cache/tsconfig.tsbuildinfo'
  ]) {
    assert.ok(!changedResult.run.results[0].changedPaths.includes(noisyPath), `${noisyPath} must not become a changed path`);
    assert.ok(!changedPatch.includes(noisyPath), `${noisyPath} must not be emitted into patch output`);
  }

  const explicitSetupResult = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'explicit-setup-run'),
    cwd: tmp,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'explicit-setup-workspaces'),
      replace: true,
      includes: ['.gitignore'],
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.writeFile(path.join(input.workspacePath, '.gitignore'), '.loom\n');
      await fs.writeFile(input.paths.lastMessagePath, 'explicit setup\n');
      return { exitCode: 0, lastMessage: 'explicit setup' };
    }
  });
  assert.deepStrictEqual(explicitSetupResult.run.results[0].changedPaths, ['.gitignore']);
}

async function testReportedWorkspaceNoiseFiltering(plan, tmp) {
  const reportedNoiseResult = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'reported-noise-run'),
    cwd: tmp,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'reported-noise-workspaces'),
      replace: true,
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
      await fs.mkdir(path.join(input.workspacePath, '.git'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, '.git/index.lock'), 'git metadata\n');
      await fs.mkdir(path.join(input.workspacePath, '.cache'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, '.cache/tsconfig.tsbuildinfo'), '{}\n');
      await fs.mkdir(path.join(input.workspacePath, '.vite/deps'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, '.vite/deps/_metadata.json'), '{}\n');
      await fs.writeFile(path.join(input.workspacePath, '.eslintcache'), '{}\n');
      await fs.mkdir(path.join(input.workspacePath, 'packages/frontier-swarm/build'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, 'packages/frontier-swarm/build/index.js'), 'generated\n');
      await fs.writeFile(input.paths.lastMessagePath, 'reported noise\n');
      return {
        exitCode: 0,
        changedPaths: [
          'src/runtime/action.ts',
          '.git/index.lock',
          '.cache/tsconfig.tsbuildinfo',
          '.vite/deps/_metadata.json',
          '.eslintcache',
          'packages/frontier-swarm/build/index.js'
        ],
        lastMessage: 'reported noise'
      };
    }
  });
  const result = reportedNoiseResult.run.results[0];
  assert.strictEqual(reportedNoiseResult.ok, true);
  assert.deepStrictEqual(result.changedPaths, ['src/runtime/action.ts']);
  assert.deepStrictEqual(result.ownershipViolations, []);
  assert.ok(result.metadata.observedChangedPaths.includes('.git/index.lock'));
  assert.ok(result.metadata.observedChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));
  assert.ok(result.metadata.observedChangedPaths.includes('.vite/deps/_metadata.json'));
  assert.ok(result.metadata.observedChangedPaths.includes('.eslintcache'));
  assert.ok(result.metadata.observedChangedPaths.includes('packages/frontier-swarm/build/index.js'));
  assert.ok(result.metadata.reportedChangedPaths.includes('.git/index.lock'));
  assert.ok(result.metadata.reportedChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));
  assert.ok(result.metadata.reportedChangedPaths.includes('.vite/deps/_metadata.json'));
  assert.ok(result.metadata.reportedChangedPaths.includes('.eslintcache'));
  assert.ok(result.metadata.reportedChangedPaths.includes('packages/frontier-swarm/build/index.js'));

  const workspaceProofPath = result.evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  const workspaceProof = JSON.parse(await fs.readFile(workspaceProofPath, 'utf8'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('.git/index.lock'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('.vite/deps/_metadata.json'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('.eslintcache'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('packages/frontier-swarm/build/index.js'));
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.git/index.lock')?.reasonCode, 'git_metadata');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.cache/tsconfig.tsbuildinfo')?.reasonCode, 'tsbuildinfo');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.vite/deps/_metadata.json')?.reasonCode, 'cache');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.eslintcache')?.reasonCode, 'cache');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === 'packages/frontier-swarm/build/index.js')?.reasonCode, 'build_output');
}

async function testDeferredCodexFailure(plan, tmp) {
  const deferredResult = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'deferred-failure-run'),
    cwd: tmp,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'deferred-failure-workspaces'),
      replace: true,
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.writeFile(input.paths.lastMessagePath, 'usage limit; try again later\n');
      return { exitCode: 1, changedPaths: [], lastMessage: 'usage limit', deferredReason: 'usage-limit' };
    }
  });
  const result = deferredResult.run.results[0];
  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.exitCode, 1);
  assert.strictEqual(result.mergeReadiness, 'discovery-only');
  assert.strictEqual(result.mergeDisposition, 'discovery-only');
  assert.strictEqual(result.metadata.codexDeferredFailure.reason, 'usage-limit');
  const mergeBundlePath = result.evidencePaths.find((entry) => entry.endsWith('merge.json'));
  assert.ok(mergeBundlePath);
  const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
  assert.strictEqual(mergeBundle.disposition, 'discovery-only');
  assert.strictEqual(mergeBundle.status, 'blocked');
}

async function testStrictAllowedWritePolicy(plan, tmp) {
  await fs.mkdir(path.join(tmp, 'src/other'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'src/other/existing.ts'), 'export const original = true;\n');
  await fs.writeFile(path.join(tmp, 'src/other/not-in-workspace.ts'), 'export const original = true;\n');
  await fs.mkdir(path.join(tmp, 'src/other/existing-empty'), { recursive: true });
  await fs.mkdir(path.join(tmp, '.git'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.git/index'), 'original git index\n');
  await fs.mkdir(path.join(tmp, '.cache'), { recursive: true });
  await fs.writeFile(path.join(tmp, '.cache/existing-cache.json'), '{}\n');
  await fs.mkdir(path.join(tmp, 'build'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'build/existing.js'), 'generated\n');
  await fs.mkdir(path.join(tmp, 'test'), { recursive: true });
  await fs.writeFile(path.join(tmp, 'test/runtime.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

assert.strictEqual(await fs.readFile('src/other/existing.ts', 'utf8'), 'export const original = true;\\n');
await assert.rejects(fs.access('src/other/out.ts'));
await assert.rejects(fs.access('src/other/not-in-workspace.ts'));
await assert.rejects(fs.access('src/other/stray-dir'));
await assert.rejects(fs.access('src/other/empty-out'));
assert.deepStrictEqual(await fs.readdir('src/other/existing-empty'), []);
`, 'utf8');
  const strictResult = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'strict-write-policy-run'),
    cwd: tmp,
    allowedWritePolicy: { mode: 'strict' },
    runVerification: true,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'strict-write-policy-workspaces'),
      replace: true,
      includes: ['src/other/existing.ts', 'src/other/existing-empty', 'test/runtime.mjs'],
      artifactIncludes: ['.git/index', '.cache/existing-cache.json', 'build/existing.js'],
      linkNodeModules: false
    },
    executor: async (input) => {
      const otherDir = path.join(input.workspacePath, 'src/other');
      const existingEmptyDir = path.join(otherDir, 'existing-empty');
      const existing = path.join(otherDir, 'existing.ts');
      const gitDir = path.join(input.workspacePath, '.git');
      const gitIndex = path.join(gitDir, 'index');
      const gitLock = path.join(gitDir, 'index.lock');
      const cacheDir = path.join(input.workspacePath, '.cache');
      const cacheFile = path.join(cacheDir, 'existing-cache.json');
      const cacheNewFile = path.join(cacheDir, 'new-cache.json');
      const buildDir = path.join(input.workspacePath, 'build');
      const buildFile = path.join(buildDir, 'existing.js');
      const buildNewFile = path.join(buildDir, 'new.js');
      const directExistingWriteDenied = await writeWasDenied(existing, 'export const direct = true;\n');
      const directNewWriteDenied = await writeWasDenied(path.join(otherDir, 'out.ts'), 'export const direct = true;\n');
      const directGitWriteDenied = await writeWasDenied(gitIndex, 'direct git index\n');
      const directGitLockWriteDenied = await writeWasDenied(gitLock, 'direct git lock\n');
      const directCacheWriteDenied = await writeWasDenied(cacheFile, '{"direct":true}\n');
      const directCacheNewWriteDenied = await writeWasDenied(cacheNewFile, '{"direct":true}\n');
      const directBuildWriteDenied = await writeWasDenied(buildFile, 'direct build\n');
      const directBuildNewWriteDenied = await writeWasDenied(buildNewFile, 'direct build\n');
      const strictChmodExpected = process.platform !== 'win32'
        && !(typeof process.getuid === 'function' && process.getuid() === 0);
      assert.ok(directExistingWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal existing-file writes');
      assert.ok(directNewWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal new-file writes');
      assert.ok(directGitWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal git metadata writes');
      assert.ok(directGitLockWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal new git metadata writes');
      assert.ok(directCacheWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal cache writes');
      assert.ok(directCacheNewWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal new cache writes');
      assert.ok(directBuildWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal build-output writes');
      assert.ok(directBuildNewWriteDenied || !strictChmodExpected, 'pre-exec write fence must deny normal new build-output writes');
      await fs.chmod(existing, 0o644).catch(() => {});
      await fs.chmod(otherDir, 0o755).catch(() => {});
      await fs.chmod(existingEmptyDir, 0o755).catch(() => {});
      await fs.chmod(gitDir, 0o755).catch(() => {});
      await fs.chmod(gitIndex, 0o644).catch(() => {});
      await fs.chmod(cacheDir, 0o755).catch(() => {});
      await fs.chmod(cacheFile, 0o644).catch(() => {});
      await fs.chmod(buildDir, 0o755).catch(() => {});
      await fs.chmod(buildFile, 0o644).catch(() => {});
      await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
      await fs.writeFile(path.join(otherDir, 'out.ts'), 'export const hidden = true;\n');
      await fs.writeFile(existing, 'export const hidden = true;\n');
      await fs.writeFile(path.join(otherDir, 'not-in-workspace.ts'), 'export const hidden = true;\n');
      await fs.mkdir(path.join(otherDir, 'stray-dir'), { recursive: true });
      await fs.writeFile(path.join(otherDir, 'stray-dir', 'nested.ts'), 'export const hidden = true;\n');
      await fs.mkdir(path.join(otherDir, 'empty-out'), { recursive: true });
      await fs.writeFile(path.join(existingEmptyDir, 'nested.ts'), 'export const hidden = true;\n');
      await fs.mkdir(path.join(input.workspacePath, 'agent-runs', 'strict-noise'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, 'agent-runs', 'strict-noise', 'evidence.json'), '{}\n');
      await fs.writeFile(gitIndex, 'hidden git index\n');
      await fs.writeFile(gitLock, 'hidden git lock\n');
      await fs.writeFile(cacheFile, '{"hidden":true}\n');
      await fs.writeFile(cacheNewFile, '{"hidden":true}\n');
      await fs.writeFile(buildFile, 'hidden build\n');
      await fs.writeFile(buildNewFile, 'hidden build\n');
      await fs.writeFile(input.paths.lastMessagePath, 'strict policy\n');
      return {
        exitCode: 0,
        changedPaths: ['src/runtime/action.ts'],
        lastMessage: 'strict policy'
      };
    }
  });
  const result = strictResult.run.results[0];
  assert.strictEqual(strictResult.ok, false);
  assert.ok(result.changedPaths.includes('src/runtime/action.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/out.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/existing.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/not-in-workspace.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/stray-dir/nested.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/empty-out'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/existing-empty'));
  assert.ok(result.metadata.observedChangedPaths.includes('src/other/existing-empty/nested.ts'));
  assert.ok(result.metadata.observedChangedPaths.includes('agent-runs'));
  assert.ok(!result.metadata.observedChangedPaths.includes('.git'));
  assert.ok(!result.metadata.observedChangedPaths.includes('.cache'));
  assert.ok(!result.metadata.observedChangedPaths.includes('build'));
  assert.ok(result.ownershipViolations.includes('src/other/out.ts'));
  assert.ok(result.ownershipViolations.includes('src/other/existing.ts'));
  assert.ok(result.ownershipViolations.includes('src/other/not-in-workspace.ts'));
  assert.ok(result.ownershipViolations.includes('src/other/stray-dir/nested.ts'));
  assert.ok(result.ownershipViolations.includes('src/other/empty-out'));
  assert.ok(result.ownershipViolations.includes('src/other/existing-empty'));
  assert.ok(result.ownershipViolations.includes('src/other/existing-empty/nested.ts'));
  assert.ok(!result.ownershipViolations.includes('agent-runs'));
  assert.ok(!result.ownershipViolations.includes('.git'));
  assert.ok(!result.ownershipViolations.includes('.cache'));
  assert.ok(!result.ownershipViolations.includes('build'));
  assert.deepStrictEqual(result.metadata.workspacePatchQuarantine.patchCandidateChangedPaths, ['src/runtime/action.ts']);
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/out.ts'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/existing.ts'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/not-in-workspace.ts'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/stray-dir/nested.ts'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/empty-out'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/existing-empty'));
  assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes('src/other/existing-empty/nested.ts'));
  assert.ok(result.patchPath);
  const strictPatch = await fs.readFile(result.patchPath, 'utf8');
  assert.ok(strictPatch.includes('diff --git a/src/runtime/action.ts b/src/runtime/action.ts'));
  assert.ok(!strictPatch.includes('src/other/out.ts'));
  assert.ok(!strictPatch.includes('src/other/existing.ts'));
  assert.ok(!strictPatch.includes('src/other/not-in-workspace.ts'));
  assert.ok(!strictPatch.includes('src/other/stray-dir'));
  assert.ok(!strictPatch.includes('src/other/empty-out'));
  assert.ok(!strictPatch.includes('src/other/existing-empty'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/out.ts' && entry.action === 'deleted'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/existing.ts' && entry.action === 'restored'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/not-in-workspace.ts' && entry.action === 'deleted'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/stray-dir/nested.ts' && entry.action === 'deleted'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/empty-out' && entry.action === 'deleted'));
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other/existing-empty' && entry.action === 'restored'));
  assert.strictEqual(result.metadata.preExecWriteFence.mode, 'chmod-readonly');
  assert.strictEqual(result.metadata.preExecWriteFence.applied, true);
  assert.ok(result.metadata.preExecWriteFence.lockedPathCount > 0);
  assert.ok(result.metadata.preExecWriteFence.restoredPathCount > 0);
  assert.ok(result.metadata.preExecWriteFence.sampleLockedPaths.includes('src/other/existing.ts'));
  assert.ok(result.metadata.preExecWriteFence.limitations.some((entry) => entry.includes('same OS user')));
  assert.deepStrictEqual(result.verification, []);
  assert.strictEqual(result.metadata.verificationSkippedReason, 'strict-out-of-scope-source-writes-skipped-verification');
  const workspaceProofPath = result.evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  const workspaceProof = JSON.parse(await fs.readFile(workspaceProofPath, 'utf8'));
  assert.strictEqual(workspaceProof.preExecWriteFence.applied, true);
  assert.ok(workspaceProof.preExecWriteFence.sampleLockedPaths.includes('src/other/existing.ts'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('agent-runs'));
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === 'agent-runs')?.reasonCode, 'agent_runs');
  assert.ok(!workspaceProof.ignoredChangedPaths.includes('.git'));
  assert.ok(!workspaceProof.ignoredChangedPaths.includes('.cache'));
  assert.ok(!workspaceProof.ignoredChangedPaths.includes('build'));
  const workspacePath = path.join(tmp, 'strict-write-policy-workspaces', plan.jobs[0].id);
  assert.strictEqual(await exists(path.join(workspacePath, 'src/other/out.ts')), false);
  assert.strictEqual(await exists(path.join(workspacePath, 'src/other/not-in-workspace.ts')), false);
  assert.strictEqual(await exists(path.join(workspacePath, 'src/other/stray-dir')), false);
  assert.strictEqual(await exists(path.join(workspacePath, 'src/other/empty-out')), false);
  assert.strictEqual(await exists(path.join(workspacePath, 'src/other/existing-empty')), true);
  assert.deepStrictEqual(await fs.readdir(path.join(workspacePath, 'src/other/existing-empty')), []);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'src/other/existing.ts'), 'utf8'), 'export const original = true;\n');
}

async function writeWasDenied(file, text) {
  try {
    await fs.writeFile(file, text);
    return false;
  } catch {
    return true;
  }
}
