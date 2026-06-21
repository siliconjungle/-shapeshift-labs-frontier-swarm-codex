import assert from 'node:assert';
import { createCodexSwarmPlan, fs, path, runCodexSwarm } from './context.mjs';
import { createCodexLiveJobResultEvents } from '../../dist/run-graph-live.js';

export async function testLiveRunGraphEvents({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'live-run-graph-events',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/**'] }]
    },
    tasks: {
      items: [{
        id: 'live-task',
        lane: 'runtime',
        ownedFiles: ['src/live.txt'],
        verification: [{ name: 'live-ok', command: 'node', args: ['-e', 'process.exit(0)'] }]
      }]
    }
  });
  const outDir = path.join(tmp, 'live-run-graph-events-run');
  const liveEventsPath = path.join(outDir, 'live-run-graph-events.jsonl');
  let sawStartedWhileExecutorRunning = false;

  const result = await runCodexSwarm(plan, {
    outDir,
    cwd: tmp,
    maxConcurrency: 1,
    dependencyHealth: false,
    runVerification: true,
    executor: async (input) => {
      const partial = await readLiveEvents(liveEventsPath);
      sawStartedWhileExecutorRunning = partial.some((event) => event.type === 'job.started' && event.jobId === input.job.id);
      await fs.writeFile(input.paths.lastMessagePath, 'live graph done\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'live graph done' };
    }
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(sawStartedWhileExecutorRunning, true);
  const events = await readLiveEvents(liveEventsPath);
  const types = events.map((event) => event.type);
  for (const type of ['run.started', 'job.started', 'evidence.discovered', 'gate.result', 'terminal.outcome', 'job.finished', 'run.finished']) {
    assert.ok(types.includes(type), `missing live graph event: ${type}`);
  }

  const started = events.find((event) => event.type === 'job.started');
  assert.ok(started.nodes.some((node) => node.kind === 'job' && node.status === 'running'));
  const evidence = events.find((event) => event.type === 'evidence.discovered');
  assert.ok(evidence.nodes.some((node) => node.kind === 'evidence' && node.path.endsWith('evidence.json')));
  const gate = events.find((event) => event.type === 'gate.result');
  assert.strictEqual(gate.nodes[0].kind, 'gate');
  assert.strictEqual(gate.nodes[0].status, 'passed');
  const terminal = events.find((event) => event.type === 'terminal.outcome');
  assert.strictEqual(terminal.nodes[0].kind, 'decision');
  assert.strictEqual(terminal.nodes[0].status, 'completed');
  const finished = events.find((event) => event.type === 'job.finished');
  assert.ok(finished.nodes.some((node) => node.kind === 'candidate'));

  const dashboard = JSON.parse(await fs.readFile(path.join(outDir, 'coordinator-dashboard.json'), 'utf8'));
  assert.strictEqual(dashboard.metadata.liveRunGraphEventsPath, liveEventsPath);
  assert.strictEqual(dashboard.metadata.artifactPaths.coordinatorDashboard, path.join(outDir, 'coordinator-dashboard.json'));
  assert.strictEqual(dashboard.metadata.artifactPaths.liveRunGraphEvents, liveEventsPath);
  assert.strictEqual(dashboard.metadata.runSource.mode, 'live-run-graph-events');
  assert.strictEqual(dashboard.metadata.runSource.format, 'jsonl');
  assert.strictEqual(dashboard.metadata.runSource.liveRunGraphEventsPath, liveEventsPath);
  assert.strictEqual(discoverLiveRunGraphEventsPath(dashboard), liveEventsPath);
  assert.strictEqual((await readLiveEvents(discoverLiveRunGraphEventsPath(dashboard))).length, events.length);

  assertLiveSemanticAdmissionEvents();
}

async function readLiveEvents(file) {
  const text = await fs.readFile(file, 'utf8');
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function discoverLiveRunGraphEventsPath(dashboard) {
  return dashboard.metadata?.artifactPaths?.liveRunGraphEvents
    ?? dashboard.metadata?.runSource?.liveRunGraphEventsPath
    ?? dashboard.metadata?.liveRunGraphEventsPath;
}

function assertLiveSemanticAdmissionEvents() {
  for (const fixture of [
    {
      status: 'safe',
      reasonCode: 'semantic-safe-accepted-clean',
      semanticImport: semanticImportWithEditReplay({
        acceptedClean: 1,
        admission: { 'accepted-clean': 1 },
        reasonCodes: ['semantic-safe-accepted-clean']
      }),
      mergeBundle: { autoMergeable: true, disposition: 'auto-mergeable' }
    },
    {
      status: 'no-op',
      reasonCode: 'semantic-safe-already-applied',
      semanticImport: semanticImportWithEditReplay({
        alreadyApplied: 1,
        admission: { 'already-applied': 1 },
        reasonCodes: ['semantic-safe-already-applied']
      })
    },
    {
      status: 'stale',
      reasonCode: 'semantic-stale-anchor',
      semanticImport: semanticImportWithEditScript({
        stale: 1,
        admission: { stale: 1 },
        reasonCodes: ['semantic-stale-anchor']
      }),
      mergeBundle: { staleAgainstHead: true, disposition: 'stale-against-head' },
      result: { mergeDisposition: 'stale-against-head' }
    },
    {
      status: 'review',
      reasonCode: 'semantic-review-required',
      semanticImport: semanticImportWithEditScript({
        reviewRequired: 1,
        admission: { 'needs-review': 1 },
        reasonCodes: ['semantic-review-required']
      }),
      mergeBundle: { disposition: 'needs-port' }
    },
    {
      status: 'block',
      reasonCode: 'semantic-symbol-conflict',
      semanticImport: semanticImportWithEditScript({
        conflicts: 1,
        admission: { conflict: 1 },
        reasonCodes: ['semantic-symbol-conflict']
      }),
      mergeBundle: { mergeReadiness: 'blocked', disposition: 'blocked' }
    }
  ]) {
    const events = createCodexLiveJobResultEvents({
      runId: 'semantic-live-run',
      outDir: '/tmp/semantic-live-run',
      job: liveSemanticJob(fixture.status),
      result: {
        jobId: `semantic-live-${fixture.status}`,
        status: 'completed',
        mergeReadiness: fixture.mergeBundle?.mergeReadiness ?? 'verified-patch',
        mergeDisposition: fixture.result?.mergeDisposition ?? fixture.mergeBundle?.disposition ?? 'auto-mergeable',
        changedPaths: ['src/live.ts'],
        ownershipViolations: [],
        evidencePaths: [],
        semanticImport: fixture.semanticImport,
        ...fixture.result
      },
      mergeBundle: liveSemanticMergeBundle(fixture.status, fixture.semanticImport, fixture.mergeBundle),
      generatedAt: 123
    });
    const semanticEvent = events.find((event) => event.type === 'semantic-admission.result');
    assert.ok(semanticEvent, `missing semantic admission event for ${fixture.status}`);
    const admissionNode = semanticEvent.nodes.find((node) =>
      node.kind === 'semantic-admission' &&
      node.status === fixture.status &&
      node.data.reasonCodes.includes(fixture.reasonCode)
    );
    assert.ok(admissionNode, `missing ${fixture.status} semantic admission node`);
    assert.ok(semanticEvent.edges.some((edge) =>
      edge.kind === 'produces' &&
      edge.from === `job:semantic-live-${fixture.status}` &&
      edge.to === admissionNode.id
    ));
    assert.ok(semanticEvent.edges.some((edge) =>
      edge.kind === 'decides' &&
      edge.from === admissionNode.id &&
      edge.to === `candidate:semantic-live-${fixture.status}`
    ));
  }
}

function liveSemanticJob(status) {
  return {
    id: `semantic-live-${status}`,
    taskId: `semantic-live-${status}-task`,
    lane: 'runtime',
    title: `semantic live ${status}`,
    task: { title: `semantic live ${status}`, workKind: 'implementation' },
    compute: { id: 'codex.impl', model: 'gpt-test', serviceTier: 'test' },
    capabilities: [],
    allowedWrites: ['src/**']
  };
}

function liveSemanticMergeBundle(status, semanticImport, overrides = {}) {
  return {
    kind: 'frontier.swarm.merge-bundle',
    version: 1,
    id: `semantic-live-${status}-bundle`,
    jobId: `semantic-live-${status}`,
    taskId: `semantic-live-${status}-task`,
    lane: 'runtime',
    generatedAt: 123,
    status: 'completed',
    mergeReadiness: overrides.mergeReadiness ?? 'verified-patch',
    disposition: overrides.disposition ?? 'auto-mergeable',
    riskLevel: 'low',
    autoMergeable: overrides.autoMergeable ?? false,
    changedPaths: ['src/live.ts'],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: ['src/**'],
    ownershipViolations: [],
    evidencePaths: [],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: [`semantic-live-${status}-task`],
    semanticImport,
    traceShards: [],
    staleAgainstHead: overrides.staleAgainstHead ?? false,
    reasons: [],
    metadata: { semanticImport },
    ...overrides
  };
}

function semanticImportWithEditScript(script) {
  return {
    ...baseSemanticImport(),
    semanticEditScripts: {
      total: 1,
      operations: 1,
      autoMergeCandidates: 0,
      portable: 0,
      alreadyApplied: 0,
      needsPort: 0,
      conflicts: 0,
      stale: 0,
      blocked: 0,
      candidates: 0,
      reviewRequired: 0,
      autoApplyCandidates: 0,
      byStatus: {},
      admission: {},
      actions: [],
      reasonCodes: [],
      ...script
    }
  };
}

function semanticImportWithEditReplay(replay) {
  return {
    ...baseSemanticImport(),
    semanticEditReplays: {
      total: 1,
      acceptedClean: 0,
      alreadyApplied: 0,
      conflicts: 0,
      stale: 0,
      blocked: 0,
      needsPort: 0,
      evidenceOnly: 0,
      admission: {},
      statusCounts: {},
      actions: [],
      reasonCodes: [],
      ...replay
    }
  };
}

function baseSemanticImport() {
  return {
    total: 1,
    selected: 1,
    eligible: 1,
    imported: 1,
    errors: 0,
    sourceMapMappingCount: 1,
    semanticIndex: { symbols: 1 },
    semanticSidecars: { ownershipRegions: 1, patchHints: 1 },
    readiness: { ready: 1 }
  };
}
