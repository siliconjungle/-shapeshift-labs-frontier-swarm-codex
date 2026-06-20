import assert from 'node:assert';
import { execFileP, fs, path, runCodexSwarm } from './context.mjs';

export async function testChangedPathDiscovery(plan, tmp) {
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

export async function testReportedWorkspaceNoiseFiltering(plan, tmp) {
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
  for (const noisyPath of ['.git/index.lock', '.cache/tsconfig.tsbuildinfo', '.vite/deps/_metadata.json', '.eslintcache', 'packages/frontier-swarm/build/index.js']) {
    assert.ok(result.metadata.observedChangedPaths.includes(noisyPath));
    assert.ok(result.metadata.reportedChangedPaths.includes(noisyPath));
  }

  const workspaceProofPath = result.evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  const workspaceProof = JSON.parse(await fs.readFile(workspaceProofPath, 'utf8'));
  for (const noisyPath of ['.git/index.lock', '.cache/tsconfig.tsbuildinfo', '.vite/deps/_metadata.json', '.eslintcache', 'packages/frontier-swarm/build/index.js']) {
    assert.ok(workspaceProof.ignoredChangedPaths.includes(noisyPath));
  }
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.git/index.lock')?.reasonCode, 'git_metadata');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.cache/tsconfig.tsbuildinfo')?.reasonCode, 'tsbuildinfo');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.vite/deps/_metadata.json')?.reasonCode, 'cache');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === '.eslintcache')?.reasonCode, 'cache');
  assert.equal(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === 'packages/frontier-swarm/build/index.js')?.reasonCode, 'build_output');
}
