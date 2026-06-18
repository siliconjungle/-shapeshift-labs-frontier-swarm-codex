import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  autonomousApplyCodexSwarmRun,
  buildCodexArgs,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  FRONTIER_SWARM_CODEX_MODEL_PRICING,
  FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND,
  FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
  FRONTIER_SWARM_CODEX_SUPPORTED_MODELS,
  collectCodexSwarmRun,
  createSwarmWorkspaceProof,
  createCodexResourceAllocation,
  estimateCodexRunCost,
  deriveCodexAutonomousApplyLockKeys,
  discoverCodexHandoffArtifacts,
  getCodexModelPricing,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  normalizeCodexRunMetrics,
  readCodexPidManifest,
  renderCodexPrompt,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  stopCodexSwarmRun,
  writeSwarmCoordinatorSnapshot
} from '../dist/index.js';

const manifestInput = {
  id: 'inkwell',
  lanes: [{
    id: 'runtime',
    layer: 'implementation',
    allowedGlobs: ['src/runtime/**'],
    evidenceOutDirPrefix: 'evidence/runtime/'
  }],
  layers: [
    { id: 'parent', childCompute: { implementation: 'codex.deep' } },
    { id: 'implementation', parentId: 'parent' }
  ]
};
const tasksInput = {
  items: [{
    id: 'runtime-action',
    lane: 'runtime',
    surfaceKind: 'runtime action',
    ownedFiles: ['src/runtime/action.ts'],
    legacySourcePaths: ['/legacy/action.ts'],
    acceptanceChecks: [{ description: 'action parity passes' }],
    verification: [{ command: 'node', args: ['test/runtime.mjs'] }]
  }]
};

const manifest = coerceCodexSwarmManifestInput(manifestInput);
const tasks = coerceCodexSwarmTasksInput(tasksInput);
assert.strictEqual(manifest.compute?.[0]?.model, 'gpt-5.5');
assert.strictEqual(tasks[0].targetRefs?.[0], 'src/runtime/action.ts');

const plan = createCodexSwarmPlan({ manifest, tasks });
assert.strictEqual(plan.jobs.length, 1);
assert.strictEqual(plan.jobs[0].compute.model, 'gpt-5.5');
assert.strictEqual(plan.jobs[0].compute.reasoningEffort, 'xhigh');
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({
    changedRegions: ['src/apply.ts#apply', 'src/apply.ts#apply'],
    changedPaths: ['src/apply.ts']
  }),
  { scope: 'semantic', keys: ['region:src/apply.ts#apply'] }
);
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({
    changedRegions: [],
    changedPaths: ['src/apply.ts', './src/apply.ts']
  }),
  { scope: 'path', keys: ['path:src/apply.ts'] }
);
assert.deepStrictEqual(
  deriveCodexAutonomousApplyLockKeys({ changedRegions: [], changedPaths: [] }),
  { scope: 'repo', keys: ['repo:*'] }
);

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-'));
const paths = {
  jobDir: tmp,
  promptPath: path.join(tmp, 'prompt.md'),
  eventsPath: path.join(tmp, 'events.jsonl'),
  stderrPath: path.join(tmp, 'stderr.log'),
  lastMessagePath: path.join(tmp, 'last.md'),
  evidenceDir: path.join(tmp, 'evidence'),
  resourceAllocationPath: path.join(tmp, 'resource-allocation.json'),
  workspaceProofPath: path.join(tmp, 'workspace-proof.json'),
  patchPath: path.join(tmp, 'changes.patch'),
  mergeBundlePath: path.join(tmp, 'merge.json'),
  pidManifestPath: path.join(tmp, 'pids.json')
};
await fs.writeFile(path.join(tmp, 'last-message.md'), 'handoff\n');
await fs.mkdir(path.join(tmp, 'evidence'), { recursive: true });
await fs.writeFile(path.join(tmp, 'evidence', 'debug-handoff.json'), '{}\n');
await fs.writeFile(path.join(tmp, 'evidence', 'trace.jsonl'), '{}\n');
await fs.writeFile(path.join(tmp, 'evidence', 'watchpoints.json'), '{}\n');
const handoffArtifacts = await discoverCodexHandoffArtifacts({ root: tmp });
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'last-message'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'debug-handoff'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'trace'));
assert.ok(handoffArtifacts.some((artifact) => artifact.kind === 'watchpoint'));
const args = buildCodexArgs(plan.jobs[0], { outDir: tmp, workspacePath: tmp, paths });
assert.ok(!args.includes('--model'));
assert.ok(!args.includes('gpt-5.5'));
assert.ok(!args.includes('model_reasoning_effort="xhigh"'));
assert.ok(!args.includes('--ask-for-approval'));
assert.ok(!args.includes('--skip-git-repo-check'));
const explicitArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  model: 'gpt-5.5',
  reasoningEffort: 'xhigh',
  approval: 'full-auto'
});
assert.ok(explicitArgs.includes('--model'));
assert.ok(explicitArgs.includes('gpt-5.5'));
assert.ok(explicitArgs.includes('model_reasoning_effort="xhigh"'));
assert.ok(explicitArgs.includes('--ask-for-approval'));
assert.strictEqual(explicitArgs[explicitArgs.indexOf('--ask-for-approval') + 1], 'never');
const forwardedArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  modelPolicy: 'plan'
});
assert.ok(forwardedArgs.includes('--model'));
assert.ok(forwardedArgs.includes('gpt-5.5'));
assert.ok(forwardedArgs.includes('model_reasoning_effort="xhigh"'));
assert.strictEqual(normalizeCodexModelFlag('default'), undefined);
for (const supportedModel of ['gpt-5.5', 'gpt-5.4-mini', 'o4-mini', 'gpt-4.1-mini']) {
  assert.ok(FRONTIER_SWARM_CODEX_SUPPORTED_MODELS.includes(supportedModel));
  assert.strictEqual(normalizeCodexModelFlag(supportedModel.toUpperCase()), supportedModel);
  const supportedArgs = buildCodexArgs(plan.jobs[0], {
    outDir: tmp,
    workspacePath: tmp,
    paths,
    model: supportedModel
  });
  assert.ok(supportedArgs.includes('--model'));
  assert.ok(supportedArgs.includes(supportedModel));
}
const unsupportedModelError = /unsupported Codex model "gpt-5\.1-codex-mini"; supported models: .*gpt-5\.5.*gpt-5\.4-mini.*o4-mini.*gpt-4\.1-mini/;
assert.throws(() => normalizeCodexModelFlag('gpt-5.1-codex-mini'), unsupportedModelError);
assert.throws(() => buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  model: 'gpt-5.1-codex-mini'
}), unsupportedModelError);
const unsupportedPlanJob = {
  ...plan.jobs[0],
  compute: { ...plan.jobs[0].compute, model: 'gpt-5.1-codex-mini' }
};
assert.throws(() => buildCodexArgs(unsupportedPlanJob, {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  modelPolicy: 'plan'
}), unsupportedModelError);
assert.strictEqual(normalizeCodexApprovalPolicy('on_request'), 'on-request');
const normalizedUsage = normalizeCodexRunMetrics({
  model: 'gpt-5.5',
  usage: {
    input_tokens: 1000,
    output_tokens: 250,
    input_token_details: { cached_tokens: 400 }
  }
});
assert.deepStrictEqual({
  inputTokens: normalizedUsage.inputTokens,
  cachedInputTokens: normalizedUsage.cachedInputTokens,
  uncachedInputTokens: normalizedUsage.uncachedInputTokens,
  outputTokens: normalizedUsage.outputTokens,
  totalTokens: normalizedUsage.totalTokens,
  hasTokenUsage: normalizedUsage.hasTokenUsage
}, {
  inputTokens: 1000,
  cachedInputTokens: 400,
  uncachedInputTokens: 600,
  outputTokens: 250,
  totalTokens: 1250,
  hasTokenUsage: true
});
const normalizedUncachedUsage = normalizeCodexRunMetrics({
  usage: {
    input_tokens: 1000,
    uncached_input_tokens: 700,
    output_tokens: 200
  }
});
assert.strictEqual(normalizedUncachedUsage.cachedInputTokens, 300);
assert.strictEqual(normalizedUncachedUsage.uncachedInputTokens, 700);
const knownCost = estimateCodexRunCost(normalizedUsage);
assert.strictEqual(knownCost.estimated, true);
assert.strictEqual(knownCost.estimatedCostUsd, 0.0107);
assert.strictEqual(FRONTIER_SWARM_CODEX_MODEL_PRICING['gpt-5.5'].inputUsdPerUnit, 5);
assert.strictEqual(FRONTIER_SWARM_CODEX_MODEL_PRICING['gpt-5.5'].cachedInputUsdPerUnit, 0.5);
assert.strictEqual(FRONTIER_SWARM_CODEX_MODEL_PRICING['gpt-5.5'].outputUsdPerUnit, 30);
assert.strictEqual(FRONTIER_SWARM_CODEX_MODEL_PRICING['gpt-5.5'].unitTokens, 1000000);
assert.strictEqual(getCodexModelPricing('GPT-5.5')?.model, 'gpt-5.5');
assert.strictEqual(getCodexModelPricing('default'), undefined);
const unknownCost = estimateCodexRunCost({ ...normalizedUsage, model: 'future-codex-model' });
assert.strictEqual(unknownCost.estimated, false);
assert.strictEqual(unknownCost.reason, 'unknown-model-pricing');
assert.strictEqual(Object.hasOwn(unknownCost, 'estimatedCostUsd'), false);
const copyArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  workspace: { mode: 'copy' }
});
assert.ok(copyArgs.includes('--skip-git-repo-check'));

const prompt = renderCodexPrompt(plan.jobs[0], { workspacePath: tmp, paths });
assert.ok(prompt.includes('Allowed write globs'));
assert.ok(prompt.includes('Resource allocation'));
assert.ok(prompt.includes('modelPricing=gpt-5.5 inputUsdPerUnit=5 cachedInputUsdPerUnit=0.5 outputUsdPerUnit=30 unitTokens=1000000'));
assert.ok(prompt.includes('src/runtime/action.ts'));
assert.ok(prompt.includes('git status'));
assert.ok(prompt.includes('runner snapshot'));
assert.ok(prompt.includes('## Human Question Contract'));
assert.ok(prompt.includes('Ask a human only when repo context, tests, task JSON, ownership rules, and coordinator policy cannot decide the issue.'));
assert.ok(prompt.includes('Do not ask humans for stale patches, failed applies, routine review, queue classification, or answerable implementation details'));
assert.ok(prompt.includes('human-question: owner=<role>; surface=<package/path>; missing-authority=<policy/fact/approval>; question=<single answerable question>; answer-code=<approve|reject|choose:<option-id>|provide:<fact-id>>'));
assert.ok(prompt.includes('The answer-code must describe the allowed human answer shape'));

const browserPlan = createCodexSwarmPlan({
  manifest: {
    id: 'browser-resources',
    lanes: [{
      id: 'browser',
      allowedGlobs: ['e2e.mjs'],
      capabilities: ['browser.playwright'],
      resourceRequirements: {
        resources: { browser: 1 },
        browser: {
          required: true,
          portPool: [4177, 4178],
          profileDirPrefix: 'agent-runs/browser-profiles',
          maxConcurrency: 1,
          headless: true
        }
      }
    }]
  },
  tasks: {
    items: [{
      id: 'browser-smoke',
      lane: 'browser',
      ownedFiles: ['e2e.mjs'],
      capabilities: ['dom.assertions']
    }]
  }
});
const browserJob = browserPlan.jobs[0];
const browserAllocation = createCodexResourceAllocation(browserJob, {
  cwd: tmp,
  outDir: path.join(tmp, 'browser-run'),
  workspacePath: tmp,
  lease: {
    kind: 'frontier.swarm.lease',
    version: 1,
    id: 'lease',
    jobId: browserJob.id,
    workerId: 'worker',
    token: 'token',
    leasedAt: 0,
    expiresAt: 1,
    fencingToken: 2,
    status: 'active'
  }
});
assert.strictEqual(browserAllocation.browser.port, '4178');
assert.strictEqual(browserAllocation.env.PORT, '4178');
assert.strictEqual(browserAllocation.env.FRONTIER_SWARM_BROWSER_HEADLESS, 'true');
assert.ok(browserAllocation.browser.profileDir.endsWith(path.join('agent-runs', 'browser-profiles', browserJob.id)));
const browserPrompt = renderCodexPrompt(browserJob, { workspacePath: tmp, paths, resourceAllocation: browserAllocation });
assert.ok(browserPrompt.includes('browser.port=4178'));
assert.ok(browserPrompt.includes('FRONTIER_SWARM_BROWSER_PROFILE_DIR'));

const result = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'run'),
  cwd: tmp,
  semanticImport: true,
  dryRun: false,
  executor: async (input) => {
    assert.strictEqual(input.resourceAllocation.env.FRONTIER_SWARM_JOB_ID, input.job.id);
    assert.strictEqual(input.env.FRONTIER_SWARM_TASK_ID, input.job.taskId);
    await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'action.ts'), 'export function action() { return 1; }\n');
    await fs.writeFile(input.paths.lastMessagePath, 'done\n');
    return {
      exitCode: 0,
      changedPaths: ['src/runtime/action.ts'],
      lastMessage: 'done',
      metrics: {
        inputTokens: 1200,
        cachedInputTokens: 200,
        outputTokens: 300
      }
    };
  }
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.run.results[0].ownershipViolations.length, 0);
assert.ok(result.proof.hash);
assert.ok(await exists(path.join(tmp, 'run', 'coordinator-dashboard.json')));
const dashboard = JSON.parse(await fs.readFile(path.join(tmp, 'run', 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(dashboard.queueMetadata.kind, 'frontier.swarm-codex.dashboard-queue-metadata');
assert.strictEqual(dashboard.costSummary.kind, 'frontier.swarm-codex.dashboard-cost-summary');
assert.strictEqual(dashboard.costSummary.jobsWithTokenUsage, 1);
assert.strictEqual(dashboard.costSummary.estimatedJobCount, 1);
assert.strictEqual(dashboard.costSummary.unknownPricingJobCount, 0);
assert.strictEqual(dashboard.costSummary.inputTokens, 1200);
assert.strictEqual(dashboard.costSummary.cachedInputTokens, 200);
assert.strictEqual(dashboard.costSummary.uncachedInputTokens, 1000);
assert.strictEqual(dashboard.costSummary.outputTokens, 300);
assert.strictEqual(dashboard.costSummary.estimatedCostUsd, 0.0141);
assert.deepStrictEqual(dashboard.costSummary.byModel.map((entry) => [entry.model, entry.estimatedCostUsd]), [['gpt-5.5', 0.0141]]);
assert.deepStrictEqual(dashboard.operatorSummary, dashboard.queueMetadata.operatorSummary);
assert.strictEqual(dashboard.operatorSummary.kind, 'frontier.swarm-codex.dashboard-operator-queue');
assert.strictEqual(dashboard.operatorSummary.available, dashboard.queueMetadata.available);
assert.strictEqual(dashboard.operatorSummary.source, dashboard.queueMetadata.source);
assert.strictEqual(dashboard.operatorSummary.counts.coordinatorQueues, dashboard.queueHealth.activeCoordinatorQueueCount);
assert.strictEqual(dashboard.operatorSummary.counts.trueBlockers, dashboard.queueHealth.trueBlockerCount + dashboard.humanQuestions.count);
assert.ok(dashboard.operatorSummary.cards.some((card) => card.id === 'true-blockers'));
assert.deepStrictEqual(
  dashboard.operatorSummary.cards.map((card) => [card.id, card.sourceFields]),
  [
    ['coordinator-queues', ['queueHealth.activeCoordinatorQueueCount', 'queueHealth.leaseCount', 'queueHealth.lockKeyCount']],
    ['applied-decisions', ['queueHealth.appliedDecisionCount', 'queueHealth.committedDecisionCount', 'queueHealth.recordOnlyCount']],
    ['coordination-debt', ['queueHealth.currentHeadConflictCount', 'queueHealth.deferredCoordinatorCount', 'queueHealth.deferredPromoteCount']],
    ['stale-rerun', ['queueHealth.staleOrRerunCount', 'queueHealth.staleCount', 'queueHealth.rerunCount', 'queueHealth.conflictBlockedDecisionCount', 'queueHealth.conflictRetryWork']],
    ['true-blockers', ['queueHealth.trueBlockerCount', 'humanQuestions.count']],
    ['coordinator-review-artifacts', ['queueHealth.coordinatorReviewCount', 'queueHealth.coordinatorReviewAssignmentCount', 'queueHealth.coordinatorReviewTaskCount']]
  ]
);
assert.ok(await exists(path.join(tmp, 'run', 'pids.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('resource-allocation.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('workspace-proof.json')));
assert.ok(result.run.results[0].evidencePaths.some((entry) => entry.endsWith('merge.json')));
const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
assert.ok(semanticImportsPath);
const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
assert.strictEqual(semanticImports.kind, 'frontier.swarm-codex.semantic-imports');
assert.strictEqual(semanticImports.summary.total, 1);
assert.strictEqual(semanticImports.summary.selected, 1);
assert.strictEqual(semanticImports.summary.eligible, 1);
assert.strictEqual(semanticImports.summary.omitted, 0);
assert.strictEqual(semanticImports.summary.imported + semanticImports.summary.errors, 1);
assert.ok(semanticImports.summary.sourceMapCount >= 1);
assert.ok(semanticImports.summary.sourceMapMappingCount >= 1);
assert.ok(semanticImports.summary.lossCount >= 1);
assert.ok(semanticImports.summary.semanticIndex.symbols >= 1);
assert.ok(semanticImports.summary.readiness['ready-with-losses'] >= 1 || semanticImports.summary.readiness['ready'] >= 1);
assert.strictEqual(result.run.results[0].metadata.codexRunMetrics.inputTokens, 1200);
assert.strictEqual(result.run.results[0].metadata.codexRunMetrics.cachedInputTokens, 200);
assert.strictEqual(result.run.results[0].metadata.codexRunMetrics.uncachedInputTokens, 1000);
assert.strictEqual(result.run.results[0].metadata.codexRunMetrics.outputTokens, 300);
assert.strictEqual(result.run.results[0].metadata.codexCostEstimate.estimated, true);
assert.strictEqual(result.run.results[0].metadata.codexCostEstimate.estimatedCostUsd, 0.0141);
assert.strictEqual(result.run.results[0].mergeReadiness, 'patch-candidate');
const mergeBundlePath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('merge.json'));
const mergeBundle = JSON.parse(await fs.readFile(mergeBundlePath, 'utf8'));
assert.strictEqual(mergeBundle.disposition, 'needs-port');
assert.deepStrictEqual(mergeBundle.queueItemIds, ['runtime-action']);
assert.strictEqual(mergeBundle.metadata.semanticImport.total, 1);
assert.ok(mergeBundle.metadata.semanticImport.sourceMapCount >= 1);
assert.strictEqual(mergeBundle.metadata.codexRunMetrics.inputTokens, 1200);
assert.strictEqual(mergeBundle.metadata.codexCostEstimate.estimatedCostUsd, 0.0141);
const unknownPricingPlan = createCodexSwarmPlan({
  manifest: {
    id: 'unknown-pricing',
    compute: [{ id: 'codex.custom', kind: 'codex', model: 'future-codex-model' }],
    policy: { defaultCompute: 'codex.custom', defaultConcurrency: 1 },
    lanes: [{ id: 'cost', allowedGlobs: ['cost.txt'] }]
  },
  tasks: {
    items: [{
      id: 'cost-task',
      lane: 'cost',
      ownedFiles: ['cost.txt']
    }]
  }
});
const unknownPricingRun = await runCodexSwarm(unknownPricingPlan, {
  outDir: path.join(tmp, 'unknown-pricing-run'),
  cwd: tmp,
  autoDrain: false,
  dryRun: false,
  executor: async (input) => {
    await fs.writeFile(input.paths.lastMessagePath, 'unknown pricing\n');
    return {
      exitCode: 0,
      changedPaths: [],
      lastMessage: 'unknown pricing',
      metrics: {
        inputTokens: 100,
        outputTokens: 50
      }
    };
  }
});
assert.strictEqual(unknownPricingRun.ok, true);
assert.strictEqual(unknownPricingRun.run.results[0].metadata.codexCostEstimate.estimated, false);
assert.strictEqual(unknownPricingRun.run.results[0].metadata.codexCostEstimate.reason, 'unknown-model-pricing');
assert.strictEqual(Object.hasOwn(unknownPricingRun.run.results[0].metadata.codexCostEstimate, 'estimatedCostUsd'), false);
const unknownPricingDashboard = JSON.parse(await fs.readFile(path.join(tmp, 'unknown-pricing-run', 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(unknownPricingDashboard.costSummary.jobsWithTokenUsage, 1);
assert.strictEqual(unknownPricingDashboard.costSummary.estimatedJobCount, 0);
assert.strictEqual(unknownPricingDashboard.costSummary.unknownPricingJobCount, 1);
assert.deepStrictEqual(unknownPricingDashboard.costSummary.unknownPricing, [{
  jobId: unknownPricingRun.run.results[0].jobId,
  model: 'future-codex-model',
  reason: 'unknown-model-pricing'
}]);
const collection = await collectCodexSwarmRun({ run: path.join(tmp, 'run'), checkStale: false, branchPrefix: 'codex/swarm-slice' });
assert.strictEqual(collection.summary.total, 1);
assert.strictEqual(collection.summary['needs-human-port'], 1);
assert.strictEqual(collection.mergeIndex.summary.entryCount, 1);
assert.strictEqual(collection.mergeAdmission.summary.deferredCount, 1);
assert.strictEqual(collection.hierarchicalMergeQueue.summary.promoteCount, 1);
assert.strictEqual(collection.hierarchicalMergeQueue.summary.applyLocalCount, 0);
assert.strictEqual(collection.summary.mergeQueuePromoteCount, 1);
assert.strictEqual(collection.summary.mergeQueueRerunCount, 0);
assert.strictEqual(collection.summary.mergeQueueRejectCount, 0);
assert.strictEqual(collection.summary.mergeQueueBlockCount, 0);
assert.strictEqual(collection.summary.mergeQueueRecordOnlyCount, 0);
assert.strictEqual(collection.summary.promotedPatchCandidateCount, 0);
assert.strictEqual(collection.reviewerLanePlan.summary.taskCount, 1);
assert.strictEqual(collection.patchStackPlan.summary.jobCount, 1);
assert.strictEqual(collection.queueOverlay.summary.entryCount, 1);
assert.ok(await exists(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json')));
assert.ok(await exists(path.join(collection.outDir, 'merge-index.json')));
assert.ok(await exists(path.join(collection.outDir, 'hierarchical-merge-queue.json')));
assert.ok(await exists(path.join(collection.outDir, 'merge-admission.json')));
assert.ok(await exists(path.join(collection.outDir, 'reviewer-lane-plan.json')));
assert.ok(await exists(path.join(collection.outDir, 'patch-stack-plan.json')));
assert.ok(await exists(path.join(collection.outDir, 'queue-overlay.json')));
assert.ok(collection.artifacts);
assert.strictEqual(collection.artifacts.hierarchicalMergeQueuePath, path.join(collection.outDir, 'hierarchical-merge-queue.json'));
assert.strictEqual(collection.artifacts.counts.mergeQueuePromoteCount, collection.hierarchicalMergeQueue.summary.promoteCount);
assert.strictEqual(collection.artifacts.counts.mergeQueueApplyLocalCount, collection.hierarchicalMergeQueue.summary.applyLocalCount);
assert.strictEqual(collection.artifacts.counts.promotedPatchCandidateCount, 0);
assert.ok(await exists(collection.artifacts.hierarchicalMergeQueuePath));
const collectedMergeBundle = JSON.parse(await fs.readFile(path.join(collection.outDir, 'needs-human-port', 'runtime-runtime-action', 'merge.json'), 'utf8'));
assert.strictEqual(collectedMergeBundle.branchName, 'codex/swarm-slice/runtime-runtime-action');

const queueMetadataRunDir = path.join(tmp, 'queue-metadata-run');
await writeSyntheticMergeBundle(queueMetadataRunDir, 'apply-local', {
  disposition: 'auto-mergeable',
  autoMergeable: true
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'queue-local', {
  disposition: 'auto-mergeable',
  autoMergeable: true,
  riskLevel: 'high'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'promote');
await writeSyntheticMergeBundle(queueMetadataRunDir, 'rerun', {
  disposition: 'auto-mergeable',
  autoMergeable: true,
  staleAgainstHead: true
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'reject', {
  status: 'failed',
  mergeReadiness: 'rejected',
  disposition: 'rejected'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'block', {
  status: 'blocked',
  mergeReadiness: 'blocked',
  disposition: 'blocked'
});
await writeSyntheticMergeBundle(queueMetadataRunDir, 'record-only', {
  changedPaths: [],
  mergeReadiness: 'discovery-only',
  disposition: 'discovery-only'
});
const queueMetadataCollection = await collectCodexSwarmRun({
  run: queueMetadataRunDir,
  cwd: tmp,
  outDir: path.join(tmp, 'queue-metadata-collection'),
  checkStale: false
});
assert.deepStrictEqual({
  applyLocalCount: queueMetadataCollection.summary.mergeQueueApplyLocalCount,
  queueLocalCount: queueMetadataCollection.summary.mergeQueueQueueLocalCount,
  promoteCount: queueMetadataCollection.summary.mergeQueuePromoteCount,
  rerunCount: queueMetadataCollection.summary.mergeQueueRerunCount,
  rejectCount: queueMetadataCollection.summary.mergeQueueRejectCount,
  blockCount: queueMetadataCollection.summary.mergeQueueBlockCount,
  recordOnlyCount: queueMetadataCollection.summary.mergeQueueRecordOnlyCount
}, {
  applyLocalCount: 1,
  queueLocalCount: 0,
  promoteCount: 2,
  rerunCount: 1,
  rejectCount: 1,
  blockCount: 1,
  recordOnlyCount: 1
});
assert.deepStrictEqual({
  applyLocalCount: queueMetadataCollection.artifacts.counts.mergeQueueApplyLocalCount,
  queueLocalCount: queueMetadataCollection.artifacts.counts.mergeQueueQueueLocalCount,
  promoteCount: queueMetadataCollection.artifacts.counts.mergeQueuePromoteCount,
  rerunCount: queueMetadataCollection.artifacts.counts.mergeQueueRerunCount,
  rejectCount: queueMetadataCollection.artifacts.counts.mergeQueueRejectCount,
  blockCount: queueMetadataCollection.artifacts.counts.mergeQueueBlockCount,
  recordOnlyCount: queueMetadataCollection.artifacts.counts.mergeQueueRecordOnlyCount
}, {
  applyLocalCount: 1,
  queueLocalCount: 0,
  promoteCount: 2,
  rerunCount: 1,
  rejectCount: 1,
  blockCount: 1,
  recordOnlyCount: 1
});
const queueMetadataCollectionJson = JSON.parse(await fs.readFile(path.join(queueMetadataCollection.outDir, 'collection.json'), 'utf8'));
assert.strictEqual(queueMetadataCollectionJson.summary.mergeQueueBlockCount, 1);
assert.strictEqual(queueMetadataCollectionJson.summary.mergeQueueRecordOnlyCount, 1);

const browserRun = await runCodexSwarm(browserPlan, {
  outDir: path.join(tmp, 'browser-run'),
  cwd: tmp,
  dryRun: false,
  executor: async (input) => {
    assert.strictEqual(input.resourceAllocation.browser.port, '4177');
    assert.strictEqual(input.env.PORT, '4177');
    assert.ok(await exists(input.resourceAllocation.browser.profileDir));
    await fs.writeFile(input.paths.lastMessagePath, 'browser done\n');
    return { exitCode: 0, changedPaths: ['e2e.mjs'], lastMessage: 'browser done' };
  }
});
assert.strictEqual(browserRun.ok, true);
const browserResourcePath = browserRun.run.results[0].evidencePaths.find((entry) => entry.endsWith('resource-allocation.json'));
const browserResourceEvidence = JSON.parse(await fs.readFile(browserResourcePath, 'utf8'));
assert.strictEqual(browserResourceEvidence.browser.port, '4177');

const applyRepo = path.join(tmp, 'apply-repo');
await fs.mkdir(path.join(applyRepo, 'src'), { recursive: true });
await fs.writeFile(path.join(applyRepo, 'src', 'apply.ts'), 'old\n');
await execFileP('git', ['init'], { cwd: applyRepo });
const readyDir = path.join(tmp, 'ready-collection', 'ready-to-apply', 'apply-job');
await fs.mkdir(readyDir, { recursive: true });
await fs.writeFile(path.join(readyDir, 'changes.patch'), [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'));
await fs.writeFile(path.join(readyDir, 'merge.json'), JSON.stringify({
  ...mergeBundle,
  jobId: 'apply-job',
  taskId: 'apply-task',
  status: 'verified',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  riskLevel: 'low',
  autoMergeable: true,
  changedPaths: ['src/apply.ts'],
  changedRegions: [],
  ownedFilesTouched: ['src/apply.ts'],
  patchPath: 'changes.patch',
  commandsPassed: [],
  commandsFailed: [],
  queueItemIds: ['apply-task'],
  staleAgainstHead: false,
  reasons: []
}, null, 2) + '\n');
const applyDryRun = await applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo });
assert.strictEqual(applyDryRun.ok, true);
assert.strictEqual(applyDryRun.dryRun, true);
assert.strictEqual(applyDryRun.summary.checked, 1);
assert.strictEqual(applyDryRun.entries[0].dryRun, true);
assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const patchScore = await scoreCodexSwarmPatches({
  collection: path.join(tmp, 'ready-collection'),
  cwd: applyRepo,
  workspaceIncludes: ['src'],
  focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
});
assert.strictEqual(patchScore.ok, true);
assert.strictEqual(patchScore.summary['accepted-clean'], 1);
assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const cliScore = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'score',
  '--collection',
  path.join(tmp, 'ready-collection'),
  '--include',
  'src',
  '--focused-command',
  "node -e \"const fs=require('fs'); const label='a,b'; if(label !== 'a,b' || fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: applyRepo });
assert.strictEqual(JSON.parse(cliScore.stdout).ok, true);
const cliHelp = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'help'
], { cwd: tmp });
assert.ok(cliHelp.stdout.includes('Default run auto-drain is autonomous coordinator drain work.'));
assert.ok(cliHelp.stdout.includes('frontier.swarm.coordinator-agent-drain-work contract'));
assert.ok(cliHelp.stdout.includes('--auto-drain-commit (after required gates pass, run auto-drain creates audited coordinator commits tied to queue item ids and the decision ledger)'));
assert.ok(cliHelp.stdout.includes('Terminal coordinator decisions such as applied, committed, checked,'));
assert.ok(cliHelp.stdout.includes('queue outcomes, not\nhuman blockers.'));
assert.ok(cliHelp.stdout.includes('--no-auto-drain (raw worker diagnostics only; skips coordinator drain-work)'));
assert.ok(cliHelp.stdout.includes('--focused-command <cmd> --global-command <cmd> (required auto-drain apply/commit gates)'));
await assert.rejects(
  () => applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo, dryRun: false }),
  /dirty worktree/
);

const autonomousRepo = await createApplyFixtureRepo(tmp, 'autonomous-apply-repo');
const autonomousResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: autonomousRepo,
  outDir: path.join(tmp, 'autonomous-apply-out'),
  focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
});
assert.strictEqual(autonomousResult.ok, true);
assert.strictEqual(autonomousResult.dryRun, false);
assert.strictEqual(autonomousResult.summary.applied, 1);
assert.strictEqual(autonomousResult.decisions[0].status, 'applied');
assert.strictEqual(autonomousResult.decisions[0].lockScope, 'path');
assert.deepStrictEqual(autonomousResult.decisions[0].lockKeys, ['path:src/apply.ts']);
assert.deepStrictEqual(autonomousResult.lockKeys, ['path:src/apply.ts']);
assert.strictEqual(autonomousResult.lockScopeCounts.path, 1);
assert.strictEqual(autonomousResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(await fs.readFile(path.join(autonomousRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual(await exists(autonomousResult.lockPath), false);
const autonomousDecisionLines = (await fs.readFile(autonomousResult.decisionLogPath, 'utf8')).trim().split(/\r?\n/);
assert.strictEqual(autonomousDecisionLines.length, 1);
const autonomousDecisionLogEntry = JSON.parse(autonomousDecisionLines[0]);
assert.strictEqual(autonomousDecisionLogEntry.jobId, 'apply-job');
assert.deepStrictEqual(autonomousDecisionLogEntry.lockKeys, ['path:src/apply.ts']);
const autonomousApplyArtifact = JSON.parse(await fs.readFile(path.join(tmp, 'autonomous-apply-out', 'autonomous-apply.json'), 'utf8'));
assert.deepStrictEqual(autonomousApplyArtifact.lockKeys, ['path:src/apply.ts']);

const autonomousConflictRepo = await createApplyFixtureRepo(tmp, 'autonomous-conflict-repo');
await fs.writeFile(path.join(autonomousConflictRepo, 'src', 'apply.ts'), 'new\n');
await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: autonomousConflictRepo });
await execFileP('git', ['commit', '-m', 'Already applied fixture'], { cwd: autonomousConflictRepo });
const autonomousConflictResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: autonomousConflictRepo,
  outDir: path.join(tmp, 'autonomous-conflict-out')
});
assert.strictEqual(autonomousConflictResult.ok, false);
assert.strictEqual(autonomousConflictResult.summary['conflict-blocked'], 1);
assert.strictEqual(autonomousConflictResult.decisions[0].status, 'conflict-blocked');
assert.strictEqual(autonomousConflictResult.queueOverlay.entries[0].status, 'stale-against-head');
assert.strictEqual(autonomousConflictResult.queueOverlay.entries[0].mergeReadiness, 'stale-against-head');
assert.strictEqual(autonomousConflictResult.queueOverlay.entries[0].disposition, 'stale-against-head');

const rollbackRepo = await createApplyFixtureRepo(tmp, 'autonomous-rollback-repo');
const rollbackResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: rollbackRepo,
  outDir: path.join(tmp, 'autonomous-rollback-out'),
  focusedCommands: [{ name: 'reject-new', command: 'node', args: ['-e', 'process.exit(1)'] }]
});
assert.strictEqual(rollbackResult.ok, true);
assert.strictEqual(rollbackResult.summary.rejected, 1);
assert.strictEqual(rollbackResult.decisions[0].status, 'rejected');
assert.match(rollbackResult.decisions[0].reason, /verification failed: reject-new/);
assert.strictEqual(rollbackResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(await fs.readFile(path.join(rollbackRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: rollbackRepo })).stdout, '');

const autonomousStaleCommitRepo = await createApplyFixtureRepo(tmp, 'autonomous-stale-commit-repo');
const autonomousStaleCommitResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: autonomousStaleCommitRepo,
  outDir: path.join(tmp, 'autonomous-stale-commit-out'),
  commit: true,
  focusedCommands: [{
    name: 'advance-head-before-commit',
    command: process.execPath,
    args: ['-e', [
      "const fs = require('fs');",
      "const cp = require('child_process');",
      "fs.writeFileSync('src/head.txt', 'advanced\\n');",
      "cp.execFileSync('git', ['add', '--', 'src/head.txt'], { stdio: 'inherit' });",
      "cp.execFileSync('git', ['commit', '-m', 'Advance head before autonomous commit'], { stdio: 'inherit' });"
    ].join(' ')]
  }]
});
const autonomousStaleCommitDecision = autonomousStaleCommitResult.decisions[0];
assert.strictEqual(autonomousStaleCommitResult.ok, false);
assert.strictEqual(autonomousStaleCommitResult.summary.rerun, 1);
assert.strictEqual(autonomousStaleCommitDecision.status, 'rerun');
assert.strictEqual(autonomousStaleCommitDecision.reason, 'repository head changed before commit; patch rolled back for rerun');
assert.match(autonomousStaleCommitDecision.headBefore, /^[0-9a-f]{40}$/);
assert.match(autonomousStaleCommitDecision.headAfter, /^[0-9a-f]{40}$/);
assert.notStrictEqual(autonomousStaleCommitDecision.headAfter, autonomousStaleCommitDecision.headBefore);
assert.strictEqual(autonomousStaleCommitDecision.commit, undefined);
assert.strictEqual(autonomousStaleCommitResult.queueOverlay.entries[0].status, 'stale-against-head');
assert.strictEqual(autonomousStaleCommitResult.queueOverlay.entries[0].mergeReadiness, 'stale-against-head');
assert.strictEqual(autonomousStaleCommitResult.queueOverlay.entries[0].disposition, 'stale-against-head');
assert.strictEqual(await fs.readFile(path.join(autonomousStaleCommitRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual(await fs.readFile(path.join(autonomousStaleCommitRepo, 'src', 'head.txt'), 'utf8'), 'advanced\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autonomousStaleCommitRepo })).stdout, '');
assert.strictEqual((await execFileP('git', ['rev-parse', 'HEAD'], { cwd: autonomousStaleCommitRepo })).stdout.trim(), autonomousStaleCommitDecision.headAfter);
const autonomousStaleCommitLog = (await execFileP('git', ['log', '-1', '--format=%B'], { cwd: autonomousStaleCommitRepo })).stdout;
assert.ok(autonomousStaleCommitLog.includes('Advance head before autonomous commit'));
assert.ok(!autonomousStaleCommitLog.includes('Autonomous apply: apply-task'));

const cliAutonomousRepo = await createApplyFixtureRepo(tmp, 'cli-autonomous-apply-repo');
const cliAutonomous = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'autonomous-apply',
  '--collection',
  path.join(tmp, 'ready-collection'),
  '--outDir',
  path.join(tmp, 'cli-autonomous-apply-out'),
  '--focused-command',
  "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: cliAutonomousRepo });
const cliAutonomousResult = JSON.parse(cliAutonomous.stdout);
assert.strictEqual(cliAutonomousResult.ok, true);
assert.strictEqual(cliAutonomousResult.summary.applied, 1);
assert.strictEqual(await fs.readFile(path.join(cliAutonomousRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');

const autoDrainRepo = await createApplyFixtureRepo(tmp, 'auto-drain-run-repo');
const autoDrainOutDir = path.join(autoDrainRepo, 'agent-runs', 'auto-drain-run');
const autoDrainPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply'],
      verification: [{
        name: 'worker-sees-new',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainRun = await runCodexSwarm(autoDrainPlan, {
  outDir: autoDrainOutDir,
  cwd: autoDrainRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 3,
    focusedCommands: [{ name: 'coordinator-sees-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'auto drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'auto drained' };
  }
});
assert.strictEqual(autoDrainRun.ok, true);
assert.strictEqual(autoDrainRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.summary.conflictBlockedCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.summary.humanBlockedCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].status, 'applied');
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].lockScope, 'semantic');
assert.deepStrictEqual(autoDrainRun.autoDrain.iterations[0].apply.decisions[0].lockKeys, ['region:src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainRun.autoDrain.lockKeys, ['region:src/apply.ts#apply']);
assert.strictEqual(autoDrainRun.autoDrain.lockScopeCounts.semantic, 1);
assert.strictEqual(await fs.readFile(path.join(autoDrainRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain-groups-01.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'reviewer-lane-plan.json')));
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'patch-stack-plan.json')));
const autoDrainResults = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'swarm-results.json'), 'utf8'));
const autoDrainDashboard = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainDashboard.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.kind, 'frontier.swarm-codex.dashboard-queue-metadata');
assert.strictEqual(autoDrainDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.applyLocalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.queueLocalCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.promoteCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.rerunCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.rejectCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.blockCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.currentHeadConflictCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.deferredCoordinatorCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.deferredPromoteCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.recordOnlyCount, 0);
assert.deepStrictEqual(autoDrainDashboard.queueHealth, autoDrainDashboard.queueMetadata.queueHealth);
assert.deepStrictEqual(autoDrainDashboard.humanQuestions, autoDrainDashboard.queueMetadata.humanQuestions);
assert.deepStrictEqual(autoDrainDashboard.operatorSummary, autoDrainDashboard.queueMetadata.operatorSummary);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.kind, 'frontier.swarm-codex.dashboard-queue-health');
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.leaseCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.lockKeyCount, 1);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.queueHealth.lockScopeCounts, { semantic: 1, path: 0, repo: 0 });
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.localQueueCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.promotedCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.appliedDecisionCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorDrainWorkCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorDrainAssignmentCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorDrainTerminalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorDrainNonTerminalCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorDrainAppliedCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.staleOrRerunCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.currentHeadConflictCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.deferredCoordinatorCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.deferredPromoteCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.coordinatorReviewCount, autoDrainRun.autoDrainArtifacts.reviewer.taskCount);
assert.ok(!Object.hasOwn(autoDrainDashboard.queueMetadata.queueHealth, 'humanReviewCount'));
assert.ok(!Object.hasOwn(autoDrainDashboard.queueMetadata.queueHealth, 'humanPortCount'));
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.kind, 'frontier.swarm-codex.dashboard-human-questions');
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.count, 0);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.jobIds, []);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.kind, 'frontier.swarm-codex.dashboard-operator-queue');
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.status, 'ok');
assert.match(autoDrainDashboard.queueMetadata.operatorSummary.headline, /1 autonomous decision applied/);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.currentHeadConflicts, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.deferredCoordinatorQueues, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.deferredPromoteQueues, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
const autoDrainOperatorCards = new Map(autoDrainDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainOperatorCards.get('applied-decisions').value, 1);
assert.strictEqual(autoDrainOperatorCards.get('applied-decisions').status, 'ok');
assert.strictEqual(autoDrainOperatorCards.get('coordination-debt').value, 0);
assert.strictEqual(autoDrainOperatorCards.get('coordination-debt').status, 'ok');
assert.strictEqual(autoDrainOperatorCards.get('stale-rerun').value, 0);
assert.strictEqual(autoDrainOperatorCards.get('true-blockers').value, 0);
assert.strictEqual(autoDrainOperatorCards.get('true-blockers').status, 'ok');
const autoDrainArtifact = JSON.parse(await fs.readFile(path.join(autoDrainOutDir, 'auto-drain', 'auto-drain.json'), 'utf8'));
assert.deepStrictEqual(autoDrainArtifact.lockKeys, ['region:src/apply.ts#apply']);
assert.strictEqual(autoDrainArtifact.iterations[0].lockScopeCounts.semantic, 1);
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts, autoDrainRun.autoDrain.artifacts);
assert.deepStrictEqual(autoDrainResults.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
assert.deepStrictEqual(autoDrainDashboard.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.collectionCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.admissionCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.mergeQueuePlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.mergeQueue.promoteCount, 0);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.paths.mergeQueues, autoDrainRun.autoDrainArtifacts.mergeQueue.paths);
assert.ok(await exists(autoDrainRun.autoDrainArtifacts.mergeQueue.paths[0]));
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.coordinatorAgentDrainWork, autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.applyLocalCount, autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.appliedCount);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.queueLocalCount, autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.queuedCount);
assert.strictEqual(autoDrainDashboard.queueMetadata.actionCounts.promoteCount, autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.escalatedCount);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.reviewerPlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.patchStackPlanCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.iterations[0].grouping.summary.readyCount, 1);
assert.strictEqual(typeof autoDrainRun.autoDrainArtifacts.generatedAt, 'number');
const autoDrainArtifactIteration = autoDrainRun.autoDrainArtifacts.iterations[0];
const autoDrainCoordinatorDrainPath = autoDrainRun.autoDrain.iterations[0].coordinatorAgentDrainPath;
const autoDrainCoordinatorDrainWorkPath = autoDrainRun.autoDrain.iterations[0].coordinatorAgentDrainWorkPath;
assert.ok(await exists(autoDrainCoordinatorDrainPath));
assert.ok(await exists(autoDrainCoordinatorDrainWorkPath));
assert.strictEqual(autoDrainArtifactIteration.coordinatorAgentDrainPath, autoDrainCoordinatorDrainPath);
assert.strictEqual(autoDrainArtifactIteration.coordinatorAgentDrainWorkPath, autoDrainCoordinatorDrainWorkPath);
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.paths, [autoDrainCoordinatorDrainPath]);
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.paths, [autoDrainCoordinatorDrainWorkPath]);
assert.deepStrictEqual(autoDrainDashboard.autoDrainArtifacts.coordinatorAgent.paths, [autoDrainCoordinatorDrainPath]);
assert.deepStrictEqual(autoDrainDashboard.autoDrainArtifacts.coordinatorAgentDrainWork.paths, [autoDrainCoordinatorDrainWorkPath]);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.paths.coordinatorAgentDrainWork, [autoDrainCoordinatorDrainWorkPath]);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.count, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.assignmentCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.selectedCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.deferredCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.promoteCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgent.queueLocalCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.coordinatorAgentDrainCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.count, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.assignmentCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.terminalCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.nonTerminalCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.promotedWorkCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.coordinatorAgentDrainWork.appliedCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.coordinatorAgentDrainWorkCount, 1);
const autoDrainCoordinatorDrainArtifact = JSON.parse(await fs.readFile(autoDrainCoordinatorDrainPath, 'utf8'));
const autoDrainCoordinatorDrainWorkArtifact = JSON.parse(await fs.readFile(autoDrainCoordinatorDrainWorkPath, 'utf8'));
assert.strictEqual(autoDrainCoordinatorDrainArtifact.kind, FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND);
assert.strictEqual(autoDrainCoordinatorDrainWorkArtifact.kind, 'frontier.swarm.coordinator-agent-drain-work');
assert.strictEqual(autoDrainCoordinatorDrainArtifact.workArtifactId, autoDrainCoordinatorDrainWorkArtifact.id);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.workArtifactPath, autoDrainCoordinatorDrainWorkPath);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.iteration, 1);
assert.deepStrictEqual(autoDrainCoordinatorDrainArtifact.readyJobIds, [autoDrainRun.run.results[0].jobId]);
assert.deepStrictEqual(autoDrainCoordinatorDrainArtifact.admittedJobIds, [autoDrainRun.run.results[0].jobId]);
assert.deepStrictEqual(autoDrainCoordinatorDrainArtifact.deferredJobIds, []);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.summary.assignmentCount, 1);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.summary.selectedCount, 1);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.summary.deferredCount, 0);
assert.strictEqual(autoDrainCoordinatorDrainArtifact.summary.applyLocalCount, 1);
const autoDrainCoordinatorDrainAssignment = autoDrainCoordinatorDrainArtifact.assignments[0];
assert.strictEqual(autoDrainCoordinatorDrainAssignment.jobId, autoDrainRun.run.results[0].jobId);
assert.strictEqual(autoDrainCoordinatorDrainAssignment.taskId, 'apply-task');
assert.strictEqual(autoDrainCoordinatorDrainAssignment.queueAction, 'apply-local');
assert.strictEqual(autoDrainCoordinatorDrainAssignment.decision, 'selected');
assert.strictEqual(autoDrainCoordinatorDrainAssignment.selected, true);
assert.deepStrictEqual(autoDrainCoordinatorDrainAssignment.queueItemIds, ['apply-task']);
assert.deepStrictEqual(autoDrainCoordinatorDrainAssignment.changedPaths, ['src/apply.ts']);
assert.deepStrictEqual(autoDrainCoordinatorDrainAssignment.changedRegions, ['src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainCoordinatorDrainAssignment.serializesAfterJobIds, []);
assert.deepStrictEqual(autoDrainCoordinatorDrainAssignment.leaderJobIds, [autoDrainRun.run.results[0].jobId]);
assert.strictEqual(autoDrainCoordinatorDrainAssignment.selectionReason, 'ready-local-drain-leader');
assert.ok(autoDrainCoordinatorDrainAssignment.reasons.includes('coordinator-agent-drain-selected'));
assert.strictEqual(autoDrainCoordinatorDrainWorkArtifact.summary.assignmentCount, 1);
assert.strictEqual(autoDrainCoordinatorDrainWorkArtifact.summary.terminalCount, 1);
assert.strictEqual(autoDrainCoordinatorDrainWorkArtifact.summary.appliedCount, 1);
assert.strictEqual(autoDrainCoordinatorDrainWorkArtifact.summary.promotedWorkCount, 0);
assert.deepStrictEqual(autoDrainCoordinatorDrainWorkArtifact.assignments[0].queueItemIds, ['apply-task']);
assert.deepStrictEqual(autoDrainCoordinatorDrainWorkArtifact.terminalDecisions[0].queueItemIds, ['apply-task']);
assert.strictEqual(autoDrainDashboard.autoDrain.summary.remainingReadyCount, 0);
assert.deepStrictEqual(autoDrainDashboard.autoDrain.terminalJobIds, [autoDrainCoordinatorDrainAssignment.jobId]);
assert.deepStrictEqual(autoDrainDashboard.autoDrain.blockedJobIds, []);
assert.strictEqual(autoDrainDashboard.autoDrain.iterations[0].postApplyCollection.buckets['ready-to-apply'].length, 0);
assert.strictEqual(autoDrainDashboard.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainDashboard.autoDrain.summary.conflictBlockedCount, 0);
assert.strictEqual(autoDrainDashboard.autoDrain.summary.humanBlockedCount, 0);
assert.deepStrictEqual({
  remainingReady: autoDrainDashboard.autoDrain.summary.remainingReadyCount,
  activeQueues: autoDrainDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount,
  leases: autoDrainDashboard.queueMetadata.queueHealth.leaseCount,
  localQueued: autoDrainDashboard.queueMetadata.queueHealth.localQueueCount,
  promoted: autoDrainDashboard.queueMetadata.queueHealth.promotedCount,
  staleOrRerun: autoDrainDashboard.queueMetadata.queueHealth.staleOrRerunCount,
  trueBlockers: autoDrainDashboard.queueMetadata.queueHealth.trueBlockerCount,
  humanQuestions: autoDrainDashboard.humanQuestions.count
}, {
  remainingReady: 0,
  activeQueues: 0,
  leases: 0,
  localQueued: 0,
  promoted: 0,
  staleOrRerun: 0,
  trueBlockers: 0,
  humanQuestions: 0
});
assert.strictEqual(autoDrainArtifactIteration.hierarchicalMergeQueuePath, path.join(autoDrainOutDir, 'auto-drain', 'collection-01', 'hierarchical-merge-queue.json'));
assert.ok(autoDrainRun.autoDrainArtifacts.mergeQueue.paths.includes(autoDrainArtifactIteration.hierarchicalMergeQueuePath));
assert.strictEqual(autoDrainArtifactIteration.mergeQueueApplyLocalCount, autoDrainRun.autoDrainArtifacts.mergeQueue.applyLocalCount);
assert.strictEqual(autoDrainArtifactIteration.mergeQueuePromoteCount, autoDrainRun.autoDrainArtifacts.mergeQueue.promoteCount);
assert.ok(await exists(autoDrainArtifactIteration.hierarchicalMergeQueuePath));

const autoDrainCommitRepo = await createApplyFixtureRepo(tmp, 'auto-drain-commit-run-repo');
const autoDrainCommitOutDir = path.join(tmp, 'auto-drain-commit-run-out');
const autoDrainCommitRun = await runCodexSwarm(autoDrainPlan, {
  outDir: autoDrainCommitOutDir,
  cwd: autoDrainCommitRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainCommitOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    commit: true,
    maxIterations: 2,
    focusedCommands: [{
      name: 'coordinator-sees-new',
      command: 'node',
      args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"]
    }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'commit auto drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'commit auto drained' };
  }
});
assert.strictEqual(autoDrainCommitRun.ok, true);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.committedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.verificationGateCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.requiredVerificationGateCount, 1);
const autoDrainCommitDecision = autoDrainCommitRun.autoDrain.iterations[0].apply.decisions[0];
assert.strictEqual(autoDrainCommitDecision.status, 'committed');
assert.strictEqual(autoDrainCommitRun.autoDrain.iterations[0].apply.summary.committed, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.iterations[0].apply.summary.gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.iterations[0].apply.summary.verificationGateCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrain.iterations[0].apply.summary.requiredVerificationGateCount, 1);
assert.deepStrictEqual(autoDrainCommitDecision.verification, {
  planned: 1,
  run: 1,
  required: 1,
  passed: 1,
  failed: 0,
  names: ['coordinator-sees-new'],
  passedNames: ['coordinator-sees-new'],
  failedNames: []
});
assert.match(autoDrainCommitDecision.headAfter, /^[0-9a-f]{40}$/);
assert.strictEqual(autoDrainCommitDecision.commit, autoDrainCommitDecision.headAfter);
assert.notStrictEqual(autoDrainCommitDecision.headAfter, autoDrainCommitDecision.headBefore);
assert.strictEqual(autoDrainCommitDecision.jobId, autoDrainCommitRun.run.results[0].jobId);
assert.deepStrictEqual(autoDrainCommitDecision.queueItemIds, ['apply-task']);
assert.strictEqual(await fs.readFile(path.join(autoDrainCommitRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autoDrainCommitRepo })).stdout, '');
assert.strictEqual((await execFileP('git', ['rev-parse', 'HEAD'], { cwd: autoDrainCommitRepo })).stdout.trim(), autoDrainCommitDecision.headAfter);
const autoDrainCommitLog = (await execFileP('git', ['log', '-1', '--format=%H%n%B'], { cwd: autoDrainCommitRepo })).stdout;
assert.ok(autoDrainCommitLog.includes(autoDrainCommitDecision.headAfter));
assert.ok(autoDrainCommitLog.includes('Autonomous apply: apply-task'));
assert.ok(autoDrainCommitLog.includes(`Decision: ${FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND}@1`));
assert.ok(autoDrainCommitLog.includes('Status: committed'));
assert.ok(autoDrainCommitLog.includes('Reason: patch committed and verification passed'));
assert.ok(autoDrainCommitLog.includes(`Job: ${autoDrainCommitDecision.jobId}`));
assert.ok(autoDrainCommitLog.includes('Task: apply-task'));
assert.ok(autoDrainCommitLog.includes('Queue items:\n- apply-task'));
assert.ok(autoDrainCommitLog.includes('Lock scope: semantic'));
assert.ok(autoDrainCommitLog.includes('Lock keys:\n- region:src/apply.ts#apply'));
assert.ok(!autoDrainCommitLog.includes('Apply swarm bundle'));
const autoDrainCommitApplyArtifact = JSON.parse(await fs.readFile(path.join(autoDrainCommitOutDir, 'auto-drain', 'apply-01', 'autonomous-apply.json'), 'utf8'));
assert.strictEqual(autoDrainCommitApplyArtifact.summary.committed, 1);
assert.strictEqual(autoDrainCommitApplyArtifact.summary.gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitApplyArtifact.summary.verificationGateCount, 1);
assert.strictEqual(autoDrainCommitApplyArtifact.summary.requiredVerificationGateCount, 1);
assert.strictEqual(autoDrainCommitApplyArtifact.decisions[0].status, 'committed');
assert.strictEqual(autoDrainCommitApplyArtifact.decisions[0].headAfter, autoDrainCommitDecision.headAfter);
assert.strictEqual(autoDrainCommitApplyArtifact.decisions[0].commit, autoDrainCommitDecision.headAfter);
assert.deepStrictEqual(autoDrainCommitApplyArtifact.decisions[0].verification, autoDrainCommitDecision.verification);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.iterations[0].committedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.iterations[0].gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.iterations[0].verificationGateCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.iterations[0].requiredVerificationGateCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.summary.committedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.summary.gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.summary.verificationGateCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.summary.requiredVerificationGateCount, 1);

const autoDrainCommitRerunRepo = await createApplyFixtureRepo(tmp, 'auto-drain-commit-rerun-repo');
const autoDrainCommitRerunPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-commit-rerun',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-first-commit-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply'],
      verification: [{
        name: 'worker-sees-first-commit',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='first-commit\\n') process.exit(1);"]
      }]
    }, {
      id: 'apply-second-commit-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply'],
      verification: [{
        name: 'worker-sees-second-commit',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second-commit\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainCommitRerunOutDir = path.join(tmp, 'auto-drain-commit-rerun-run');
const autoDrainCommitRerunRun = await runCodexSwarm(autoDrainCommitRerunPlan, {
  outDir: autoDrainCommitRerunOutDir,
  cwd: autoDrainCommitRerunRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainCommitRerunOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    commit: true,
    maxIterations: 3
  },
  executor: async (input) => {
    const value = input.job.taskId === 'apply-first-commit-task' ? 'first-commit\n' : 'second-commit\n';
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), value);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed\n`);
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: `${input.job.taskId} changed` };
  }
});
assert.strictEqual(autoDrainCommitRerunRun.ok, true);
assert.strictEqual(autoDrainCommitRerunRun.autoDrain.iterations.length, 2);
assert.strictEqual(autoDrainCommitRerunRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainCommitRerunRun.autoDrain.summary.remainingReadyCount, 0);
assert.strictEqual(autoDrainCommitRerunRun.autoDrain.summary.committedDecisionCount, 1);
const autoDrainCommitRerunFirstIteration = autoDrainCommitRerunRun.autoDrain.iterations[0];
const autoDrainCommitRerunSecondIteration = autoDrainCommitRerunRun.autoDrain.iterations[1];
assert.strictEqual(autoDrainCommitRerunFirstIteration.apply.decisions[0].status, 'committed');
assert.strictEqual(autoDrainCommitRerunFirstIteration.deferredJobIds.length, 1);
assert.strictEqual(autoDrainCommitRerunSecondIteration.apply, undefined);
assert.deepStrictEqual(autoDrainCommitRerunSecondIteration.readyJobIds, []);
assert.strictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.summary.assignmentCount, 1);
assert.strictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.summary.terminalCount, 1);
assert.strictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.summary.nonTerminalCount, 0);
assert.strictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.summary.rerunCount, 1);
assert.deepStrictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.terminalDecisions.map((decision) => decision.decision), ['rerun']);
assert.deepStrictEqual(autoDrainCommitRerunSecondIteration.coordinatorAgentDrainWork.terminalDecisions.map((decision) => decision.jobId), autoDrainCommitRerunFirstIteration.deferredJobIds);
assert.strictEqual(autoDrainCommitRerunRun.autoDrainArtifacts.summary.coordinatorAgentDrainWorkCount, 2);
assert.strictEqual(autoDrainCommitRerunRun.autoDrainArtifacts.coordinatorAgentDrainWork.rerunCount, 1);
assert.strictEqual(await fs.readFile(path.join(autoDrainCommitRerunRepo, 'src', 'apply.ts'), 'utf8'), 'first-commit\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autoDrainCommitRerunRepo })).stdout, '');

const autoDrainPromotedDebtRepo = path.join(tmp, 'auto-drain-promoted-debt-repo');
await fs.mkdir(path.join(autoDrainPromotedDebtRepo, 'src'), { recursive: true });
await execFileP('git', ['init'], { cwd: autoDrainPromotedDebtRepo });
await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: autoDrainPromotedDebtRepo });
await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: autoDrainPromotedDebtRepo });
await fs.writeFile(path.join(autoDrainPromotedDebtRepo, 'src', 'shared.ts'), 'old\n');
await fs.writeFile(path.join(autoDrainPromotedDebtRepo, 'src', 'one.ts'), 'old-one\n');
await fs.writeFile(path.join(autoDrainPromotedDebtRepo, 'src', 'two.ts'), 'old-two\n');
await execFileP('git', ['add', '--', 'src/shared.ts', 'src/one.ts', 'src/two.ts'], { cwd: autoDrainPromotedDebtRepo });
await execFileP('git', ['commit', '-m', 'Initial promoted debt fixture'], { cwd: autoDrainPromotedDebtRepo });
const autoDrainPromotedDebtPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-promoted-debt',
    lanes: [{ id: 'promote', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'promote-first-task',
      lane: 'promote',
      ownedFiles: ['src/shared.ts', 'src/one.ts'],
      verification: [{
        name: 'worker-sees-first-promote',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/shared.ts','utf8')!=='first\\n') process.exit(1); if(fs.readFileSync('src/one.ts','utf8')!=='first-one\\n') process.exit(1);"]
      }]
    }, {
      id: 'promote-second-task',
      lane: 'promote',
      ownedFiles: ['src/shared.ts', 'src/two.ts'],
      verification: [{
        name: 'worker-sees-second-promote',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/shared.ts','utf8')!=='second\\n') process.exit(1); if(fs.readFileSync('src/two.ts','utf8')!=='second-two\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainPromotedDebtOutDir = path.join(tmp, 'auto-drain-promoted-debt-run');
const autoDrainPromotedDebtRun = await runCodexSwarm(autoDrainPromotedDebtPlan, {
  outDir: autoDrainPromotedDebtOutDir,
  cwd: autoDrainPromotedDebtRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainPromotedDebtOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    commit: true,
    maxReady: 1,
    maxIterations: 3
  },
  executor: async (input) => {
    const first = input.job.taskId === 'promote-first-task';
    const file = first ? 'src/one.ts' : 'src/two.ts';
    const sharedValue = first ? 'first\n' : 'second\n';
    const fileValue = first ? 'first-one\n' : 'second-two\n';
    await fs.writeFile(path.join(input.workspacePath, 'src', 'shared.ts'), sharedValue);
    await fs.writeFile(path.join(input.workspacePath, file), fileValue);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed promoted debt fixture\n`);
    return {
      exitCode: 0,
      changedPaths: ['src/shared.ts', file],
      lastMessage: `${input.job.taskId} changed promoted debt fixture`
    };
  }
});
assert.strictEqual(autoDrainPromotedDebtRun.ok, true);
assert.strictEqual(autoDrainPromotedDebtRun.autoDrain.iterations.length, 2);
const autoDrainPromotedDebtFirstIteration = autoDrainPromotedDebtRun.autoDrain.iterations[0];
const autoDrainPromotedDebtSecondIteration = autoDrainPromotedDebtRun.autoDrain.iterations[1];
assert.strictEqual(autoDrainPromotedDebtFirstIteration.coordinatorAgentDrain.summary.promoteCount, 2);
assert.strictEqual(autoDrainPromotedDebtFirstIteration.coordinatorAgentDrain.summary.selectedPromoteCount, 1);
assert.strictEqual(autoDrainPromotedDebtFirstIteration.coordinatorAgentDrain.summary.deferredPromoteCount, 1);
assert.strictEqual(autoDrainPromotedDebtFirstIteration.deferredJobIds.length, 1);
const autoDrainPromotedDeferredJobId = autoDrainPromotedDebtFirstIteration.deferredJobIds[0];
const autoDrainPromotedDeferredGrouping = autoDrainPromotedDebtFirstIteration.grouping.jobs.find((job) => job.jobId === autoDrainPromotedDeferredJobId);
assert.ok(autoDrainPromotedDeferredGrouping);
assert.strictEqual(autoDrainPromotedDeferredGrouping.placement, 'deferred');
assert.strictEqual(autoDrainPromotedDeferredGrouping.bucket, 'ready-to-apply');
assert.ok(autoDrainPromotedDeferredGrouping.bundlePath.endsWith('merge.json'));
assert.deepStrictEqual(autoDrainPromotedDeferredGrouping.queueItemIds, ['promote-second-task']);
const autoDrainPromotedDeferredWork = autoDrainPromotedDebtFirstIteration.coordinatorAgentDrainWork.metadata.deferredPromotedWork.find((entry) => entry.jobId === autoDrainPromotedDeferredJobId);
assert.ok(autoDrainPromotedDeferredWork);
assert.strictEqual(autoDrainPromotedDeferredWork.bundlePath, autoDrainPromotedDeferredGrouping.bundlePath);
assert.deepStrictEqual(autoDrainPromotedDeferredWork.queueItemIds, autoDrainPromotedDeferredGrouping.queueItemIds);
assert.deepStrictEqual(autoDrainPromotedDebtSecondIteration.readyJobIds, []);
assert.strictEqual(autoDrainPromotedDebtSecondIteration.apply, undefined);
assert.deepStrictEqual(autoDrainPromotedDebtSecondIteration.grouping.queueDebtJobIds, [autoDrainPromotedDeferredJobId]);
assert.strictEqual(autoDrainPromotedDebtSecondIteration.grouping.summary.queueDebtCount, 1);
const autoDrainPromotedDebtJob = autoDrainPromotedDebtSecondIteration.grouping.jobs.find((job) => job.jobId === autoDrainPromotedDeferredJobId);
assert.ok(autoDrainPromotedDebtJob);
assert.strictEqual(autoDrainPromotedDebtJob.reason, 'auto-drain-queue-debt');
assert.strictEqual(autoDrainPromotedDebtJob.bucket, 'stale-against-head');
assert.ok(autoDrainPromotedDebtJob.bundlePath.endsWith('merge.json'));
assert.deepStrictEqual(autoDrainPromotedDebtJob.queueItemIds, ['promote-second-task']);
assert.strictEqual(autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.summary.assignmentCount, 1);
assert.strictEqual(autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.summary.terminalCount, 1);
assert.strictEqual(autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.summary.rerunCount, 1);
assert.deepStrictEqual(autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.terminalDecisions.map((decision) => decision.jobId), [autoDrainPromotedDeferredJobId]);
assert.deepStrictEqual(autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.metadata.promotedQueueDebtJobIds, [autoDrainPromotedDeferredJobId]);
const autoDrainPromotedCarriedDebt = autoDrainPromotedDebtSecondIteration.coordinatorAgentDrainWork.metadata.carriedPromotedQueueDebt.find((entry) => entry.jobId === autoDrainPromotedDeferredJobId);
assert.ok(autoDrainPromotedCarriedDebt);
assert.strictEqual(autoDrainPromotedCarriedDebt.queueAction, 'rerun');
assert.strictEqual(autoDrainPromotedCarriedDebt.bundlePath, autoDrainPromotedDebtJob.bundlePath);
assert.deepStrictEqual(autoDrainPromotedCarriedDebt.queueItemIds, autoDrainPromotedDebtJob.queueItemIds);
assert.strictEqual(autoDrainPromotedDebtRun.autoDrainArtifacts.coordinatorAgentDrainWork.rerunCount, 1);
assert.strictEqual(await fs.readFile(path.join(autoDrainPromotedDebtRepo, 'src', 'shared.ts'), 'utf8'), 'first\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autoDrainPromotedDebtRepo })).stdout, '');

const cliAutoDrainCommitRepo = await createApplyFixtureRepo(tmp, 'cli-auto-drain-commit-run-repo');
const cliAutoDrainCommitOutDir = path.join(tmp, 'cli-auto-drain-commit-run-out');
const cliAutoDrainCommitPlanPath = path.join(tmp, 'cli-auto-drain-commit-plan.json');
const cliAutoDrainCommitCodex = await writeFakeCodexApplyScript(tmp);
const cliAutoDrainCommitFocusedCommand = "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\"";
await fs.writeFile(cliAutoDrainCommitPlanPath, JSON.stringify(autoDrainPlan, null, 2) + '\n');
const cliAutoDrainCommit = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'run',
  '--plan',
  cliAutoDrainCommitPlanPath,
  '--outDir',
  cliAutoDrainCommitOutDir,
  '--codex',
  cliAutoDrainCommitCodex,
  '--workspace',
  'copy',
  '--worktree-root',
  path.join(cliAutoDrainCommitOutDir, 'workspaces'),
  '--replace-workspace',
  '--include',
  'src',
  '--link-node-modules',
  'false',
  '--verify',
  '--auto-drain-commit',
  '--auto-drain-max-iterations',
  '2',
  '--focused-command',
  cliAutoDrainCommitFocusedCommand
], { cwd: cliAutoDrainCommitRepo, maxBuffer: 8 * 1024 * 1024 });
const cliAutoDrainCommitRun = JSON.parse(cliAutoDrainCommit.stdout);
assert.strictEqual(cliAutoDrainCommitRun.ok, true);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.committedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.gatedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.verificationGateCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.summary.requiredVerificationGateCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.iterations[0].apply.summary.committed, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.iterations[0].apply.summary.gatedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.iterations[0].apply.summary.verificationGateCount, 1);
assert.strictEqual(cliAutoDrainCommitRun.autoDrain.iterations[0].apply.summary.requiredVerificationGateCount, 1);
const cliAutoDrainCommitDecision = cliAutoDrainCommitRun.autoDrain.iterations[0].apply.decisions[0];
assert.strictEqual(cliAutoDrainCommitDecision.status, 'committed');
assert.strictEqual(cliAutoDrainCommitDecision.reason, 'patch committed and verification passed');
assert.deepStrictEqual(cliAutoDrainCommitDecision.verification, {
  planned: 1,
  run: 1,
  required: 1,
  passed: 1,
  failed: 0,
  names: [cliAutoDrainCommitFocusedCommand],
  passedNames: [cliAutoDrainCommitFocusedCommand],
  failedNames: []
});
assert.strictEqual(cliAutoDrainCommitDecision.jobId, cliAutoDrainCommitRun.run.results[0].jobId);
assert.deepStrictEqual(cliAutoDrainCommitDecision.queueItemIds, ['apply-task']);
assert.match(cliAutoDrainCommitDecision.commit, /^[0-9a-f]{40}$/);
assert.strictEqual(cliAutoDrainCommitDecision.commit, cliAutoDrainCommitDecision.headAfter);
assert.strictEqual(await fs.readFile(path.join(cliAutoDrainCommitRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: cliAutoDrainCommitRepo })).stdout, '');
assert.strictEqual((await execFileP('git', ['rev-parse', 'HEAD'], { cwd: cliAutoDrainCommitRepo })).stdout.trim(), cliAutoDrainCommitDecision.commit);
const cliAutoDrainCommitDashboard = JSON.parse(await fs.readFile(path.join(cliAutoDrainCommitOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(cliAutoDrainCommitDashboard.autoDrain.summary.committedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.autoDrain.summary.gatedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.autoDrainArtifacts.summary.committedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.autoDrainArtifacts.summary.gatedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.queueMetadata.queueHealth.appliedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.queueMetadata.queueHealth.committedDecisionCount, 1);
assert.strictEqual(cliAutoDrainCommitDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 1);
const cliAutoDrainCommitDecisionLogPath = cliAutoDrainCommitRun.autoDrain.iterations[0].apply.decisionLogPath;
const cliAutoDrainCommitDecisionLines = (await fs.readFile(cliAutoDrainCommitDecisionLogPath, 'utf8')).trim().split(/\r?\n/);
assert.strictEqual(cliAutoDrainCommitDecisionLines.length, 1);
const cliAutoDrainCommitDecisionEntry = JSON.parse(cliAutoDrainCommitDecisionLines[0]);
assert.strictEqual(cliAutoDrainCommitDecisionEntry.status, 'committed');
assert.strictEqual(cliAutoDrainCommitDecisionEntry.commit, cliAutoDrainCommitDecision.commit);
assert.deepStrictEqual(cliAutoDrainCommitDecisionEntry.queueItemIds, ['apply-task']);
assert.deepStrictEqual(cliAutoDrainCommitDecisionEntry.lockKeys, ['region:src/apply.ts#apply']);
assert.deepStrictEqual(cliAutoDrainCommitDecisionEntry.verification, cliAutoDrainCommitDecision.verification);

const autoDrainCandidateRepo = await createApplyFixtureRepo(tmp, 'auto-drain-candidate-run-repo');
const autoDrainCandidateOutDir = path.join(autoDrainCandidateRepo, 'agent-runs', 'auto-drain-candidate-run');
const autoDrainCandidatePlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-candidate',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-candidate-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply']
    }]
  }
});

const autoDrainUngatedCandidateRepo = await createApplyFixtureRepo(tmp, 'auto-drain-ungated-candidate-run-repo');
const autoDrainUngatedCandidateOutDir = path.join(autoDrainUngatedCandidateRepo, 'agent-runs', 'auto-drain-ungated-candidate-run');
const autoDrainUngatedCandidateRun = await runCodexSwarm(autoDrainCandidatePlan, {
  outDir: autoDrainUngatedCandidateOutDir,
  cwd: autoDrainUngatedCandidateRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainUngatedCandidateOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: false,
  autoDrain: {
    maxIterations: 1
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'ungated candidate held for coordinator review\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'ungated candidate held for coordinator review' };
  }
});
assert.strictEqual(autoDrainUngatedCandidateRun.ok, true);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrain.summary.applyCount, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrain.summary.terminalCount, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrain.iterations[0].collection.buckets['ready-to-apply'].length, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrain.iterations[0].collection.buckets['needs-human-port'].length, 1);
const autoDrainUngatedCandidateCollected = autoDrainUngatedCandidateRun.autoDrain.iterations[0].collection.buckets['needs-human-port'][0].bundle;
assert.strictEqual(autoDrainUngatedCandidateCollected.mergeReadiness, 'patch-candidate');
assert.strictEqual(autoDrainUngatedCandidateCollected.disposition, 'needs-port');
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.grouping.readyToApplyCount, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.grouping.needsHumanPortCount, 1);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.mergeQueue.promoteCount, 1);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.mergeQueue.promotedPatchCandidateCount, 0);
assert.strictEqual(autoDrainUngatedCandidateRun.autoDrainArtifacts.summary.promotedPatchCandidateCount, 0);
assert.strictEqual(await fs.readFile(path.join(autoDrainUngatedCandidateRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const autoDrainUngatedCandidateDashboard = JSON.parse(await fs.readFile(path.join(autoDrainUngatedCandidateOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.bucketCounts.readyToApplyCount, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.bucketCounts.needsHumanPortCount, 1);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.bucketCounts.promotedPatchCandidateCount, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.actionCounts.applyLocalCount, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.actionCounts.promoteCount, 1);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.queueHealth.promotedCount, 1);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.queueHealth.appliedDecisionCount, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.coordinatorAgentDrainWork.assignmentCount, 0);
assert.strictEqual(autoDrainUngatedCandidateDashboard.queueMetadata.actionCounts.promoteCount, autoDrainUngatedCandidateRun.autoDrainArtifacts.mergeQueue.promoteCount);
const autoDrainUngatedCandidateOperatorCards = new Map(autoDrainUngatedCandidateDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainUngatedCandidateOperatorCards.get('applied-decisions').value, 0);

const autoDrainCandidateRun = await runCodexSwarm(autoDrainCandidatePlan, {
  outDir: autoDrainCandidateOutDir,
  cwd: autoDrainCandidateRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainCandidateOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: false,
  autoDrain: {
    maxIterations: 2,
    focusedCommands: [{ name: 'coordinator-sees-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'candidate auto drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'candidate auto drained' };
  }
});
assert.strictEqual(autoDrainCandidateRun.ok, true);
const autoDrainCandidateMergePath = autoDrainCandidateRun.run.results[0].evidencePaths.find((entry) => entry.endsWith('merge.json'));
const autoDrainCandidateWorkerBundle = JSON.parse(await fs.readFile(autoDrainCandidateMergePath, 'utf8'));
assert.strictEqual(autoDrainCandidateWorkerBundle.mergeReadiness, 'patch-candidate');
assert.strictEqual(autoDrainCandidateWorkerBundle.disposition, 'needs-port');
assert.strictEqual(autoDrainCandidateRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrain.summary.blockedCount, 0);
const autoDrainCandidateCollected = autoDrainCandidateRun.autoDrain.iterations[0].collection.buckets['ready-to-apply'][0].bundle;
assert.strictEqual(autoDrainCandidateCollected.mergeReadiness, 'verified-patch');
assert.strictEqual(autoDrainCandidateCollected.disposition, 'auto-mergeable');
assert.strictEqual(autoDrainCandidateCollected.autoMergeable, true);
assert.strictEqual(autoDrainCandidateCollected.metadata.coordinatorPatchCandidatePromotion.originalDisposition, 'needs-port');
assert.strictEqual(autoDrainCandidateRun.autoDrain.iterations[0].collection.summary.promotedPatchCandidateCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrain.iterations[0].collection.hierarchicalMergeQueue.summary.applyLocalCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrain.iterations[0].collection.hierarchicalMergeQueue.summary.promoteCount, 0);
assert.strictEqual(autoDrainCandidateRun.autoDrain.iterations[0].apply.decisions[0].status, 'applied');
assert.strictEqual(autoDrainCandidateRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrainArtifacts.mergeQueue.promoteCount, 0);
assert.strictEqual(autoDrainCandidateRun.autoDrainArtifacts.mergeQueue.promotedPatchCandidateCount, 1);
assert.strictEqual(autoDrainCandidateRun.autoDrainArtifacts.summary.promotedPatchCandidateCount, 1);
assert.strictEqual(await fs.readFile(path.join(autoDrainCandidateRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
const autoDrainCandidateDashboard = JSON.parse(await fs.readFile(path.join(autoDrainCandidateOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.bucketCounts.promotedPatchCandidateCount, 1);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.actionCounts.applyLocalCount, 1);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.actionCounts.promoteCount, 0);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.queueHealth.promotedCount, 0);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.queueHealth.appliedDecisionCount, 1);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.queueHealth.staleOrRerunCount, 0);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 1);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 0);
assert.strictEqual(autoDrainCandidateDashboard.queueMetadata.operatorSummary.status, 'ok');
const autoDrainCandidateOperatorCards = new Map(autoDrainCandidateDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainCandidateOperatorCards.get('applied-decisions').value, 1);
assert.strictEqual(autoDrainCandidateOperatorCards.get('stale-rerun').value, 0);

const autoDrainDirtyRepo = await createApplyFixtureRepo(tmp, 'auto-drain-dirty-run-repo');
await fs.writeFile(path.join(autoDrainDirtyRepo, 'src', 'dirty.ts'), 'dirty\n');
const autoDrainDirtyOutDir = path.join(autoDrainDirtyRepo, 'agent-runs', 'auto-drain-dirty-run');
const autoDrainDirtyRun = await runCodexSwarm(autoDrainPlan, {
  outDir: autoDrainDirtyOutDir,
  cwd: autoDrainDirtyRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainDirtyOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 2,
    focusedCommands: [{ name: 'coordinator-sees-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'dirty auto-drain collected\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'dirty auto-drain collected' };
  }
});
assert.strictEqual(autoDrainDirtyRun.ok, false);
assert.strictEqual(autoDrainDirtyRun.autoDrain.ok, false);
assert.strictEqual(autoDrainDirtyRun.autoDrain.skippedReason, 'dirty-worktree');
assert.ok(autoDrainDirtyRun.autoDrain.dirtyPaths.includes('src/dirty.ts'));
assert.strictEqual(autoDrainDirtyRun.autoDrain.summary.collectionCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrain.summary.applyCount, 0);
assert.strictEqual(autoDrainDirtyRun.autoDrain.summary.remainingReadyCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrain.summary.terminalCount, 0);
assert.strictEqual(autoDrainDirtyRun.autoDrain.summary.admittedCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrain.iterations.length, 1);
const autoDrainDirtyIteration = autoDrainDirtyRun.autoDrain.iterations[0];
assert.strictEqual(autoDrainDirtyIteration.readyJobIds.length, 1);
assert.strictEqual(autoDrainDirtyIteration.admittedJobIds.length, 1);
assert.strictEqual(autoDrainDirtyIteration.deferredJobIds.length, 0);
assert.strictEqual(autoDrainDirtyIteration.apply, undefined);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.grouping.readyToApplyCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.admission.admittedCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 1);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.summary.applyCount, 0);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.summary.decisionCount, 0);
assert.strictEqual(autoDrainDirtyRun.autoDrainArtifacts.patchStack.patchCount, 0);
assert.ok(autoDrainDirtyRun.autoDrainArtifacts.grouping.paths.length > 0);
assert.ok(autoDrainDirtyRun.autoDrainArtifacts.mergeQueue.paths.length > 0);
assert.ok(await exists(autoDrainDirtyRun.autoDrainArtifacts.mergeQueue.paths[0]));
const autoDrainDirtyArtifactIteration = autoDrainDirtyRun.autoDrainArtifacts.iterations[0];
assert.ok(await exists(autoDrainDirtyArtifactIteration.collectionPath));
assert.ok(await exists(autoDrainDirtyArtifactIteration.mergeIndexPath));
assert.ok(await exists(autoDrainDirtyArtifactIteration.hierarchicalMergeQueuePath));
assert.ok(await exists(autoDrainDirtyArtifactIteration.queueOverlayPath));
assert.ok(await exists(autoDrainDirtyArtifactIteration.groupingPath));
assert.ok(!Object.hasOwn(autoDrainDirtyArtifactIteration, 'applyPath'));
assert.ok(!Object.hasOwn(autoDrainDirtyArtifactIteration, 'autonomousQueueOverlayPath'));
assert.ok(!Object.hasOwn(autoDrainDirtyArtifactIteration, 'decisionLogPath'));
assert.ok(await exists(path.join(autoDrainDirtyIteration.collection.buckets['ready-to-apply'][0].outputDir, 'merge.json')));
assert.strictEqual(await exists(path.join(autoDrainDirtyOutDir, 'auto-drain', 'apply-01', 'autonomous-apply.json')), false);
assert.strictEqual(await fs.readFile(path.join(autoDrainDirtyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
const autoDrainDirtyDashboard = JSON.parse(await fs.readFile(path.join(autoDrainDirtyOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainDirtyDashboard.autoDrain.skippedReason, 'dirty-worktree');
assert.deepStrictEqual(autoDrainDirtyDashboard.queueHealth, autoDrainDirtyDashboard.queueMetadata.queueHealth);
assert.deepStrictEqual(autoDrainDirtyDashboard.humanQuestions, autoDrainDirtyDashboard.queueMetadata.humanQuestions);
assert.deepStrictEqual(autoDrainDirtyDashboard.operatorSummary, autoDrainDirtyDashboard.queueMetadata.operatorSummary);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.collectOnly.reason, 'dirty-worktree');
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.collectOnly.dirtyPathCount, 1);
assert.deepStrictEqual(autoDrainDirtyDashboard.queueMetadata.collectOnly.dirtyPaths, ['src/dirty.ts']);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.queueHealth.appliedDecisionCount, 0);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.queueHealth.coordinatorDrainAssignmentCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.queueHealth.coordinatorDrainTerminalCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.queueHealth.coordinatorDrainAppliedCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.actionCounts.applyLocalCount, autoDrainDirtyRun.autoDrainArtifacts.coordinatorAgentDrainWork.appliedCount);
assert.deepStrictEqual(autoDrainDirtyDashboard.queueMetadata.operatorSummary.collectOnly, autoDrainDirtyDashboard.queueMetadata.collectOnly);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.operatorSummary.status, 'info');
assert.match(autoDrainDirtyDashboard.queueMetadata.operatorSummary.headline, /waiting for a clean worktree/);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.operatorSummary.counts.coordinatorQueues, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 0);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
const autoDrainDirtyOperatorCards = new Map(autoDrainDirtyDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.match(autoDrainDirtyOperatorCards.get('coordinator-queues').action, /Clean or isolate dirty paths/);

const autoDrainBudgetRepo = path.join(tmp, 'auto-drain-budget-repo');
await fs.mkdir(path.join(autoDrainBudgetRepo, 'src'), { recursive: true });
await execFileP('git', ['init'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: autoDrainBudgetRepo });
await fs.writeFile(path.join(autoDrainBudgetRepo, 'src', 'one.ts'), 'old-one\n');
await fs.writeFile(path.join(autoDrainBudgetRepo, 'src', 'two.ts'), 'old-two\n');
await execFileP('git', ['add', '--', 'src/one.ts', 'src/two.ts'], { cwd: autoDrainBudgetRepo });
await execFileP('git', ['commit', '-m', 'Initial budget fixture'], { cwd: autoDrainBudgetRepo });
const autoDrainBudgetPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-budget',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-one-task',
      lane: 'apply',
      ownedFiles: ['src/one.ts'],
      changedRegions: ['src/one.ts#one'],
      verification: [{
        name: 'worker-sees-one',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/one.ts','utf8')!=='new-one\\n') process.exit(1);"]
      }]
    }, {
      id: 'apply-two-task',
      lane: 'apply',
      ownedFiles: ['src/two.ts'],
      changedRegions: ['src/two.ts#two'],
      verification: [{
        name: 'worker-sees-two',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/two.ts','utf8')!=='new-two\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainBudgetRun = await runCodexSwarm(autoDrainBudgetPlan, {
  outDir: path.join(autoDrainBudgetRepo, 'agent-runs', 'auto-drain-budget-run'),
  cwd: autoDrainBudgetRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainBudgetRepo, 'agent-runs', 'auto-drain-budget-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxReady: 1,
    maxIterations: 4
  },
  executor: async (input) => {
    const file = input.job.taskId === 'apply-one-task' ? 'src/one.ts' : 'src/two.ts';
    const value = input.job.taskId === 'apply-one-task' ? 'new-one\n' : 'new-two\n';
    await fs.writeFile(path.join(input.workspacePath, file), value);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed\n`);
    return { exitCode: 0, changedPaths: [file], lastMessage: `${input.job.taskId} changed` };
  }
});
assert.strictEqual(autoDrainBudgetRun.ok, true);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.applyCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.terminalCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.remainingReadyCount, 0);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.admittedCount, 2);
assert.strictEqual(autoDrainBudgetRun.autoDrain.summary.deferredCount, 0);
assert.deepStrictEqual(autoDrainBudgetRun.autoDrain.iterations.map((iteration) => iteration.admittedJobIds.length), [1, 1]);
assert.deepStrictEqual(autoDrainBudgetRun.autoDrain.iterations.map((iteration) => iteration.deferredJobIds.length), [1, 0]);
const autoDrainBudgetDashboard = JSON.parse(await fs.readFile(path.join(autoDrainBudgetRepo, 'agent-runs', 'auto-drain-budget-run', 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainBudgetDashboard.queueMetadata.actionCounts.applyLocalCount, autoDrainBudgetRun.autoDrainArtifacts.coordinatorAgentDrainWork.appliedCount);
assert.strictEqual(autoDrainBudgetDashboard.queueMetadata.actionCounts.queueLocalCount, autoDrainBudgetRun.autoDrainArtifacts.coordinatorAgentDrainWork.queuedCount);
assert.strictEqual(autoDrainBudgetDashboard.queueMetadata.queueHealth.coordinatorDrainTerminalCount, autoDrainBudgetRun.autoDrainArtifacts.coordinatorAgentDrainWork.terminalCount);
assert.strictEqual(autoDrainBudgetDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, 0);
assert.strictEqual(await fs.readFile(path.join(autoDrainBudgetRepo, 'src', 'one.ts'), 'utf8'), 'new-one\n');
assert.strictEqual(await fs.readFile(path.join(autoDrainBudgetRepo, 'src', 'two.ts'), 'utf8'), 'new-two\n');

const autoDrainConflictRepo = await createApplyFixtureRepo(tmp, 'auto-drain-conflict-repo');
const autoDrainConflictPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-conflict',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'apply-first-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      verification: [{
        name: 'worker-sees-first',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='first\\n') process.exit(1);"]
      }]
    }, {
      id: 'apply-second-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      verification: [{
        name: 'worker-sees-second',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainConflictRun = await runCodexSwarm(autoDrainConflictPlan, {
  outDir: path.join(autoDrainConflictRepo, 'agent-runs', 'auto-drain-conflict-run'),
  cwd: autoDrainConflictRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainConflictRepo, 'agent-runs', 'auto-drain-conflict-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 3
  },
  executor: async (input) => {
    const value = input.job.taskId === 'apply-first-task' ? 'first\n' : 'second\n';
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), value);
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} changed\n`);
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: `${input.job.taskId} changed` };
  }
});
assert.strictEqual(autoDrainConflictRun.ok, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admittedJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].deferredJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admission.metadata.conflictLeaderAdmission.enabled, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.iterations[0].admission.metadata.conflictLeaderAdmission.selectedJobIds.length, 1);
assert.strictEqual(autoDrainConflictRun.autoDrain.summary.applyCount >= 1, true);
assert.strictEqual(autoDrainConflictRun.autoDrain.summary.terminalCount >= 1, true);
const conflictDrainIteration = autoDrainConflictRun.autoDrain.iterations[0];
assert.ok(conflictDrainIteration.apply.decisions.some((decision) => decision.status === 'applied'));
assert.ok(await exists(conflictDrainIteration.postApplyCollectionPath));
assert.strictEqual(conflictDrainIteration.postApplyCollection.kind, 'frontier.swarm-codex.collection');
assert.ok(await exists(conflictDrainIteration.coordinatorAgentDrainPath));
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.kind, FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.assignmentCount, 2);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.selectedCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.deferredCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.queueLocalCount, 2);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.promoteCount, 0);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.selectedQueueLocalCount, 1);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.selectedPromoteCount, 0);
assert.strictEqual(conflictDrainIteration.coordinatorAgentDrain.summary.deferredPromoteCount, 0);
const selectedConflictDrain = conflictDrainIteration.coordinatorAgentDrain.assignments.find((assignment) => assignment.selected);
const deferredConflictDrain = conflictDrainIteration.coordinatorAgentDrain.assignments.find((assignment) => !assignment.selected);
assert.ok(selectedConflictDrain);
assert.ok(deferredConflictDrain);
assert.strictEqual(selectedConflictDrain.queueAction, 'queue-local');
assert.strictEqual(deferredConflictDrain.queueAction, 'queue-local');
assert.strictEqual(selectedConflictDrain.selectionReason, 'queue-local-drain-leader');
assert.strictEqual(deferredConflictDrain.selectionReason, 'waiting-for-local-queue-leader');
assert.strictEqual(selectedConflictDrain.jobId < deferredConflictDrain.jobId, true);
assert.deepStrictEqual(deferredConflictDrain.serializesAfterJobIds, [selectedConflictDrain.jobId]);
const deferredConflictGroupingJob = conflictDrainIteration.grouping.jobs.find((job) => job.jobId === deferredConflictDrain.jobId);
assert.ok(deferredConflictGroupingJob);
assert.strictEqual(deferredConflictGroupingJob.placement, 'deferred');
assert.strictEqual(deferredConflictGroupingJob.coordinatorAgent.queueAction, 'queue-local');
assert.deepStrictEqual(deferredConflictGroupingJob.coordinatorAgent.leaderJobIds, [selectedConflictDrain.jobId]);
assert.strictEqual(autoDrainConflictRun.autoDrainArtifacts.coordinatorAgent.count >= 1, true);
assert.strictEqual(autoDrainConflictRun.autoDrainArtifacts.summary.coordinatorAgentDrainCount >= 1, true);
assert.ok(['first\n', 'second\n'].includes(await fs.readFile(path.join(autoDrainConflictRepo, 'src', 'apply.ts'), 'utf8')));

const autoDrainConflictBlockedRepo = await createApplyFixtureRepo(tmp, 'auto-drain-conflict-blocked-repo');
const autoDrainConflictBlockedPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-conflict-blocked',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'conflict-blocked-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      verification: [{
        name: 'worker-sees-new',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainConflictBlockedOutDir = path.join(autoDrainConflictBlockedRepo, 'agent-runs', 'auto-drain-conflict-blocked-run');
const autoDrainConflictBlockedRun = await runCodexSwarm(autoDrainConflictBlockedPlan, {
  outDir: autoDrainConflictBlockedOutDir,
  cwd: autoDrainConflictBlockedRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainConflictBlockedOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 2,
    checkStale: false
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'conflict-blocked seeded\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'conflict-blocked seeded' };
  },
  onJobFinished: async () => {
    await fs.writeFile(path.join(autoDrainConflictBlockedRepo, 'src', 'apply.ts'), 'new\n');
    await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: autoDrainConflictBlockedRepo });
    await execFileP('git', ['commit', '-m', 'Already applied before auto drain'], { cwd: autoDrainConflictBlockedRepo });
  }
});
assert.strictEqual(autoDrainConflictBlockedRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainConflictBlockedRun.autoDrain.summary.conflictBlockedCount, 1);
const autoDrainConflictBlockedDecision = autoDrainConflictBlockedRun.autoDrain.iterations[0].apply.decisions[0];
assert.strictEqual(autoDrainConflictBlockedDecision.status, 'conflict-blocked');
const autoDrainConflictBlockedDashboard = JSON.parse(await fs.readFile(path.join(autoDrainConflictBlockedOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.rerunCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.conflictBlockedDecisionCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.currentHeadConflictCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.deferredCoordinatorCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.actionCounts.deferredPromoteCount, 0);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueHealth, autoDrainConflictBlockedDashboard.queueMetadata.queueHealth);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.humanQuestions, autoDrainConflictBlockedDashboard.queueMetadata.humanQuestions);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.operatorSummary, autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.staleCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.rerunCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.staleOrRerunCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.currentHeadConflictCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.deferredCoordinatorCount, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.deferredPromoteCount, 0);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork, autoDrainConflictBlockedDashboard.queueMetadata.queueHealth.conflictRetryWork);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork.length, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].jobId, autoDrainConflictBlockedDecision.jobId);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].queueItemIds, ['conflict-blocked-task']);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].queueKeys, ['queue:conflict-blocked-task']);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].patchPath, autoDrainConflictBlockedDecision.patchPath);
assert.ok(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].patchPath.endsWith('changes.patch'));
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.status, 'warning');
assert.match(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.headline, /1 current-head conflict/);
assert.match(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.headline, /coordinator retry work/);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.currentHeadConflicts, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.deferredCoordinatorQueues, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.deferredPromoteQueues, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 0);
const autoDrainConflictBlockedCards = new Map(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainConflictBlockedCards.get('coordination-debt').value, 1);
assert.strictEqual(autoDrainConflictBlockedCards.get('coordination-debt').status, 'warning');
assert.match(autoDrainConflictBlockedCards.get('coordination-debt').detail, /1 current-head conflict/);
assert.strictEqual(autoDrainConflictBlockedCards.get('stale-rerun').value, 1);
assert.strictEqual(autoDrainConflictBlockedCards.get('stale-rerun').status, 'warning');
assert.match(autoDrainConflictBlockedCards.get('stale-rerun').detail, /retry queue conflict-blocked-task/);
assert.match(autoDrainConflictBlockedCards.get('stale-rerun').detail, /changes\.patch/);
assert.ok(autoDrainConflictBlockedCards.get('stale-rerun').sourceFields.includes('queueHealth.conflictRetryWork'));
assert.strictEqual(autoDrainConflictBlockedCards.get('true-blockers').value, 0);
assert.strictEqual(autoDrainConflictBlockedCards.get('true-blockers').status, 'ok');

const collapsedDecisionOutDir = path.join(tmp, 'collapsed-decision-dashboard');
const collapsedDecisionArtifacts = createSyntheticAutoDrainArtifacts(collapsedDecisionOutDir);
Object.assign(collapsedDecisionArtifacts.grouping, { staleAgainstHeadCount: 1 });
Object.assign(collapsedDecisionArtifacts.coordinatorAgentDrainWork, {
  count: 1,
  leaseCount: 1,
  assignmentCount: 2,
  terminalCount: 1,
  nonTerminalCount: 1,
  promotedWorkCount: 1,
  escalatedCount: 1,
  rerunCount: 1
});
Object.assign(collapsedDecisionArtifacts.coordinatorAgent, {
  count: 1,
  assignmentCount: 2,
  selectedCount: 1,
  deferredCount: 1,
  promoteCount: 1,
  queueLocalCount: 0
});
Object.assign(collapsedDecisionArtifacts.mergeQueue, {
  count: 1,
  scopeCount: 1,
  promoteCount: 1,
  rerunCount: 1
});
const collapsedDecisionAutoDrain = {
  kind: 'frontier.swarm-codex.auto-drain',
  version: 1,
  ok: true,
  enabled: true,
  cwd: tmp,
  runDir: tmp,
  outDir: collapsedDecisionOutDir,
  generatedAt: collapsedDecisionArtifacts.generatedAt,
  iterations: [{
    index: 1,
    collection: {
      buckets: {
        'ready-to-apply': [],
        'needs-human-port': [],
        'failed-evidence': [],
        'stale-against-head': [{
          jobId: 'collapsed-rerun-old-job',
          bundle: {
            taskId: 'collapsed-rerun-task',
            queueItemIds: ['collapsed-rerun-task']
          }
        }]
      },
      hierarchicalMergeQueue: {
        assignments: [{
          jobId: 'collapsed-rerun-old-job',
          queueItemIds: ['collapsed-rerun-task'],
          action: 'rerun'
        }]
      }
    },
    coordinatorAgentDrainWork: {
      summary: {
        leaseCount: 1,
        assignmentCount: 2,
        terminalCount: 1,
        nonTerminalCount: 1,
        promotedWorkCount: 1,
        appliedCount: 0,
        queuedCount: 0,
        escalatedCount: 1,
        rerunCount: 1,
        rejectedCount: 0,
        recordedCount: 0,
        blockedCount: 0
      }
    },
    coordinatorAgentDrain: {
      summary: {
        assignmentCount: 2,
        selectedCount: 1,
        deferredCount: 1,
        applyLocalCount: 0,
        queueLocalCount: 0,
        promoteCount: 1,
        selectedQueueLocalCount: 0,
        selectedPromoteCount: 0,
        deferredPromoteCount: 1,
        scopeCount: 1
      }
    },
    apply: {
      decisions: [
        createSyntheticAutonomousDecision('rerun', {
          id: 'collapsed-rerun-old',
          jobId: 'collapsed-rerun-old-job',
          taskId: 'collapsed-rerun-task',
          queueItemIds: ['collapsed-rerun-task'],
          reason: 'bundle is stale against the current repository head',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 1
        }),
        createSyntheticAutonomousDecision('conflict-blocked', {
          id: 'collapsed-conflict-old',
          jobId: 'collapsed-conflict-old-job',
          taskId: 'collapsed-conflict-task',
          queueItemIds: ['collapsed-conflict-task'],
          reason: 'git apply --check failed',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 2
        }),
        createSyntheticAutonomousDecision('applied', {
          id: 'collapsed-rerun-fresh',
          jobId: 'collapsed-rerun-fresh-job',
          taskId: 'collapsed-rerun-task',
          queueItemIds: ['collapsed-rerun-task'],
          reason: 'fresh bundle applied',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 3
        }),
        createSyntheticAutonomousDecision('committed', {
          id: 'collapsed-conflict-fresh',
          jobId: 'collapsed-conflict-fresh-job',
          taskId: 'collapsed-conflict-task',
          queueItemIds: ['collapsed-conflict-task'],
          reason: 'fresh conflict-resolution bundle committed',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 4
        })
      ]
    }
  }],
  lockKeys: [],
  lockScopeCounts: { semantic: 0, path: 0, repo: 0 },
  terminalJobIds: [
    'collapsed-conflict-fresh-job',
    'collapsed-rerun-fresh-job'
  ],
  blockedJobIds: [],
  artifacts: collapsedDecisionArtifacts,
  summary: {
    iterationCount: 1,
    collectionCount: 1,
    applyCount: 1,
    terminalCount: 2,
    blockedCount: 0,
    conflictBlockedCount: 1,
    humanBlockedCount: 0,
    remainingReadyCount: 0,
    admittedCount: 4,
    deferredCount: 0,
    reviewerAssignmentCount: 0,
    reviewerTaskCount: 0,
    patchStackCount: 0
  }
};
const collapsedDecisionDashboardPath = path.join(collapsedDecisionOutDir, 'coordinator-dashboard.json');
await writeSwarmCoordinatorSnapshot(collapsedDecisionDashboardPath, {
  ok: true,
  outDir: collapsedDecisionOutDir,
  plan,
  run: {
    id: 'collapsed-decision-run',
    jobs: [],
    results: [],
    summary: {}
  },
  proof: {},
  autoDrain: collapsedDecisionAutoDrain,
  autoDrainArtifacts: collapsedDecisionArtifacts
});
const collapsedDecisionDashboard = JSON.parse(await fs.readFile(collapsedDecisionDashboardPath, 'utf8'));
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.appliedDecisionCount, 2);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.committedDecisionCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.staleOrRerunCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.rerunCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.currentHeadConflictCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.selectedCoordinatorCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.deferredCoordinatorCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.selectedPromoteCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.deferredPromoteCount, 1);
assert.deepStrictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.conflictRetryWork, []);
assert.deepStrictEqual(collapsedDecisionDashboard.queueMetadata.conflictRetryWork, []);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.bucketCounts.staleAgainstHeadCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.promoteCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.rerunCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.currentHeadConflictCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.deferredCoordinatorCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.deferredPromoteCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.humanQuestions.count, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.status, 'warning');
assert.match(collapsedDecisionDashboard.queueMetadata.operatorSummary.headline, /1 deferred coordinator assignment/);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.currentHeadConflicts, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.deferredCoordinatorQueues, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.deferredPromoteQueues, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
const collapsedDecisionCards = new Map(collapsedDecisionDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(collapsedDecisionCards.get('applied-decisions').value, 2);
assert.strictEqual(collapsedDecisionCards.get('coordination-debt').value, 1);
assert.strictEqual(collapsedDecisionCards.get('coordination-debt').status, 'warning');
assert.match(collapsedDecisionCards.get('coordination-debt').detail, /1 deferred promotion/);
assert.strictEqual(collapsedDecisionCards.get('stale-rerun').value, 0);
assert.strictEqual(collapsedDecisionCards.get('true-blockers').value, 0);

const explicitHumanQuestionOutDir = path.join(tmp, 'explicit-human-question-dashboard');
const explicitHumanQuestionArtifacts = createSyntheticAutoDrainArtifacts(explicitHumanQuestionOutDir);
explicitHumanQuestionArtifacts.summary.decisionCount = 5;
const explicitHumanQuestionAutoDrain = {
  kind: 'frontier.swarm-codex.auto-drain',
  version: 1,
  ok: false,
  enabled: true,
  cwd: tmp,
  runDir: explicitHumanQuestionOutDir,
  outDir: explicitHumanQuestionOutDir,
  generatedAt: explicitHumanQuestionArtifacts.generatedAt,
  iterations: [{
    index: 1,
    admittedJobIds: [
      'generic-human-blocked-job',
      'prefixed-human-question-job',
      'question-mark-human-question-job',
      'failed-apply-job',
      'coordinator-review-job'
    ],
    deferredJobIds: [],
    readyJobIds: [],
    coordinatorAgentDrainWork: {
      summary: {
        leaseCount: 0,
        assignmentCount: 0,
        terminalCount: 0,
        nonTerminalCount: 0,
        promotedWorkCount: 0,
        appliedCount: 0,
        queuedCount: 0,
        escalatedCount: 0,
        rerunCount: 0,
        rejectedCount: 0,
        recordedCount: 0,
        blockedCount: 0
      }
    },
    apply: {
      decisions: [
        createSyntheticAutonomousDecision('human-blocked', {
          id: 'generic-human-blocked',
          jobId: 'generic-human-blocked-job',
          taskId: 'generic-human-blocked-task',
          queueItemIds: ['generic-human-blocked-task'],
          reason: 'ownership violations: packages/frontier-swarm-codex/src/index.ts',
          finishedAt: explicitHumanQuestionArtifacts.generatedAt + 1
        }),
        createSyntheticAutonomousDecision('human-blocked', {
          id: 'prefixed-human-question',
          jobId: 'prefixed-human-question-job',
          taskId: 'prefixed-human-question-task',
          queueItemIds: ['prefixed-human-question-task'],
          reason: 'human-question: Should the parent coordinator approve this ownership exception',
          finishedAt: explicitHumanQuestionArtifacts.generatedAt + 2
        }),
        createSyntheticAutonomousDecision('human-blocked', {
          id: 'question-mark-human-question',
          jobId: 'question-mark-human-question-job',
          taskId: 'question-mark-human-question-task',
          queueItemIds: ['question-mark-human-question-task'],
          reason: 'Can the parent coordinator assign this cross-lane surface?',
          finishedAt: explicitHumanQuestionArtifacts.generatedAt + 3
        }),
        createSyntheticAutonomousDecision('failed', {
          id: 'failed-apply',
          jobId: 'failed-apply-job',
          taskId: 'failed-apply-task',
          queueItemIds: ['failed-apply-task'],
          reason: 'generated evidence failed to parse',
          finishedAt: explicitHumanQuestionArtifacts.generatedAt + 4
        }),
        createSyntheticAutonomousDecision('skipped', {
          id: 'coordinator-review-evidence',
          jobId: 'coordinator-review-job',
          taskId: 'coordinator-review-task',
          queueItemIds: ['coordinator-review-task'],
          reason: 'coordinator review artifact recorded',
          finishedAt: explicitHumanQuestionArtifacts.generatedAt + 5
        })
      ]
    }
  }],
  lockKeys: [],
  lockScopeCounts: { semantic: 0, path: 0, repo: 0 },
  terminalJobIds: ['coordinator-review-job', 'failed-apply-job'],
  blockedJobIds: ['generic-human-blocked-job', 'prefixed-human-question-job', 'question-mark-human-question-job'],
  artifacts: explicitHumanQuestionArtifacts,
  summary: {
    iterationCount: 1,
    collectionCount: 1,
    applyCount: 1,
    terminalCount: 2,
    blockedCount: 3,
    conflictBlockedCount: 0,
    humanBlockedCount: 3,
    remainingReadyCount: 0,
    admittedCount: 5,
    deferredCount: 0,
    reviewerAssignmentCount: 1,
    reviewerTaskCount: 1,
    patchStackCount: 0
  }
};
const explicitHumanQuestionDashboardPath = path.join(explicitHumanQuestionOutDir, 'coordinator-dashboard.json');
await writeSwarmCoordinatorSnapshot(explicitHumanQuestionDashboardPath, {
  ok: false,
  outDir: explicitHumanQuestionOutDir,
  plan,
  run: {
    id: 'explicit-human-question-run',
    jobs: [],
    results: [],
    summary: {}
  },
  proof: {},
  autoDrain: explicitHumanQuestionAutoDrain,
  autoDrainArtifacts: explicitHumanQuestionArtifacts
});
const explicitHumanQuestionDashboard = JSON.parse(await fs.readFile(explicitHumanQuestionDashboardPath, 'utf8'));
assert.strictEqual(explicitHumanQuestionDashboard.autoDrain.summary.humanBlockedCount, 3);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.count, 2);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.decisionCount, 2);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds, [
  'prefixed-human-question-job',
  'question-mark-human-question-job'
]);
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('generic-human-blocked-job'));
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('failed-apply-job'));
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('coordinator-review-job'));
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.taskIds, [
  'prefixed-human-question-task',
  'question-mark-human-question-task'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.reasons, [
  'Can the parent coordinator assign this cross-lane surface?',
  'human-question: Should the parent coordinator approve this ownership exception'
]);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.status, 'blocked');
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 2);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 2);
const explicitHumanQuestionCards = new Map(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(explicitHumanQuestionCards.get('true-blockers').value, 2);
assert.strictEqual(explicitHumanQuestionCards.get('true-blockers').status, 'blocked');
assert.match(explicitHumanQuestionCards.get('true-blockers').detail, /2 explicit human questions/);

const autoDrainDryRunRepo = await createApplyFixtureRepo(tmp, 'auto-drain-dry-run-repo');
const autoDrainDryRun = await runCodexSwarm(autoDrainPlan, {
  outDir: path.join(autoDrainDryRunRepo, 'agent-runs', 'auto-drain-dry-run'),
  cwd: autoDrainDryRunRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainDryRunRepo, 'agent-runs', 'auto-drain-dry-run', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    dryRun: true,
    maxIterations: 2
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'dry-run drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'dry-run drained' };
  }
});
assert.strictEqual(autoDrainDryRun.ok, true);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainDryRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainDryRun.autoDrain.iterations[0].apply.decisions[0].status, 'checked');
assert.strictEqual(await fs.readFile(path.join(autoDrainDryRunRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');

const autoDrainClassificationOutDir = path.join(tmp, 'auto-drain-classification-run');
const autoDrainClassificationPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-classification',
    lanes: [{ id: 'classification', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'classification-marker',
      lane: 'classification',
      ownedFiles: ['src/marker.ts']
    }]
  }
});
const autoDrainClassificationRun = await runCodexSwarm(autoDrainClassificationPlan, {
  outDir: autoDrainClassificationOutDir,
  cwd: tmp,
  dryRun: false,
  autoDrain: {
    maxIterations: 2,
    checkStale: false
  },
  executor: async (input) => {
    const runDir = path.dirname(input.paths.jobDir);
    await writeSyntheticMergeBundle(runDir, 'classification-coordinator-review');
    await writeSyntheticMergeBundle(runDir, 'classification-stale', {
      disposition: 'stale-against-head',
      staleAgainstHead: true
    });
    await writeSyntheticMergeBundle(runDir, 'classification-failed', {
      status: 'failed',
      mergeReadiness: 'rejected',
      disposition: 'rejected'
    });
    await writeSyntheticMergeBundle(runDir, 'classification-evidence', {
      changedPaths: [],
      mergeReadiness: 'discovery-only',
      disposition: 'discovery-only'
    });
    await writeSyntheticMergeBundle(runDir, 'classification-human-question', {
      status: 'blocked',
      mergeReadiness: 'blocked',
      disposition: 'blocked'
    });
    await fs.writeFile(input.paths.lastMessagePath, 'classification seeded\n');
    return { exitCode: 0, changedPaths: [], lastMessage: 'classification seeded' };
  }
});
assert.strictEqual(autoDrainClassificationRun.ok, true);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.applyCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.blockedCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrain.summary.remainingReadyCount, 0);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.promoteCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.rerunCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.rejectCount, 1);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.recordOnlyCount, 2);
assert.strictEqual(autoDrainClassificationRun.autoDrainArtifacts.mergeQueue.blockCount, 1);
const autoDrainClassificationDashboard = JSON.parse(await fs.readFile(path.join(autoDrainClassificationOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.promoteCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.rerunCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.rejectCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.recordOnlyCount, 2);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.blockCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.trueBlockerCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.actionCounts.conflictBlockedDecisionCount, 0);
assert.deepStrictEqual(autoDrainClassificationDashboard.queueHealth, autoDrainClassificationDashboard.queueMetadata.queueHealth);
assert.deepStrictEqual(autoDrainClassificationDashboard.humanQuestions, autoDrainClassificationDashboard.queueMetadata.humanQuestions);
assert.deepStrictEqual(autoDrainClassificationDashboard.operatorSummary, autoDrainClassificationDashboard.queueMetadata.operatorSummary);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.queueHealth.staleOrRerunCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.queueHealth.trueBlockerCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.queueHealth.conflictBlockedDecisionCount, 0);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.operatorSummary.status, 'blocked');
assert.match(autoDrainClassificationDashboard.queueMetadata.operatorSummary.headline, /1 true blocker/);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 0);
const autoDrainClassificationCards = new Map(autoDrainClassificationDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainClassificationCards.get('true-blockers').value, 1);
assert.strictEqual(autoDrainClassificationCards.get('true-blockers').status, 'blocked');
assert.strictEqual(autoDrainClassificationCards.get('stale-rerun').value, 1);
assert.strictEqual(autoDrainClassificationCards.get('stale-rerun').status, 'warning');
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.readyToApplyCount, 0);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.needsHumanPortCount, 3);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.failedEvidenceCount, 2);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.bucketCounts.staleAgainstHeadCount, 1);
const autoDrainClassificationQueue = JSON.parse(await fs.readFile(autoDrainClassificationDashboard.queueMetadata.paths.mergeQueues[0], 'utf8'));
const autoDrainClassificationAssignments = new Map(autoDrainClassificationQueue.assignments.map((assignment) => [assignment.jobId, assignment]));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-coordinator-review').action, 'promote');
assert.ok(autoDrainClassificationAssignments.get('classification-coordinator-review').reasons.includes('coordinator-queue-required'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-stale').action, 'rerun');
assert.ok(autoDrainClassificationAssignments.get('classification-stale').reasons.includes('stale-against-head'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-failed').action, 'reject');
assert.ok(autoDrainClassificationAssignments.get('classification-failed').reasons.includes('failed-or-invalid-evidence'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-evidence').action, 'record-only');
assert.ok(autoDrainClassificationAssignments.get('classification-evidence').reasons.includes('discovery-only'));
assert.strictEqual(autoDrainClassificationAssignments.get('classification-human-question').action, 'block');
assert.ok(autoDrainClassificationAssignments.get('classification-human-question').reasons.includes('true-blocker'));
assert.deepStrictEqual(autoDrainClassificationQueue.byAction.block, ['classification-human-question']);
assert.ok(!autoDrainClassificationQueue.byAction.promote.includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.byAction.rerun.includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.byAction['record-only'].includes('classification-human-question'));
assert.ok(!autoDrainClassificationQueue.promotions.some((promotion) => promotion.jobId === 'classification-evidence'));

const cleanApplyRepo = path.join(tmp, 'clean-apply-repo');
await fs.mkdir(path.join(cleanApplyRepo, 'src'), { recursive: true });
await execFileP('git', ['init'], { cwd: cleanApplyRepo });
await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: cleanApplyRepo });
await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: cleanApplyRepo });
await fs.writeFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'old\n');
await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: cleanApplyRepo });
await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: cleanApplyRepo });
const committedApply = await applyCodexSwarmCollection({
  collection: path.join(tmp, 'ready-collection'),
  cwd: cleanApplyRepo,
  dryRun: false,
  branchPrefix: 'codex/tiny',
  commit: true
});
assert.strictEqual(committedApply.ok, true);
assert.strictEqual(committedApply.dryRun, false);
assert.strictEqual(committedApply.summary.committed, 1);
assert.strictEqual(committedApply.entries[0].status, 'committed');
assert.strictEqual(committedApply.entries[0].branchName, 'codex/tiny/apply-job');
assert.match(committedApply.entries[0].commit, /^[0-9a-f]{40}$/);
assert.strictEqual(await fs.readFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual((await execFileP('git', ['branch', '--show-current'], { cwd: cleanApplyRepo })).stdout.trim(), 'codex/tiny/apply-job');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: cleanApplyRepo })).stdout, '');

const hookEvents = [];
const hookedResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'hooked-run'),
  cwd: tmp,
  dryRun: false,
  prepareJobWorkspace: async (input) => {
    hookEvents.push(`prepare:${input.job.id}`);
    await fs.writeFile(path.join(input.workspacePath, 'prepared.txt'), 'prepared\n');
  },
  renderJobPrompt: (input) => {
    hookEvents.push(`prompt:${input.job.id}`);
    return `${input.prompt}\nHooked prompt context.\n`;
  },
  changedPathFilter: (paths) => paths.filter((entry) => !entry.startsWith('node_modules/')),
  onJobStarted: (input) => {
    hookEvents.push(`started:${input.job.id}:${input.args.includes('--json')}`);
  },
  onJobFinished: (input) => {
    hookEvents.push(`finished:${input.job.id}:${input.result.changedPaths.join(',')}`);
  },
  onSwarmFinished: (input) => {
    hookEvents.push(`swarm:${input.result.ok}`);
  },
  executor: async (input) => {
    assert.ok(input.prompt.includes('Hooked prompt context.'));
    assert.strictEqual(await fs.readFile(path.join(input.workspacePath, 'prepared.txt'), 'utf8'), 'prepared\n');
    await fs.writeFile(input.paths.lastMessagePath, 'hooked\n');
    return { exitCode: 0, changedPaths: ['src/runtime/action.ts', 'node_modules/cache.txt'], lastMessage: 'hooked' };
  }
});
assert.strictEqual(hookedResult.ok, true);
assert.deepStrictEqual(hookedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);
assert.deepStrictEqual(hookEvents, [
  'prepare:runtime-runtime-action',
  'prompt:runtime-runtime-action',
  'started:runtime-runtime-action:true',
  'finished:runtime-runtime-action:src/runtime/action.ts',
  'swarm:true'
]);

const orderedPlan = createCodexSwarmPlan({
  manifest: manifestInput,
  tasks: {
    items: [
      {
        id: 'runtime-parent',
        lane: 'runtime',
        ownedFiles: ['src/runtime/parent.ts']
      },
      {
        id: 'runtime-child',
        lane: 'runtime',
        dependsOn: ['runtime-parent'],
        ownedFiles: ['src/runtime/child.ts']
      }
    ]
  },
  plan: { maxLaneConcurrency: { runtime: 2 } }
});
const order = [];
const orderedResult = await runCodexSwarm(orderedPlan, {
  outDir: path.join(tmp, 'ordered-run'),
  cwd: tmp,
  maxConcurrency: 2,
  executor: async (input) => {
    order.push(input.job.taskId);
    await fs.writeFile(input.paths.lastMessagePath, input.job.taskId + '\n');
    return { exitCode: 0, changedPaths: input.job.task.targetRefs, lastMessage: input.job.taskId };
  }
});
assert.strictEqual(orderedResult.ok, true);
assert.deepStrictEqual(order, ['runtime-parent', 'runtime-child']);
assert.ok(orderedResult.run.results.every((entry) => typeof entry.metadata?.fencingToken === 'number'));

await fs.writeFile(path.join(tmp, 'fixture.txt'), 'fixture\n');
await fs.mkdir(path.join(tmp, 'skip'), { recursive: true });
await fs.writeFile(path.join(tmp, 'skip', 'large.bin'), 'skip\n');
await fs.mkdir(path.join(tmp, 'linked'), { recursive: true });
await fs.writeFile(path.join(tmp, 'linked', 'asset.txt'), 'asset\n');
const copyPlan = createCodexWorkspacePlan(plan.jobs[0], {
  outDir: path.join(tmp, 'copy-run'),
  cwd: tmp,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'minimal-workspaces'),
    replace: true,
    includes: ['fixture.txt', 'skip'],
    excludes: ['skip'],
    linkPaths: ['linked'],
    linkNodeModules: false
  }
});
assert.ok(copyPlan.includes.includes('fixture.txt'));
assert.ok(copyPlan.includes.includes('skip'));
const copyResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'copy-run'),
  cwd: tmp,
  dryRun: true,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'minimal-workspaces'),
    replace: true,
    includes: ['fixture.txt', 'skip'],
    excludes: ['skip'],
    linkPaths: ['linked'],
    linkNodeModules: false
  }
});
const workspacePath = path.join(tmp, 'minimal-workspaces', copyResult.plan.jobs[0].id);
assert.strictEqual(await fs.readFile(path.join(workspacePath, 'fixture.txt'), 'utf8'), 'fixture\n');
assert.strictEqual(await exists(path.join(workspacePath, 'skip', 'large.bin')), false);
assert.strictEqual((await fs.lstat(path.join(workspacePath, 'linked'))).isSymbolicLink(), true);
const workspaceProof = await createSwarmWorkspaceProof(copyPlan);
assert.ok(workspaceProof.copiedPaths.includes('fixture.txt'));
assert.ok(workspaceProof.linkedPaths.includes('linked'));

const changedResult = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'changed-run'),
  cwd: tmp,
  workspace: {
    mode: 'copy',
    root: path.join(tmp, 'changed-workspaces'),
    replace: true,
    includes: ['fixture.txt'],
    linkNodeModules: false
  },
  executor: async (input) => {
    await fs.mkdir(path.join(input.workspacePath, 'src/runtime'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
    await fs.mkdir(path.join(input.workspacePath, 'agent-runs/noisy'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'agent-runs/noisy/evidence.json'), '{}\n');
    await fs.mkdir(path.join(input.workspacePath, 'packages/frontier-swarm/dist'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'packages/frontier-swarm/dist/index.js'), 'generated\n');
    await fs.mkdir(path.join(input.workspacePath, 'packages/frontier-swarm/node_modules/.cache'), { recursive: true });
    await fs.writeFile(path.join(input.workspacePath, 'packages/frontier-swarm/node_modules/.cache/tsconfig.tsbuildinfo'), '{}\n');
    await fs.writeFile(input.paths.lastMessagePath, 'changed\n');
    return { exitCode: 0, lastMessage: 'changed' };
  }
});
assert.strictEqual(changedResult.ok, true);
assert.deepStrictEqual(changedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);
assert.ok(changedResult.run.results[0].metadata.codexHandoffArtifacts.some((artifact) => artifact.kind === 'last-message'));
assert.ok(changedResult.run.results[0].evidencePaths.some((entry) => entry.endsWith('last-message.md')));
const changedWorkspaceProofPath = changedResult.run.results[0].evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
const changedWorkspaceProof = JSON.parse(await fs.readFile(changedWorkspaceProofPath, 'utf8'));
assert.deepStrictEqual(changedWorkspaceProof.ignoredChangedPaths, [
  'agent-runs/noisy/evidence.json',
  'packages/frontier-swarm/dist/index.js',
  'packages/frontier-swarm/node_modules/.cache/tsconfig.tsbuildinfo'
]);

const ignoredCopyRepo = path.join(tmp, 'ignored-copy-repo');
await fs.mkdir(path.join(ignoredCopyRepo, 'src/runtime'), { recursive: true });
await fs.writeFile(path.join(ignoredCopyRepo, '.gitignore'), 'agent-runs/\n');
await fs.writeFile(path.join(ignoredCopyRepo, 'src/runtime/action.ts'), 'export const ok = false;\n');
const ignoredCopyResult = await runCodexSwarm(plan, {
  outDir: path.join(ignoredCopyRepo, 'agent-runs/ignored-copy-run'),
  cwd: ignoredCopyRepo,
  workspace: {
    mode: 'copy',
    root: path.join(ignoredCopyRepo, 'agent-runs/ignored-copy-workspaces'),
    replace: true,
    includes: ['src/runtime/action.ts'],
    linkNodeModules: false
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src/runtime/action.ts'), 'export const ok = true;\n');
    await fs.writeFile(input.paths.lastMessagePath, 'ignored copy changed\n');
    return { exitCode: 0, changedPaths: [], lastMessage: 'ignored copy changed' };
  }
});
const ignoredCopyJobResult = ignoredCopyResult.run.results[0];
assert.strictEqual(ignoredCopyResult.ok, true);
assert.deepStrictEqual(ignoredCopyJobResult.changedPaths, ['src/runtime/action.ts']);
assert.notStrictEqual(ignoredCopyJobResult.mergeReadiness, 'discovery-only');
assert.ok(typeof ignoredCopyJobResult.patchPath === 'string');
const ignoredCopyPatch = await fs.readFile(ignoredCopyJobResult.patchPath, 'utf8');
assert.ok(ignoredCopyPatch.includes('diff --git a/src/runtime/action.ts b/src/runtime/action.ts'));
assert.ok(ignoredCopyPatch.includes('-export const ok = false;'));
assert.ok(ignoredCopyPatch.includes('+export const ok = true;'));
const ignoredCopyMergePath = ignoredCopyJobResult.evidencePaths.find((entry) => entry.endsWith('merge.json'));
const ignoredCopyMergeBundle = JSON.parse(await fs.readFile(ignoredCopyMergePath, 'utf8'));
assert.deepStrictEqual(ignoredCopyMergeBundle.changedPaths, ['src/runtime/action.ts']);
assert.ok(String(ignoredCopyMergeBundle.patchPath).endsWith('changes.patch'));
assert.notStrictEqual(ignoredCopyMergeBundle.disposition, 'discovery-only');

const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);

const cliSource = await fs.readFile(new URL('../dist/cli.js', import.meta.url), 'utf8');
assert.ok(cliSource.includes("from './index.js'"));
assert.ok(cliSource.includes('stopCodexSwarmRun'));
assert.ok(cliSource.includes('frontier-swarm <command> [options]'));
assert.ok(cliSource.includes('--semantic-import-include <glob>'));
assert.ok(cliSource.includes('--semantic-import-exclude <glob>'));
assert.ok(cliSource.includes('--semantic-import-max-files <n>'));
assert.ok(cliSource.includes('autonomous-apply'));
assert.ok(cliSource.includes('drain'));
assert.ok(cliSource.includes('--no-auto-drain'));
assert.ok(cliSource.includes('--auto-drain-out-dir <path>'));
assert.ok(cliSource.includes('--auto-drain-allow-dirty'));
assert.ok(cliSource.includes('--auto-drain-check-stale'));
assert.ok(cliSource.includes('--auto-drain-branch-prefix <prefix>'));
assert.ok(cliSource.includes('--auto-drain-dry-run'));
assert.ok(cliSource.includes('--auto-drain-commit (after required gates pass, run auto-drain creates audited coordinator commits tied to queue item ids and the decision ledger)'));
assert.ok(cliSource.includes('--auto-drain-limit <n>'));
assert.ok(cliSource.includes('--auto-drain-max-iterations <n>'));
assert.ok(cliSource.includes('--auto-drain-max-ready <n>'));
assert.ok(cliSource.includes('--auto-drain-max-changed-paths <n>'));
assert.ok(cliSource.includes('--auto-drain-max-changed-regions <n>'));
assert.ok(cliSource.includes('--auto-drain-promote-patch-candidates[=true|false]'));
assert.ok(cliSource.includes('--no-auto-drain-promote-patch-candidates'));
assert.ok(cliSource.includes('--auto-drain-decision-log <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-path <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-timeout-ms <n>'));
assert.ok(cliSource.includes('--auto-drain-lock-stale-ms <n>'));
assert.ok(cliSource.includes("args['auto-drain-limit']"));
assert.ok(cliSource.includes("args['auto-drain-max-iterations']"));
assert.ok(cliSource.includes("args['no-auto-drain-promote-patch-candidates']"));
assert.ok(cliSource.includes("promotePatchCandidates: disableAutoDrainPatchCandidatePromotion ? false : optionalBoolArg(args.autoDrainPromotePatchCandidates ?? args['auto-drain-promote-patch-candidates'])"));
assert.ok(cliSource.includes("args['auto-drain-decision-log']"));
assert.ok(cliSource.includes("args['auto-drain-lock-path']"));
assert.ok(cliSource.includes('autonomous coordinator drain work'));
assert.ok(cliSource.includes('frontier.swarm.coordinator-agent-drain-work contract'));
assert.ok(cliSource.includes('Terminal coordinator decisions such as applied, committed, checked'));
assert.ok(cliSource.includes('queue outcomes, not'));
assert.ok(cliSource.includes('human/authority question'));
assert.ok(cliSource.includes('--focused-command <cmd> --global-command <cmd> (required auto-drain apply/commit gates)'));
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

async function createApplyFixtureRepo(root, name) {
  const repo = path.join(root, name);
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: repo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: repo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: repo });
  return repo;
}

async function writeSyntheticMergeBundle(runDir, jobId, overrides = {}) {
  const changedPaths = Array.isArray(overrides.changedPaths) ? overrides.changedPaths : [`src/${jobId}.ts`];
  const queueItemIds = Array.isArray(overrides.queueItemIds) ? overrides.queueItemIds : [`${jobId}-task`];
  const jobDir = path.join(runDir, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(path.join(jobDir, 'merge.json'), JSON.stringify({
    jobId,
    taskId: `${jobId}-task`,
    lane: 'queue-metadata',
    title: jobId,
    generatedAt: Date.now(),
    status: 'verified',
    mergeReadiness: changedPaths.length ? 'verified-patch' : 'discovery-only',
    disposition: 'needs-port',
    riskLevel: 'low',
    autoMergeable: false,
    changedPaths,
    changedRegions: [],
    ownedFilesTouched: changedPaths,
    allowedWrites: changedPaths,
    ownershipViolations: [],
    evidencePaths: [],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds,
    staleAgainstHead: false,
    reasons: [],
    ...overrides
  }, null, 2) + '\n');
}

function createSyntheticAutonomousDecision(status, overrides = {}) {
  const now = Date.now();
  const jobId = overrides.jobId ?? `${status}-job`;
  const queueItemIds = Array.isArray(overrides.queueItemIds) ? overrides.queueItemIds : [`${jobId}-task`];
  return {
    kind: FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND,
    version: 1,
    id: overrides.id ?? `synthetic-${status}-${jobId}`,
    jobId,
    taskId: overrides.taskId ?? `${jobId}-task`,
    queueItemIds,
    status,
    reason: overrides.reason ?? status,
    bundlePath: overrides.bundlePath ?? path.join(tmp, `${jobId}-merge.json`),
    changedPaths: overrides.changedPaths ?? [`src/${jobId}.ts`],
    changedRegions: overrides.changedRegions ?? [],
    lockScope: overrides.lockScope ?? 'path',
    lockKeys: overrides.lockKeys ?? [`path:src/${jobId}.ts`],
    startedAt: overrides.startedAt ?? now,
    finishedAt: overrides.finishedAt ?? now,
    dryRun: overrides.dryRun ?? false,
    commands: overrides.commands ?? []
  };
}

function createSyntheticAutoDrainArtifacts(outDir) {
  const generatedAt = Date.now();
  return {
    kind: 'frontier.swarm-codex.auto-drain-artifacts',
    version: 1,
    outDir,
    autoDrainPath: path.join(outDir, 'auto-drain.json'),
    generatedAt,
    admission: { paths: [], count: 0, admittedCount: 0, deferredCount: 0 },
    grouping: {
      paths: [],
      count: 0,
      collectionCount: 0,
      groupedBundleCount: 0,
      readyToApplyCount: 0,
      needsHumanPortCount: 0,
      failedEvidenceCount: 0,
      staleAgainstHeadCount: 0
    },
    reviewer: { paths: [], count: 0, assignmentCount: 0, taskCount: 0, decisionCount: 0 },
    coordinatorAgent: {
      paths: [],
      count: 0,
      assignmentCount: 0,
      selectedCount: 0,
      deferredCount: 0,
      promoteCount: 0,
      queueLocalCount: 0
    },
    coordinatorAgentDrainWork: {
      paths: [],
      count: 0,
      leaseCount: 0,
      assignmentCount: 0,
      terminalCount: 0,
      nonTerminalCount: 0,
      promotedWorkCount: 0,
      appliedCount: 0,
      queuedCount: 0,
      escalatedCount: 0,
      rerunCount: 0,
      rejectedCount: 0,
      recordedCount: 0,
      blockedCount: 0
    },
    patchStack: {
      paths: [],
      count: 0,
      stackCount: 0,
      jobCount: 0,
      conflictedStackCount: 0,
      patchCount: 0
    },
    mergeQueue: {
      paths: [],
      count: 0,
      scopeCount: 0,
      applyLocalCount: 0,
      queueLocalCount: 0,
      promoteCount: 0,
      rerunCount: 0,
      rejectCount: 0,
      blockCount: 0,
      recordOnlyCount: 0,
      promotedPatchCandidateCount: 0
    },
    iterations: [],
    summary: {
      pathCount: 0,
      iterationCount: 1,
      collectionCount: 1,
      applyCount: 1,
      admissionCount: 0,
      coordinatorAgentDrainCount: 0,
      coordinatorAgentDrainWorkCount: 0,
      mergeQueuePlanCount: 0,
      reviewerPlanCount: 0,
      patchStackPlanCount: 0,
      decisionCount: 4,
      promotedPatchCandidateCount: 0,
      patchCount: 0
    }
  };
}

async function writeFakeCodexApplyScript(root) {
  const file = path.join(root, 'fake-codex-apply.mjs');
  await fs.writeFile(file, [
    '#!/usr/bin/env node',
    "import fs from 'node:fs/promises';",
    "import path from 'node:path';",
    '',
    'const args = process.argv.slice(2);',
    "const valueAfter = (flag) => {",
    '  const index = args.indexOf(flag);',
    '  return index >= 0 ? args[index + 1] : undefined;',
    '};',
    "const workspace = valueAfter('--cd');",
    "const lastMessage = valueAfter('--output-last-message');",
    'if (!workspace || !lastMessage) {',
    "  console.error('missing workspace or last-message path');",
    '  process.exit(2);',
    '}',
    "await fs.mkdir(path.join(workspace, 'src'), { recursive: true });",
    "await fs.writeFile(path.join(workspace, 'src', 'apply.ts'), 'new\\n');",
    "await fs.writeFile(lastMessage, 'cli commit auto drained\\n');",
    "process.stdout.write(JSON.stringify({ type: 'fake-codex', workspace }) + '\\n');",
    ''
  ].join('\n'));
  await fs.chmod(file, 0o755);
  return file;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function execFileP(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}
