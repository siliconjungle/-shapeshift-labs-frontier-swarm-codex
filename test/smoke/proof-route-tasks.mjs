import assert from 'node:assert';
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
