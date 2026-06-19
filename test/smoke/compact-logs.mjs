import assert from 'node:assert';
import {
  fs,
  path,
  spawnCodexExecutor
} from './context.mjs';

export async function testCompactLogTruncation({ tmp }) {
  const jobDir = path.join(tmp, 'compact-log-worker');
  const evidenceDir = path.join(jobDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  const paths = {
    jobDir,
    promptPath: path.join(jobDir, 'prompt.md'),
    eventsPath: path.join(jobDir, 'codex-events.jsonl'),
    stderrPath: path.join(jobDir, 'codex-stderr.log'),
    lastMessagePath: path.join(jobDir, 'last-message.md'),
    evidenceDir,
    resourceAllocationPath: path.join(evidenceDir, 'resource-allocation.json'),
    workspaceProofPath: path.join(evidenceDir, 'workspace-proof.json'),
    patchPath: path.join(evidenceDir, 'changes.patch'),
    mergeBundlePath: path.join(evidenceDir, 'merge.json'),
    patchIntentPath: path.join(evidenceDir, 'patch-intent.json'),
    logSummaryPath: path.join(evidenceDir, 'log-summary.json'),
    pidManifestPath: path.join(tmp, 'compact-pids.json')
  };
  const script = [
    "process.stdout.write(JSON.stringify({type:'ok',value:1}) + '\\n');",
    "process.stdout.write('{\"type\":\"partial\",\"payload\":\"' + 'x'.repeat(500));"
  ].join('');
  const result = await spawnCodexExecutor({
    job: { id: 'compact-log-worker', taskId: 'compact-log-task' },
    prompt: '',
    args: ['-e', script],
    cwd: tmp,
    workspacePath: tmp,
    codexPath: process.execPath,
    paths,
    resourceAllocation: { env: {} },
    env: {},
    timeoutMs: 5000,
    compactLogs: { enabled: true, maxEventBytes: 80, maxStderrBytes: 80 }
  });
  assert.strictEqual(result.exitCode, 0);
  assert.ok(result.logSummary.eventBytesTruncated > 0);
  const lines = (await fs.readFile(paths.eventsPath, 'utf8')).split(/\r?\n/).filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(JSON.parse(lines[0]), { type: 'ok', value: 1 });
  const summary = JSON.parse(await fs.readFile(paths.logSummaryPath, 'utf8'));
  assert.strictEqual(summary.eventBytesWritten, Buffer.byteLength(lines[0] + '\n'));

  const quotaResult = await spawnCodexExecutor({
    job: { id: 'quota-worker', taskId: 'quota-task' },
    prompt: '',
    args: ['-e', "process.stderr.write('You have hit your usage limit. Visit settings to purchase more credits.\\n'); process.exit(1);"],
    cwd: tmp,
    workspacePath: tmp,
    codexPath: process.execPath,
    paths,
    resourceAllocation: { env: {} },
    env: {},
    timeoutMs: 5000,
    compactLogs: { enabled: true, maxEventBytes: 80, maxStderrBytes: 80 }
  });
  assert.strictEqual(quotaResult.exitCode, 1);
  assert.strictEqual(quotaResult.deferredReason, 'usage-limit');
}
