import assert from 'node:assert';
import {
  appendCodexPidManifest,
  fs,
  path,
  readCodexPidManifest,
  stopCodexSwarmRun
} from './context.mjs';

export async function testCliAndPidManifest({ tmp }) {
  const cliSource = await fs.readFile(new URL('../../dist/cli.js', import.meta.url), 'utf8');
  assert.ok(cliSource.includes("from './index.js'"));
  assert.ok(cliSource.includes('stopCodexSwarmRun'));
  assert.ok(cliSource.includes('frontier-swarm <command> [options]'));
  assert.ok(cliSource.includes('--semantic-import-include <glob>'));
  assert.ok(cliSource.includes('--semantic-import-exclude <glob>'));
  assert.ok(cliSource.includes('--semantic-import-max-files <n>'));
  assert.ok(cliSource.includes('debug/replay/watchpoint/trace artifacts'));

  const pidManifestPath = path.join(tmp, 'pid-test', 'pids.json');
  await appendCodexPidManifest(pidManifestPath, { pid: process.pid, role: 'parent', runId: 'pid-test', startedAt: Date.now() }, 'pid-test');
  assert.strictEqual((await readCodexPidManifest(pidManifestPath)).entries.length, 1);
  const concurrentPidManifestPath = path.join(tmp, 'pid-test', 'pids-concurrent.json');
  await Promise.all(Array.from({ length: 8 }, (_, index) => appendCodexPidManifest(concurrentPidManifestPath, {
    pid: 900000 + index,
    role: 'codex',
    runId: 'pid-test',
    jobId: `job-${index}`,
    startedAt: Date.now() + index
  }, 'pid-test')));
  assert.strictEqual((await readCodexPidManifest(concurrentPidManifestPath)).entries.length, 8);
  const stopResult = await stopCodexSwarmRun({ run: pidManifestPath });
  assert.strictEqual(stopResult.ok, true);
  assert.deepStrictEqual(stopResult.stopped, []);
}
