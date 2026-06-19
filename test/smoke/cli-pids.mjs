import assert from 'node:assert';
import {
  appendCodexPidManifest,
  execFileP,
  fs,
  path,
  readCodexPidManifest,
  stopCodexSwarmRun
} from './context.mjs';

export async function testCliAndPidManifest({ tmp }) {
  const cliSource = await fs.readFile(new URL('../../dist/cli.js', import.meta.url), 'utf8');
  const cliArgsSource = await fs.readFile(new URL('../../dist/cli-args.js', import.meta.url), 'utf8');
  const helpSource = await fs.readFile(new URL('../../dist/cli-help.js', import.meta.url), 'utf8');
  assert.ok(cliSource.includes("from './index.js'"));
  assert.ok(cliSource.includes('stopCodexSwarmRun'));
  assert.ok(cliSource.includes('continueCodexSwarmLoop'));
  assert.ok(cliSource.includes('shouldContinueAfterRun'));
  assert.ok(cliArgsSource.includes('continueOut'));
  assert.ok(cliArgsSource.includes('cwd: stringArg(args.cwd)'));
  assert.ok(cliSource.includes('requires --run <run-dir|swarm-results.json> or --collection <collection-dir|collection.json>'));
  assert.ok(cliSource.includes('cwd: stringArg(args.cwd)'));
  assert.ok(cliSource.includes('next-wave'));
  assert.ok(cliArgsSource.includes("routingPolicyPath = stringArg(options.routingPolicy ?? options['routing-policy'])"));
  assert.ok(cliArgsSource.includes('...(routingPolicy ? { routingPolicy } : {})'));
  assert.ok(helpSource.includes('frontier-swarm <command> [options]'));
  assert.ok(helpSource.includes('--cwd <dir> source/workspace root'));
  assert.ok(helpSource.includes('resume    Resume unfinished jobs from a prior run directory'));
  assert.ok(helpSource.includes('doctor    Check package resolution before launching workers'));
  assert.ok(helpSource.includes('continue  Build the next closed-loop wave from a run or collected merge bundle directory'));
  assert.ok(helpSource.includes('continue and next-wave require --run <dir|swarm-results.json> or --collection <dir|collection.json>'));
  assert.ok(helpSource.includes('--backlog <file>'));
  assert.ok(helpSource.includes('--child-backlog-name <file>'));
  assert.ok(helpSource.includes('run --closed-loop'));
  assert.ok(helpSource.includes('--continue-out <dir>'));
  assert.ok(helpSource.includes('--continue-write'));
  assert.ok(helpSource.includes('--routing-policy <file>'));
  assert.ok(helpSource.includes('--routing-mode fill|override|observe'));
  assert.ok(helpSource.includes('--semantic-import-include <glob>'));
  assert.ok(helpSource.includes('--semantic-import-exclude <glob>'));
  assert.ok(helpSource.includes('--semantic-import-max-files <n>'));
  assert.ok(helpSource.includes('collect writes strategy-tournament.json and tournament-adaptive-feedback.json'));
  assert.ok(helpSource.includes('continue reads --routing-policy as input and writes model-routing-policy.next.json'));
  assert.ok(helpSource.includes('plan/run consume model-routing-policy.next.json with --routing-policy <file>'));
  assert.ok(helpSource.includes('dependency-health.json'));
  assert.ok(helpSource.includes('--resume-overlay <file>'));
  assert.ok(helpSource.includes('tournament show/query/compare/history/feedback'));
  assert.ok(helpSource.includes('--adaptive-feedback <tournament-adaptive-feedback.json>'));

  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  await assert.rejects(
    execFileP(process.execPath, [cli, 'continue', '--outDir', path.join(tmp, 'empty-continuation')], { cwd: tmp }),
    (error) => {
      assert.match(error.stderr, /continue requires --run <run-dir\|swarm-results\.json> or --collection <collection-dir\|collection\.json>/);
      return true;
    }
  );
  await assert.rejects(
    execFileP(process.execPath, [cli, 'next-wave', '--outDir', path.join(tmp, 'empty-next-wave')], { cwd: tmp }),
    (error) => {
      assert.match(error.stderr, /next-wave requires --run <run-dir\|swarm-results\.json> or --collection <collection-dir\|collection\.json>/);
      return true;
    }
  );
  await assert.rejects(
    (async () => {
      const manifestPath = path.join(tmp, 'invalid-routing-manifest.json');
      const tasksPath = path.join(tmp, 'invalid-routing-tasks.json');
      await fs.writeFile(manifestPath, JSON.stringify({ lanes: [{ id: 'runtime', allowedWrites: ['src/**'] }] }, null, 2) + '\n');
      await fs.writeFile(tasksPath, JSON.stringify({ items: [] }, null, 2) + '\n');
      return execFileP(process.execPath, [cli, 'plan', '--manifest', manifestPath, '--tasks', tasksPath, '--routing-mode', 'invalid'], { cwd: tmp });
    })(),
    (error) => {
      assert.match(error.stderr, /unsupported --routing-mode invalid; expected fill, override, or observe/);
      return true;
    }
  );

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
