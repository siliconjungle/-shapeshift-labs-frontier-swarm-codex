import assert from 'node:assert';
import {
  collectCodexSwarmRun,
  continueCodexSwarmLoop,
  exists,
  fs,
  path
} from './context.mjs';
import {
  FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE,
  FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
  createCodexProofRouteBacklog,
  createCodexProofRouteRequests,
  createCodexProofRouteTasks
} from '../../dist/index.js';

export function testProofRouteTasks(mergeBundle) {
  const bundle = {
    ...mergeBundle,
    id: 'html-css-proof-route-bundle',
    jobId: 'html-css-worker',
    taskId: 'html-css-task',
    changedPaths: ['src/view.html', 'src/button.css', 'src/app.ts'],
    evidencePaths: ['semantic-imports.json'],
    semanticImport: {
      confidence: {
        missingEvidence: [{
          code: FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE,
          scope: 'browser-proof',
          kind: 'browser-runtime-proof',
          routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
          summary: 'Run @shapeshift-labs/frontier-playwright runFrontierPlaywrightAssertionRuntimeProof to produce source-bound proofBuilderInput.',
          suggestedInput: {
            browserRuntimeProof: true,
            playwrightSourceRuntimeProof: true,
            playwrightAssertionRuntimeProof: true,
            proofBuilderInput: true
          }
        }]
      }
    },
    metadata: {}
  };
  const collection = {
    buckets: {
      'ready-to-apply': [],
      'research-complete': [],
      'needs-human-port': [{
        bucket: 'needs-human-port',
        jobId: 'html-css-worker',
        mergePath: 'collected/needs-human-port/html-css-worker/merge.json',
        outputDir: 'collected/needs-human-port/html-css-worker',
        bundle
      }],
      'rerun-work': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  };

  const requests = createCodexProofRouteRequests({ collection });
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].routeNext, FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE);
  assert.strictEqual(requests[0].code, FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE);
  assert.strictEqual(requests[0].sourceJobId, 'html-css-worker');
  assert.deepStrictEqual(requests[0].sourceRefs, ['src/view.html', 'src/button.css']);
  assert.ok(requests[0].targetRefs.includes('src/app.ts'));
  assert.strictEqual(requests[0].suggestedInput.playwrightAssertionRuntimeProof, true);
  assert.strictEqual(requests[0].suggestedInput.proofBuilderInput, true);

  const tasks = createCodexProofRouteTasks({
    collection,
    packageName: '@example/app',
    browserPortPool: ['4177'],
    browserProfileDirPrefix: 'agent-runs/browser-profiles'
  });
  assert.strictEqual(tasks.length, 1);
  assert.strictEqual(tasks[0].lane, 'browser');
  assert.ok(tasks[0].capabilities.includes('browser.playwright'));
  assert.ok(tasks[0].capabilities.includes('frontier-playwright.assertions'));
  assert.strictEqual(tasks[0].resourceRequirements.browser.required, true);
  assert.deepStrictEqual(tasks[0].resourceRequirements.browser.portPool, ['4177']);
  assert.ok(tasks[0].acceptance.some((entry) => entry.includes('runFrontierPlaywrightAssertionRuntimeProof')));
  assert.strictEqual(tasks[0].metadata.proofRoute.routeNext, FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE);
  assert.strictEqual(tasks[0].metadata.proofRoute.suggestedInput.proofBuilderInput, true);
  assert.deepStrictEqual(tasks[0].metadata.proofProducer.functions, [
    'runFrontierPlaywrightAssertionRuntimeProof',
    'runFrontierPlaywrightSourceRuntimeProof'
  ]);

  const backlog = createCodexProofRouteBacklog({ collection, packageName: '@example/app' });
  assert.strictEqual(backlog.package, '@example/app');
  assert.strictEqual(backlog.summary.taskCount, 1);
  assert.strictEqual(backlog.tasks[0].lane, 'browser');
  assert.ok(backlog.tasks[0].tags.includes(FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE));

  const partialCollection = {
    buckets: {
      'needs-human-port': [{
        bucket: 'needs-human-port',
        jobId: 'html-css-worker',
        mergePath: 'collected/needs-human-port/html-css-worker/merge.json',
        outputDir: 'collected/needs-human-port/html-css-worker',
        bundle: {
          ...bundle,
          evidencePaths: undefined
        }
      }]
    }
  };
  assert.strictEqual(createCodexProofRouteTasks({ collection: partialCollection }).length, 1);
}

export async function testProofRouteCollectionAutomation({ tmp }, mergeBundle) {
  const runDir = path.join(tmp, 'proof-route-automation-run');
  const jobDir = path.join(runDir, 'html-css-worker');
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'changes.patch'), [
    'diff --git a/src/page.html b/src/page.html',
    '--- a/src/page.html',
    '+++ b/src/page.html',
    '@@ -1 +1 @@',
    '-<button class="old">Save</button>',
    '+<button class="new">Save</button>',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    id: 'html-css-proof-route-bundle',
    jobId: 'html-css-worker',
    taskId: 'html-css-task',
    queueItemIds: ['html-css-task'],
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'needs-port',
    autoMergeable: false,
    changedPaths: ['src/page.html', 'src/styles.css', 'src/app.ts'],
    patchPath: path.join(jobDir, 'changes.patch'),
    evidencePaths: [],
    semanticImport: {
      confidence: {
        missingEvidence: [{
          code: FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE,
          routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
          summary: 'Run source-bound Playwright assertions before admitting this HTML/CSS browser change.',
          suggestedInput: {
            playwrightAssertionRuntimeProof: true,
            proofBuilderInput: true
          }
        }]
      }
    },
    metadata: {}
  }, null, 2) + '\n');

  const collection = await collectCodexSwarmRun({
    run: runDir,
    outDir: path.join(runDir, 'collected'),
    checkStale: false,
    semanticImportExpected: true
  });
  assert.strictEqual(collection.summary.proofRouteTaskCount, 1);
  assert.ok(collection.proofRouteBacklogPath.endsWith('proof-route-backlog.json'));
  assert.ok(await exists(collection.proofRouteBacklogPath));
  assert.strictEqual(collection.proofRouteBacklog.entries[0].lane, 'browser');
  assert.ok(collection.proofRouteBacklog.entries[0].targetRefs.includes('src/app.ts'));
  assert.ok(collection.artifactStore.records.some((record) => record.relativePath === 'proof-route-backlog.json'));

  const continuation = await continueCodexSwarmLoop({
    collection: collection.outDir,
    outDir: path.join(tmp, 'proof-route-automation-continuation'),
    backlog: { id: 'proof-route-base', entries: [] },
    routingPolicy: { id: 'proof-route-routing', defaultMode: 'fill' }
  });
  assert.ok(continuation.childBacklogPaths.includes(collection.proofRouteBacklogPath));
  assert.strictEqual(continuation.summary.childBacklogEntryCount, 1);
  assert.ok(continuation.nextBacklog.entries.some((entry) => entry.id === collection.proofRouteBacklog.entries[0].id));
}
