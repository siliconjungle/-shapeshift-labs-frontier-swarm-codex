import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  createCodexSwarmPlan,
  execFileP,
  fs,
  path,
  runCodexSwarm
} from './context.mjs';

export async function testNoIndexCollection(tmp, mergeBundle) {
  const noIndexRepo = path.join(tmp, 'no-index-repo');
  await fs.mkdir(path.join(noIndexRepo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: noIndexRepo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: noIndexRepo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: noIndexRepo });
  await fs.writeFile(path.join(noIndexRepo, 'src', 'foo.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/foo.ts'], { cwd: noIndexRepo });
  await execFileP('git', ['commit', '-m', 'Initial no-index fixture'], { cwd: noIndexRepo });
  const noIndexOldHash = (await execFileP('git', ['rev-parse', 'HEAD:src/foo.ts'], { cwd: noIndexRepo })).stdout.trim();
  const noIndexRunDir = path.join(noIndexRepo, 'agent-runs', 'copy-run');
  const noIndexJobDir = path.join(noIndexRunDir, 'copy-worker');
  await fs.mkdir(noIndexJobDir, { recursive: true });
  await fs.writeFile(path.join(noIndexJobDir, 'changes.patch'), [
    `diff --git a${path.join(noIndexRepo, 'src', 'foo.ts')} b${path.join(noIndexRepo, 'agent-worktrees', 'copy-worker', 'src', 'foo.ts')}`,
    `index ${noIndexOldHash}..1234567 100644`,
    `--- a${path.join(noIndexRepo, 'src', 'foo.ts')}`,
    `+++ b${path.join(noIndexRepo, 'agent-worktrees', 'copy-worker', 'src', 'foo.ts')}`,
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(noIndexJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'copy-worker-bundle',
    jobId: 'copy-worker',
    taskId: 'copy-task',
    status: 'completed',
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/foo.ts'],
    ownedFilesTouched: ['src/foo.ts'],
    patchPath: 'changes.patch',
    staleAgainstHead: false,
    reasons: []
  }, null, 2) + '\n');
  const noIndexCollection = await collectCodexSwarmRun({ run: noIndexRunDir, cwd: noIndexRepo, outDir: path.join(noIndexRunDir, 'collected') });
  assert.strictEqual(noIndexCollection.summary['stale-against-head'], 0);
  assert.strictEqual(noIndexCollection.summary['needs-human-port'], 1);
  const noIndexCollectedBundle = JSON.parse(await fs.readFile(path.join(noIndexCollection.outDir, 'needs-human-port', 'copy-worker', 'merge.json'), 'utf8'));
  assert.strictEqual(noIndexCollectedBundle.staleAgainstHead, false);
  assert.deepStrictEqual(noIndexCollectedBundle.traceShards, []);
  assert.ok(noIndexCollectedBundle.reasons.some((reason) => reason.includes('patch base hashes match HEAD')));
  await testInheritedStaleNoIndexCollection(noIndexRepo, noIndexOldHash, mergeBundle);
  await testBaseHashDriftCollection(noIndexRepo, noIndexOldHash, mergeBundle);
  await testStrictSourceOwnershipBlocked(tmp);
}

async function testInheritedStaleNoIndexCollection(repo, oldHash, mergeBundle) {
  await fs.mkdir(path.join(repo, 'docs'), { recursive: true });
  await fs.writeFile(path.join(repo, 'docs', 'notes.md'), 'tracked\n');
  await execFileP('git', ['add', '--', 'docs/notes.md'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'Add unrelated tracked file'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'docs', 'notes.md'), 'dirty unrelated\n');
  const staleRunDir = path.join(repo, 'agent-runs', 'inherited-stale-run');
  const staleJobDir = path.join(staleRunDir, 'inherited-stale-worker');
  await fs.mkdir(staleJobDir, { recursive: true });
  await fs.writeFile(path.join(staleJobDir, 'changes.patch'), [
    `diff --git a${path.join(repo, 'src', 'foo.ts')} b${path.join(repo, 'agent-worktrees', 'inherited-stale-worker', 'src', 'foo.ts')}`,
    `index ${oldHash}..1234567 100644`,
    `--- a${path.join(repo, 'src', 'foo.ts')}`,
    `+++ b${path.join(repo, 'agent-worktrees', 'inherited-stale-worker', 'src', 'foo.ts')}`,
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(staleJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'inherited-stale-worker-bundle',
    jobId: 'inherited-stale-worker',
    taskId: 'inherited-stale-task',
    disposition: 'stale-against-head',
    autoMergeable: false,
    changedPaths: ['src/foo.ts'],
    ownedFilesTouched: ['src/foo.ts'],
    patchPath: 'changes.patch',
    staleAgainstHead: true,
    reasons: ['stale-against-head']
  }, null, 2) + '\n');
  const staleCollection = await collectCodexSwarmRun({ run: staleRunDir, cwd: repo, outDir: path.join(staleRunDir, 'collected') });
  assert.strictEqual(staleCollection.summary['stale-against-head'], 0);
  assert.strictEqual(staleCollection.summary['needs-human-port'], 1);
  const staleBundle = JSON.parse(await fs.readFile(path.join(staleCollection.outDir, 'needs-human-port', 'inherited-stale-worker', 'merge.json'), 'utf8'));
  assert.strictEqual(staleBundle.staleAgainstHead, false);
  assert.strictEqual(staleBundle.disposition, 'needs-port');
  assert.ok(!staleBundle.reasons.includes('stale-against-head'));
  assert.ok(staleBundle.reasons.some((reason) => reason.includes('cleared by patch freshness check')));
}

async function testBaseHashDriftCollection(repo, oldHash, mergeBundle) {
  await fs.writeFile(path.join(repo, 'src', 'foo.ts'), 'current\n');
  await execFileP('git', ['add', '--', 'src/foo.ts'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'Move coordinator head'], { cwd: repo });
  const driftRunDir = path.join(repo, 'agent-runs', 'drift-run');
  const driftJobDir = path.join(driftRunDir, 'drift-worker');
  await fs.mkdir(driftJobDir, { recursive: true });
  await fs.writeFile(path.join(driftJobDir, 'changes.patch'), [
    'diff --git a/src/foo.ts b/src/foo.ts',
    `index ${oldHash}..1234567 100644`,
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(driftJobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'drift-worker-bundle',
    jobId: 'drift-worker',
    taskId: 'drift-task',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/foo.ts'],
    ownedFilesTouched: ['src/foo.ts'],
    patchPath: 'changes.patch',
    staleAgainstHead: false,
    reasons: []
  }, null, 2) + '\n');
  const driftCollection = await collectCodexSwarmRun({ run: driftRunDir, cwd: repo, outDir: path.join(driftRunDir, 'collected') });
  assert.strictEqual(driftCollection.summary['stale-against-head'], 0);
  assert.strictEqual(driftCollection.summary['needs-human-port'], 1);
  const driftBundle = JSON.parse(await fs.readFile(path.join(driftCollection.outDir, 'needs-human-port', 'drift-worker', 'merge.json'), 'utf8'));
  assert.ok(driftBundle.reasons.some((reason) => reason.includes('manual port required')));
}

async function testStrictSourceOwnershipBlocked(tmp) {
  const repo = path.join(tmp, 'strict-source-block-repo');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.mkdir(path.join(repo, 'test'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'owned.ts'), 'export const owned = false;\n');
  await fs.writeFile(path.join(repo, 'src', 'other.ts'), 'export const other = false;\n');
  await fs.writeFile(path.join(repo, 'test', 'verify.mjs'), `
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

assert.strictEqual(await fs.readFile('src/owned.ts', 'utf8'), 'export const owned = true;\\n');
assert.strictEqual(await fs.readFile('src/other.ts', 'utf8'), 'export const other = false;\\n');
`, 'utf8');

  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'strict-source-block',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/owned.ts'] }]
    },
    tasks: {
      items: [{
        id: 'strict-source-block',
        lane: 'runtime',
        ownedFiles: ['src/owned.ts'],
        sourceRefs: ['src/owned.ts', 'src/other.ts', 'test/verify.mjs'],
        targetRefs: ['src/owned.ts'],
        verification: [{ name: 'restored-state', command: process.execPath, args: ['test/verify.mjs'] }]
      }]
    }
  });
  const run = await runCodexSwarm(plan, {
    outDir: path.join(repo, 'agent-runs', 'strict-source-block-run'),
    cwd: repo,
    allowedWritePolicy: { mode: 'strict' },
    dependencyHealth: false,
    runVerification: true,
    workspace: {
      mode: 'copy',
      root: path.join(repo, 'agent-worktrees', 'strict-source-block'),
      replace: true,
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.chmod(path.join(input.workspacePath, 'src', 'other.ts'), 0o644).catch(() => {});
      await fs.writeFile(path.join(input.workspacePath, 'src', 'owned.ts'), 'export const owned = true;\n');
      await fs.writeFile(path.join(input.workspacePath, 'src', 'other.ts'), 'export const other = true;\n');
      await fs.mkdir(path.join(input.workspacePath, '.cache'), { recursive: true });
      await fs.writeFile(path.join(input.workspacePath, '.cache', 'tsconfig.tsbuildinfo'), '{}\n');
      await fs.writeFile(input.paths.lastMessagePath, 'strict source block\n');
      return {
        exitCode: 0,
        changedPaths: ['src/owned.ts', 'src/other.ts', '.cache/tsconfig.tsbuildinfo'],
        lastMessage: 'strict source block'
      };
    }
  });
  const result = run.run.results[0];
  assert.strictEqual(run.ok, false);
  assert.strictEqual(result.status, 'blocked');
  assert.strictEqual(result.mergeReadiness, 'blocked');
  assert.strictEqual(result.mergeDisposition, 'blocked');
  assert.deepStrictEqual([...result.changedPaths].sort(), ['src/other.ts', 'src/owned.ts']);
  assert.deepStrictEqual(result.ownershipViolations, ['src/other.ts']);
  assert.strictEqual(result.error, 'strict-out-of-scope-source-writes-restored-before-verification: src/other.ts');
  assert.deepStrictEqual(result.verification, []);
  assert.ok(result.metadata.ownershipRestore.some((entry) => entry.path === 'src/other.ts' && entry.action === 'restored'));
  assert.strictEqual(result.metadata.strictOwnershipBlockReason, 'strict-out-of-scope-source-writes-restored-before-verification');
  assert.strictEqual(result.metadata.verificationSkippedReason, 'strict-out-of-scope-source-writes-skipped-verification');
  assert.deepStrictEqual(result.metadata.verificationSkipReasons, ['strict-out-of-scope-source-writes-skipped-verification']);
  assert.deepStrictEqual(result.metadata.verificationSkippedCommands, [{
    name: 'restored-state',
    command: [process.execPath, 'test/verify.mjs'],
    required: true,
    reason: 'strict-out-of-scope-source-writes-skipped-verification'
  }]);
  assert.strictEqual(result.metadata.verificationSkippedCommandCount, 1);
  assert.ok(result.metadata.observedChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));
  assert.ok(result.metadata.reportedChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));
  assert.ok(!result.ownershipViolations.includes('.cache/tsconfig.tsbuildinfo'));

  const workspacePath = path.join(repo, 'agent-worktrees', 'strict-source-block', plan.jobs[0].id);
  assert.strictEqual(await fs.readFile(path.join(workspacePath, 'src', 'other.ts'), 'utf8'), 'export const other = false;\n');
  const workspaceProofPath = result.evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  const workspaceProof = JSON.parse(await fs.readFile(workspaceProofPath, 'utf8'));
  assert.ok(workspaceProof.ignoredChangedPaths.includes('.cache/tsconfig.tsbuildinfo'));

  const mergeBundlePath = result.evidencePaths.find((entry) => entry.endsWith('merge.json'));
  const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
  assert.ok(mergeBundle.reasons.includes('strict-out-of-scope-source-writes-restored-before-verification'));
  assert.ok(mergeBundle.reasons.includes('strict-out-of-scope-source-writes-skipped-verification'));
  assert.ok(mergeBundle.reasons.includes('restored-disallowed-changes'));
  assert.ok(mergeBundle.reasons.includes('ownership-violations'));
  assert.deepStrictEqual(mergeBundle.commandsPassed, []);
  assert.strictEqual(mergeBundle.metadata.verificationSkippedReason, 'strict-out-of-scope-source-writes-skipped-verification');
  assert.deepStrictEqual(mergeBundle.metadata.verificationSkipReasons, ['strict-out-of-scope-source-writes-skipped-verification']);
  assert.deepStrictEqual(mergeBundle.metadata.verificationSkippedCommands, [{
    name: 'restored-state',
    command: [process.execPath, 'test/verify.mjs'],
    required: true,
    reason: 'strict-out-of-scope-source-writes-skipped-verification'
  }]);
  assert.strictEqual(mergeBundle.metadata.verificationSkippedCommandCount, 1);

  const noCommandPlan = createCodexSwarmPlan({
    manifest: {
      id: 'strict-source-block-no-command',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/owned.ts'] }]
    },
    tasks: {
      items: [{
        id: 'strict-source-block-no-command',
        lane: 'runtime',
        ownedFiles: ['src/owned.ts'],
        sourceRefs: ['src/owned.ts', 'src/other.ts'],
        targetRefs: ['src/owned.ts'],
        verification: []
      }]
    }
  });
  const noCommandRun = await runCodexSwarm(noCommandPlan, {
    outDir: path.join(repo, 'agent-runs', 'strict-source-block-no-command-run'),
    cwd: repo,
    allowedWritePolicy: { mode: 'strict' },
    dependencyHealth: false,
    runVerification: true,
    workspace: {
      mode: 'copy',
      root: path.join(repo, 'agent-worktrees', 'strict-source-block-no-command'),
      replace: true,
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.chmod(path.join(input.workspacePath, 'src', 'other.ts'), 0o644).catch(() => {});
      await fs.writeFile(path.join(input.workspacePath, 'src', 'other.ts'), 'export const other = true;\n');
      await fs.writeFile(input.paths.lastMessagePath, 'strict source block without verification command\n');
      return {
        exitCode: 0,
        changedPaths: ['src/other.ts'],
        lastMessage: 'strict source block without verification command'
      };
    }
  });
  const noCommandResult = noCommandRun.run.results[0];
  assert.strictEqual(noCommandResult.status, 'blocked');
  assert.strictEqual(noCommandResult.metadata.verificationSkippedReason, 'strict-out-of-scope-source-writes-skipped-verification');
  assert.deepStrictEqual(noCommandResult.metadata.verificationSkipReasons, ['strict-out-of-scope-source-writes-skipped-verification']);
  assert.deepStrictEqual(noCommandResult.metadata.verificationSkippedCommands, []);
  assert.strictEqual(noCommandResult.metadata.verificationSkippedCommandCount, 0);
  const noCommandMergeBundlePath = noCommandResult.evidencePaths.find((entry) => entry.endsWith('merge.json'));
  const noCommandMergeBundle = JSON.parse(await fs.readFile(noCommandMergeBundlePath, 'utf8'));
  assert.ok(noCommandMergeBundle.reasons.includes('strict-out-of-scope-source-writes-skipped-verification'));
  assert.deepStrictEqual(noCommandMergeBundle.metadata.verificationSkipReasons, ['strict-out-of-scope-source-writes-skipped-verification']);
  assert.deepStrictEqual(noCommandMergeBundle.metadata.verificationSkippedCommands, []);
  assert.strictEqual(noCommandMergeBundle.metadata.verificationSkippedCommandCount, 0);
}
