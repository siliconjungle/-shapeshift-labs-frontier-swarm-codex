import assert from 'node:assert';
import { collectCodexSwarmRun, exists, fs, path, runCodexSwarm } from './context.mjs';

export async function testDeferredCodexFailure(plan, tmp) {
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
  assert.strictEqual(result.mergeReadiness, 'blocked');
  assert.strictEqual(result.mergeDisposition, 'rerun-work');
  assert.strictEqual(result.metadata.codexDeferredFailure.reason, 'usage-limit');
  const mergeBundlePath = result.evidencePaths.find((entry) => entry.endsWith('merge.json'));
  assert.ok(mergeBundlePath);
  const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
  assert.strictEqual(mergeBundle.disposition, 'rerun-work');
  assert.strictEqual(mergeBundle.status, 'blocked');
  assert.ok(mergeBundle.reasons.includes('codex-deferred:usage-limit'));
  const collection = await collectCodexSwarmRun({
    run: deferredResult.outDir,
    outDir: path.join(tmp, 'deferred-failure-collected'),
    cwd: tmp,
    checkStale: false
  });
  assert.strictEqual(collection.summary['needs-human-port'], 0);
  assert.strictEqual(collection.summary['rerun-work'], 1);
  const decision = collection.queueOutcomeModel.latestDecisions.find((entry) => entry.jobId === result.jobId);
  assert.ok(decision);
  assert.strictEqual(decision.decision, 'rerun');
  assert.strictEqual(decision.staleOrRerun, true);
  assert.strictEqual(decision.coordinatorReview, false);
  assert.strictEqual(decision.reviewDebt, false);
}

export async function testStrictAllowedWritePolicy(plan, tmp) {
  await prepareStrictPolicyFixture(tmp);
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
    executor: strictPolicyExecutor
  });
  const result = strictResult.run.results[0];
  assert.strictEqual(strictResult.ok, false);
  assert.ok(result.changedPaths.includes('src/runtime/action.ts'));
  for (const file of strictViolationPaths()) {
    assert.ok(result.metadata.observedChangedPaths.includes(file));
    assert.ok(result.ownershipViolations.includes(file));
  }
  assert.ok(result.metadata.observedChangedPaths.includes('agent-runs'));
  assert.ok(!result.metadata.observedChangedPaths.includes('.git'));
  assert.ok(!result.metadata.observedChangedPaths.includes('.cache'));
  assert.ok(!result.metadata.observedChangedPaths.includes('build'));
  assert.ok(!result.ownershipViolations.includes('agent-runs'));
  assert.ok(!result.ownershipViolations.includes('.git'));
  assert.ok(!result.ownershipViolations.includes('.cache'));
  assert.ok(!result.ownershipViolations.includes('build'));
  assert.deepStrictEqual(result.metadata.workspacePatchQuarantine.patchCandidateChangedPaths, ['src/runtime/action.ts']);
  for (const file of strictViolationPaths()) {
    assert.ok(result.metadata.workspacePatchQuarantine.quarantinedChangedPaths.includes(file));
  }
  assert.ok(result.patchPath);
  const strictPatch = await fs.readFile(result.patchPath, 'utf8');
  assert.ok(strictPatch.includes('diff --git a/src/runtime/action.ts b/src/runtime/action.ts'));
  for (const blockedText of ['src/other/out.ts', 'src/other/existing.ts', 'src/other/not-in-workspace.ts', 'src/other/stray-dir', 'src/other/empty-out', 'src/other/existing-empty']) {
    assert.ok(!strictPatch.includes(blockedText));
  }
  assertRestoreActions(result);
  assert.strictEqual(result.metadata.preExecWriteFence.mode, 'chmod-readonly');
  assert.strictEqual(result.metadata.preExecWriteFence.applied, true);
  assert.ok(result.metadata.preExecWriteFence.lockedPathCount > 0);
  assert.ok(result.metadata.preExecWriteFence.restoredPathCount > 0);
  assert.ok(result.metadata.preExecWriteFence.sampleLockedPaths.includes('src/other/existing.ts'));
  assert.ok(result.metadata.preExecWriteFence.limitations.some((entry) => entry.includes('same OS user')));
  assert.deepStrictEqual(result.verification, []);
  assert.strictEqual(result.metadata.verificationSkippedReason, 'strict-out-of-scope-source-writes-skipped-verification');
  await assertStrictWorkspaceProofAndRestore({ result, plan, tmp });
}

async function prepareStrictPolicyFixture(tmp) {
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
}

async function strictPolicyExecutor(input) {
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
  const strictChmodExpected = process.platform !== 'win32'
    && !(typeof process.getuid === 'function' && process.getuid() === 0);
  for (const [file, text, label] of [
    [existing, 'export const direct = true;\n', 'existing-file'],
    [path.join(otherDir, 'out.ts'), 'export const direct = true;\n', 'new-file'],
    [gitIndex, 'direct git index\n', 'git metadata'],
    [gitLock, 'direct git lock\n', 'new git metadata'],
    [cacheFile, '{"direct":true}\n', 'cache'],
    [cacheNewFile, '{"direct":true}\n', 'new cache'],
    [buildFile, 'direct build\n', 'build-output'],
    [buildNewFile, 'direct build\n', 'new build-output']
  ]) {
    assert.ok(await writeWasDenied(file, text) || !strictChmodExpected, `pre-exec write fence must deny normal ${label} writes`);
  }
  await restoreWritablePaths({ existing, otherDir, existingEmptyDir, gitDir, gitIndex, cacheDir, cacheFile, buildDir, buildFile });
  await writeStrictPolicyViolations(input, { otherDir, existingEmptyDir, existing, gitIndex, gitLock, cacheFile, cacheNewFile, buildFile, buildNewFile });
  await fs.writeFile(input.paths.lastMessagePath, 'strict policy\n');
  return { exitCode: 0, changedPaths: ['src/runtime/action.ts'], lastMessage: 'strict policy' };
}

async function restoreWritablePaths(paths) {
  for (const [file, mode] of [
    [paths.existing, 0o644],
    [paths.otherDir, 0o755],
    [paths.existingEmptyDir, 0o755],
    [paths.gitDir, 0o755],
    [paths.gitIndex, 0o644],
    [paths.cacheDir, 0o755],
    [paths.cacheFile, 0o644],
    [paths.buildDir, 0o755],
    [paths.buildFile, 0o644]
  ]) {
    await fs.chmod(file, mode).catch(() => {});
  }
}

async function writeStrictPolicyViolations(input, paths) {
  await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
  await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
  await fs.writeFile(path.join(paths.otherDir, 'out.ts'), 'export const hidden = true;\n');
  await fs.writeFile(paths.existing, 'export const hidden = true;\n');
  await fs.writeFile(path.join(paths.otherDir, 'not-in-workspace.ts'), 'export const hidden = true;\n');
  await fs.mkdir(path.join(paths.otherDir, 'stray-dir'), { recursive: true });
  await fs.writeFile(path.join(paths.otherDir, 'stray-dir', 'nested.ts'), 'export const hidden = true;\n');
  await fs.mkdir(path.join(paths.otherDir, 'empty-out'), { recursive: true });
  await fs.writeFile(path.join(paths.existingEmptyDir, 'nested.ts'), 'export const hidden = true;\n');
  await fs.mkdir(path.join(input.workspacePath, 'agent-runs', 'strict-noise'), { recursive: true });
  await fs.writeFile(path.join(input.workspacePath, 'agent-runs', 'strict-noise', 'evidence.json'), '{}\n');
  await fs.writeFile(paths.gitIndex, 'hidden git index\n');
  await fs.writeFile(paths.gitLock, 'hidden git lock\n');
  await fs.writeFile(paths.cacheFile, '{"hidden":true}\n');
  await fs.writeFile(paths.cacheNewFile, '{"hidden":true}\n');
  await fs.writeFile(paths.buildFile, 'hidden build\n');
  await fs.writeFile(paths.buildNewFile, 'hidden build\n');
}

function strictViolationPaths() {
  return [
    'src/other/out.ts',
    'src/other/existing.ts',
    'src/other/not-in-workspace.ts',
    'src/other/stray-dir/nested.ts',
    'src/other/empty-out',
    'src/other/existing-empty',
    'src/other/existing-empty/nested.ts'
  ];
}

function assertRestoreActions(result) {
  for (const [file, action] of [
    ['src/other/out.ts', 'deleted'],
    ['src/other/existing.ts', 'restored'],
    ['src/other/not-in-workspace.ts', 'deleted'],
    ['src/other/stray-dir/nested.ts', 'deleted'],
    ['src/other/empty-out', 'deleted'],
    ['src/other/existing-empty', 'restored']
  ]) {
    assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === file && entry.action === action));
  }
}

async function assertStrictWorkspaceProofAndRestore({ result, plan, tmp }) {
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
