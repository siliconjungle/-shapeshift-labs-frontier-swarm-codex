import assert from 'node:assert';
import { execFileP, fs, path } from './context.mjs';

export async function testProofParentApplyOperatorWorkflow({ sourceDir, continuation, sourceFilePath }) {
  const cli = path.resolve(process.cwd(), 'dist', 'cli.js');
  const queryResult = JSON.parse((await execFileP(process.execPath, [
    cli,
    'query',
    '--cwd',
    sourceDir,
    '--continuation',
    continuation.outDir,
    '--kind',
    'proof-parent-apply-candidate',
    '--proof-parent-apply-candidate',
    '--limit',
    '5'
  ], { cwd: sourceDir })).stdout);
  assert.strictEqual(queryResult.collectionDir, continuation.proofParentApplyCandidateCollectionDir);
  assert.strictEqual(queryResult.summary.proofParentApplyCandidates.total, 1);
  assert.strictEqual(queryResult.jobs.length, 1);
  assert.strictEqual(queryResult.jobs[0].workKind, 'proof-parent-apply-candidate');

  const applyOutDir = path.join(path.dirname(continuation.outDir), 'proof-parent-operator-apply-dry-run');
  const applyResult = JSON.parse((await execFileP(process.execPath, [
    cli,
    'apply',
    '--cwd',
    sourceDir,
    '--continuation',
    continuation.outDir,
    '--dry-run',
    'true',
    '--outDir',
    applyOutDir
  ], { cwd: sourceDir })).stdout);
  assert.strictEqual(applyResult.ok, true);
  assert.strictEqual(applyResult.collectionDir, continuation.proofParentApplyCandidateCollectionDir);
  assert.strictEqual(applyResult.dryRun, true);
  assert.strictEqual(applyResult.admission.accepted, 1);
  assert.strictEqual(applyResult.summary.checked, 1);
  assert.ok(await exists(applyResult.gateExecutionsPath));
  assert.ok(await exists(applyResult.runEventsPath));
  assert.strictEqual(await fs.readFile(sourceFilePath, 'utf8'), '.button { color: red; }\n');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
