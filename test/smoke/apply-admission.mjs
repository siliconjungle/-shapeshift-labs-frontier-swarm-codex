import assert from 'node:assert';
import { applyCodexSwarmCollection, fs, path } from './context.mjs';

export async function testStrictAdmissionRejectsMissingQueueOutcome(applyRepo, tmp, readyDir) {
  const rejectedCollection = path.join(tmp, 'rejected-admission-collection');
  const rejectedDir = path.join(rejectedCollection, 'ready-to-apply', 'apply-job');
  await fs.mkdir(rejectedDir, { recursive: true });
  await fs.copyFile(path.join(readyDir, 'changes.patch'), path.join(rejectedDir, 'changes.patch'));
  await fs.copyFile(path.join(readyDir, 'merge.json'), path.join(rejectedDir, 'merge.json'));
  const rejected = await applyCodexSwarmCollection({ collection: rejectedCollection, cwd: applyRepo });
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(rejected.summary.failed, 1);
  assert.strictEqual(rejected.entries[0].status, 'failed');
  assert.strictEqual(rejected.entries[0].commands.length, 0);
  assert.ok(rejected.entries[0].error.includes('missing queue outcome model'));
  assert.strictEqual(rejected.entries[0].admission.status, 'rejected');
}
