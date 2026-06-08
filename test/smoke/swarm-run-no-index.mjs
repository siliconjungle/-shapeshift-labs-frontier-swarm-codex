import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  execFileP,
  fs,
  path
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
  assert.ok(noIndexCollectedBundle.reasons.some((reason) => reason.includes('patch base hashes match HEAD')));
  await testBaseHashDriftCollection(noIndexRepo, noIndexOldHash, mergeBundle);
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
