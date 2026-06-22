import assert from 'node:assert';
import { classifyCodexSemanticCollectAdmission } from '../dist/collect-bundles.js';
import { createSmokeContext } from './smoke/context.mjs';
import {
  collectCodexSwarmRun,
  createCodexSwarmPlan,
  fs,
  path,
  runCodexSwarm
} from './smoke/context.mjs';
import { testApplyAndScore } from './smoke/apply-score.mjs';
import { testCliAndPidManifest } from './smoke/cli-pids.mjs';
import { testCompactLogTruncation } from './smoke/compact-logs.mjs';
import { testHooksAndWorkspaces } from './smoke/hooks-and-workspaces.mjs';
import { testDependencyHealth } from './smoke/dependency-health.mjs';
import { testPlanningAndLinks } from './smoke/planning-and-links.mjs';
import { testResumeRun } from './smoke/resume.mjs';
import { testSemanticImportSelection } from './smoke/semantic-import-selection.mjs';
import { testSemanticImportBaseLineage } from './smoke/semantic-import-base-lineage.mjs';
import { testSemanticEditProjectionSummary } from './smoke/semantic-edit-projection.mjs';
import { testSemanticEditReplaySummary } from './smoke/semantic-edit-replay.mjs';
import { testSemanticEditLockdown } from './smoke/semantic-edit-lockdown.mjs';
import { testSemanticImportQuality } from './smoke/semantic-import-quality.mjs';
import {
  cleanEditScriptSemanticImportSummary,
  editScriptSemanticImportSummary,
  emptyExpectedSemanticImportSummary,
  factSemanticImportSummary
} from './smoke/semantic-import-quality-fixtures.mjs';
import { testSemanticLineageCollection } from './smoke/semantic-lineage-collection.mjs';
import { testSwarmRunCollection } from './smoke/swarm-run-collection.mjs';
import { testSemanticAdmissionGates } from './smoke/semantic-admission-gates.mjs';
import { testSemanticAdmissionSidecars } from './smoke/semantic-admission-sidecars.mjs';
import { testTerminalDrainMixedOracle } from './smoke/terminal-drain-e2e.mjs';
import { testArtifactArchiveCompaction } from './smoke/artifact-archive.mjs';
import { testTournamentCli } from './smoke/tournament-cli.mjs';
import { testContextBudget } from './smoke/context-budget.mjs';
import { testContinuation } from './smoke/continuation.mjs';
import { testContinuationTaskSource } from './smoke/continuation-task-source.mjs';
import { testContinuationRoutingCost } from './smoke/continuation-routing-cost.mjs';
import { testDashboardUi } from './smoke/dashboard-ui.mjs';
import { testHumanActionArtifacts } from './smoke/human-actions.mjs';
import { testHumanActionAnswers } from './smoke/human-action-answers.mjs';
import { testLiveRoutingController } from './smoke/live-routing.mjs';
import { testModelPricing } from './smoke/model-pricing.mjs';
import { testRunEventsCurrentFormat } from './smoke/run-events-current-format.mjs';
import { testRunSync } from './smoke/run-sync.mjs';
import './smoke/collection-noise.mjs';
import './smoke/workspace-lockdown.mjs';

const context = await createSmokeContext();

await testPlanningAndLinks(context);
await testResourceAwareScheduling(context);
await testRunEventsCurrentFormat(context);
await testRunSync(context);
await testLiveRoutingController(context);
await testCompactLogTruncation(context);
await testContextBudget(context);
testModelPricing();
await testSemanticImportSelection(context);
await testSemanticImportBaseLineage(context);
await testSemanticEditProjectionSummary();
await testSemanticEditReplaySummary();
await testSemanticEditLockdown();
const { mergeBundle, collectionDir } = await testSwarmRunCollection(context);
const continuation = await testContinuation(context, collectionDir);
await testContinuationTaskSource(context, collectionDir);
await testContinuationRoutingCost(context, collectionDir);
await testDashboardUi(context, collectionDir, continuation);
await testHumanActionArtifacts(context);
await testHumanActionAnswers(context);
await testArtifactArchiveCompaction(context, collectionDir);
await testTournamentCli(context);
await testSemanticImportQuality(context, mergeBundle);
await testSemanticAdmissionGates(context, mergeBundle);
await testSemanticAdmissionSidecars(context, mergeBundle);
await testTerminalDrainMixedOracle(context);
await testSemanticAdmissionReasonCodes(context, mergeBundle);
await testSemanticLineageCollection(context, mergeBundle);
await testApplyAndScore(context, mergeBundle);
await testHooksAndWorkspaces(context);
await testDependencyHealth(context);
await testResumeRun(context);
await testCliAndPidManifest(context);

async function testResourceAwareScheduling({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'evidence-resource-lanes',
      policy: { defaultConcurrency: 1 },
      lanes: [
        { id: 'static-check', capabilities: ['static-check'], allowedGlobs: ['checks/**'] },
        {
          id: 'browser',
          capabilities: ['browser.playwright'],
          allowedGlobs: ['browser/**'],
          resourceRequirements: {
            resources: { browser: 1 },
            browser: {
              required: true,
              maxConcurrency: 1,
              profileDirPrefix: 'agent-runs/browser-profiles',
              headless: true
            }
          }
        },
        { id: 'api-check', capabilities: ['api-check'], allowedGlobs: ['api/**'] },
        { id: 'fuzzer', capabilities: ['fuzzer'], allowedGlobs: ['fuzz/**'] }
      ]
    },
    tasks: {
      items: [
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `static-${index}`,
          lane: 'static-check',
          priority: index + 1,
          ownedFiles: [`checks/static-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `browser-${index}`,
          lane: 'browser',
          priority: 10 + index,
          ownedFiles: [`browser/browser-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `api-${index}`,
          lane: 'api-check',
          priority: 20 + index,
          ownedFiles: [`api/api-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `fuzz-${index}`,
          lane: 'fuzzer',
          priority: 30 + index,
          ownedFiles: [`fuzz/fuzz-${index}.txt`]
        }))
      ]
    }
  });
  const running = { total: 0, staticCheck: 0, browser: 0, apiCheck: 0, fuzzer: 0 };
  const peak = { total: 0, staticCheck: 0, browser: 0, apiCheck: 0, fuzzer: 0 };
  const laneKey = (lane) => lane === 'static-check'
    ? 'staticCheck'
    : lane === 'api-check'
      ? 'apiCheck'
      : lane;
  const run = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'resource-scheduler-run'),
    cwd: tmp,
    maxConcurrency: 4,
    dependencyHealth: false,
    executor: async (input) => {
      const key = laneKey(input.job.lane);
      const canonicalCapability = input.job.lane;
      assert.ok(input.resourceAllocation.capabilities.includes(canonicalCapability));
      assert.ok(input.env.FRONTIER_SWARM_CAPABILITIES.split(',').includes(canonicalCapability));
      const allocation = JSON.parse(input.env.FRONTIER_SWARM_RESOURCE_ALLOCATION);
      assert.strictEqual(allocation.resources[canonicalCapability === 'browser' ? 'browser' : canonicalCapability], 1);
      running.total += 1;
      running[key] += 1;
      peak.total = Math.max(peak.total, running.total);
      peak[key] = Math.max(peak[key], running[key]);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running.total -= 1;
      running[key] -= 1;
      await fs.writeFile(input.paths.lastMessagePath, `${input.job.id} done\n`);
      return { exitCode: 0, changedPaths: [], lastMessage: `${input.job.id} done` };
    }
  });
  assert.strictEqual(run.ok, true);
  assert.ok(peak.staticCheck >= 3, `expected static checks to run wide, saw ${peak.staticCheck}`);
  assert.strictEqual(peak.browser, 1);
  assert.strictEqual(peak.apiCheck, 1);
  assert.strictEqual(peak.fuzzer, 1);
  assert.ok(peak.total > peak.browser);
}

async function testSemanticAdmissionReasonCodes({ tmp }, mergeBundle) {
  const cases = new Map([
    ['missing-sidecar', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-missing',
      semanticImport: undefined,
      semanticImportExpected: true
    })],
    ['empty-sidecar', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-empty',
      semanticImport: emptyExpectedSemanticImportSummary(),
      semanticImportExpected: true
    })],
    ['stale-source-hash', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-stale',
      semanticImport: staleSemanticImportSummary()
    })],
    ['symbol-conflict', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-symbol-conflict',
      semanticImport: editScriptSemanticImportSummary()
    })],
    ['effect-conflict', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-effect-conflict',
      semanticImport: effectConflictSemanticImportSummary()
    })],
    ['lossy-import', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-lossy',
      semanticImport: lossySemanticImportSummary()
    })],
    ['tests-missing', classifySemanticReasonBundle(mergeBundle, {
      jobId: 'semantic-reason-tests-missing',
      semanticImport: cleanEditScriptSemanticImportSummary()
    })]
  ]);
  for (const [reasonCode, decision] of cases) {
    assert.ok(decision.reasonCodes.includes(reasonCode), `missing semantic admission reason code: ${reasonCode}`);
  }
  assert.strictEqual(cases.get('missing-sidecar').status, 'review');
  assert.strictEqual(cases.get('empty-sidecar').status, 'review');
  assert.strictEqual(cases.get('stale-source-hash').status, 'rerun');
  assert.strictEqual(cases.get('tests-missing').status, 'review');

  const runDir = path.join(tmp, 'semantic-admission-reason-codes-run');
  await writeSemanticReasonCodeJob(runDir, mergeBundle, {
    jobId: 'semantic-reason-graph-ready',
    semanticImport: cleanEditScriptSemanticImportSummary()
  });
  const collection = await collectCodexSwarmRun({
    run: runDir,
    checkStale: false,
    semanticImportExpected: true,
    outDir: path.join(runDir, 'collected')
  });
  assert.strictEqual(collection.summary['needs-human-port'], 1);
  const collectedBundle = Object.values(collection.buckets)
    .flat()
    .find((entry) => entry.jobId === 'semantic-reason-graph-ready')?.bundle;
  assert.ok(collectedBundle);
  const collectedDecision = classifyCodexSemanticCollectAdmission(collectedBundle, {
    hasActionablePatch: true,
    semanticImportExpected: true
  });
  assert.strictEqual(collectedDecision.status, 'review');
  assert.ok(collectedDecision.reasonCodes.includes('tests-missing'));
}

function classifySemanticReasonBundle(mergeBundle, input) {
  return classifyCodexSemanticCollectAdmission(semanticReasonBundle(mergeBundle, input), {
    hasActionablePatch: true,
    semanticImportExpected: input.semanticImportExpected ?? true
  });
}

function semanticReasonBundle(mergeBundle, input) {
  const semanticImport = input.semanticImport;
  return {
    ...mergeBundle,
    id: `${input.jobId}-bundle`,
    jobId: input.jobId,
    taskId: `${input.jobId}-task`,
    queueItemIds: [`${input.jobId}-task`],
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    autoMergeable: true,
    changedPaths: [`src/runtime/${input.jobId}.ts`],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [`src/runtime/${input.jobId}.ts`],
    ownershipViolations: [],
    patchPath: 'changes.patch',
    patchHash: `${input.jobId}-patch-hash`,
    evidencePaths: semanticImport ? ['semantic-imports.json'] : [],
    commandsPassed: [],
    commandsFailed: [],
    traceShards: [],
    metadata: semanticImport ? { semanticImport } : {},
    semanticImport,
    reasons: []
  };
}

async function writeSemanticReasonCodeJob(runDir, mergeBundle, input) {
  const jobDir = path.join(runDir, input.jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'changes.patch'), semanticReasonCodePatch(`src/runtime/${input.jobId}.ts`));
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify(semanticReasonBundle(mergeBundle, input), null, 2) + '\n');
}

function staleSemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    semanticEditScripts: {
      total: 1,
      operations: 1,
      stale: 1,
      byStatus: { stale: 1 },
      admission: { stale: 1 },
      reasonCodes: ['head-source-hash-mismatch'],
      actions: ['block']
    }
  };
}

function effectConflictSemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    semanticEditScripts: {
      total: 1,
      operations: 1,
      byStatus: { portable: 1 },
      admission: { portable: 1 },
      reasonCodes: ['effect-conflict'],
      actions: ['review']
    }
  };
}

function lossySemanticImportSummary() {
  return {
    ...factSemanticImportSummary(),
    lossCount: 1,
    lossesBySeverity: { warning: 1 },
    readiness: { 'ready-with-losses': 1 }
  };
}

function semanticReasonCodePatch(file) {
  return [
    `diff --git a/${file} b/${file}`,
    'index 1111111..2222222 100644',
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    '-export const value = 1;',
    '+export const value = 2;',
    ''
  ].join('\n');
}
