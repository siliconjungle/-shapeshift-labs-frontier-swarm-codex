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
  const helpSource = await fs.readFile(new URL('../../dist/cli-help.js', import.meta.url), 'utf8');
  assert.ok(cliSource.includes("from './index.js'"));
  assert.ok(cliSource.includes('stopCodexSwarmRun'));
  assert.ok(helpSource.includes('frontier-swarm <command> [options]'));
  assert.ok(helpSource.includes('resume    Resume unfinished jobs from a prior run directory'));
  assert.ok(helpSource.includes('doctor    Check package resolution before launching workers'));
  assert.ok(helpSource.includes('--semantic-import-include <glob>'));
  assert.ok(helpSource.includes('--semantic-import-exclude <glob>'));
  assert.ok(helpSource.includes('--semantic-import-max-files <n>'));
  assert.ok(helpSource.includes('dependency-health.json'));
  assert.ok(helpSource.includes('--resume-overlay <file>'));

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
