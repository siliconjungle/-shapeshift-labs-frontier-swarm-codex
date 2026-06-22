import assert from 'node:assert';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCodexSwarmPlan, fs, path, readCodexRunEvents, runCodexSwarm, syncCodexRunEventPeers } from './context.mjs';

const execFileAsync = promisify(execFile);

export async function testRunSync({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'run-sync',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [{
        id: 'sync-task',
        lane: 'runtime',
        ownedFiles: ['src/sync.txt']
      }]
    }
  });
  const outDir = path.join(tmp, 'run-sync-local');
  const peerDir = path.join(tmp, 'run-sync-peer');
  await fs.mkdir(peerDir, { recursive: true });
  const peerEvent = createRunEvent('evt-peer-note', plan.runId, 'peer-note', 'peer-runner');
  await fs.writeFile(path.join(peerDir, 'run-events.jsonl'), JSON.stringify(peerEvent) + '\n');

  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    runSyncPeers: [peerDir],
    executor: async (input) => {
      await fs.writeFile(input.paths.lastMessagePath, 'run sync done\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'run sync done' };
    }
  });

  assert.strictEqual(result.ok, true);
  assert.ok(result.runSync);
  assert.strictEqual(result.runSync.ok, true);
  assert.strictEqual(result.runSyncEvidencePath, path.join(outDir, 'run-sync-evidence.json'));
  assert.strictEqual(result.runSyncHistoryPath, path.join(outDir, 'run-sync-history.jsonl'));
  assert.strictEqual(result.runSync.summary.peerCount, 1);
  assert.strictEqual(result.runSync.summary.pulledEventCount, 1);
  assert.ok(result.runSync.summary.pushedEventCount >= 1);

  const localEvents = await readCodexRunEvents(result.runEventsPath);
  assert.ok(localEvents.some((event) => event.id === peerEvent.id));
  const syncedPeerEvents = await readCodexRunEvents(path.join(peerDir, 'run-events.jsonl'));
  assert.ok(syncedPeerEvents.some((event) => event.type === 'run.created'));

  const runSyncEvidence = JSON.parse(await fs.readFile(result.runSyncEvidencePath, 'utf8'));
  assert.strictEqual(runSyncEvidence.kind, 'frontier.swarm-codex.run-sync');
  assert.strictEqual(runSyncEvidence.exchanges[0].kind, 'frontier.run.jsonl-store-sync-evidence');
  assert.strictEqual(runSyncEvidence.summary.conflictCount, 0);
  const historyRecords = (await fs.readFile(result.runSyncHistoryPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  assert.strictEqual(historyRecords.length, 1);
  assert.strictEqual(historyRecords[0].kind, 'frontier.swarm-codex.run-sync');

  const resultsJson = JSON.parse(await fs.readFile(path.join(outDir, 'swarm-results.json'), 'utf8'));
  assert.strictEqual(resultsJson.runSyncEvidencePath, result.runSyncEvidencePath);
  assert.strictEqual(resultsJson.runSync.summary.pulledEventCount, 1);
  const coordinatorDashboard = JSON.parse(await fs.readFile(path.join(outDir, 'coordinator-dashboard.json'), 'utf8'));
  assert.strictEqual(coordinatorDashboard.metadata.runSyncEvidencePath, result.runSyncEvidencePath);
  assert.strictEqual(coordinatorDashboard.metadata.artifactPaths.runSyncEvidence, result.runSyncEvidencePath);
  assert.strictEqual(coordinatorDashboard.metadata.artifactPaths.runSyncHistory, result.runSyncHistoryPath);

  const apiPeerDir = path.join(tmp, 'run-sync-api-peer');
  await fs.mkdir(apiPeerDir, { recursive: true });
  const apiPeerEvent = createRunEvent('evt-api-peer-note', plan.runId, 'api-peer-note', 'api-peer-runner');
  await fs.writeFile(path.join(apiPeerDir, 'run-events.jsonl'), JSON.stringify(apiPeerEvent) + '\n');
  const apiSync = await syncCodexRunEventPeers({
    cwd: tmp,
    run: outDir,
    peers: [apiPeerDir],
    direction: 'pull',
    runSyncEvidencePath: path.join(outDir, 'run-sync-api-evidence.json'),
    runSyncHistoryPath: path.join(outDir, 'run-sync-api-history.jsonl')
  });
  assert.ok(apiSync);
  assert.strictEqual(apiSync.direction, 'pull');
  assert.strictEqual(apiSync.summary.pulledEventCount, 1);
  assert.strictEqual(apiSync.summary.pushedEventCount, 0);

  const cliPeerDir = path.join(tmp, 'run-sync-cli-peer');
  await fs.mkdir(cliPeerDir, { recursive: true });
  const cliPeerEvent = createRunEvent('evt-cli-peer-note', plan.runId, 'cli-peer-note', 'cli-peer-runner');
  await fs.writeFile(path.join(cliPeerDir, 'run-events.jsonl'), JSON.stringify(cliPeerEvent) + '\n');
  const cliEvidencePath = path.join(outDir, 'run-sync-cli-evidence.json');
  const { stdout } = await execFileAsync(process.execPath, [
    path.resolve('dist/cli.js'),
    'sync',
    '--run',
    outDir,
    '--peer',
    cliPeerDir,
    '--run-sync-direction',
    'pull',
    '--run-sync-evidence',
    cliEvidencePath,
    '--run-sync-history',
    path.join(outDir, 'run-sync-cli-history.jsonl')
  ], { cwd: path.resolve('.') });
  const cliSync = JSON.parse(stdout);
  assert.strictEqual(cliSync.kind, 'frontier.swarm-codex.run-sync');
  assert.strictEqual(cliSync.direction, 'pull');
  assert.strictEqual(cliSync.runSyncEvidencePath, cliEvidencePath);
  assert.strictEqual(cliSync.summary.pulledEventCount, 1);
  assert.strictEqual(cliSync.summary.pushedEventCount, 0);
}

function createRunEvent(id, runId, noteId, actorId) {
  return {
    kind: 'frontier.run.event',
    version: 1,
    id,
    runId,
    type: 'note.recorded',
    actorId,
    actorSeq: 1,
    parents: [],
    time: new Date().toISOString(),
    payload: { note: { id: noteId, text: noteId } },
    payloadHash: `sha256:${id}`
  };
}
