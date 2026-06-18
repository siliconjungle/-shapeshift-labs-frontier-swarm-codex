import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const codexPackageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const localSwarmPackageRoot = path.resolve(codexPackageRoot, '..', 'frontier-swarm');
const localDependencyName = '@shapeshift-labs/frontier-swarm';

async function readJson(pathname) {
  return JSON.parse(await fs.readFile(pathname, 'utf8'));
}

function isPackageCandidateRoot(pathname, packageId) {
  return path.basename(pathname) === packageId && path.basename(path.dirname(pathname)) === 'packages';
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function assertLocalFrontierSwarmDependency({ requireAdjacent = true } = {}) {
  const codexPackageJsonPath = path.join(codexPackageRoot, 'package.json');
  const localSwarmPackageJsonPath = path.join(localSwarmPackageRoot, 'package.json');
  const codexPackageJson = await readJson(codexPackageJsonPath);
  const localSwarmPackageJson = await readJson(localSwarmPackageJsonPath);
  const declaredVersion = codexPackageJson.dependencies?.[localDependencyName];
  assert.strictEqual(
    declaredVersion,
    localSwarmPackageJson.version,
    `${localDependencyName} must stay pinned to the local frontier-swarm package version for publishable metadata`
  );
  assert.doesNotMatch(
    declaredVersion,
    /^(?:workspace|file|link):/,
    `${localDependencyName} must use publishable semver metadata, not a workspace-only specifier`
  );

  let resolvedSwarmPackageJsonPath;
  try {
    resolvedSwarmPackageJsonPath = fileURLToPath(import.meta.resolve(`${localDependencyName}/package.json`));
  } catch (error) {
    if (!requireAdjacent && error?.code === 'ERR_MODULE_NOT_FOUND') return;
    throw error;
  }
  const packageNodeModulesRoot = path.join(codexPackageRoot, 'node_modules');
  const resolvedFromPackageNodeModules = isWithin(packageNodeModulesRoot, path.resolve(resolvedSwarmPackageJsonPath));
  const resolvedSwarmRoot = path.dirname(await fs.realpath(resolvedSwarmPackageJsonPath));
  const localSwarmRoot = await fs.realpath(localSwarmPackageRoot);
  const resolvedFromAdjacentPackage = resolvedSwarmRoot === localSwarmRoot;
  const resolvedFromLocalPackage = resolvedFromAdjacentPackage
    || (!requireAdjacent && isPackageCandidateRoot(resolvedSwarmRoot, 'frontier-swarm'));
  if (!requireAdjacent && !resolvedFromLocalPackage && !resolvedFromPackageNodeModules) return;
  const resolvedSwarmPackageJson = await readJson(resolvedSwarmPackageJsonPath);
  assert.strictEqual(resolvedSwarmPackageJson.name, localDependencyName);
  assert.strictEqual(
    resolvedSwarmPackageJson.version,
    localSwarmPackageJson.version,
    `${localDependencyName} resolved to version ${resolvedSwarmPackageJson.version}, expected local version ${localSwarmPackageJson.version}`
  );
  assert.ok(
    resolvedFromLocalPackage,
    `${localDependencyName} resolved to ${resolvedSwarmRoot}; package-local tests must link ${localSwarmRoot} instead of a registry install`
  );
}

const localDepsOnly = process.argv.includes('--local-deps-only');
await assertLocalFrontierSwarmDependency({ requireAdjacent: !localDepsOnly });
if (localDepsOnly) {
  console.log('frontier-swarm-codex local dependency hygiene ok');
  process.exit(0);
}

const {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  autonomousApplyCodexSwarmRun,
  buildCodexArgs,
  classifyCodexAutonomousDecisionCollapse,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexAutoDrainRerunManifest,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY,
  FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_KIND,
  FRONTIER_SWARM_CODEX_MODEL_PRICING,
  FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_KIND,
  FRONTIER_SWARM_CODEX_COORDINATOR_AGENT_DRAIN_KIND,
  FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND,
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
  spawnCodexExecutor,
  stopCodexSwarmRun,
  writeSwarmCoordinatorSnapshot
} = await import('../dist/index.js');

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
assert.strictEqual(FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY.kind, FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY_KIND);
assert.strictEqual(FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY.latestDecisionWinsByQueueSubject, true);
assert.strictEqual(FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY.explicitHumanQuestionsOnly, true);
assert.deepStrictEqual(
  Object.keys(FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY.statuses).sort(),
  [
    'applied',
    'checked',
    'committed',
    'conflict-blocked',
    'failed',
    'human-blocked',
    'rejected',
    'rerun',
    'skipped'
  ]
);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('conflict-blocked').autoDrainTerminal, true);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('conflict-blocked').createsRerunWork, true);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('conflict-blocked').humanNeeded, false);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('rerun').createsRerunWork, true);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('rejected').queueResolved, true);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('rejected').humanNeeded, false);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('skipped').queueResolved, true);
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('failed').dashboardCategory, 'automation-blocker');
assert.strictEqual(classifyCodexAutonomousDecisionCollapse('failed').humanNeeded, false);
assert.strictEqual(
  classifyCodexAutonomousDecisionCollapse({
    status: 'human-blocked',
    reason: 'ownership violations: packages/frontier-swarm-codex/src/index.ts'
  }).humanNeeded,
  false
);
assert.strictEqual(
  classifyCodexAutonomousDecisionCollapse({
    status: 'human-blocked',
    reason: 'human-question: owner=release; surface=packages/frontier-swarm-codex; missing-authority=approval; question=Approve release?; answer-code=approve|reject'
  }).dashboardCategory,
  'human-needed'
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
const uncachedInputOnlyCost = estimateCodexRunCost({ model: 'gpt-5.5', inputTokens: 1000 });
assert.strictEqual(uncachedInputOnlyCost.estimated, true);
assert.strictEqual(uncachedInputOnlyCost.uncachedInputCostUsd, 0.005);
assert.strictEqual(uncachedInputOnlyCost.outputCostUsd, 0);
assert.strictEqual(uncachedInputOnlyCost.estimatedCostUsd, 0.005);
const cachedInputOnlyCost = estimateCodexRunCost({ model: 'gpt-5.5', inputTokens: 1000, cachedInputTokens: 1000 });
assert.strictEqual(cachedInputOnlyCost.estimated, true);
assert.strictEqual(cachedInputOnlyCost.cachedInputCostUsd, 0.0005);
assert.strictEqual(cachedInputOnlyCost.uncachedInputCostUsd, 0);
assert.strictEqual(cachedInputOnlyCost.estimatedCostUsd, 0.0005);
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

const compactLogCodexPath = path.join(tmp, 'fake-codex-compact-log.mjs');
await fs.writeFile(compactLogCodexPath, `#!/usr/bin/env node
import fs from 'node:fs';

const lastMessageIndex = process.argv.indexOf('--output-last-message');
const lastMessagePath = lastMessageIndex >= 0 ? process.argv[lastMessageIndex + 1] : '';
process.stdin.resume();
process.stdin.on('end', () => {
  if (lastMessagePath) fs.writeFileSync(lastMessagePath, 'compact done\\n');
  const filler = 'x'.repeat(4096);
  for (let index = 0; index < 512; index += 1) {
    process.stdout.write(JSON.stringify({ type: 'item.completed', item: { id: 'noise-' + index, text: filler } }) + '\\n');
  }
  process.stdout.write(JSON.stringify({
    type: 'run.metrics',
    usage: { input_tokens: 1200, cached_input_tokens: 200, output_tokens: 300 },
    model: 'gpt-5.5'
  }) + '\\n');
  process.stderr.write('stderr log retained\\n');
});
`);
await fs.chmod(compactLogCodexPath, 0o755);
const compactLogPaths = {
  ...paths,
  eventsPath: path.join(tmp, 'compact-events.jsonl'),
  stderrPath: path.join(tmp, 'compact-stderr.log'),
  lastMessagePath: path.join(tmp, 'compact-last.md'),
  pidManifestPath: path.join(tmp, 'compact-pids.json')
};
const compactLogRun = await spawnCodexExecutor({
  job: plan.jobs[0],
  prompt: 'compact log prompt',
  args: buildCodexArgs(plan.jobs[0], { outDir: tmp, workspacePath: tmp, paths: compactLogPaths }),
  cwd: tmp,
  workspacePath: tmp,
  codexPath: compactLogCodexPath,
  paths: compactLogPaths,
  resourceAllocation: createCodexResourceAllocation(plan.jobs[0], { cwd: tmp, outDir: tmp, workspacePath: tmp }),
  env: {},
  timeoutMs: 30000
});
assert.strictEqual(compactLogRun.exitCode, 0);
assert.strictEqual(compactLogRun.metrics?.inputTokens, 1200);
assert.strictEqual(compactLogRun.metrics?.cachedInputTokens, 200);
assert.strictEqual(compactLogRun.metrics?.uncachedInputTokens, 1000);
assert.strictEqual(compactLogRun.metrics?.outputTokens, 300);
assert.strictEqual(compactLogRun.lastMessage, 'compact done\n');
assert.ok((await fs.stat(compactLogPaths.eventsPath)).size > 1024 * 1024);
assert.strictEqual(await fs.readFile(compactLogPaths.stderrPath, 'utf8'), 'stderr log retained\n');

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
  semanticImport: { enabled: true, maxFiles: 2, maxBytes: 64 },
  dryRun: false,
  executor: async (input) => {
    assert.strictEqual(input.resourceAllocation.env.FRONTIER_SWARM_JOB_ID, input.job.id);
    assert.strictEqual(input.env.FRONTIER_SWARM_TASK_ID, input.job.taskId);
    await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'action.ts'), 'export function action() { return 1; }\n');
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'generated.ts'), `export const generated = "${'x'.repeat(128)}";\n`);
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'omitted.ts'), 'export const omitted = true;\n');
    await fs.writeFile(input.paths.lastMessagePath, 'done\n');
    return {
      exitCode: 0,
      changedPaths: ['src/runtime/action.ts', 'src/runtime/generated.ts', 'src/runtime/omitted.ts'],
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
assert.strictEqual(dashboard.costSummary.costEstimateStatus, 'estimated');
assert.strictEqual(dashboard.costSummary.inputTokens, 1200);
assert.strictEqual(dashboard.costSummary.cachedInputTokens, 200);
assert.strictEqual(dashboard.costSummary.uncachedInputTokens, 1000);
assert.strictEqual(dashboard.costSummary.outputTokens, 300);
assert.strictEqual(dashboard.costSummary.estimatedCostUsd, 0.0141);
assert.deepStrictEqual(dashboard.costSummary.byModel.map((entry) => [entry.model, entry.costEstimateStatus, entry.estimatedCostUsd]), [['gpt-5.5', 'estimated', 0.0141]]);
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
assert.strictEqual(semanticImports.summary.total, 2);
assert.strictEqual(semanticImports.summary.selected, 2);
assert.strictEqual(semanticImports.summary.eligible, 3);
assert.strictEqual(semanticImports.summary.omitted, 1);
assert.strictEqual(semanticImports.summary.maxFiles, 2);
assert.strictEqual(semanticImports.summary.maxBytes, 64);
assert.strictEqual(semanticImports.summary.imported + semanticImports.summary.errors, 1);
assert.strictEqual(semanticImports.summary.skipped, 1);
const actionSemanticImport = semanticImports.records.find((record) => record.path === 'src/runtime/action.ts');
const generatedSemanticImport = semanticImports.records.find((record) => record.path === 'src/runtime/generated.ts');
assert.ok(actionSemanticImport);
assert.ok(generatedSemanticImport);
assert.strictEqual(generatedSemanticImport.status, 'skipped');
assert.strictEqual(generatedSemanticImport.reason, 'too-large');
assert.ok(generatedSemanticImport.bytes > semanticImports.summary.maxBytes);
if (actionSemanticImport.status === 'imported') {
  assert.ok(semanticImports.summary.sourceMapCount >= 1);
  assert.ok(semanticImports.summary.sourceMapMappingCount >= 1);
  assert.ok(semanticImports.summary.lossCount >= 1);
  assert.ok(semanticImports.summary.semanticIndex.symbols >= 1);
  assert.ok(semanticImports.summary.readiness['ready-with-losses'] >= 1 || semanticImports.summary.readiness['ready'] >= 1);
} else {
  assert.strictEqual(actionSemanticImport.status, 'error');
  assert.strictEqual(actionSemanticImport.reason, 'frontier-lang-unavailable');
  assert.ok(actionSemanticImport.error);
}
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
assert.strictEqual(mergeBundle.metadata.semanticImport.total, 2);
assert.strictEqual(mergeBundle.metadata.semanticImport.skipped, 1);
assert.strictEqual(mergeBundle.metadata.semanticImport.maxBytes, 64);
if (actionSemanticImport.status === 'imported') assert.ok(mergeBundle.metadata.semanticImport.sourceMapCount >= 1);
assert.strictEqual(mergeBundle.metadata.codexRunMetrics.inputTokens, 1200);
assert.strictEqual(mergeBundle.metadata.codexCostEstimate.estimatedCostUsd, 0.0141);
const isolatedCodexDir = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-no-lang-'));
await fs.mkdir(path.join(isolatedCodexDir, 'dist'), { recursive: true });
await fs.mkdir(path.join(isolatedCodexDir, 'node_modules', '@shapeshift-labs'), { recursive: true });
await fs.writeFile(path.join(isolatedCodexDir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');
await fs.copyFile(new URL('../dist/index.js', import.meta.url), path.join(isolatedCodexDir, 'dist', 'index.js'));
await fs.symlink(
  fileURLToPath(new URL('../../frontier-swarm', import.meta.url)),
  path.join(isolatedCodexDir, 'node_modules', '@shapeshift-labs', 'frontier-swarm'),
  process.platform === 'win32' ? 'junction' : 'dir'
);
const isolatedCodex = await import(`${pathToFileURL(path.join(isolatedCodexDir, 'dist', 'index.js')).href}?no-lang`);
const missingLangPlan = isolatedCodex.createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput });
const missingLangResult = await isolatedCodex.runCodexSwarm(missingLangPlan, {
  outDir: path.join(tmp, 'run-no-lang'),
  cwd: tmp,
  semanticImport: true,
  dryRun: false,
  executor: async (input) => {
    await fs.mkdir(path.join(tmp, 'src', 'runtime'), { recursive: true });
    await fs.writeFile(path.join(tmp, 'src', 'runtime', 'no-lang.ts'), 'export const noLang = true;\n');
    await fs.writeFile(input.paths.lastMessagePath, 'missing optional done\n');
    return { exitCode: 0, changedPaths: ['src/runtime/no-lang.ts'], lastMessage: 'missing optional done' };
  }
});
assert.strictEqual(missingLangResult.ok, true);
const missingLangSemanticImportsPath = missingLangResult.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
assert.ok(missingLangSemanticImportsPath);
const missingLangSemanticImports = JSON.parse(await fs.readFile(missingLangSemanticImportsPath, 'utf8'));
assert.strictEqual(missingLangSemanticImports.summary.total, 1);
assert.strictEqual(missingLangSemanticImports.summary.errors, 1);
assert.strictEqual(missingLangSemanticImports.records[0].path, 'src/runtime/no-lang.ts');
assert.strictEqual(missingLangSemanticImports.records[0].status, 'error');
assert.strictEqual(missingLangSemanticImports.records[0].reason, 'frontier-lang-unavailable');
assert.ok(missingLangSemanticImports.records[0].error);
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
assert.strictEqual(unknownPricingDashboard.costSummary.costEstimateStatus, 'unknown-pricing');
assert.strictEqual(Object.hasOwn(unknownPricingDashboard.costSummary, 'estimatedCostUsd'), false);
assert.deepStrictEqual(unknownPricingDashboard.costSummary.unknownPricing, [{
  jobId: unknownPricingRun.run.results[0].jobId,
  model: 'future-codex-model',
  reason: 'unknown-model-pricing'
}]);
assert.deepStrictEqual(
  unknownPricingDashboard.costSummary.byModel.map((entry) => [
    entry.model,
    entry.costEstimateStatus,
    entry.unknownPricingJobCount,
    entry.unknownPricingReason,
    Object.hasOwn(entry, 'estimatedCostUsd')
  ]),
  [['future-codex-model', 'unknown-pricing', 1, 'unknown-model-pricing', false]]
);
const activeCostDashboardPath = path.join(tmp, 'active-cost-dashboard.json');
await writeSwarmCoordinatorSnapshot(activeCostDashboardPath, {
  ok: true,
  outDir: tmp,
  plan,
  run: {
    id: 'active-cost-run',
    jobs: [
      {
        ...plan.jobs[0],
        id: 'active-priced',
        taskId: 'active-priced-task',
        status: 'running',
        metadata: {
          resourceAllocation: { model: 'gpt-5.5' },
          codexRunMetrics: {
            inputTokens: 1200,
            cachedInputTokens: 200,
            outputTokens: 300
          }
        }
      },
      {
        ...plan.jobs[0],
        id: 'active-unknown-pricing',
        taskId: 'active-unknown-pricing-task',
        status: 'running',
        metadata: {
          codexRunMetrics: {
            model: 'future-codex-model',
            inputTokens: 100,
            outputTokens: 50
          }
        }
      }
    ],
    results: [{
      jobId: 'completed-priced',
      status: 'completed',
      metadata: {
        codexRunMetrics: {
          model: 'gpt-5.5',
          inputTokens: 1000,
          cachedInputTokens: 100,
          outputTokens: 100
        }
      }
    }],
    summary: {}
  },
  proof: {}
});
const activeCostDashboard = JSON.parse(await fs.readFile(activeCostDashboardPath, 'utf8'));
assert.strictEqual(activeCostDashboard.costSummary.source, 'run-results-and-jobs-metadata');
assert.strictEqual(activeCostDashboard.costSummary.jobCount, 3);
assert.strictEqual(activeCostDashboard.costSummary.jobsWithTokenUsage, 3);
assert.strictEqual(activeCostDashboard.costSummary.estimatedJobCount, 2);
assert.strictEqual(activeCostDashboard.costSummary.unknownPricingJobCount, 1);
assert.strictEqual(activeCostDashboard.costSummary.costEstimateStatus, 'partial');
assert.strictEqual(activeCostDashboard.costSummary.estimatedCostUsd, 0.02165);
assert.deepStrictEqual(activeCostDashboard.costSummary.missingUsageJobIds, []);
assert.deepStrictEqual(
  activeCostDashboard.costSummary.byModel.map((entry) => [
    entry.model,
    entry.jobCount,
    entry.estimatedJobCount,
    entry.unknownPricingJobCount,
    entry.costEstimateStatus,
    Object.hasOwn(entry, 'estimatedCostUsd') ? entry.estimatedCostUsd : 'unknown'
  ]),
  [
    ['future-codex-model', 1, 0, 1, 'unknown-pricing', 'unknown'],
    ['gpt-5.5', 2, 2, 0, 'estimated', 0.02165]
  ]
);
assert.deepStrictEqual(activeCostDashboard.costSummary.unknownPricing, [{
  jobId: 'active-unknown-pricing',
  model: 'future-codex-model',
  reason: 'unknown-model-pricing'
}]);
assert.strictEqual(activeCostDashboard.autonomousQueueHealth.kind, 'frontier.swarm-codex.dashboard-autonomous-queue-health');
assert.strictEqual(activeCostDashboard.autonomousQueueHealth.source, 'run-only');
assert.strictEqual(activeCostDashboard.autonomousQueueHealth.summary.activeWorkerCount, 2);
assert.deepStrictEqual(activeCostDashboard.autonomousQueueHealth.activeWorkers.map((worker) => worker.jobId), [
  'active-priced',
  'active-unknown-pricing'
]);
assert.strictEqual(activeCostDashboard.autonomousQueueHealth.summary.completedHistoryCount, 0);
const activeCostHealthSections = new Map(activeCostDashboard.autonomousQueueHealth.sections.map((section) => [section.id, section]));
assert.strictEqual(activeCostHealthSections.get('active-workers').value, 2);
assert.strictEqual(activeCostHealthSections.get('active-workers').status, 'info');
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

const patchOnlyRepo = await createApplyFixtureRepo(tmp, 'patch-only-repo');
const patchOnlyRunDir = path.join(tmp, 'patch-only-run');
await writePatchOnlyJob(patchOnlyRunDir, 'patch-only-ready', [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'), {
  taskId: 'patch-only-ready-task',
  changedFiles: ['src/apply.ts'],
  changedRegions: ['src/apply.ts#apply']
});
await writePatchOnlyJob(patchOnlyRunDir, 'patch-only-stale', [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-missing',
  '+stale',
  ''
].join('\n'), {
  taskId: 'patch-only-stale-task',
  changedFiles: ['src/apply.ts'],
  changedRegions: ['src/apply.ts#apply']
});
const patchOnlyCollection = await collectCodexSwarmRun({
  run: patchOnlyRunDir,
  cwd: patchOnlyRepo,
  outDir: path.join(tmp, 'patch-only-collection'),
  checkStale: true,
  promotePatchCandidates: true,
  promotionFocusedCommands: [{ name: 'coordinator-gate', command: process.execPath, args: ['-e', 'process.exit(0)'] }]
});
assert.strictEqual(patchOnlyCollection.summary.total, 2);
assert.strictEqual(patchOnlyCollection.summary.patchOnlyCount, 2);
assert.strictEqual(patchOnlyCollection.artifacts.counts.patchOnlyCount, 2);
assert.strictEqual(patchOnlyCollection.summary['ready-to-apply'], 1);
assert.strictEqual(patchOnlyCollection.summary['stale-against-head'], 1);
assert.strictEqual(patchOnlyCollection.summary.mergeQueueApplyLocalCount, 0);
assert.strictEqual(patchOnlyCollection.summary.mergeQueueQueueLocalCount, 1);
assert.strictEqual(patchOnlyCollection.summary.mergeQueuePromoteCount, 0);
assert.strictEqual(patchOnlyCollection.summary.mergeQueueRerunCount, 1);
assert.strictEqual(patchOnlyCollection.summary.promotedPatchCandidateCount, 1);
assert.ok(await exists(path.join(patchOnlyCollection.outDir, 'ready-to-apply', 'patch-only-ready', 'merge.json')));
assert.ok(await exists(path.join(patchOnlyCollection.outDir, 'ready-to-apply', 'patch-only-ready', 'changes.patch')));
assert.ok(await exists(path.join(patchOnlyCollection.outDir, 'stale-against-head', 'patch-only-stale', 'merge.json')));
assert.ok(await exists(path.join(patchOnlyCollection.outDir, 'stale-against-head', 'patch-only-stale', 'changes.patch')));
assert.strictEqual(patchOnlyCollection.buckets['ready-to-apply'][0].patchOnly, true);
assert.strictEqual(patchOnlyCollection.buckets['stale-against-head'][0].patchOnly, true);
const patchOnlyReadyBundle = JSON.parse(await fs.readFile(path.join(patchOnlyCollection.outDir, 'ready-to-apply', 'patch-only-ready', 'merge.json'), 'utf8'));
assert.strictEqual(patchOnlyReadyBundle.metadata.patchOnlyCollection.reason, 'changes.patch existed without merge.json');
assert.strictEqual(patchOnlyReadyBundle.metadata.patchOnlyCollection.changedPathSource, 'patch');
assert.strictEqual(patchOnlyReadyBundle.metadata.coordinatorPatchCandidatePromotion.originalDisposition, 'needs-port');
assert.deepStrictEqual(patchOnlyReadyBundle.changedPaths, ['src/apply.ts']);
assert.deepStrictEqual(patchOnlyReadyBundle.ownedFilesTouched, ['src/apply.ts']);
assert.deepStrictEqual(patchOnlyReadyBundle.queueItemIds, ['patch-only-ready-task']);
const patchOnlyStaleBundle = JSON.parse(await fs.readFile(path.join(patchOnlyCollection.outDir, 'stale-against-head', 'patch-only-stale', 'merge.json'), 'utf8'));
assert.strictEqual(patchOnlyStaleBundle.staleAgainstHead, true);
assert.strictEqual(patchOnlyStaleBundle.disposition, 'stale-against-head');
assert.deepStrictEqual(patchOnlyStaleBundle.queueItemIds, ['patch-only-stale-task']);

const patchOnlyNormalizedRepo = await createApplyFixtureRepo(tmp, 'patch-only-normalized-repo');
const patchOnlyNormalizedRunDir = path.join(tmp, 'patch-only-normalized-run');
await writePatchOnlyJob(patchOnlyNormalizedRunDir, 'patch-only-normalized', [
  'diff --git a/tmp/frontier-head/src/apply.ts b/Users/example/agent-worktrees/patch-only/packages/app/src/apply.ts',
  '--- a/tmp/frontier-head/src/apply.ts',
  '+++ b/Users/example/agent-worktrees/patch-only/packages/app/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'), {
  taskId: 'patch-only-normalized-task',
  changedFiles: ['src/apply.ts'],
  changedRegions: ['src/apply.ts#apply']
});
const patchOnlyNormalizedCollection = await collectCodexSwarmRun({
  run: patchOnlyNormalizedRunDir,
  cwd: patchOnlyNormalizedRepo,
  outDir: path.join(tmp, 'patch-only-normalized-collection'),
  checkStale: true,
  promotePatchCandidates: true,
  promotionFocusedCommands: [{ name: 'coordinator-gate', command: process.execPath, args: ['-e', 'process.exit(0)'] }]
});
assert.strictEqual(patchOnlyNormalizedCollection.summary.total, 1);
assert.strictEqual(patchOnlyNormalizedCollection.summary['ready-to-apply'], 1);
assert.strictEqual(patchOnlyNormalizedCollection.summary['stale-against-head'], 0);
const patchOnlyNormalizedBundle = JSON.parse(await fs.readFile(path.join(patchOnlyNormalizedCollection.outDir, 'ready-to-apply', 'patch-only-normalized', 'merge.json'), 'utf8'));
assert.deepStrictEqual(patchOnlyNormalizedBundle.changedPaths, ['src/apply.ts']);
assert.deepStrictEqual(patchOnlyNormalizedBundle.ownershipViolations, []);
assert.strictEqual(patchOnlyNormalizedBundle.metadata.patchOnlyCollection.changedPathSource, 'normalized-patch');
assert.ok(patchOnlyNormalizedBundle.metadata.patchOnlyCollection.normalizedPatchPath.endsWith('changes.normalized.patch'));
const patchOnlyNormalizedPatch = await fs.readFile(path.join(patchOnlyNormalizedCollection.outDir, 'ready-to-apply', 'patch-only-normalized', 'changes.patch'), 'utf8');
assert.match(patchOnlyNormalizedPatch, /diff --git a\/src\/apply\.ts b\/src\/apply\.ts/);

const failedOrigRepo = await createApplyFixtureRepo(tmp, 'failed-orig-repo');
const failedOrigPlan = createCodexSwarmPlan({
  manifest: {
    id: 'failed-orig',
    lanes: [{ id: 'apply', allowedGlobs: ['src/apply.ts'] }]
  },
  tasks: {
    items: [
      { id: 'failed-orig-only', lane: 'apply', ownedFiles: ['src/apply.ts'], allowedWrites: ['src/apply.ts'] },
      { id: 'failed-orig-source-escape', lane: 'apply', ownedFiles: ['src/apply.ts'], allowedWrites: ['src/apply.ts'] }
    ]
  }
});
const failedOrigOutDir = path.join(tmp, 'failed-orig-run');
const failedOrigRun = await runCodexSwarm(failedOrigPlan, {
  outDir: failedOrigOutDir,
  cwd: failedOrigRepo,
  dryRun: false,
  workspace: {
    mode: 'copy',
    root: path.join(failedOrigRepo, 'agent-runs', 'failed-orig', 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts.orig'), 'patch reject backup\n');
    if (input.job.taskId === 'failed-orig-source-escape') {
      await fs.writeFile(path.join(input.workspacePath, 'src', 'escape.ts'), 'real source escape\n');
    } else {
      await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts.rej'), 'failed hunk\n');
    }
    await fs.writeFile(input.paths.lastMessagePath, `${input.job.taskId} failed\n`);
    return {
      exitCode: 1,
      changedPaths: input.job.taskId === 'failed-orig-source-escape'
        ? ['src/apply.ts.orig', 'src/escape.ts']
        : ['src/apply.ts.orig', 'src/apply.ts.rej'],
      lastMessage: `${input.job.taskId} failed`
    };
  }
});
assert.strictEqual(failedOrigRun.run.summary.failedCount, 2);
const failedOrigResults = new Map(failedOrigRun.run.results.map((entry) => [entry.jobId, entry]));
const failedOrigOnlyJob = failedOrigPlan.jobs.find((job) => job.taskId === 'failed-orig-only');
const failedOrigEscapeJob = failedOrigPlan.jobs.find((job) => job.taskId === 'failed-orig-source-escape');
assert.ok(failedOrigOnlyJob);
assert.ok(failedOrigEscapeJob);
const failedOrigOnlyResult = failedOrigResults.get(failedOrigOnlyJob.id);
const failedOrigEscapeResult = failedOrigResults.get(failedOrigEscapeJob.id);
assert.ok(failedOrigOnlyResult);
assert.ok(failedOrigEscapeResult);
assert.deepStrictEqual(failedOrigOnlyResult.changedPaths, []);
assert.deepStrictEqual(failedOrigOnlyResult.ownershipViolations, []);
assert.deepStrictEqual(failedOrigOnlyResult.metadata.generatedFailedEvidence.paths, ['src/apply.ts.orig', 'src/apply.ts.rej']);
assert.deepStrictEqual(failedOrigEscapeResult.changedPaths, ['src/escape.ts']);
assert.deepStrictEqual(failedOrigEscapeResult.ownershipViolations, ['src/escape.ts']);
assert.deepStrictEqual(failedOrigEscapeResult.metadata.generatedFailedEvidence.paths, ['src/apply.ts.orig']);
const failedOrigCollection = await collectCodexSwarmRun({
  run: failedOrigOutDir,
  cwd: failedOrigRepo,
  outDir: path.join(tmp, 'failed-orig-collection'),
  checkStale: false
});
assert.strictEqual(failedOrigCollection.summary['failed-evidence'], 2);
assert.strictEqual(failedOrigCollection.summary['needs-human-port'], 0);
assert.strictEqual(failedOrigCollection.summary.mergeQueueRejectCount, 2);
assert.strictEqual(failedOrigCollection.summary.mergeQueueBlockCount, 0);
const failedOrigCollectedEntries = new Map(failedOrigCollection.buckets['failed-evidence'].map((entry) => [entry.jobId, entry]));
const failedOrigOnlyBundle = failedOrigCollectedEntries.get(failedOrigOnlyJob.id)?.bundle;
const failedOrigEscapeBundle = failedOrigCollectedEntries.get(failedOrigEscapeJob.id)?.bundle;
assert.ok(failedOrigOnlyBundle);
assert.ok(failedOrigEscapeBundle);
assert.strictEqual(failedOrigOnlyBundle.disposition, 'rejected');
assert.deepStrictEqual(failedOrigOnlyBundle.changedPaths, []);
assert.deepStrictEqual(failedOrigOnlyBundle.ownershipViolations, []);
assert.deepStrictEqual(failedOrigOnlyBundle.metadata.generatedFailedEvidence.paths, ['src/apply.ts.orig', 'src/apply.ts.rej']);
assert.strictEqual(failedOrigEscapeBundle.disposition, 'rejected');
assert.deepStrictEqual(failedOrigEscapeBundle.changedPaths, ['src/escape.ts']);
assert.deepStrictEqual(failedOrigEscapeBundle.ownershipViolations, ['src/escape.ts']);
const failedOrigAssignments = new Map(failedOrigCollection.hierarchicalMergeQueue.assignments.map((assignment) => [assignment.jobId, assignment]));
assert.strictEqual(failedOrigAssignments.get(failedOrigOnlyJob.id)?.action, 'reject');
assert.ok(failedOrigAssignments.get(failedOrigOnlyJob.id)?.reasons.includes('failed-or-invalid-evidence'));
assert.ok(!failedOrigAssignments.get(failedOrigOnlyJob.id)?.reasons.includes('true-blocker'));
assert.strictEqual(failedOrigAssignments.get(failedOrigEscapeJob.id)?.action, 'reject');
assert.ok(failedOrigAssignments.get(failedOrigEscapeJob.id)?.reasons.includes('failed-or-invalid-evidence'));
assert.ok(!failedOrigAssignments.get(failedOrigEscapeJob.id)?.reasons.includes('true-blocker'));

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
assert.ok(cliHelp.stdout.includes('--promote-patch-candidates[=true|false] --no-promote-patch-candidates'));
assert.ok(cliHelp.stdout.includes('--promotion-focused-command <cmd> --promotion-global-command <cmd> --promotion-global-glob <glob>'));
assert.ok(cliHelp.stdout.includes('Terminal coordinator decisions such as applied, committed, checked,'));
assert.ok(cliHelp.stdout.includes('queue outcomes, not\nhuman blockers.'));
assert.ok(cliHelp.stdout.includes('--no-auto-drain (raw worker diagnostics only; skips coordinator drain-work)'));
assert.ok(cliHelp.stdout.includes('--focused-command <cmd> --global-command <cmd> (required auto-drain apply/commit gates)'));
assert.ok(cliHelp.stdout.includes('--rerun-manifest <file>'));
assert.ok(cliHelp.stdout.includes('it does not apply old\npatches or bypass autonomous apply gates.'));
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
const autonomousReadback = autonomousResult.decisions[0].leaseReadback;
assert.strictEqual(autonomousReadback.source, 'autonomous-apply');
assert.strictEqual(autonomousReadback.decisionId, autonomousResult.decisions[0].id);
assert.strictEqual(autonomousReadback.status, 'applied');
assert.strictEqual(autonomousReadback.reason, 'patch applied and verification passed');
assert.strictEqual(autonomousReadback.terminal, true);
assert.deepStrictEqual(autonomousReadback.queueItemIds, ['apply-task']);
assert.deepStrictEqual(autonomousReadback.queueKeys, ['queue:apply-task', 'task:apply-task', 'job:apply-job']);
assert.deepStrictEqual(autonomousReadback.applyScope.changedPaths, ['src/apply.ts']);
assert.deepStrictEqual(autonomousReadback.applyScope.changedRegions, []);
assert.strictEqual(autonomousReadback.lease.scope, 'path');
assert.deepStrictEqual(autonomousReadback.lease.keys, ['path:src/apply.ts']);
assert.strictEqual(autonomousReadback.lease.lockPath, autonomousResult.lockPath);
assert.strictEqual(autonomousReadback.lease.token, autonomousResult.decisions[0].lockToken);
assert.strictEqual(autonomousReadback.head.leaseHead, autonomousResult.decisions[0].headBefore);
assert.strictEqual(autonomousReadback.head.headBefore, autonomousResult.decisions[0].headBefore);
assert.strictEqual(autonomousReadback.head.headAfter, autonomousResult.decisions[0].headAfter);
assert.strictEqual(autonomousReadback.head.currentHead, autonomousResult.decisions[0].headAfter);
assert.strictEqual(autonomousReadback.head.movedSinceCollection, false);
assert.strictEqual(autonomousReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(autonomousResult.decisionReadbacks, [autonomousReadback]);
assert.strictEqual(autonomousResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(await fs.readFile(path.join(autonomousRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
assert.strictEqual(await exists(autonomousResult.lockPath), false);
const autonomousDecisionLines = (await fs.readFile(autonomousResult.decisionLogPath, 'utf8')).trim().split(/\r?\n/);
assert.strictEqual(autonomousDecisionLines.length, 1);
const autonomousDecisionLogEntry = JSON.parse(autonomousDecisionLines[0]);
assert.strictEqual(autonomousDecisionLogEntry.jobId, 'apply-job');
assert.deepStrictEqual(autonomousDecisionLogEntry.lockKeys, ['path:src/apply.ts']);
assert.strictEqual(autonomousDecisionLogEntry.leaseReadback.decisionId, autonomousResult.decisions[0].id);
assert.deepStrictEqual(autonomousDecisionLogEntry.leaseReadback.lease.keys, ['path:src/apply.ts']);
const autonomousApplyArtifact = JSON.parse(await fs.readFile(path.join(tmp, 'autonomous-apply-out', 'autonomous-apply.json'), 'utf8'));
assert.deepStrictEqual(autonomousApplyArtifact.lockKeys, ['path:src/apply.ts']);
assert.deepStrictEqual(autonomousApplyArtifact.decisionReadbacks, [autonomousReadback]);

const readbackSupersedeRepo = await createApplyFixtureRepo(tmp, 'autonomous-readback-supersede-repo');
await fs.writeFile(path.join(readbackSupersedeRepo, 'src', 'first.ts'), 'old-first\n');
await fs.writeFile(path.join(readbackSupersedeRepo, 'src', 'second.ts'), 'old-second\n');
await execFileP('git', ['add', '--', 'src/first.ts', 'src/second.ts'], { cwd: readbackSupersedeRepo });
await execFileP('git', ['commit', '-m', 'Add readback files'], { cwd: readbackSupersedeRepo });
const readbackSupersedeCollection = path.join(tmp, 'autonomous-readback-supersede-collection');
const readbackSupersedeReadyRoot = path.join(readbackSupersedeCollection, 'ready-to-apply');
await writeSyntheticMergeBundle(readbackSupersedeReadyRoot, 'readback-first-job', {
  taskId: 'shared-readback-task',
  lane: 'readback',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  autoMergeable: true,
  changedPaths: ['src/first.ts'],
  changedRegions: ['src/first.ts#first'],
  ownedFilesTouched: ['src/first.ts'],
  allowedWrites: ['src/first.ts'],
  patchPath: 'changes.patch',
  queueItemIds: ['shared-readback-task']
});
await fs.writeFile(path.join(readbackSupersedeReadyRoot, 'readback-first-job', 'changes.patch'), [
  'diff --git a/src/first.ts b/src/first.ts',
  '--- a/src/first.ts',
  '+++ b/src/first.ts',
  '@@ -1 +1 @@',
  '-old-first',
  '+new-first',
  ''
].join('\n'));
await writeSyntheticMergeBundle(readbackSupersedeReadyRoot, 'readback-second-job', {
  taskId: 'shared-readback-task',
  lane: 'readback',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  autoMergeable: true,
  changedPaths: ['src/second.ts'],
  changedRegions: ['src/second.ts#second'],
  ownedFilesTouched: ['src/second.ts'],
  allowedWrites: ['src/second.ts'],
  patchPath: 'changes.patch',
  queueItemIds: ['shared-readback-task']
});
await fs.writeFile(path.join(readbackSupersedeReadyRoot, 'readback-second-job', 'changes.patch'), [
  'diff --git a/src/second.ts b/src/second.ts',
  '--- a/src/second.ts',
  '+++ b/src/second.ts',
  '@@ -1 +1 @@',
  '-old-second',
  '+new-second',
  ''
].join('\n'));
const readbackSupersedeResult = await autonomousApplyCodexSwarmRun({
  collection: readbackSupersedeCollection,
  cwd: readbackSupersedeRepo,
  outDir: path.join(tmp, 'autonomous-readback-supersede-out')
});
assert.strictEqual(readbackSupersedeResult.ok, true);
assert.deepStrictEqual(readbackSupersedeResult.decisions.map((decision) => decision.status), ['applied', 'applied']);
assert.strictEqual(readbackSupersedeResult.decisionReadbacks.length, 2);
const readbackSupersededDecision = readbackSupersedeResult.decisions[0];
const readbackLatestDecision = readbackSupersedeResult.decisions[1];
assert.strictEqual(readbackSupersededDecision.leaseReadback.supersededByDecisionId, readbackLatestDecision.id);
assert.deepStrictEqual(readbackLatestDecision.leaseReadback.supersedesDecisionIds, [readbackSupersededDecision.id]);
assert.strictEqual(readbackSupersedeResult.decisionReadbacks[0].supersededByDecisionId, readbackLatestDecision.id);
assert.deepStrictEqual(readbackSupersedeResult.decisionReadbacks[1].supersedesDecisionIds, [readbackSupersededDecision.id]);
assert.deepStrictEqual(readbackLatestDecision.leaseReadback.queueKeys, ['queue:shared-readback-task', 'task:shared-readback-task', 'job:readback-second-job']);
assert.strictEqual(readbackSupersedeResult.queueOverlay.summary.entryCount, 1);
assert.strictEqual(readbackSupersedeResult.queueOverlay.entries[0].jobId, readbackLatestDecision.jobId);
assert.strictEqual(readbackSupersedeResult.queueOverlay.entries[0].queueItemId, 'shared-readback-task');
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.currentDecisionCount, 1);
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.supersededDecisionCount, 1);
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.decisionHistoryCount, 2);
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.activeReviewCount, 0);
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.statusBuckets.terminal.count, 1);
assert.strictEqual(readbackSupersedeResult.queueOverlay.metadata.statusBuckets.supersededHistory.count, 1);
assert.match(readbackSupersedeResult.queueOverlay.metadata.statusBuckets.supersededHistory.description, /hidden from active overlay entries/);

const dependencyGateRepo = await createApplyFixtureRepo(tmp, 'autonomous-gate-order-repo');
await fs.mkdir(path.join(dependencyGateRepo, 'packages', 'frontier-swarm'), { recursive: true });
await fs.mkdir(path.join(dependencyGateRepo, 'packages', 'frontier-swarm-codex'), { recursive: true });
const dependencyGateLog = path.join(tmp, 'autonomous-gate-order.log');
const dependencyGateScript = (label, requiredPrevious) => [
  "const fs = require('fs');",
  `const logPath = ${JSON.stringify(dependencyGateLog)};`,
  "const current = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';",
  requiredPrevious ? `if (!current.includes(${JSON.stringify(`${requiredPrevious}\n`)})) process.exit(1);` : '',
  `fs.appendFileSync(logPath, ${JSON.stringify(`${label}\n`)});`
].filter(Boolean).join('\n');
const dependencyGateResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: dependencyGateRepo,
  outDir: path.join(tmp, 'autonomous-gate-order-out'),
  focusedCommands: [
    {
      name: 'frontier-swarm-codex-test',
      command: process.execPath,
      args: ['-e', dependencyGateScript('frontier-swarm-codex', 'frontier-swarm')],
      cwd: 'packages/frontier-swarm-codex',
      metadata: { packageName: '@shapeshift-labs/frontier-swarm-codex' }
    },
    {
      name: 'frontier-swarm-test',
      command: process.execPath,
      args: ['-e', dependencyGateScript('frontier-swarm')],
      cwd: 'packages/frontier-swarm',
      metadata: { packageName: '@shapeshift-labs/frontier-swarm' }
    }
  ]
});
assert.strictEqual(dependencyGateResult.ok, true);
assert.strictEqual(dependencyGateResult.summary.applied, 1);
assert.deepStrictEqual(dependencyGateResult.decisions[0].verification.names, ['frontier-swarm-test', 'frontier-swarm-codex-test']);
assert.strictEqual(await fs.readFile(dependencyGateLog, 'utf8'), 'frontier-swarm\nfrontier-swarm-codex\n');

const autonomousHumanQuestionRepo = await createApplyFixtureRepo(tmp, 'autonomous-human-question-repo');
const autonomousHumanQuestionCollection = path.join(tmp, 'autonomous-human-question-collection');
const autonomousHumanQuestionDir = path.join(autonomousHumanQuestionCollection, 'ready-to-apply', 'human-question-job');
const autonomousHumanQuestionReason = 'human-question: Should the parent coordinator approve this ownership exception?';
await fs.mkdir(autonomousHumanQuestionDir, { recursive: true });
await fs.writeFile(path.join(autonomousHumanQuestionDir, 'changes.patch'), [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'));
await fs.writeFile(path.join(autonomousHumanQuestionDir, 'merge.json'), JSON.stringify({
  ...mergeBundle,
  jobId: 'human-question-job',
  taskId: 'human-question-task',
  status: 'verified',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  riskLevel: 'low',
  autoMergeable: true,
  changedPaths: ['src/apply.ts'],
  changedRegions: ['src/apply.ts#apply'],
  ownedFilesTouched: ['src/apply.ts'],
  patchPath: 'changes.patch',
  commandsPassed: [],
  commandsFailed: [],
  queueItemIds: ['human-question-task'],
  staleAgainstHead: false,
  reasons: [autonomousHumanQuestionReason]
}, null, 2) + '\n');
const autonomousHumanQuestionResult = await autonomousApplyCodexSwarmRun({
  collection: autonomousHumanQuestionCollection,
  cwd: autonomousHumanQuestionRepo,
  outDir: path.join(tmp, 'autonomous-human-question-out'),
  focusedCommands: [{ name: 'would-see-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
});
assert.strictEqual(autonomousHumanQuestionResult.ok, false);
assert.strictEqual(autonomousHumanQuestionResult.summary['human-blocked'], 1);
assert.strictEqual(autonomousHumanQuestionResult.summary.gatedDecisionCount, 0);
assert.strictEqual(autonomousHumanQuestionResult.decisions[0].status, 'human-blocked');
assert.strictEqual(autonomousHumanQuestionResult.decisions[0].reason, autonomousHumanQuestionReason);
assert.deepStrictEqual(autonomousHumanQuestionResult.decisions[0].queueItemIds, ['human-question-task']);
assert.strictEqual(autonomousHumanQuestionResult.decisions[0].verification.planned, 1);
assert.strictEqual(autonomousHumanQuestionResult.decisions[0].verification.run, 0);
assert.deepStrictEqual(autonomousHumanQuestionResult.decisions[0].commands, []);
assert.strictEqual(autonomousHumanQuestionResult.queueOverlay.entries[0].status, 'blocked');
assert.strictEqual(autonomousHumanQuestionResult.queueOverlay.entries[0].mergeReadiness, 'blocked');
assert.strictEqual(autonomousHumanQuestionResult.queueOverlay.entries[0].disposition, 'blocked');
assert.strictEqual(await fs.readFile(path.join(autonomousHumanQuestionRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autonomousHumanQuestionRepo })).stdout, '');

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
assert.strictEqual(autonomousConflictResult.queueOverlay.metadata.conflictRetryCount, 1);
assert.strictEqual(autonomousConflictResult.queueOverlay.metadata.humanNeededCount, 0);
assert.strictEqual(autonomousConflictResult.queueOverlay.metadata.statusBuckets.conflictRetry.count, 1);
assert.match(autonomousConflictResult.queueOverlay.metadata.statusBuckets.conflictRetry.description, /not human-needed blockers/);

const staleBeforeApplyRepo = await createApplyFixtureRepo(tmp, 'autonomous-stale-before-apply-repo');
const staleBeforeApplyRunDir = path.join(tmp, 'autonomous-stale-before-apply-run');
await writeSyntheticMergeBundle(staleBeforeApplyRunDir, 'stale-before-apply', {
  taskId: 'stale-before-apply-task',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  autoMergeable: true,
  changedPaths: ['src/apply.ts'],
  ownedFilesTouched: ['src/apply.ts'],
  allowedWrites: ['src/apply.ts'],
  patchPath: 'changes.patch',
  queueItemIds: ['stale-before-apply-task']
});
await fs.writeFile(path.join(staleBeforeApplyRunDir, 'stale-before-apply', 'changes.patch'), [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'));
const staleBeforeApplyCollection = await collectCodexSwarmRun({
  run: staleBeforeApplyRunDir,
  cwd: staleBeforeApplyRepo,
  outDir: path.join(tmp, 'autonomous-stale-before-apply-collection')
});
assert.strictEqual(staleBeforeApplyCollection.summary['ready-to-apply'], 1);
const staleBeforeApplyCollectedBundle = JSON.parse(await fs.readFile(path.join(staleBeforeApplyCollection.outDir, 'ready-to-apply', 'stale-before-apply', 'merge.json'), 'utf8'));
const staleBeforeApplyCollectedHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: staleBeforeApplyRepo })).stdout.trim();
assert.strictEqual(staleBeforeApplyCollectedBundle.metadata.frontierSwarmCodex.collection.head, staleBeforeApplyCollectedHead);
await fs.writeFile(path.join(staleBeforeApplyRepo, 'src', 'head.txt'), 'advanced\n');
await execFileP('git', ['add', '--', 'src/head.txt'], { cwd: staleBeforeApplyRepo });
await execFileP('git', ['commit', '-m', 'Advance unrelated head before autonomous apply'], { cwd: staleBeforeApplyRepo });
const staleBeforeApplyAdvancedHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: staleBeforeApplyRepo })).stdout.trim();
const staleBeforeApplyResult = await autonomousApplyCodexSwarmRun({
  collection: staleBeforeApplyCollection.outDir,
  cwd: staleBeforeApplyRepo,
  outDir: path.join(tmp, 'autonomous-stale-before-apply-out')
});
const staleBeforeApplyDecision = staleBeforeApplyResult.decisions[0];
assert.strictEqual(staleBeforeApplyResult.ok, false);
assert.strictEqual(staleBeforeApplyResult.summary.rerun, 1);
assert.strictEqual(staleBeforeApplyDecision.status, 'rerun');
assert.strictEqual(staleBeforeApplyDecision.reason, 'repository head changed since bundle collection; rerun against current head');
assert.strictEqual(staleBeforeApplyDecision.headBefore, staleBeforeApplyCollectedHead);
assert.strictEqual(staleBeforeApplyDecision.headAfter, staleBeforeApplyAdvancedHead);
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.status, 'rerun');
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.head.collectionHead, staleBeforeApplyCollectedHead);
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.head.leaseHead, staleBeforeApplyAdvancedHead);
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.head.currentHead, staleBeforeApplyAdvancedHead);
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.head.movedSinceCollection, true);
assert.strictEqual(staleBeforeApplyDecision.leaseReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(staleBeforeApplyResult.decisionReadbacks, [staleBeforeApplyDecision.leaseReadback]);
assert.strictEqual(staleBeforeApplyResult.queueOverlay.entries[0].status, 'stale-against-head');
assert.strictEqual(await fs.readFile(path.join(staleBeforeApplyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual(await fs.readFile(path.join(staleBeforeApplyRepo, 'src', 'head.txt'), 'utf8'), 'advanced\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: staleBeforeApplyRepo })).stdout, '');

const staleConflictBeforeApplyRepo = await createApplyFixtureRepo(tmp, 'autonomous-stale-conflict-before-apply-repo');
const staleConflictBeforeApplyRunDir = path.join(tmp, 'autonomous-stale-conflict-before-apply-run');
await writeSyntheticMergeBundle(staleConflictBeforeApplyRunDir, 'stale-conflict-before-apply', {
  taskId: 'stale-conflict-before-apply-task',
  mergeReadiness: 'verified-patch',
  disposition: 'auto-mergeable',
  autoMergeable: true,
  changedPaths: ['src/apply.ts'],
  ownedFilesTouched: ['src/apply.ts'],
  allowedWrites: ['src/apply.ts'],
  patchPath: 'changes.patch',
  queueItemIds: ['stale-conflict-before-apply-task']
});
await fs.writeFile(path.join(staleConflictBeforeApplyRunDir, 'stale-conflict-before-apply', 'changes.patch'), [
  'diff --git a/src/apply.ts b/src/apply.ts',
  '--- a/src/apply.ts',
  '+++ b/src/apply.ts',
  '@@ -1 +1 @@',
  '-old',
  '+new',
  ''
].join('\n'));
const staleConflictBeforeApplyCollection = await collectCodexSwarmRun({
  run: staleConflictBeforeApplyRunDir,
  cwd: staleConflictBeforeApplyRepo,
  outDir: path.join(tmp, 'autonomous-stale-conflict-before-apply-collection')
});
const staleConflictBeforeApplyCollectedHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: staleConflictBeforeApplyRepo })).stdout.trim();
await fs.writeFile(path.join(staleConflictBeforeApplyRepo, 'src', 'apply.ts'), 'other\n');
await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: staleConflictBeforeApplyRepo });
await execFileP('git', ['commit', '-m', 'Advance conflicting head before autonomous apply'], { cwd: staleConflictBeforeApplyRepo });
const staleConflictBeforeApplyAdvancedHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: staleConflictBeforeApplyRepo })).stdout.trim();
const staleConflictBeforeApplyResult = await autonomousApplyCodexSwarmRun({
  collection: staleConflictBeforeApplyCollection.outDir,
  cwd: staleConflictBeforeApplyRepo,
  outDir: path.join(tmp, 'autonomous-stale-conflict-before-apply-out')
});
const staleConflictBeforeApplyDecision = staleConflictBeforeApplyResult.decisions[0];
assert.strictEqual(staleConflictBeforeApplyResult.ok, false);
assert.strictEqual(staleConflictBeforeApplyResult.summary['conflict-blocked'], 1);
assert.strictEqual(staleConflictBeforeApplyDecision.status, 'conflict-blocked');
assert.strictEqual(staleConflictBeforeApplyDecision.reason, 'repository head changed since bundle collection and git apply --check failed');
assert.strictEqual(staleConflictBeforeApplyDecision.headBefore, staleConflictBeforeApplyCollectedHead);
assert.strictEqual(staleConflictBeforeApplyDecision.headAfter, staleConflictBeforeApplyAdvancedHead);
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.status, 'conflict-blocked');
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.head.collectionHead, staleConflictBeforeApplyCollectedHead);
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.head.leaseHead, staleConflictBeforeApplyAdvancedHead);
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.head.currentHead, staleConflictBeforeApplyAdvancedHead);
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.head.movedSinceCollection, true);
assert.strictEqual(staleConflictBeforeApplyDecision.leaseReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(staleConflictBeforeApplyResult.decisionReadbacks, [staleConflictBeforeApplyDecision.leaseReadback]);
assert.strictEqual(staleConflictBeforeApplyResult.queueOverlay.entries[0].status, 'stale-against-head');
assert.strictEqual(await fs.readFile(path.join(staleConflictBeforeApplyRepo, 'src', 'apply.ts'), 'utf8'), 'other\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: staleConflictBeforeApplyRepo })).stdout, '');

const rollbackRepo = await createApplyFixtureRepo(tmp, 'autonomous-rollback-repo');
const rollbackResult = await autonomousApplyCodexSwarmRun({
  collection: path.join(tmp, 'ready-collection'),
  cwd: rollbackRepo,
  outDir: path.join(tmp, 'autonomous-rollback-out'),
  focusedCommands: [
    { name: 'reject-new', command: 'node', args: ['-e', 'process.exit(1)'] },
    { name: 'must-not-be-marked-passed', command: 'node', args: ['-e', 'process.exit(0)'] }
  ]
});
assert.strictEqual(rollbackResult.ok, false);
assert.strictEqual(rollbackResult.summary.rejected, 1);
assert.strictEqual(rollbackResult.summary.finalGateOk, false);
assert.strictEqual(rollbackResult.summary.finalGateState, 'failed');
assert.strictEqual(rollbackResult.summary.failedRequiredGateCount, 1);
assert.strictEqual(rollbackResult.summary.skippedRequiredGateCount, 1);
const rollbackDecision = rollbackResult.decisions[0];
assert.strictEqual(rollbackDecision.status, 'rejected');
assert.match(rollbackDecision.reason, /verification failed: reject-new/);
assert.strictEqual(rollbackDecision.leaseReadback.status, 'rejected');
assert.strictEqual(rollbackDecision.leaseReadback.terminal, true);
assert.strictEqual(rollbackDecision.leaseReadback.head.leaseHead, rollbackDecision.headBefore);
assert.strictEqual(rollbackDecision.leaseReadback.head.movedSinceCollection, false);
assert.strictEqual(rollbackDecision.leaseReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(rollbackResult.decisionReadbacks, [rollbackDecision.leaseReadback]);
assert.deepStrictEqual(rollbackDecision.verification, {
  planned: 2,
  run: 1,
  required: 2,
  passed: 0,
  failed: 1,
  skipped: 1,
  skippedRequired: 1,
  names: ['reject-new', 'must-not-be-marked-passed'],
  passedNames: [],
  failedNames: ['reject-new'],
  skippedNames: ['must-not-be-marked-passed'],
  skippedRequiredNames: ['must-not-be-marked-passed']
});
assert.strictEqual(rollbackDecision.finalGateSummary.ok, false);
assert.strictEqual(rollbackDecision.finalGateSummary.state, 'failed');
assert.deepStrictEqual(rollbackDecision.finalGateSummary.gates.map((gate) => ({
  index: gate.index,
  name: gate.name,
  required: gate.required,
  status: gate.status,
  exitCode: gate.exitCode
})), [{
  index: 1,
  name: 'reject-new',
  required: true,
  status: 'failed',
  exitCode: 1
}, {
  index: 2,
  name: 'must-not-be-marked-passed',
  required: true,
  status: 'skipped',
  exitCode: undefined
}]);
assert.ok(rollbackDecision.commands.some((entry) => (
  entry.command[0] === 'git'
    && entry.command[1] === 'apply'
    && entry.command[2] === '-R'
    && entry.status === 0
)));
assert.strictEqual(rollbackResult.finalGateSummary.ok, false);
assert.strictEqual(rollbackResult.finalGateSummary.state, 'failed');
assert.deepStrictEqual(rollbackResult.finalGateSummary.failedRequiredGateNames, ['reject-new']);
assert.deepStrictEqual(rollbackResult.finalGateSummary.skippedRequiredGateNames, ['must-not-be-marked-passed']);
assert.strictEqual(rollbackResult.queueOverlay.entries[0].status, 'satisfied');
assert.strictEqual(rollbackResult.queueOverlay.entries[0].disposition, 'rejected');
assert.strictEqual(rollbackResult.queueOverlay.metadata.terminalCount, 1);
assert.strictEqual(rollbackResult.queueOverlay.metadata.activeReviewCount, 0);
assert.strictEqual(rollbackResult.queueOverlay.metadata.statusBuckets.terminal.count, 1);
assert.match(rollbackResult.queueOverlay.metadata.statusBuckets.terminal.description, /rejected/);
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
await fs.mkdir(autoDrainOutDir, { recursive: true });
const autoDrainAnswerLogPath = path.join(autoDrainOutDir, 'human-action-answers.jsonl');
await fs.writeFile(autoDrainAnswerLogPath, JSON.stringify({
  id: 'answer-apply-task',
  queueItemId: 'apply-task',
  status: 'answered',
  answer: 'No human action needed for already-applied coordinator work.',
  evidencePath: 'operator-answer.md'
}) + '\n{invalid-json\n');
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
const autoDrainPidManifest = await readCodexPidManifest(path.join(autoDrainOutDir, 'pids.json'));
const autoDrainParentPidEntries = autoDrainPidManifest.entries.filter((entry) => entry.role === 'parent');
assert.strictEqual(autoDrainParentPidEntries.length, 1);
assert.strictEqual(autoDrainParentPidEntries[0].status, 'finished');
assert.strictEqual(autoDrainParentPidEntries[0].exitCode, 0);
assert.strictEqual(typeof autoDrainParentPidEntries[0].finishedAt, 'number');
assert.deepStrictEqual(autoDrainPidManifest.entries.filter((entry) => entry.role === 'parent' && entry.status !== 'finished'), []);
const autoDrainStopFinished = await stopCodexSwarmRun({ run: autoDrainOutDir });
assert.strictEqual(autoDrainStopFinished.ok, true);
assert.deepStrictEqual(autoDrainStopFinished.stopped, []);
assert.deepStrictEqual(autoDrainStopFinished.missing, []);
assert.strictEqual(autoDrainDashboard.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.kind, 'frontier.swarm-codex.dashboard-queue-metadata');
assert.strictEqual(autoDrainDashboard.queueMetadata.available, true);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.available, true);
assert.deepStrictEqual(autoDrainRun.autoDrain.humanAnswers.paths, [autoDrainAnswerLogPath]);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.count, 1);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.consumedCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.routedDecisionCount, 0);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.ignoredCount, 1);
assert.strictEqual(autoDrainRun.autoDrain.humanAnswers.parseErrorCount, 1);
assert.strictEqual(autoDrainDashboard.humanAnswers.available, true);
assert.deepStrictEqual(autoDrainDashboard.humanAnswers, autoDrainDashboard.queueMetadata.humanAnswers);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.kind, 'frontier.swarm-codex.dashboard-human-answers');
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.routingKind, 'frontier.swarm-codex.human-answer-routing');
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.count, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.answeredCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.consumedCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.routedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.ignoredCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanAnswers.parseErrorCount, 1);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanAnswers.answerIds, ['answer:answer-apply-task']);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanAnswers.answerRoutes, ['answered']);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanAnswers.evidencePaths, ['operator-answer.md']);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanAnswers.paths, [autoDrainAnswerLogPath]);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.paths.humanAnswers, [autoDrainAnswerLogPath]);
assert.ok(await exists(path.join(autoDrainOutDir, 'auto-drain', 'human-answer-routing.json')));
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
assert.deepStrictEqual(autoDrainDashboard.mergeQueueHealth, autoDrainDashboard.queueMetadata.mergeQueueHealth);
assert.deepStrictEqual(autoDrainDashboard.humanQuestions, autoDrainDashboard.queueMetadata.humanQuestions);
assert.deepStrictEqual(autoDrainDashboard.operatorSummary, autoDrainDashboard.queueMetadata.operatorSummary);
assert.strictEqual(autoDrainDashboard.queueMetadata.queueHealth.kind, 'frontier.swarm-codex.dashboard-queue-health');
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.kind, 'frontier.swarm-codex.dashboard-merge-queue-health');
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.available, true);
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.counts.activeLeaseCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.counts.appliedDecisionCount, 1);
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.counts.committedDecisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.appliedDecisions[0].status, 'applied');
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.mergeQueueHealth.appliedDecisions[0].queueItemIds, ['apply-task']);
assert.ok(autoDrainDashboard.queueMetadata.mergeQueueHealth.queueScopes.length > 0);
assert.ok(autoDrainDashboard.queueMetadata.mergeQueueHealth.coordinatorAssignments.some((assignment) => assignment.assignedAction === 'apply-local'));
assert.ok(autoDrainDashboard.queueMetadata.mergeQueueHealth.terminalDecisions.some((decision) => decision.source === 'autonomous-apply' && decision.status === 'applied'));
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
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.decisionCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.answeredCount, 0);
assert.strictEqual(autoDrainDashboard.queueMetadata.humanQuestions.routedDecisionCount, 0);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.jobIds, []);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.openDecisionIds, []);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.answeredDecisionIds, []);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.answerIds, []);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.humanQuestions.answerRoutes, []);
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
assert.strictEqual(autoDrainResults.autoDrainArtifacts.iterations[0].applyPath, path.join(autoDrainOutDir, 'auto-drain', 'apply-01', 'autonomous-apply.json'));
assert.strictEqual(autoDrainResults.autoDrainArtifacts.iterations[0].autonomousQueueOverlayPath, path.join(autoDrainOutDir, 'auto-drain', 'apply-01', 'autonomous-queue-overlay.json'));
assert.strictEqual(autoDrainResults.autoDrainArtifacts.iterations[0].decisionLogPath, autoDrainRun.autoDrain.iterations[0].apply.decisionLogPath);
assert.ok(await exists(autoDrainResults.autoDrainArtifacts.iterations[0].applyPath));
assert.ok(await exists(autoDrainResults.autoDrainArtifacts.iterations[0].autonomousQueueOverlayPath));
assert.ok(await exists(autoDrainResults.autoDrainArtifacts.iterations[0].decisionLogPath));
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts, autoDrainRun.autoDrain.artifacts);
assert.deepStrictEqual(autoDrainResults.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
assert.deepStrictEqual(autoDrainDashboard.autoDrainArtifacts, autoDrainRun.autoDrainArtifacts);
const autoDrainRerunManifestPath = path.join(autoDrainOutDir, 'auto-drain', 'rerun-manifest.json');
assert.deepStrictEqual(autoDrainRun.autoDrainArtifacts.rerunManifest.paths, [autoDrainRerunManifestPath]);
assert.deepStrictEqual(autoDrainDashboard.queueMetadata.paths.rerunManifests, [autoDrainRerunManifestPath]);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.rerunManifest.taskCount, 0);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.rerunManifestCount, 1);
assert.strictEqual(autoDrainRun.autoDrainArtifacts.summary.rerunTaskCount, 0);
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
const autoDrainCommitIteration = autoDrainCommitRun.autoDrain.iterations[0];
const autoDrainCommitJobId = autoDrainCommitRun.run.results[0].jobId;
assert.strictEqual(autoDrainCommitIteration.collection.summary['ready-to-apply'], 1);
assert.deepStrictEqual(autoDrainCommitIteration.readyJobIds, [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitIteration.admittedJobIds, [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitIteration.deferredJobIds, []);
assert.deepStrictEqual(autoDrainCommitIteration.collection.mergeAdmission.admitted, [autoDrainCommitJobId]);
assert.strictEqual(autoDrainCommitIteration.collection.summary.admittedCount, 1);
assert.strictEqual(autoDrainCommitIteration.collection.summary.deferredCount, 0);
assert.strictEqual(autoDrainCommitIteration.collection.summary.mergeQueueApplyLocalCount, 1);
assert.strictEqual(autoDrainCommitIteration.collection.summary.mergeQueueQueueLocalCount, 0);
assert.strictEqual(autoDrainCommitIteration.collection.summary.mergeQueuePromoteCount, 0);
assert.strictEqual(autoDrainCommitIteration.grouping.summary.readyCount, 1);
assert.strictEqual(autoDrainCommitIteration.grouping.summary.admittedCount, 1);
assert.strictEqual(autoDrainCommitIteration.grouping.summary.deferredCount, 0);
assert.strictEqual(autoDrainCommitIteration.grouping.summary.queueDebtCount, 0);
const autoDrainCommitQueueAssignment = autoDrainCommitIteration.collection.hierarchicalMergeQueue.assignments.find((assignment) => assignment.jobId === autoDrainCommitJobId);
assert.ok(autoDrainCommitQueueAssignment);
assert.strictEqual(autoDrainCommitQueueAssignment.action, 'apply-local');
assert.strictEqual(autoDrainCommitQueueAssignment.admitted, true);
assert.deepStrictEqual(autoDrainCommitQueueAssignment.queueItemIds, ['apply-task']);
assert.deepStrictEqual(autoDrainCommitQueueAssignment.changedPaths, ['src/apply.ts']);
assert.deepStrictEqual(autoDrainCommitQueueAssignment.changedRegions, ['src/apply.ts#apply']);
assert.ok(autoDrainCommitQueueAssignment.leaseKey.startsWith('merge:semantic:'));
assert.ok(autoDrainCommitQueueAssignment.leaseKey.includes('src/apply.ts#apply'));
assert.ok(await exists(autoDrainCommitIteration.collection.artifacts.collectionPath));
assert.ok(await exists(autoDrainCommitIteration.collection.artifacts.mergeAdmissionPath));
assert.ok(await exists(autoDrainCommitIteration.collection.artifacts.hierarchicalMergeQueuePath));
assert.ok(await exists(autoDrainCommitIteration.coordinatorAgentDrainPath));
assert.ok(await exists(autoDrainCommitIteration.coordinatorAgentDrainWorkPath));
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.assignmentCount, 1);
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.selectedCount, 1);
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.deferredCount, 0);
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.applyLocalCount, 1);
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.queueLocalCount, 0);
assert.strictEqual(autoDrainCommitIteration.coordinatorAgentDrain.summary.promoteCount, 0);
const autoDrainCommitDrainWork = autoDrainCommitIteration.coordinatorAgentDrainWork;
assert.ok(autoDrainCommitDrainWork.summary.leaseCount >= 1);
assert.strictEqual(autoDrainCommitDrainWork.summary.assignmentCount, 1);
assert.strictEqual(autoDrainCommitDrainWork.summary.terminalCount, 1);
assert.strictEqual(autoDrainCommitDrainWork.summary.nonTerminalCount, 0);
assert.strictEqual(autoDrainCommitDrainWork.summary.appliedCount, 1);
assert.strictEqual(autoDrainCommitDrainWork.summary.queuedCount, 0);
assert.strictEqual(autoDrainCommitDrainWork.summary.escalatedCount, 0);
const autoDrainCommitDrainAssignment = autoDrainCommitDrainWork.assignments[0];
assert.strictEqual(autoDrainCommitDrainAssignment.jobId, autoDrainCommitJobId);
assert.strictEqual(autoDrainCommitDrainAssignment.assignedAction, 'apply-local');
assert.strictEqual(autoDrainCommitDrainAssignment.decision, 'applied');
assert.strictEqual(autoDrainCommitDrainAssignment.terminal, true);
assert.deepStrictEqual(autoDrainCommitDrainAssignment.queueItemIds, ['apply-task']);
assert.ok(autoDrainCommitDrainAssignment.leaseId.startsWith('swarm-coordinator-agent-drain-lease:'));
assert.strictEqual(autoDrainCommitDrainAssignment.leaseScope, autoDrainCommitQueueAssignment.leaseKey);
assert.ok(autoDrainCommitDrainWork.leases.some((lease) => (
  lease.id === autoDrainCommitDrainAssignment.leaseId
    && lease.leaseScope === autoDrainCommitDrainAssignment.leaseScope
)));
assert.deepStrictEqual(autoDrainCommitDrainWork.terminalDecisions.map((decision) => decision.jobId), [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitDrainWork.terminalDecisions.map((decision) => decision.decision), ['applied']);
assert.strictEqual(autoDrainCommitDrainWork.terminalDecisions[0].leaseId, autoDrainCommitDrainAssignment.leaseId);
assert.strictEqual(autoDrainCommitDrainWork.terminalDecisions[0].leaseScope, autoDrainCommitDrainAssignment.leaseScope);
assert.deepStrictEqual(autoDrainCommitDrainWork.byAction['apply-local'], [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitDrainWork.byLeaseScope[autoDrainCommitDrainAssignment.leaseScope], [autoDrainCommitJobId]);
const autoDrainCommitDecision = autoDrainCommitIteration.apply.decisions[0];
assert.strictEqual(autoDrainCommitDecision.status, 'committed');
assert.strictEqual(autoDrainCommitIteration.apply.summary.committed, 1);
assert.strictEqual(autoDrainCommitIteration.apply.summary.gatedDecisionCount, 1);
assert.strictEqual(autoDrainCommitIteration.apply.summary.verificationGateCount, 1);
assert.strictEqual(autoDrainCommitIteration.apply.summary.requiredVerificationGateCount, 1);
assert.deepStrictEqual(autoDrainCommitDecision.verification, {
  planned: 1,
  run: 1,
  required: 1,
  passed: 1,
  failed: 0,
  skipped: 0,
  skippedRequired: 0,
  names: ['coordinator-sees-new'],
  passedNames: ['coordinator-sees-new'],
  failedNames: [],
  skippedNames: [],
  skippedRequiredNames: []
});
assert.match(autoDrainCommitDecision.headAfter, /^[0-9a-f]{40}$/);
assert.strictEqual(autoDrainCommitDecision.commit, autoDrainCommitDecision.headAfter);
assert.notStrictEqual(autoDrainCommitDecision.headAfter, autoDrainCommitDecision.headBefore);
assert.strictEqual(autoDrainCommitDecision.leaseReadback.status, 'committed');
assert.strictEqual(autoDrainCommitDecision.leaseReadback.head.leaseHead, autoDrainCommitDecision.headBefore);
assert.strictEqual(autoDrainCommitDecision.leaseReadback.head.currentHead, autoDrainCommitDecision.headAfter);
assert.strictEqual(autoDrainCommitDecision.leaseReadback.head.commit, autoDrainCommitDecision.headAfter);
assert.strictEqual(autoDrainCommitDecision.leaseReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(autoDrainCommitIteration.apply.decisionReadbacks, [autoDrainCommitDecision.leaseReadback]);
assert.strictEqual(autoDrainCommitDecision.jobId, autoDrainCommitJobId);
assert.deepStrictEqual(autoDrainCommitDecision.queueItemIds, ['apply-task']);
assert.deepStrictEqual(autoDrainCommitDecision.lockKeys, ['region:src/apply.ts#apply']);
assert.ok(autoDrainCommitDecision.commands.some((entry) => (
  entry.command[0] === 'git'
    && entry.command[1] === 'apply'
    && entry.command[2] === '--check'
    && entry.command[3] === autoDrainCommitDecision.patchPath
)));
assert.ok(autoDrainCommitDecision.commands.some((entry) => (
  entry.command[0] === 'node'
    && entry.command[1] === '-e'
    && entry.command[2].includes("readFileSync('src/apply.ts','utf8')")
)));
const autoDrainCommitDecisionLog = (await fs.readFile(autoDrainCommitIteration.apply.decisionLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
assert.deepStrictEqual(autoDrainCommitDecisionLog.map((decision) => decision.status), ['committed']);
assert.strictEqual(autoDrainCommitDecisionLog[0].id, autoDrainCommitDecision.id);
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
assert.strictEqual(autoDrainCommitRun.autoDrain.summary.remainingReadyCount, 0);
assert.deepStrictEqual(autoDrainCommitRun.autoDrain.terminalJobIds, [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitRun.autoDrain.blockedJobIds, []);
assert.strictEqual(autoDrainCommitIteration.postApplyCollection.buckets['ready-to-apply'].length, 0);
assert.strictEqual(autoDrainCommitIteration.postApplyCollection.buckets['needs-human-port'].length, 0);
assert.strictEqual(autoDrainCommitIteration.postApplyCollection.buckets['failed-evidence'].length, 0);
assert.strictEqual(autoDrainCommitIteration.postApplyCollection.summary.admittedCount, 0);
assert.ok(await exists(autoDrainCommitIteration.postApplyCollectionPath));
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.rerunManifest.taskCount, 0);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.coordinatorAgentDrainWork.appliedCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.coordinatorAgentDrainWork.queuedCount, 0);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.coordinatorAgentDrainWork.escalatedCount, 0);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.mergeQueue.applyLocalCount, 1);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.mergeQueue.queueLocalCount, 0);
assert.strictEqual(autoDrainCommitRun.autoDrainArtifacts.mergeQueue.promoteCount, 0);
const autoDrainCommitDashboard = JSON.parse(await fs.readFile(path.join(autoDrainCommitOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainCommitDashboard.autoDrain.summary.committedDecisionCount, 1);
assert.strictEqual(autoDrainCommitDashboard.autoDrain.summary.remainingReadyCount, 0);
assert.deepStrictEqual(autoDrainCommitDashboard.autoDrain.terminalJobIds, [autoDrainCommitJobId]);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.leaseCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.localQueueCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.promotedCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.staleOrRerunCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.queueHealth.committedDecisionCount, 1);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.humanQuestions.count, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.status, 'ok');
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 1);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.currentHeadConflicts, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.deferredCoordinatorQueues, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.deferredPromoteQueues, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
assert.strictEqual(autoDrainCommitDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 0);
const autoDrainCommitCards = new Map(autoDrainCommitDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainCommitCards.get('coordination-debt').value, 0);
assert.strictEqual(autoDrainCommitCards.get('coordination-debt').status, 'ok');
assert.strictEqual(autoDrainCommitCards.get('stale-rerun').value, 0);
assert.strictEqual(autoDrainCommitCards.get('true-blockers').value, 0);
const autoDrainCommitCurrentHeadProof = {
  admittedJobIds: autoDrainCommitIteration.collection.mergeAdmission.admitted,
  readyJobIds: autoDrainCommitIteration.readyJobIds,
  drainLeaseScope: autoDrainCommitDrainAssignment.leaseScope,
  drainTerminal: autoDrainCommitDrainAssignment.terminal,
  decisionStatus: autoDrainCommitDecision.status,
  gateNames: autoDrainCommitDecision.verification.passedNames,
  commit: autoDrainCommitDecision.commit,
  remainingReadyCount: autoDrainCommitRun.autoDrain.summary.remainingReadyCount,
  postApplyReadyCount: autoDrainCommitIteration.postApplyCollection.buckets['ready-to-apply'].length,
  reviewDebt: {
    activeCoordinatorQueueCount: autoDrainCommitDashboard.queueMetadata.queueHealth.activeCoordinatorQueueCount,
    localQueueCount: autoDrainCommitDashboard.queueMetadata.queueHealth.localQueueCount,
    promotedCount: autoDrainCommitDashboard.queueMetadata.queueHealth.promotedCount,
    staleOrRerunCount: autoDrainCommitDashboard.queueMetadata.queueHealth.staleOrRerunCount,
    trueBlockerCount: autoDrainCommitDashboard.queueMetadata.queueHealth.trueBlockerCount,
    humanQuestions: autoDrainCommitDashboard.humanQuestions.count
  }
};
assert.deepStrictEqual(autoDrainCommitCurrentHeadProof.admittedJobIds, [autoDrainCommitJobId]);
assert.deepStrictEqual(autoDrainCommitCurrentHeadProof.readyJobIds, [autoDrainCommitJobId]);
assert.ok(autoDrainCommitCurrentHeadProof.drainLeaseScope.startsWith('merge:semantic:'));
assert.strictEqual(autoDrainCommitCurrentHeadProof.drainTerminal, true);
assert.strictEqual(autoDrainCommitCurrentHeadProof.decisionStatus, 'committed');
assert.deepStrictEqual(autoDrainCommitCurrentHeadProof.gateNames, ['coordinator-sees-new']);
assert.match(autoDrainCommitCurrentHeadProof.commit, /^[0-9a-f]{40}$/);
assert.deepStrictEqual(autoDrainCommitCurrentHeadProof.reviewDebt, {
  activeCoordinatorQueueCount: 0,
  localQueueCount: 0,
  promotedCount: 0,
  staleOrRerunCount: 0,
  trueBlockerCount: 0,
  humanQuestions: 0
});
assert.deepStrictEqual({
  remainingReadyCount: autoDrainCommitCurrentHeadProof.remainingReadyCount,
  postApplyReadyCount: autoDrainCommitCurrentHeadProof.postApplyReadyCount
}, {
  remainingReadyCount: 0,
  postApplyReadyCount: 0
});

const autoDrainCommitRerunRepo = await createApplyFixtureRepo(tmp, 'auto-drain-commit-rerun-repo');
const autoDrainCommitRerunPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-commit-rerun',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }],
    layers: [{ id: 'merge' }]
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
      layer: 'merge',
      compute: 'codex.deep',
      priority: 17,
      concurrencyKey: 'auto-drain-commit-rerun:apply-second-commit-task',
      ownedFiles: ['src/apply.ts'],
      ownedRegions: ['src/apply.ts#apply'],
      changedRegions: ['src/apply.ts#apply'],
      acceptance: ['second commit rerun keeps scheduling metadata'],
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
const autoDrainCommitRerunManifestPath = path.join(autoDrainCommitRerunOutDir, 'auto-drain', 'rerun-manifest.json');
const autoDrainCommitRerunManifest = JSON.parse(await fs.readFile(autoDrainCommitRerunManifestPath, 'utf8'));
const autoDrainCommitRerunHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: autoDrainCommitRerunRepo })).stdout.trim();
assert.strictEqual(autoDrainCommitRerunManifest.kind, FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND);
assert.strictEqual(autoDrainCommitRerunManifest.currentHead, autoDrainCommitRerunHead);
assert.strictEqual(autoDrainCommitRerunManifest.sourceHead, autoDrainCommitRerunHead);
assert.deepStrictEqual(autoDrainCommitRerunManifest.sourceHeads, [autoDrainCommitRerunHead]);
assert.deepStrictEqual(autoDrainCommitRerunRun.autoDrainArtifacts.rerunManifest.paths, [autoDrainCommitRerunManifestPath]);
assert.strictEqual(autoDrainCommitRerunRun.autoDrainArtifacts.rerunManifest.taskCount, 1);
assert.strictEqual(autoDrainCommitRerunRun.autoDrainArtifacts.rerunManifest.sourceHead, autoDrainCommitRerunHead);
assert.strictEqual(autoDrainCommitRerunManifest.summary.taskCount, 1);
assert.strictEqual(autoDrainCommitRerunManifest.summary.staleAgainstHeadCount, 1);
assert.strictEqual(autoDrainCommitRerunManifest.summary.queueRerunCount, 1);
assert.strictEqual(autoDrainCommitRerunManifest.summary.conflictBlockedCount, 0);
assert.strictEqual(autoDrainCommitRerunManifest.summary.sourceHeadCount, 1);
assert.strictEqual(autoDrainCommitRerunManifest.items.length, 1);
const autoDrainCommitRerunTask = autoDrainCommitRerunManifest.items[0];
assert.strictEqual(autoDrainCommitRerunTask.id, 'apply-second-commit-task-rerun-current-head');
assert.strictEqual(autoDrainCommitRerunTask.lane, 'apply');
assert.strictEqual(autoDrainCommitRerunTask.layer, 'merge');
assert.strictEqual(autoDrainCommitRerunTask.compute, 'codex.deep');
assert.strictEqual(autoDrainCommitRerunTask.priority, 17);
assert.strictEqual(autoDrainCommitRerunTask.concurrencyKey, 'auto-drain-commit-rerun:apply-second-commit-task');
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.originalTaskId, 'apply-second-commit-task');
assert.deepStrictEqual(autoDrainCommitRerunTask.metadata.rerun.queueItemIds, ['apply-second-commit-task']);
assert.deepStrictEqual(autoDrainCommitRerunTask.targetRefs, ['src/apply.ts']);
assert.deepStrictEqual(autoDrainCommitRerunTask.allowedWrites, ['src/apply.ts']);
assert.deepStrictEqual(autoDrainCommitRerunTask.ownedRegions, ['src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainCommitRerunTask.acceptance, ['second commit rerun keeps scheduling metadata']);
assert.deepStrictEqual(autoDrainCommitRerunTask.verification, [{
  name: 'worker-sees-second-commit',
  command: 'node',
  args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second-commit\\n') process.exit(1);"],
  required: true
}]);
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.id, 'apply-second-commit-task');
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.lane, 'apply');
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.layer, 'merge');
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.compute, 'codex.deep');
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.priority, 17);
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceTask.concurrencyKey, 'auto-drain-commit-rerun:apply-second-commit-task');
assert.ok(autoDrainCommitRerunTask.metadata.rerun.sourceKinds.includes('stale-against-head'));
assert.ok(autoDrainCommitRerunTask.metadata.rerun.sourceKinds.includes('queue-rerun'));
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.currentHead, autoDrainCommitRerunHead);
assert.strictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceHead, autoDrainCommitRerunHead);
assert.deepStrictEqual(autoDrainCommitRerunTask.metadata.rerun.sourceHeads, [autoDrainCommitRerunHead]);
assert.ok(autoDrainCommitRerunTask.metadata.rerun.sourcePatchPaths.some((entry) => entry.endsWith('changes.patch')));
assert.ok(autoDrainCommitRerunTask.sourceRefs.some((entry) => entry.endsWith('changes.patch')));
assert.ok(autoDrainCommitRerunTask.sourceRefs.includes(autoDrainCommitRerunSecondIteration.collection.artifacts.queueOverlayPath));
assert.ok(autoDrainCommitRerunTask.sourceRefs.includes(autoDrainCommitRerunSecondIteration.collection.artifacts.hierarchicalMergeQueuePath));
const autoDrainCommitRerunDashboard = JSON.parse(await fs.readFile(path.join(autoDrainCommitRerunOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.queueHealth.rerunCount, 1);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.queueHealth.staleOrRerunCount, 1);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.queueHealth.trueBlockerCount, 0);
assert.strictEqual(autoDrainCommitRerunDashboard.humanQuestions.count, 0);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.status, 'warning');
assert.match(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.headline, /not a human blocker/);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 1);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 0);
assert.strictEqual(autoDrainCommitRerunDashboard.queueMetadata.mergeQueueHealth.counts.rerunCandidateCount, 1);
assert.deepStrictEqual(autoDrainCommitRerunDashboard.queueMetadata.mergeQueueHealth.rerunCandidates[0].sourceKinds, ['stale-against-head', 'queue-rerun']);
assert.deepStrictEqual(autoDrainCommitRerunDashboard.queueMetadata.mergeQueueHealth.rerunCandidates[0].queueItemIds, ['apply-second-commit-task']);
const autoDrainCommitRerunCards = new Map(autoDrainCommitRerunDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(autoDrainCommitRerunCards.get('stale-rerun').value, 1);
assert.strictEqual(autoDrainCommitRerunCards.get('stale-rerun').status, 'warning');
assert.match(autoDrainCommitRerunCards.get('stale-rerun').action, /coordinator work/);
assert.strictEqual(autoDrainCommitRerunCards.get('true-blockers').value, 0);
assert.strictEqual(autoDrainCommitRerunCards.get('true-blockers').status, 'ok');

const autoDrainApplyRerunRepo = await createApplyFixtureRepo(tmp, 'auto-drain-apply-rerun-repo');
await fs.writeFile(path.join(autoDrainApplyRerunRepo, 'src', 'other.ts'), 'old-other\n');
await execFileP('git', ['add', '--', 'src/other.ts'], { cwd: autoDrainApplyRerunRepo });
await execFileP('git', ['commit', '-m', 'Add second apply fixture'], { cwd: autoDrainApplyRerunRepo });
const autoDrainApplyRerunPlan = createCodexSwarmPlan({
  manifest: {
    id: 'auto-drain-apply-rerun',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'a-commit-task',
      lane: 'apply',
      ownedFiles: ['src/apply.ts'],
      changedRegions: ['src/apply.ts#apply'],
      verification: [{
        name: 'worker-sees-first',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='first\\n') process.exit(1);"]
      }]
    }, {
      id: 'b-rerun-task',
      lane: 'apply',
      ownedFiles: ['src/other.ts'],
      changedRegions: ['src/other.ts#other'],
      verification: [{
        name: 'worker-sees-second',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/other.ts','utf8')!=='second\\n') process.exit(1);"]
      }]
    }]
  }
});
const autoDrainApplyRerunOutDir = path.join(tmp, 'auto-drain-apply-rerun-run');
const autoDrainApplyRerunRun = await runCodexSwarm(autoDrainApplyRerunPlan, {
  outDir: autoDrainApplyRerunOutDir,
  cwd: autoDrainApplyRerunRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainApplyRerunOutDir, 'workspaces'),
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
      name: 'coordinator-sees-first-commit',
      command: 'node',
      args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='first\\n') process.exit(1);"]
    }]
  },
  executor: async (input) => {
    if (input.job.taskId === 'a-commit-task') {
      await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'first\n');
      await fs.writeFile(input.paths.lastMessagePath, 'first committed\n');
      return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'first committed' };
    }
    await fs.writeFile(path.join(input.workspacePath, 'src', 'other.ts'), 'second\n');
    await fs.writeFile(input.paths.lastMessagePath, 'second rerun\n');
    return { exitCode: 0, changedPaths: ['src/other.ts'], lastMessage: 'second rerun' };
  }
});
assert.strictEqual(autoDrainApplyRerunRun.ok, true);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.ok, true);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.finalGateOk, true);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.finalGateState, 'passed');
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.skippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.finalGateContinuationDecisionCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.finalGateContinuationSkippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.rerunTaskCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.terminalCount, 2);
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.summary.committedDecisionCount, 2);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.finalGateOk, true);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.finalGateState, 'passed');
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.skippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.finalGateContinuationDecisionCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.finalGateContinuationSkippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.summary.rerunTaskCount, 0);
const autoDrainApplyRerunApply = autoDrainApplyRerunRun.autoDrain.iterations[0].apply;
assert.strictEqual(autoDrainApplyRerunRun.autoDrain.iterations.length, 1);
assert.strictEqual(autoDrainApplyRerunApply.ok, true);
assert.strictEqual(autoDrainApplyRerunApply.summary.committed, 2);
assert.strictEqual(autoDrainApplyRerunApply.summary.rerun, 0);
assert.strictEqual(autoDrainApplyRerunApply.summary.finalGateOk, true);
assert.strictEqual(autoDrainApplyRerunApply.summary.finalGateState, 'passed');
assert.strictEqual(autoDrainApplyRerunApply.summary.skippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunApply.summary.finalGateContinuationDecisionCount, 0);
assert.strictEqual(autoDrainApplyRerunApply.summary.finalGateContinuationSkippedRequiredGateCount, 0);
assert.deepStrictEqual(autoDrainApplyRerunApply.decisions.map((decision) => decision.status), ['committed', 'committed']);
const autoDrainApplyRerunCommittedDecision = autoDrainApplyRerunApply.decisions.find((decision) => decision.taskId === 'a-commit-task');
const autoDrainApplyRerunRevalidatedDecision = autoDrainApplyRerunApply.decisions.find((decision) => decision.taskId === 'b-rerun-task');
assert.ok(autoDrainApplyRerunCommittedDecision);
assert.ok(autoDrainApplyRerunRevalidatedDecision);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.status, 'committed');
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.headBefore, autoDrainApplyRerunCommittedDecision.headAfter);
assert.match(autoDrainApplyRerunRevalidatedDecision.headAfter, /^[0-9a-f]{40}$/);
assert.notStrictEqual(autoDrainApplyRerunRevalidatedDecision.headAfter, autoDrainApplyRerunRevalidatedDecision.headBefore);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.status, 'committed');
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.collectionHead, autoDrainApplyRerunCommittedDecision.headBefore);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.leaseHead, autoDrainApplyRerunCommittedDecision.headAfter);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.currentHead, autoDrainApplyRerunRevalidatedDecision.headAfter);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.commit, autoDrainApplyRerunRevalidatedDecision.headAfter);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.movedSinceCollection, true);
assert.strictEqual(autoDrainApplyRerunRevalidatedDecision.leaseReadback.head.movedDuringDecision, false);
assert.deepStrictEqual(autoDrainApplyRerunApply.lockKeys, [
  'region:src/apply.ts#apply',
  'region:src/other.ts#other'
]);
assert.deepStrictEqual(autoDrainApplyRerunApply.finalGateSummary.failedDecisionIds, []);
assert.deepStrictEqual(autoDrainApplyRerunApply.finalGateSummary.skippedRequiredDecisionIds, []);
assert.deepStrictEqual(autoDrainApplyRerunApply.finalGateSummary.continuationDecisionIds, []);
assert.deepStrictEqual(autoDrainApplyRerunApply.finalGateSummary.skippedRequiredGateNames, []);
assert.deepStrictEqual(autoDrainApplyRerunApply.finalGateSummary.continuationGateNames, []);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.iterations[0].finalGateOk, true);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.iterations[0].skippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.iterations[0].finalGateContinuationDecisionCount, 0);
assert.strictEqual(autoDrainApplyRerunRun.autoDrainArtifacts.iterations[0].finalGateContinuationSkippedRequiredGateCount, 0);
const autoDrainApplyRerunCollectionArtifact = JSON.parse(await fs.readFile(autoDrainApplyRerunRun.autoDrain.iterations[0].collection.artifacts.collectionPath, 'utf8'));
assert.strictEqual(autoDrainApplyRerunCollectionArtifact.summary['ready-to-apply'], 2);
assert.strictEqual(autoDrainApplyRerunCollectionArtifact.summary.mergeQueueApplyLocalCount, 2);
assert.strictEqual(autoDrainApplyRerunCollectionArtifact.summary.mergeQueueRerunCount, 0);
const autoDrainApplyRerunApplyArtifact = JSON.parse(await fs.readFile(path.join(autoDrainApplyRerunApply.outDir, 'autonomous-apply.json'), 'utf8'));
assert.strictEqual(autoDrainApplyRerunApplyArtifact.summary.committed, 2);
assert.strictEqual(autoDrainApplyRerunApplyArtifact.summary.rerun, 0);
assert.strictEqual(autoDrainApplyRerunApplyArtifact.summary.skippedRequiredGateCount, 0);
assert.strictEqual(autoDrainApplyRerunApplyArtifact.summary.finalGateContinuationDecisionCount, 0);
assert.strictEqual(autoDrainApplyRerunApplyArtifact.summary.finalGateContinuationSkippedRequiredGateCount, 0);
assert.deepStrictEqual(autoDrainApplyRerunApplyArtifact.decisions.map((decision) => decision.status), ['committed', 'committed']);
const autoDrainApplyRerunManifest = JSON.parse(await fs.readFile(autoDrainApplyRerunRun.autoDrainArtifacts.rerunManifest.paths[0], 'utf8'));
assert.strictEqual(autoDrainApplyRerunManifest.summary.taskCount, 0);
assert.strictEqual(autoDrainApplyRerunManifest.summary.decisionRerunCount, 0);
assert.deepStrictEqual(autoDrainApplyRerunManifest.items, []);
const autoDrainApplyRerunResults = JSON.parse(await fs.readFile(path.join(autoDrainApplyRerunOutDir, 'swarm-results.json'), 'utf8'));
assert.strictEqual(autoDrainApplyRerunResults.ok, true);
assert.strictEqual(autoDrainApplyRerunResults.autoDrain.summary.finalGateOk, true);
assert.strictEqual(autoDrainApplyRerunResults.autoDrain.summary.rerunTaskCount, 0);
assert.strictEqual(autoDrainApplyRerunResults.autoDrain.summary.committedDecisionCount, 2);
assert.strictEqual(await fs.readFile(path.join(autoDrainApplyRerunRepo, 'src', 'apply.ts'), 'utf8'), 'first\n');
assert.strictEqual(await fs.readFile(path.join(autoDrainApplyRerunRepo, 'src', 'other.ts'), 'utf8'), 'second\n');

const autoDrainCommitRerunContinuationTasks = coerceCodexSwarmTasksInput(autoDrainCommitRerunManifest);
assert.deepStrictEqual(autoDrainCommitRerunContinuationTasks.map((task) => task.id), ['apply-second-commit-task-rerun-current-head']);
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].lane, 'apply');
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].layer, 'merge');
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].compute, 'codex.deep');
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].priority, 17);
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].concurrencyKey, 'auto-drain-commit-rerun:apply-second-commit-task');
assert.deepStrictEqual(autoDrainCommitRerunContinuationTasks[0].ownedRegions, ['src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainCommitRerunContinuationTasks[0].acceptance, ['second commit rerun keeps scheduling metadata']);
assert.deepStrictEqual(autoDrainCommitRerunContinuationTasks[0].verification, [{
  name: 'worker-sees-second-commit',
  command: 'node',
  args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second-commit\\n') process.exit(1);"],
  required: true
}]);
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].metadata.rerun.originalTaskId, 'apply-second-commit-task');
assert.strictEqual(autoDrainCommitRerunContinuationTasks[0].metadata.source.metadata.rerun.originalTaskId, 'apply-second-commit-task');
const autoDrainCommitRerunContinuationManifestInput = {
  id: 'auto-drain-commit-rerun-continuation',
  lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }],
  layers: [{ id: 'merge' }]
};
const autoDrainCommitRerunContinuationPlan = createCodexSwarmPlan({
  manifest: autoDrainCommitRerunContinuationManifestInput,
  tasks: autoDrainCommitRerunManifest
});
assert.strictEqual(autoDrainCommitRerunContinuationPlan.validation.valid, true);
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].lane, 'apply');
assert.notStrictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].lane, 'unassigned');
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].layer, 'merge');
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].compute.id, 'codex.deep');
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].priority, 17);
assert.notStrictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].priority, 100);
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].concurrencyKey, 'auto-drain-commit-rerun:apply-second-commit-task');
assert.deepStrictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].ownedRegions, ['src/apply.ts#apply']);
assert.deepStrictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].acceptance, ['second commit rerun keeps scheduling metadata']);
assert.deepStrictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].verification, [{
  name: 'worker-sees-second-commit',
  command: 'node',
  args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='second-commit\\n') process.exit(1);"],
  required: true
}]);
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].task.metadata.rerun.originalTaskId, 'apply-second-commit-task');
assert.strictEqual(autoDrainCommitRerunContinuationPlan.jobs[0].metadata.rerun.originalTaskId, 'apply-second-commit-task');
const autoDrainCommitRerunContinuationManifestPath = path.join(tmp, 'auto-drain-commit-rerun-continuation-manifest.json');
await fs.writeFile(autoDrainCommitRerunContinuationManifestPath, JSON.stringify(autoDrainCommitRerunContinuationManifestInput, null, 2) + '\n');
const cliRerunContinuationPlan = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'plan',
  '--manifest',
  autoDrainCommitRerunContinuationManifestPath,
  '--rerun-manifest',
  autoDrainCommitRerunManifestPath,
  '--outDir',
  path.join(tmp, 'cli-rerun-continuation-plan')
], { cwd: autoDrainCommitRerunRepo });
const cliRerunContinuationPlanOutput = JSON.parse(cliRerunContinuationPlan.stdout);
assert.strictEqual(cliRerunContinuationPlanOutput.ok, true);
assert.strictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].taskId, 'apply-second-commit-task-rerun-current-head');
assert.strictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].lane, 'apply');
assert.notStrictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].lane, 'unassigned');
assert.strictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].priority, 17);
assert.notStrictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].priority, 100);
assert.strictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].concurrencyKey, 'auto-drain-commit-rerun:apply-second-commit-task');
assert.strictEqual(cliRerunContinuationPlanOutput.plan.jobs[0].task.metadata.rerun.originalTaskId, 'apply-second-commit-task');

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
assert.strictEqual(autoDrainPromotedDebtFirstIteration.coordinatorAgentDrain.summary.promoteCount, 1);
assert.strictEqual(autoDrainPromotedDebtFirstIteration.coordinatorAgentDrain.summary.selectedPromoteCount, 0);
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
  skipped: 0,
  skippedRequired: 0,
  names: [cliAutoDrainCommitFocusedCommand],
  passedNames: [cliAutoDrainCommitFocusedCommand],
  failedNames: [],
  skippedNames: [],
  skippedRequiredNames: []
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

const autoDrainGateFailureRepo = await createApplyFixtureRepo(tmp, 'auto-drain-gate-failure-run-repo');
const autoDrainGateFailureOutDir = path.join(tmp, 'auto-drain-gate-failure-run-out');
const autoDrainGateFailureRun = await runCodexSwarm(autoDrainPlan, {
  outDir: autoDrainGateFailureOutDir,
  cwd: autoDrainGateFailureRepo,
  workspace: {
    mode: 'copy',
    root: path.join(autoDrainGateFailureOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: {
    maxIterations: 2,
    focusedCommands: [{
      name: 'coordinator-rejects-new',
      command: 'node',
      args: ['-e', 'process.exit(1)']
    }, {
      name: 'skipped-required-after-failure',
      command: 'node',
      args: ['-e', 'process.exit(0)']
    }]
  },
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'gate failure auto drained\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'gate failure auto drained' };
  }
});
assert.strictEqual(autoDrainGateFailureRun.ok, false);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.ok, false);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.applyCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.terminalCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.finalGateOk, false);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.finalGateState, 'failed');
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.failedRequiredGateCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrain.summary.skippedRequiredGateCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.summary.finalGateOk, false);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.summary.finalGateState, 'failed');
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.summary.failedRequiredGateCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.summary.skippedRequiredGateCount, 1);
const autoDrainGateFailureDecision = autoDrainGateFailureRun.autoDrain.iterations[0].apply.decisions[0];
assert.strictEqual(autoDrainGateFailureDecision.status, 'rejected');
assert.strictEqual(autoDrainGateFailureDecision.finalGateSummary.ok, false);
assert.strictEqual(autoDrainGateFailureDecision.finalGateSummary.state, 'failed');
assert.deepStrictEqual(autoDrainGateFailureDecision.finalGateSummary.gates.map((gate) => ({
  index: gate.index,
  name: gate.name,
  required: gate.required,
  status: gate.status,
  exitCode: gate.exitCode
})), [{
  index: 1,
  name: 'coordinator-rejects-new',
  required: true,
  status: 'failed',
  exitCode: 1
}, {
  index: 2,
  name: 'skipped-required-after-failure',
  required: true,
  status: 'skipped',
  exitCode: undefined
}]);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrain.finalGateSummary.failedDecisionIds, [autoDrainGateFailureDecision.id]);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrain.finalGateSummary.skippedRequiredDecisionIds, [autoDrainGateFailureDecision.id]);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrain.finalGateSummary.failedRequiredGateNames, ['coordinator-rejects-new']);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrain.finalGateSummary.skippedRequiredGateNames, ['skipped-required-after-failure']);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrainArtifacts.finalGateSummary.gates.map((gate) => ({
  decisionId: gate.decisionId,
  name: gate.name,
  status: gate.status
})), [{
  decisionId: autoDrainGateFailureDecision.id,
  name: 'coordinator-rejects-new',
  status: 'failed'
}, {
  decisionId: autoDrainGateFailureDecision.id,
  name: 'skipped-required-after-failure',
  status: 'skipped'
}]);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.iterations[0].finalGateOk, false);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.iterations[0].finalGateState, 'failed');
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.iterations[0].failedRequiredGateCount, 1);
assert.strictEqual(autoDrainGateFailureRun.autoDrainArtifacts.iterations[0].skippedRequiredGateCount, 1);
assert.deepStrictEqual(autoDrainGateFailureRun.autoDrain.terminalJobIds, [autoDrainGateFailureDecision.jobId]);
assert.ok(autoDrainGateFailureDecision.commands.some((entry) => (
  entry.command[0] === 'git'
    && entry.command[1] === 'apply'
    && entry.command[2] === '-R'
    && entry.status === 0
)));
assert.strictEqual(await fs.readFile(path.join(autoDrainGateFailureRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: autoDrainGateFailureRepo })).stdout, '');
const autoDrainGateFailureSwarmResults = JSON.parse(await fs.readFile(path.join(autoDrainGateFailureOutDir, 'swarm-results.json'), 'utf8'));
assert.strictEqual(autoDrainGateFailureSwarmResults.ok, false);
assert.strictEqual(autoDrainGateFailureSwarmResults.autoDrain.summary.finalGateOk, false);
assert.strictEqual(autoDrainGateFailureSwarmResults.autoDrainArtifacts.summary.finalGateOk, false);
assert.deepStrictEqual(autoDrainGateFailureSwarmResults.autoDrainArtifacts.finalGateSummary.failedRequiredGateNames, ['coordinator-rejects-new']);
const autoDrainGateFailureDashboard = JSON.parse(await fs.readFile(path.join(autoDrainGateFailureOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(autoDrainGateFailureDashboard.autoDrain.summary.finalGateOk, false);
assert.strictEqual(autoDrainGateFailureDashboard.autoDrainArtifacts.summary.finalGateOk, false);
assert.deepStrictEqual(autoDrainGateFailureDashboard.autoDrainArtifacts.finalGateSummary.skippedRequiredGateNames, ['skipped-required-after-failure']);

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

const cliCollectPromotedOutDir = path.join(tmp, 'cli-collect-promoted-collection');
const cliCollectPromoted = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'collect',
  '--run',
  autoDrainUngatedCandidateOutDir,
  '--outDir',
  cliCollectPromotedOutDir,
  '--promote-patch-candidates',
  '--focused-command',
  "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: autoDrainUngatedCandidateRepo });
const cliCollectPromotedResult = JSON.parse(cliCollectPromoted.stdout);
assert.strictEqual(cliCollectPromotedResult.ok, true);
assert.strictEqual(cliCollectPromotedResult.summary['ready-to-apply'], 1);
assert.strictEqual(cliCollectPromotedResult.summary['needs-human-port'], 0);
assert.strictEqual(cliCollectPromotedResult.summary.promotedPatchCandidateCount, 1);
assert.strictEqual(cliCollectPromotedResult.artifacts.counts.promotedPatchCandidateCount, 1);
const cliCollectPromotedBundle = cliCollectPromotedResult.buckets['ready-to-apply'][0].bundle;
assert.strictEqual(cliCollectPromotedBundle.mergeReadiness, 'verified-patch');
assert.strictEqual(cliCollectPromotedBundle.disposition, 'auto-mergeable');
assert.strictEqual(cliCollectPromotedBundle.autoMergeable, true);
assert.strictEqual(cliCollectPromotedBundle.metadata.coordinatorPatchCandidatePromotion.originalMergeReadiness, 'patch-candidate');
assert.ok(await exists(path.join(cliCollectPromotedResult.buckets['ready-to-apply'][0].outputDir, 'merge.json')));

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

const cliAutonomousPromoteRepo = await createApplyFixtureRepo(tmp, 'cli-autonomous-promote-run-repo');
const cliAutonomousPromoteOutDir = path.join(cliAutonomousPromoteRepo, 'agent-runs', 'cli-autonomous-promote-run');
const cliAutonomousPromoteRun = await runCodexSwarm(autoDrainCandidatePlan, {
  outDir: cliAutonomousPromoteOutDir,
  cwd: cliAutonomousPromoteRepo,
  workspace: {
    mode: 'copy',
    root: path.join(cliAutonomousPromoteOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: false,
  autoDrain: false,
  executor: async (input) => {
    await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'new\n');
    await fs.writeFile(input.paths.lastMessagePath, 'cli autonomous promotion candidate\n');
    return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'cli autonomous promotion candidate' };
  }
});
assert.strictEqual(cliAutonomousPromoteRun.ok, true);
const cliAutonomousPromote = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'autonomous-apply',
  '--run',
  cliAutonomousPromoteOutDir,
  '--outDir',
  path.join(cliAutonomousPromoteRepo, 'agent-runs', 'cli-autonomous-promote-apply'),
  '--allow-dirty',
  '--promote-patch-candidates',
  '--focused-command',
  "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
], { cwd: cliAutonomousPromoteRepo });
const cliAutonomousPromoteResult = JSON.parse(cliAutonomousPromote.stdout);
assert.strictEqual(cliAutonomousPromoteResult.ok, true);
assert.strictEqual(cliAutonomousPromoteResult.summary.applied, 1);
assert.strictEqual(cliAutonomousPromoteResult.decisions[0].status, 'applied');
assert.strictEqual(await fs.readFile(path.join(cliAutonomousPromoteRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
const cliAutonomousPromoteCollection = JSON.parse(await fs.readFile(path.join(cliAutonomousPromoteResult.collectionDir, 'collection.json'), 'utf8'));
assert.strictEqual(cliAutonomousPromoteCollection.summary.promotedPatchCandidateCount, 1);
assert.strictEqual(cliAutonomousPromoteCollection.summary['ready-to-apply'], 1);
assert.strictEqual(cliAutonomousPromoteCollection.summary['needs-human-port'], 0);

const explicitDrainRerunRepo = await createApplyFixtureRepo(tmp, 'explicit-drain-rerun-repo');
await fs.writeFile(path.join(explicitDrainRerunRepo, 'src', 'stale.ts'), 'old-stale\n');
await execFileP('git', ['add', '--', 'src/stale.ts'], { cwd: explicitDrainRerunRepo });
await execFileP('git', ['commit', '-m', 'Add explicit drain stale fixture'], { cwd: explicitDrainRerunRepo });
const explicitDrainRerunPlan = createCodexSwarmPlan({
  manifest: {
    id: 'explicit-drain-rerun',
    lanes: [{ id: 'apply', allowedGlobs: ['src/**'] }],
    layers: [{ id: 'merge' }]
  },
  tasks: {
    items: [{
      id: 'explicit-commit-task',
      lane: 'apply',
      layer: 'merge',
      compute: 'codex.deep',
      priority: 29,
      concurrencyKey: 'explicit-drain-rerun:explicit-commit-task',
      ownedFiles: ['src/apply.ts'],
      ownedRegions: ['src/apply.ts#apply'],
      changedRegions: ['src/apply.ts#apply'],
      acceptance: ['explicit drain commits current work'],
      verification: [{
        name: 'worker-sees-explicit-commit',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='explicit-commit\\n') process.exit(1);"]
      }]
    }, {
      id: 'explicit-stale-task',
      lane: 'apply',
      layer: 'merge',
      compute: 'codex.deep',
      priority: 31,
      concurrencyKey: 'explicit-drain-rerun:explicit-stale-task',
      ownedFiles: ['src/stale.ts'],
      ownedRegions: ['src/stale.ts#stale'],
      changedRegions: ['src/stale.ts#stale'],
      acceptance: ['explicit drain rerun preserves scheduling metadata'],
      verification: [{
        name: 'worker-sees-explicit-stale',
        command: 'node',
        args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/stale.ts','utf8')!=='worker-stale\\n') process.exit(1);"]
      }]
    }]
  }
});
const explicitDrainRerunOutDir = path.join(explicitDrainRerunRepo, 'agent-runs', 'explicit-drain-rerun-run');
const explicitDrainRerunRun = await runCodexSwarm(explicitDrainRerunPlan, {
  outDir: explicitDrainRerunOutDir,
  cwd: explicitDrainRerunRepo,
  workspace: {
    mode: 'copy',
    root: path.join(explicitDrainRerunOutDir, 'workspaces'),
    includes: ['src'],
    replace: true,
    linkNodeModules: false
  },
  dryRun: false,
  runVerification: true,
  autoDrain: false,
  executor: async (input) => {
    if (input.job.taskId === 'explicit-commit-task') {
      await fs.writeFile(path.join(input.workspacePath, 'src', 'apply.ts'), 'explicit-commit\n');
      await fs.writeFile(input.paths.lastMessagePath, 'explicit commit worker\n');
      return { exitCode: 0, changedPaths: ['src/apply.ts'], lastMessage: 'explicit commit worker' };
    }
    await fs.writeFile(path.join(input.workspacePath, 'src', 'stale.ts'), 'worker-stale\n');
    await fs.writeFile(input.paths.lastMessagePath, 'explicit stale worker\n');
    return { exitCode: 0, changedPaths: ['src/stale.ts'], lastMessage: 'explicit stale worker' };
  }
});
assert.strictEqual(explicitDrainRerunRun.ok, true);
await fs.writeFile(path.join(explicitDrainRerunRepo, 'src', 'stale.ts'), 'coordinator-stale\n');
await execFileP('git', ['add', '--', 'src/stale.ts'], { cwd: explicitDrainRerunRepo });
await execFileP('git', ['commit', '-m', 'Advance stale fixture before explicit drain'], { cwd: explicitDrainRerunRepo });
const explicitDrainRerunApplyOutDir = path.join(explicitDrainRerunRepo, 'agent-runs', 'explicit-drain-rerun-apply');
const cliExplicitDrainRerun = await execFileP(process.execPath, [
  new URL('../dist/cli.js', import.meta.url).pathname,
  'drain',
  '--run',
  explicitDrainRerunOutDir,
  '--outDir',
  explicitDrainRerunApplyOutDir,
  '--allow-dirty',
  '--commit',
  '--focused-command',
  "node -e \"const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='explicit-commit\\n') process.exit(1);\""
], { cwd: explicitDrainRerunRepo });
const cliExplicitDrainRerunResult = JSON.parse(cliExplicitDrainRerun.stdout);
assert.strictEqual(cliExplicitDrainRerunResult.ok, true);
assert.strictEqual(cliExplicitDrainRerunResult.summary.committed, 1);
assert.strictEqual(cliExplicitDrainRerunResult.summary.rerunManifestCount, 1);
assert.strictEqual(cliExplicitDrainRerunResult.summary.rerunTaskCount, 1);
assert.ok(cliExplicitDrainRerunResult.rerunManifest);
const explicitDrainRerunManifestPath = path.join(explicitDrainRerunApplyOutDir, 'rerun-manifest.json');
assert.strictEqual(cliExplicitDrainRerunResult.rerunManifest.path, explicitDrainRerunManifestPath);
assert.ok(await exists(explicitDrainRerunManifestPath));
const explicitDrainRerunApplyArtifact = JSON.parse(await fs.readFile(path.join(explicitDrainRerunApplyOutDir, 'autonomous-apply.json'), 'utf8'));
assert.strictEqual(explicitDrainRerunApplyArtifact.rerunManifest.path, explicitDrainRerunManifestPath);
assert.strictEqual(explicitDrainRerunApplyArtifact.summary.rerunTaskCount, 1);
const explicitDrainRerunManifest = JSON.parse(await fs.readFile(explicitDrainRerunManifestPath, 'utf8'));
const explicitDrainRerunHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: explicitDrainRerunRepo })).stdout.trim();
assert.strictEqual(explicitDrainRerunManifest.kind, FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND);
assert.strictEqual(explicitDrainRerunManifest.currentHead, explicitDrainRerunHead);
assert.strictEqual(explicitDrainRerunManifest.sourceHead, explicitDrainRerunHead);
assert.deepStrictEqual(explicitDrainRerunManifest.sourceHeads, [explicitDrainRerunHead]);
assert.deepStrictEqual(explicitDrainRerunManifest.tasks, explicitDrainRerunManifest.items);
assert.strictEqual(explicitDrainRerunManifest.items.length, 1);
assert.strictEqual(explicitDrainRerunManifest.summary.taskCount, 1);
assert.strictEqual(explicitDrainRerunManifest.summary.staleAgainstHeadCount, 1);
assert.strictEqual(explicitDrainRerunManifest.summary.queueRerunCount, 1);
assert.strictEqual(explicitDrainRerunManifest.summary.conflictBlockedCount, 0);
assert.strictEqual(explicitDrainRerunManifest.summary.decisionRerunCount, 0);
const explicitDrainRerunTask = explicitDrainRerunManifest.items[0];
assert.strictEqual(explicitDrainRerunTask.id, 'explicit-stale-task-rerun-current-head');
assert.strictEqual(explicitDrainRerunTask.lane, 'apply');
assert.strictEqual(explicitDrainRerunTask.layer, 'merge');
assert.strictEqual(explicitDrainRerunTask.compute, 'codex.deep');
assert.strictEqual(explicitDrainRerunTask.priority, 31);
assert.strictEqual(explicitDrainRerunTask.concurrencyKey, 'explicit-drain-rerun:explicit-stale-task');
assert.deepStrictEqual(explicitDrainRerunTask.targetRefs, ['src/stale.ts']);
assert.deepStrictEqual(explicitDrainRerunTask.allowedWrites, ['src/stale.ts']);
assert.deepStrictEqual(explicitDrainRerunTask.ownedRegions, ['src/stale.ts#stale']);
assert.deepStrictEqual(explicitDrainRerunTask.acceptance, ['explicit drain rerun preserves scheduling metadata']);
assert.deepStrictEqual(explicitDrainRerunTask.verification, [{
  name: 'worker-sees-explicit-stale',
  command: 'node',
  args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/stale.ts','utf8')!=='worker-stale\\n') process.exit(1);"],
  required: true
}]);
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.originalTaskId, 'explicit-stale-task');
assert.deepStrictEqual(explicitDrainRerunTask.metadata.rerun.queueItemIds, ['explicit-stale-task']);
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.currentHead, explicitDrainRerunHead);
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceHead, explicitDrainRerunHead);
assert.deepStrictEqual(explicitDrainRerunTask.metadata.rerun.sourceHeads, [explicitDrainRerunHead]);
assert.ok(explicitDrainRerunTask.metadata.rerun.sourceKinds.includes('stale-against-head'));
assert.ok(explicitDrainRerunTask.metadata.rerun.sourceKinds.includes('queue-rerun'));
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.id, 'explicit-stale-task');
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.lane, 'apply');
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.layer, 'merge');
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.compute, 'codex.deep');
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.priority, 31);
assert.strictEqual(explicitDrainRerunTask.metadata.rerun.sourceTask.concurrencyKey, 'explicit-drain-rerun:explicit-stale-task');
assert.ok(explicitDrainRerunTask.metadata.rerun.sourcePatchPaths.some((entry) => entry.endsWith('changes.patch')));
assert.ok(explicitDrainRerunTask.sourceRefs.some((entry) => entry.endsWith('changes.patch')));
assert.ok(explicitDrainRerunTask.sourceRefs.includes(path.join(cliExplicitDrainRerunResult.collectionDir, 'queue-overlay.json')));
assert.ok(explicitDrainRerunTask.sourceRefs.includes(path.join(cliExplicitDrainRerunResult.collectionDir, 'hierarchical-merge-queue.json')));
const explicitDrainContinuationTasks = coerceCodexSwarmTasksInput(explicitDrainRerunManifest);
assert.deepStrictEqual(explicitDrainContinuationTasks.map((task) => task.id), ['explicit-stale-task-rerun-current-head']);
assert.strictEqual(explicitDrainContinuationTasks[0].lane, 'apply');
assert.strictEqual(explicitDrainContinuationTasks[0].compute, 'codex.deep');
assert.strictEqual(explicitDrainContinuationTasks[0].priority, 31);
assert.strictEqual(explicitDrainContinuationTasks[0].concurrencyKey, 'explicit-drain-rerun:explicit-stale-task');
assert.deepStrictEqual(explicitDrainContinuationTasks[0].verification, [{
  name: 'worker-sees-explicit-stale',
  command: 'node',
  args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/stale.ts','utf8')!=='worker-stale\\n') process.exit(1);"],
  required: true
}]);
assert.strictEqual(await fs.readFile(path.join(explicitDrainRerunRepo, 'src', 'apply.ts'), 'utf8'), 'explicit-commit\n');
assert.strictEqual(await fs.readFile(path.join(explicitDrainRerunRepo, 'src', 'stale.ts'), 'utf8'), 'coordinator-stale\n');

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
assert.deepStrictEqual(autoDrainDirtyDashboard.mergeQueueHealth, autoDrainDirtyDashboard.queueMetadata.mergeQueueHealth);
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
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.mergeQueueHealth.counts.activeLeaseCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.mergeQueueHealth.counts.openCoordinatorAssignmentCount, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.mergeQueueHealth.activeLeases.length, 1);
assert.strictEqual(autoDrainDirtyDashboard.queueMetadata.mergeQueueHealth.coordinatorAssignments.some((assignment) => assignment.open && assignment.assignedAction === 'apply-local'), true);

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
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.mergeQueueHealth, autoDrainConflictBlockedDashboard.queueMetadata.mergeQueueHealth);
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
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].queueKeys, [
  'queue:conflict-blocked-task',
  'task:conflict-blocked-task',
  `job:${autoDrainConflictBlockedDecision.jobId}`
]);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].patchPath, autoDrainConflictBlockedDecision.patchPath);
assert.ok(autoDrainConflictBlockedDashboard.queueMetadata.conflictRetryWork[0].patchPath.endsWith('changes.patch'));
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.mergeQueueHealth.counts.realConflictCount >= 1, true);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.mergeQueueHealth.counts.rerunCandidateCount, 1);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.mergeQueueHealth.realConflicts.some((conflict) => conflict.kind === 'current-head-conflict'), true);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.mergeQueueHealth.rerunCandidates.some((candidate) => candidate.sourceKinds.includes('conflict-blocked')), true);
assert.strictEqual(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.status, 'warning');
assert.match(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.headline, /1 current-head conflict/);
assert.match(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.headline, /coordinator retry work/);
assert.match(autoDrainConflictBlockedDashboard.queueMetadata.operatorSummary.headline, /not a human blocker/);
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
assert.match(autoDrainConflictBlockedCards.get('coordination-debt').action, /do not treat this card as a human blocker/);
assert.strictEqual(autoDrainConflictBlockedCards.get('stale-rerun').value, 1);
assert.strictEqual(autoDrainConflictBlockedCards.get('stale-rerun').status, 'warning');
assert.match(autoDrainConflictBlockedCards.get('stale-rerun').detail, /conflict retry queue conflict-blocked-task/);
assert.match(autoDrainConflictBlockedCards.get('stale-rerun').detail, /changes\.patch/);
assert.match(autoDrainConflictBlockedCards.get('stale-rerun').action, /not a human question/);
assert.ok(autoDrainConflictBlockedCards.get('stale-rerun').sourceFields.includes('queueHealth.conflictRetryWork'));
assert.strictEqual(autoDrainConflictBlockedCards.get('true-blockers').value, 0);
assert.strictEqual(autoDrainConflictBlockedCards.get('true-blockers').status, 'ok');
const autoDrainConflictBlockedManifestPath = autoDrainConflictBlockedRun.autoDrainArtifacts.rerunManifest.paths[0];
const autoDrainConflictBlockedManifest = JSON.parse(await fs.readFile(autoDrainConflictBlockedManifestPath, 'utf8'));
const autoDrainConflictBlockedHead = (await execFileP('git', ['rev-parse', 'HEAD'], { cwd: autoDrainConflictBlockedRepo })).stdout.trim();
assert.strictEqual(autoDrainConflictBlockedManifest.kind, FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND);
assert.strictEqual(autoDrainConflictBlockedManifest.currentHead, autoDrainConflictBlockedHead);
assert.strictEqual(autoDrainConflictBlockedManifest.sourceHead, autoDrainConflictBlockedDecision.headBefore);
assert.deepStrictEqual(autoDrainConflictBlockedManifest.sourceHeads, [autoDrainConflictBlockedDecision.headBefore]);
assert.deepStrictEqual(autoDrainConflictBlockedDashboard.queueMetadata.paths.rerunManifests, [autoDrainConflictBlockedManifestPath]);
assert.strictEqual(autoDrainConflictBlockedManifest.summary.taskCount, 1);
assert.strictEqual(autoDrainConflictBlockedManifest.summary.conflictBlockedCount, 1);
assert.strictEqual(autoDrainConflictBlockedManifest.summary.staleAgainstHeadCount, 0);
assert.strictEqual(autoDrainConflictBlockedManifest.summary.sourceHeadCount, 1);
assert.strictEqual(autoDrainConflictBlockedManifest.summary.sourcePatchCount, 1);
assert.strictEqual(autoDrainConflictBlockedRun.autoDrainArtifacts.rerunManifest.taskCount, 1);
assert.strictEqual(autoDrainConflictBlockedRun.autoDrainArtifacts.rerunManifest.conflictBlockedCount, 1);
assert.strictEqual(autoDrainConflictBlockedRun.autoDrainArtifacts.rerunManifest.sourceHead, autoDrainConflictBlockedDecision.headBefore);
const autoDrainConflictBlockedRerunTask = autoDrainConflictBlockedManifest.items[0];
assert.strictEqual(autoDrainConflictBlockedRerunTask.id, 'conflict-blocked-task-rerun-current-head');
assert.strictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.originalJobId, autoDrainConflictBlockedDecision.jobId);
assert.strictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.originalTaskId, 'conflict-blocked-task');
assert.deepStrictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.sourceKinds, ['conflict-blocked']);
assert.deepStrictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.decisionStatuses, ['conflict-blocked']);
assert.deepStrictEqual(autoDrainConflictBlockedRerunTask.targetRefs, ['src/apply.ts']);
assert.strictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.currentHead, autoDrainConflictBlockedHead);
assert.strictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.sourceHead, autoDrainConflictBlockedDecision.headBefore);
assert.deepStrictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.sourceHeads, [autoDrainConflictBlockedDecision.headBefore]);
assert.ok(autoDrainConflictBlockedRerunTask.objective.includes(`source head ${autoDrainConflictBlockedDecision.headBefore}`));
assert.ok(autoDrainConflictBlockedRerunTask.objective.includes(`current head ${autoDrainConflictBlockedHead}`));
assert.deepStrictEqual(autoDrainConflictBlockedRerunTask.metadata.rerun.sourcePatchPaths, [autoDrainConflictBlockedDecision.patchPath]);
assert.ok(autoDrainConflictBlockedRerunTask.sourceRefs.includes(autoDrainConflictBlockedDecision.patchPath));
assert.ok(autoDrainConflictBlockedRerunTask.sourceRefs.includes(autoDrainConflictBlockedDecision.bundlePath));
assert.ok(autoDrainConflictBlockedRerunTask.sourceRefs.includes(path.join(autoDrainConflictBlockedRun.autoDrain.iterations[0].apply.outDir, 'autonomous-apply.json')));
assert.ok(autoDrainConflictBlockedRerunTask.sourceRefs.includes(path.join(autoDrainConflictBlockedRun.autoDrain.iterations[0].apply.outDir, 'autonomous-queue-overlay.json')));
assert.deepStrictEqual(coerceCodexSwarmTasksInput(autoDrainConflictBlockedManifest).map((task) => task.targetRefs), [['src/apply.ts']]);

const collapsedDecisionOutDir = path.join(tmp, 'collapsed-decision-dashboard');
const collapsedDecisionArtifacts = createSyntheticAutoDrainArtifacts(collapsedDecisionOutDir);
Object.assign(collapsedDecisionArtifacts.grouping, { staleAgainstHeadCount: 3 });
Object.assign(collapsedDecisionArtifacts.coordinatorAgentDrainWork, {
  count: 1,
  leaseCount: 1,
  assignmentCount: 3,
  terminalCount: 2,
  nonTerminalCount: 1,
  promotedWorkCount: 1,
  escalatedCount: 1,
  rerunCount: 2
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
  count: 3,
  scopeCount: 1,
  promoteCount: 1,
  rerunCount: 2
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
        }, {
          jobId: 'collapsed-committed-stale-job',
          bundle: {
            taskId: 'collapsed-committed-task',
            queueItemIds: ['collapsed-committed-stale-queue']
          }
        }, {
          jobId: 'collapsed-rejected-stale-job',
          bundle: {
            taskId: 'collapsed-rejected-task',
            queueItemIds: ['collapsed-rejected-task']
          }
        }]
      },
      hierarchicalMergeQueue: {
        assignments: [{
          jobId: 'collapsed-rerun-old-job',
          taskId: 'collapsed-rerun-task',
          queueItemIds: ['collapsed-rerun-task'],
          action: 'rerun'
        }, {
          jobId: 'collapsed-committed-stale-job',
          taskId: 'collapsed-committed-task',
          queueItemIds: ['collapsed-committed-stale-queue'],
          action: 'rerun'
        }, {
          jobId: 'collapsed-rejected-stale-job',
          taskId: 'collapsed-rejected-task',
          queueItemIds: ['collapsed-rejected-task'],
          action: 'rerun'
        }]
      }
    },
    coordinatorAgentDrainWork: {
      summary: {
        leaseCount: 1,
        assignmentCount: 3,
        terminalCount: 2,
        nonTerminalCount: 1,
        promotedWorkCount: 1,
        appliedCount: 0,
        queuedCount: 0,
        escalatedCount: 1,
        rerunCount: 2,
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
      outDir: path.join(collapsedDecisionOutDir, 'apply-01'),
      decisionLogPath: path.join(collapsedDecisionOutDir, 'apply-01', 'autonomous-merge-decisions.jsonl'),
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
        createSyntheticAutonomousDecision('rerun', {
          id: 'collapsed-rejected-old',
          jobId: 'collapsed-rejected-old-job',
          taskId: 'collapsed-rejected-task',
          queueItemIds: ['collapsed-rejected-task'],
          reason: 'older stale rejected candidate',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 3
        }),
        createSyntheticAutonomousDecision('applied', {
          id: 'collapsed-rerun-fresh',
          jobId: 'collapsed-rerun-fresh-job',
          taskId: 'collapsed-rerun-task',
          queueItemIds: ['collapsed-rerun-task'],
          reason: 'fresh bundle applied',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 4
        }),
        createSyntheticAutonomousDecision('committed', {
          id: 'collapsed-conflict-fresh',
          jobId: 'collapsed-conflict-fresh-job',
          taskId: 'collapsed-conflict-task',
          queueItemIds: ['collapsed-conflict-task'],
          reason: 'fresh conflict-resolution bundle committed',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 5
        }),
        createSyntheticAutonomousDecision('rejected', {
          id: 'collapsed-rejected-fresh',
          jobId: 'collapsed-rejected-fresh-job',
          taskId: 'collapsed-rejected-task',
          queueItemIds: ['collapsed-rejected-task'],
          reason: 'fresh gate failed and rollback completed',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 6
        }),
        createSyntheticAutonomousDecision('committed', {
          id: 'collapsed-committed-fresh',
          jobId: 'collapsed-committed-fresh-job',
          taskId: 'collapsed-committed-task',
          queueItemIds: ['collapsed-committed-fresh-queue'],
          reason: 'fresh queue alias committed',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 7
        })
      ]
    }
  }],
  lockKeys: [],
  lockScopeCounts: { semantic: 0, path: 0, repo: 0 },
  terminalJobIds: [
    'collapsed-conflict-fresh-job',
    'collapsed-committed-fresh-job',
    'collapsed-rejected-fresh-job',
    'collapsed-rerun-fresh-job'
  ],
  blockedJobIds: [],
  artifacts: collapsedDecisionArtifacts,
  summary: {
    iterationCount: 1,
    collectionCount: 1,
    applyCount: 1,
    terminalCount: 4,
    blockedCount: 0,
    conflictBlockedCount: 1,
    humanBlockedCount: 0,
    remainingReadyCount: 0,
    admittedCount: 7,
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
assert.deepStrictEqual(collapsedDecisionDashboard.operatorSummary, collapsedDecisionDashboard.queueMetadata.operatorSummary);
assert.deepStrictEqual(collapsedDecisionDashboard.mergeQueueHealth, collapsedDecisionDashboard.queueMetadata.mergeQueueHealth);
assert.deepStrictEqual(collapsedDecisionDashboard.queueMetadata.decisionCollapsePolicy, FRONTIER_SWARM_CODEX_AUTONOMOUS_DECISION_COLLAPSE_POLICY);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.appliedDecisionCount, 3);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.queueHealth.committedDecisionCount, 2);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.mergeQueueHealth.counts.appliedDecisionCount, 3);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.mergeQueueHealth.counts.committedDecisionCount, 2);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.mergeQueueHealth.counts.rerunCandidateCount, 0);
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
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.bucketCounts.staleAgainstHeadCount, 3);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.promoteCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.rerunCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.currentHeadConflictCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.deferredCoordinatorCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.deferredPromoteCount, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.humanQuestions.count, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.status, 'warning');
assert.match(collapsedDecisionDashboard.queueMetadata.operatorSummary.headline, /1 deferred coordinator assignment/);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.appliedDecisions, 3);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.currentHeadConflicts, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.deferredCoordinatorQueues, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.deferredPromoteQueues, 1);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.staleOrRerun, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
assert.strictEqual(collapsedDecisionDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 0);
const collapsedDecisionCards = new Map(collapsedDecisionDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(collapsedDecisionCards.get('applied-decisions').value, 3);
assert.strictEqual(collapsedDecisionCards.get('coordination-debt').value, 1);
assert.strictEqual(collapsedDecisionCards.get('coordination-debt').status, 'warning');
assert.match(collapsedDecisionCards.get('coordination-debt').detail, /1 deferred promotion/);
assert.strictEqual(collapsedDecisionCards.get('stale-rerun').value, 0);
assert.strictEqual(collapsedDecisionCards.get('stale-rerun').detail, '0 stale, 0 rerun, 0 current-head conflicts');
assert.match(collapsedDecisionCards.get('stale-rerun').action, /escalate only explicit human-blocked or true-blocker entries/);
assert.strictEqual(collapsedDecisionCards.get('true-blockers').value, 0);
assert.strictEqual(collapsedDecisionCards.get('true-blockers').detail, '0 queue block actions, 0 explicit human questions');
assert.strictEqual(collapsedDecisionCards.get('true-blockers').status, 'ok');
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.autonomousDecisionCount, 7);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.currentDecisionCount, 4);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.supersededDecisionCount, 3);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.completedHistoryCount, 7);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.committedDecisionCount, 2);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.rerunWorkCount, 0);
assert.strictEqual(collapsedDecisionDashboard.autonomousQueueHealth.summary.realBlockerCount, 0);
const collapsedDecisionHistory = new Map(collapsedDecisionDashboard.autonomousQueueHealth.decisionHistory.map((decision) => [decision.id, decision]));
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rerun-old').historyState, 'superseded');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rerun-old').queueImpact, 'completed-history');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rerun-old').supersededByDecisionId, 'collapsed-rerun-fresh');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-conflict-old').historyState, 'superseded');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-conflict-old').queueImpact, 'completed-history');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-conflict-old').supersededByDecisionId, 'collapsed-conflict-fresh');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rejected-old').historyState, 'superseded');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rejected-old').queueImpact, 'completed-history');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rejected-old').supersededByDecisionId, 'collapsed-rejected-fresh');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rejected-fresh').historyState, 'current');
assert.strictEqual(collapsedDecisionHistory.get('collapsed-rejected-fresh').queueImpact, 'completed-history');
const collapsedHealthSections = new Map(collapsedDecisionDashboard.autonomousQueueHealth.sections.map((section) => [section.id, section]));
assert.strictEqual(collapsedHealthSections.get('completed-history').value, 7);
assert.match(collapsedHealthSections.get('completed-history').detail, /3 superseded decisions/);
assert.strictEqual(collapsedHealthSections.get('rerun-work').value, 0);
assert.strictEqual(collapsedHealthSections.get('real-blockers').value, 0);
const collapsedManifestHead = 'f'.repeat(40);
const closedStaleEntry = createSyntheticCollectedRerunEntry(collapsedDecisionOutDir, {
  jobId: 'closed-stale-old-job',
  taskId: 'closed-stale-task',
  queueItemIds: ['closed-stale-task'],
  changedPaths: ['src/closed-stale.ts']
});
const closedRejectedEntry = createSyntheticCollectedRerunEntry(collapsedDecisionOutDir, {
  jobId: 'closed-rejected-old-job',
  taskId: 'closed-rejected-task',
  queueItemIds: ['closed-rejected-task'],
  changedPaths: ['src/closed-rejected.ts']
});
const openRerunEntry = createSyntheticCollectedRerunEntry(collapsedDecisionOutDir, {
  jobId: 'open-rerun-old-job',
  taskId: 'open-rerun-task',
  queueItemIds: ['open-rerun-task'],
  changedPaths: ['src/open-rerun.ts']
});
const openDecisionPatchPath = path.join(collapsedDecisionOutDir, 'apply-01', 'open-rerun-job', 'changes.patch');
const openDecisionBundlePath = path.join(collapsedDecisionOutDir, 'apply-01', 'open-rerun-job', 'merge.json');
const collapsedDecisionManifest = createCodexAutoDrainRerunManifest({
  outDir: collapsedDecisionOutDir,
  autoDrainPath: path.join(collapsedDecisionOutDir, 'auto-drain.json'),
  manifestPath: path.join(collapsedDecisionOutDir, 'rerun-manifest.json'),
  generatedAt: collapsedDecisionArtifacts.generatedAt,
  currentHead: collapsedManifestHead,
  terminalJobIds: ['closed-stale-fresh-job', 'closed-conflict-fresh-job', 'closed-rejected-fresh-job'],
  blockedJobIds: [],
  iterations: [{
    index: 1,
    collection: {
      outDir: path.join(collapsedDecisionOutDir, 'collection-01'),
      artifacts: {
        collectionPath: path.join(collapsedDecisionOutDir, 'collection-01', 'collection.json'),
        hierarchicalMergeQueuePath: path.join(collapsedDecisionOutDir, 'collection-01', 'hierarchical-merge-queue.json'),
        queueOverlayPath: path.join(collapsedDecisionOutDir, 'collection-01', 'queue-overlay.json')
      },
      mergeIndex: { runId: 'collapsed-decision-run' },
      buckets: {
        'ready-to-apply': [],
        'needs-human-port': [],
        'failed-evidence': [],
        'stale-against-head': [closedStaleEntry, closedRejectedEntry, openRerunEntry]
      },
      hierarchicalMergeQueue: {
        assignments: [{
          jobId: 'closed-stale-old-job',
          taskId: 'closed-stale-task',
          lane: 'rerun-lifecycle',
          queueItemIds: ['closed-stale-task'],
          action: 'rerun',
          changedPaths: ['src/closed-stale.ts'],
          changedRegions: [],
          conflictingJobIds: [],
          scopeId: 'path:src/closed-stale.ts',
          leaseKey: 'path:src/closed-stale.ts',
          reasons: ['stale-against-head']
        }, {
          jobId: 'closed-rejected-old-job',
          taskId: 'closed-rejected-task',
          lane: 'rerun-lifecycle',
          queueItemIds: ['closed-rejected-task'],
          action: 'rerun',
          changedPaths: ['src/closed-rejected.ts'],
          changedRegions: [],
          conflictingJobIds: [],
          scopeId: 'path:src/closed-rejected.ts',
          leaseKey: 'path:src/closed-rejected.ts',
          reasons: ['stale-against-head']
        }, {
          jobId: 'open-rerun-old-job',
          taskId: 'open-rerun-task',
          lane: 'rerun-lifecycle',
          queueItemIds: ['open-rerun-task'],
          action: 'rerun',
          changedPaths: ['src/open-rerun.ts'],
          changedRegions: ['src/open-rerun.ts#open'],
          conflictingJobIds: [],
          scopeId: 'region:src/open-rerun.ts#open',
          leaseKey: 'region:src/open-rerun.ts#open',
          reasons: ['stale-against-head']
        }]
      }
    },
    apply: {
      outDir: path.join(collapsedDecisionOutDir, 'manifest-apply-01'),
      decisionLogPath: path.join(collapsedDecisionOutDir, 'manifest-apply-01', 'autonomous-merge-decisions.jsonl'),
      decisions: [
        createSyntheticAutonomousDecision('rerun', {
          id: 'closed-stale-old-decision',
          jobId: 'closed-stale-old-job',
          taskId: 'closed-stale-task',
          queueItemIds: ['closed-stale-task'],
          patchPath: path.join(collapsedDecisionOutDir, 'apply-01', 'closed-stale-old-job', 'changes.patch'),
          bundlePath: path.join(collapsedDecisionOutDir, 'apply-01', 'closed-stale-old-job', 'merge.json'),
          changedPaths: ['src/closed-stale.ts'],
          headAfter: 'a'.repeat(40),
          finishedAt: collapsedDecisionArtifacts.generatedAt + 1
        }),
        createSyntheticAutonomousDecision('conflict-blocked', {
          id: 'closed-conflict-old-decision',
          jobId: 'closed-conflict-old-job',
          taskId: 'closed-conflict-task',
          queueItemIds: ['closed-conflict-task'],
          patchPath: path.join(collapsedDecisionOutDir, 'apply-01', 'closed-conflict-old-job', 'changes.patch'),
          bundlePath: path.join(collapsedDecisionOutDir, 'apply-01', 'closed-conflict-old-job', 'merge.json'),
          changedPaths: ['src/closed-conflict.ts'],
          headBefore: 'b'.repeat(40),
          finishedAt: collapsedDecisionArtifacts.generatedAt + 2
        }),
        createSyntheticAutonomousDecision('applied', {
          id: 'closed-stale-fresh-decision',
          jobId: 'closed-stale-fresh-job',
          taskId: 'closed-stale-task',
          queueItemIds: ['closed-stale-task'],
          changedPaths: ['src/closed-stale.ts'],
          finishedAt: collapsedDecisionArtifacts.generatedAt + 3
        }),
        createSyntheticAutonomousDecision('committed', {
          id: 'closed-conflict-fresh-decision',
          jobId: 'closed-conflict-fresh-job',
          taskId: 'closed-conflict-task',
          queueItemIds: ['closed-conflict-task'],
          changedPaths: ['src/closed-conflict.ts'],
          finishedAt: collapsedDecisionArtifacts.generatedAt + 4
        }),
        createSyntheticAutonomousDecision('rejected', {
          id: 'closed-rejected-fresh-decision',
          jobId: 'closed-rejected-fresh-job',
          taskId: 'closed-rejected-task',
          queueItemIds: ['closed-rejected-task'],
          changedPaths: ['src/closed-rejected.ts'],
          reason: 'verification failed: closed-rejected-gate',
          finishedAt: collapsedDecisionArtifacts.generatedAt + 5
        }),
        createSyntheticAutonomousDecision('rerun', {
          id: 'open-rerun-decision',
          jobId: 'open-rerun-new-job',
          taskId: 'open-rerun-task',
          queueItemIds: ['open-rerun-task'],
          patchPath: openDecisionPatchPath,
          bundlePath: openDecisionBundlePath,
          changedPaths: ['src/open-rerun.ts'],
          changedRegions: ['src/open-rerun.ts#open'],
          headAfter: 'c'.repeat(40),
          finishedAt: collapsedDecisionArtifacts.generatedAt + 6
        })
      ]
    }
  }]
});
assert.strictEqual(collapsedDecisionManifest.kind, FRONTIER_SWARM_CODEX_RERUN_MANIFEST_KIND);
assert.strictEqual(collapsedDecisionManifest.currentHead, collapsedManifestHead);
assert.deepStrictEqual(collapsedDecisionManifest.taskIds, ['open-rerun-task']);
assert.deepStrictEqual(collapsedDecisionManifest.jobIds, ['open-rerun-new-job']);
assert.strictEqual(collapsedDecisionManifest.summary.taskCount, 1);
assert.strictEqual(collapsedDecisionManifest.summary.staleAgainstHeadCount, 0);
assert.strictEqual(collapsedDecisionManifest.summary.queueRerunCount, 0);
assert.strictEqual(collapsedDecisionManifest.summary.decisionRerunCount, 1);
assert.strictEqual(collapsedDecisionManifest.summary.conflictBlockedCount, 0);
const collapsedDecisionManifestTask = collapsedDecisionManifest.items[0];
assert.strictEqual(collapsedDecisionManifestTask.id, 'open-rerun-task-rerun-current-head');
assert.deepStrictEqual(collapsedDecisionManifestTask.metadata.rerun.sourceKinds, ['decision-rerun']);
assert.deepStrictEqual(collapsedDecisionManifestTask.metadata.rerun.sourcePatchPaths, [openDecisionPatchPath]);
assert.deepStrictEqual(collapsedDecisionManifestTask.metadata.rerun.sourceBundlePaths, [openDecisionBundlePath]);
assert.ok(!collapsedDecisionManifestTask.sourceRefs.includes(openRerunEntry.bundle.patchPath));
assert.ok(collapsedDecisionManifestTask.sourceRefs.includes(openDecisionBundlePath));
assert.ok(!collapsedDecisionManifest.taskIds.includes('closed-stale-task'));
assert.ok(!collapsedDecisionManifest.taskIds.includes('closed-conflict-task'));
assert.ok(!collapsedDecisionManifest.taskIds.includes('closed-rejected-task'));

const explicitHumanQuestionOutDir = path.join(tmp, 'explicit-human-question-dashboard');
const explicitHumanQuestionArtifacts = createSyntheticAutoDrainArtifacts(explicitHumanQuestionOutDir);
explicitHumanQuestionArtifacts.summary.decisionCount = 5;
await fs.mkdir(explicitHumanQuestionOutDir, { recursive: true });
const explicitHumanQuestionAnswerLogPath = path.join(explicitHumanQuestionOutDir, 'human-action-answers.jsonl');
const explicitHumanQuestionAnswerEvidencePath = path.join(explicitHumanQuestionOutDir, 'answer-evidence.md');
await fs.writeFile(explicitHumanQuestionAnswerLogPath, JSON.stringify({
  id: 'answer-prefixed-human-question',
  questionId: 'prefixed-human-question',
  questionCode: 'queue:prefixed-human-question-task',
  queueItemId: 'prefixed-human-question-task',
  route: 'approve-parent-assignment',
  answer: 'Approve the parent coordinator ownership exception.',
  evidencePath: explicitHumanQuestionAnswerEvidencePath
}) + '\n');
await fs.writeFile(explicitHumanQuestionAnswerEvidencePath, 'approved\n');
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
  humanAnswers: {
    kind: 'frontier.swarm-codex.human-answer-routing',
    version: 1,
    source: 'human-action-answers.jsonl',
    available: true,
    paths: [explicitHumanQuestionAnswerLogPath],
    routingPath: path.join(explicitHumanQuestionOutDir, 'human-answer-routing.json'),
    count: 1,
    consumedCount: 1,
    routedDecisionCount: 1,
    ignoredCount: 0,
    parseErrorCount: 0,
    answeredQuestionIds: ['prefixed-human-question'],
    answeredQuestionCodes: ['queue:prefixed-human-question-task'],
    routedDecisionIds: ['prefixed-human-question'],
    routedJobIds: ['prefixed-human-question-job'],
    routedTaskIds: ['prefixed-human-question-task'],
    routedQueueItemIds: ['prefixed-human-question-task'],
    evidencePaths: [explicitHumanQuestionAnswerEvidencePath],
    answers: [{
      id: 'answer-prefixed-human-question',
      sourcePath: explicitHumanQuestionAnswerLogPath,
      line: 1,
      consumed: true,
      questionIds: ['prefixed-human-question'],
      questionCodes: ['queue:prefixed-human-question-task'],
      decisionIds: [],
      jobIds: [],
      taskIds: [],
      queueItemIds: ['prefixed-human-question-task'],
      routes: ['approve-parent-assignment'],
      evidencePaths: [explicitHumanQuestionAnswerEvidencePath],
      answer: 'Approve the parent coordinator ownership exception.'
    }],
    routedDecisions: [{
      decisionId: 'prefixed-human-question',
      jobId: 'prefixed-human-question-job',
      taskId: 'prefixed-human-question-task',
      queueItemIds: ['prefixed-human-question-task'],
      questionIds: ['prefixed-human-question'],
      questionCodes: ['queue:prefixed-human-question-task'],
      reason: 'human-question: Should the parent coordinator approve this ownership exception',
      answerIds: ['answer:answer-prefixed-human-question'],
      answerRoutes: ['approve-parent-assignment'],
      answerEvidencePaths: [explicitHumanQuestionAnswerEvidencePath]
    }],
    parseErrors: []
  },
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
assert.deepStrictEqual(explicitHumanQuestionDashboard.mergeQueueHealth, explicitHumanQuestionDashboard.queueMetadata.mergeQueueHealth);
assert.deepStrictEqual(explicitHumanQuestionDashboard.humanAnswers, explicitHumanQuestionDashboard.queueMetadata.humanAnswers);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.kind, 'frontier.swarm-codex.dashboard-human-answers');
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.routingKind, 'frontier.swarm-codex.human-answer-routing');
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.count, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.answeredCount, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.consumedCount, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.routedDecisionCount, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.ignoredCount, 0);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.answerIds, ['answer:answer-prefixed-human-question']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.answerRoutes, ['approve-parent-assignment']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanAnswers.evidencePaths, [explicitHumanQuestionAnswerEvidencePath]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.paths.humanAnswers, [explicitHumanQuestionAnswerLogPath]);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.count, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.decisionCount, 2);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answeredCount, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedDecisionCount, 1);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.questionIds, [
  'question-mark-human-question'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.openDecisionIds, [
  'question-mark-human-question'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answeredDecisionIds, [
  'prefixed-human-question'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.questionCodes, [
  'queue:question-mark-human-question-task'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds, [
  'question-mark-human-question-job'
]);
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('generic-human-blocked-job'));
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('prefixed-human-question-job'));
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('failed-apply-job'));
assert.ok(!explicitHumanQuestionDashboard.queueMetadata.humanQuestions.jobIds.includes('coordinator-review-job'));
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.taskIds, [
  'question-mark-human-question-task'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answeredJobIds, [
  'prefixed-human-question-job'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answeredTaskIds, [
  'prefixed-human-question-task'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.reasons, [
  'Can the parent coordinator assign this cross-lane surface?'
]);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.mergeQueueHealth.counts.blockedHumanQuestionCount, 1);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.mergeQueueHealth.blockedHumanQuestions.map((question) => question.id), [
  'question-mark-human-question'
]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedDecisionIds, ['prefixed-human-question']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedJobIds, ['prefixed-human-question-job']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedTaskIds, ['prefixed-human-question-task']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedQuestionIds, ['prefixed-human-question']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.routedQuestionCodes, ['queue:prefixed-human-question-task']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answerIds, ['answer:answer-prefixed-human-question']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answerRoutes, ['approve-parent-assignment']);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answerLogPaths, [explicitHumanQuestionAnswerLogPath]);
assert.deepStrictEqual(explicitHumanQuestionDashboard.queueMetadata.humanQuestions.answerEvidencePaths, [explicitHumanQuestionAnswerEvidencePath]);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.status, 'blocked');
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.counts.humanQuestions, 1);
assert.strictEqual(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 1);
const explicitHumanQuestionCards = new Map(explicitHumanQuestionDashboard.queueMetadata.operatorSummary.cards.map((card) => [card.id, card]));
assert.strictEqual(explicitHumanQuestionCards.get('true-blockers').value, 1);
assert.strictEqual(explicitHumanQuestionCards.get('true-blockers').status, 'blocked');
assert.match(explicitHumanQuestionCards.get('true-blockers').detail, /1 explicit human question/);
assert.strictEqual(explicitHumanQuestionDashboard.autonomousQueueHealth.summary.humanQuestionCount, 1);
assert.strictEqual(explicitHumanQuestionDashboard.autonomousQueueHealth.summary.realBlockerCount, 1);
const explicitHumanQuestionHealthSections = new Map(explicitHumanQuestionDashboard.autonomousQueueHealth.sections.map((section) => [section.id, section]));
assert.strictEqual(explicitHumanQuestionHealthSections.get('human-questions').value, 1);
assert.strictEqual(explicitHumanQuestionHealthSections.get('real-blockers').value, 1);
assert.deepStrictEqual(explicitHumanQuestionDashboard.autonomousQueueHealth.realBlockers.map((blocker) => blocker.id), [
  'human-blocked-decision:generic-human-blocked'
]);

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
assert.deepStrictEqual(autoDrainClassificationDashboard.mergeQueueHealth, autoDrainClassificationDashboard.queueMetadata.mergeQueueHealth);
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
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.mergeQueueHealth.counts.rerunCandidateCount, 1);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.mergeQueueHealth.rerunCandidates[0].sourceKinds.includes('stale-against-head'), true);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.mergeQueueHealth.coordinatorAssignments.some((assignment) => assignment.assignedAction === 'block' && assignment.terminal), true);
assert.strictEqual(autoDrainClassificationDashboard.queueMetadata.mergeQueueHealth.terminalDecisions.some((decision) => decision.status === 'blocked'), true);
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

const unansweredHumanQuestionOutDir = path.join(tmp, 'auto-drain-unanswered-human-question');
const humanQuestionPlan = createCodexSwarmPlan({
  manifest: {
    id: 'human-question-routing',
    lanes: [{ id: 'question', allowedGlobs: ['src/**'] }]
  },
  tasks: {
    items: [{
      id: 'human-question-marker',
      lane: 'question',
      ownedFiles: ['src/question.ts']
    }]
  }
});
const explicitQueueQuestionReason = 'human-question: owner=product; surface=src/question.ts; missing-authority=policy; question=Can this product behavior ship?; answer-code=choose:ship|hold';
const unansweredHumanQuestionRun = await runCodexSwarm(humanQuestionPlan, {
  outDir: unansweredHumanQuestionOutDir,
  cwd: tmp,
  dryRun: false,
  autoDrain: {
    maxIterations: 1,
    checkStale: false
  },
  executor: async (input) => {
    const runDir = path.dirname(input.paths.jobDir);
    await writeSyntheticMergeBundle(runDir, 'unanswered-human-question', {
      status: 'blocked',
      mergeReadiness: 'blocked',
      disposition: 'blocked',
      riskLevel: 'high',
      reasons: [explicitQueueQuestionReason],
      queueItemIds: ['unanswered-human-question-task']
    });
    await fs.writeFile(input.paths.lastMessagePath, `${explicitQueueQuestionReason}\n`);
    return { exitCode: 0, changedPaths: [], lastMessage: explicitQueueQuestionReason };
  }
});
const unansweredHumanQuestionDashboard = JSON.parse(await fs.readFile(path.join(unansweredHumanQuestionOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(unansweredHumanQuestionRun.autoDrain.humanAnswers.available, false);
assert.strictEqual(unansweredHumanQuestionRun.autoDrain.summary.humanAnswerContinuationCount, 0);
assert.strictEqual(unansweredHumanQuestionDashboard.queueMetadata.actionCounts.blockCount, 1);
assert.strictEqual(unansweredHumanQuestionDashboard.queueMetadata.actionCounts.trueBlockerCount, 1);
assert.strictEqual(unansweredHumanQuestionDashboard.queueMetadata.operatorSummary.status, 'blocked');
assert.strictEqual(unansweredHumanQuestionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 1);

const answeredHumanQuestionOutDir = path.join(tmp, 'auto-drain-answered-human-question');
await fs.mkdir(answeredHumanQuestionOutDir, { recursive: true });
const answeredHumanQuestionAnswerLogPath = path.join(answeredHumanQuestionOutDir, 'human-action-answers.jsonl');
await fs.writeFile(answeredHumanQuestionAnswerLogPath, JSON.stringify({
  id: 'answer-answered-human-question',
  queueItemId: 'answered-human-question-task',
  route: 'choose:ship',
  answer: 'Ship this behavior.',
  evidencePath: 'human-answer-evidence.md'
}) + '\n');
const answeredHumanQuestionRun = await runCodexSwarm(humanQuestionPlan, {
  outDir: answeredHumanQuestionOutDir,
  cwd: tmp,
  dryRun: false,
  autoDrain: {
    maxIterations: 1,
    checkStale: false
  },
  executor: async (input) => {
    const runDir = path.dirname(input.paths.jobDir);
    await writeSyntheticMergeBundle(runDir, 'answered-human-question', {
      status: 'blocked',
      mergeReadiness: 'blocked',
      disposition: 'blocked',
      riskLevel: 'high',
      reasons: [explicitQueueQuestionReason],
      queueItemIds: ['answered-human-question-task']
    });
    await fs.writeFile(input.paths.lastMessagePath, `${explicitQueueQuestionReason}\n`);
    return { exitCode: 0, changedPaths: [], lastMessage: explicitQueueQuestionReason };
  }
});
const answeredHumanQuestionDashboard = JSON.parse(await fs.readFile(path.join(answeredHumanQuestionOutDir, 'coordinator-dashboard.json'), 'utf8'));
assert.strictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.available, true);
assert.deepStrictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.paths, [answeredHumanQuestionAnswerLogPath]);
assert.strictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.routedDecisionCount, 0);
assert.strictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.routedContinuationCount, 1);
assert.strictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.consumedCount, 1);
assert.strictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.ignoredCount, 0);
assert.strictEqual(answeredHumanQuestionRun.autoDrain.summary.humanAnswerContinuationCount, 1);
assert.deepStrictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.routedJobIds, ['answered-human-question']);
assert.deepStrictEqual(answeredHumanQuestionRun.autoDrain.humanAnswers.routedQueueItemIds, ['answered-human-question-task']);
assert.deepStrictEqual(answeredHumanQuestionDashboard.queueMetadata.humanAnswers.routedContinuationIds, answeredHumanQuestionRun.autoDrain.humanAnswers.routedContinuationIds);
assert.strictEqual(answeredHumanQuestionDashboard.queueMetadata.actionCounts.blockCount, 0);
assert.strictEqual(answeredHumanQuestionDashboard.queueMetadata.actionCounts.trueBlockerCount, 0);
assert.strictEqual(answeredHumanQuestionDashboard.queueMetadata.operatorSummary.status, 'ok');
assert.strictEqual(answeredHumanQuestionDashboard.queueMetadata.operatorSummary.counts.trueBlockers, 0);
assert.deepStrictEqual(answeredHumanQuestionDashboard.queueMetadata.paths.humanAnswers, [answeredHumanQuestionAnswerLogPath]);

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
assert.ok(cliSource.includes('--rerun-manifest <file>'));
assert.ok(cliSource.includes("options['rerun-manifest']"));
assert.ok(cliSource.includes('assertRerunManifestInput(tasks, rerunManifestPath)'));
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
assert.ok(cliSource.includes('--promote-patch-candidates[=true|false] --no-promote-patch-candidates'));
assert.ok(cliSource.includes('--promotion-focused-command <cmd> --promotion-global-command <cmd> --promotion-global-glob <glob>'));
assert.ok(cliSource.includes('--auto-drain-decision-log <path>'));
assert.ok(cliSource.includes('--auto-drain-human-answer-log <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-path <path>'));
assert.ok(cliSource.includes('--auto-drain-lock-timeout-ms <n>'));
assert.ok(cliSource.includes('--auto-drain-lock-stale-ms <n>'));
assert.ok(cliSource.includes("args['auto-drain-limit']"));
assert.ok(cliSource.includes("args['auto-drain-max-iterations']"));
assert.ok(cliSource.includes("args['no-auto-drain-promote-patch-candidates']"));
assert.ok(cliSource.includes("promotePatchCandidates: disableAutoDrainPatchCandidatePromotion ? false : optionalBoolArg(args.autoDrainPromotePatchCandidates ?? args['auto-drain-promote-patch-candidates'])"));
assert.ok(cliSource.includes("args['no-promote-patch-candidates']"));
assert.ok(cliSource.includes("promotePatchCandidates: disablePatchCandidatePromotion ? false : optionalBoolArg(args.promotePatchCandidates ?? args['promote-patch-candidates'])"));
assert.ok(cliSource.includes("args['auto-drain-decision-log']"));
assert.ok(cliSource.includes("args['auto-drain-human-answer-log']"));
assert.ok(cliSource.includes("args['auto-drain-lock-path']"));
assert.ok(cliSource.includes('autonomous coordinator drain work'));
assert.ok(cliSource.includes('frontier.swarm.coordinator-agent-drain-work contract'));
assert.ok(cliSource.includes('Terminal coordinator decisions such as applied, committed, checked'));
assert.ok(cliSource.includes('queue outcomes, not'));
assert.ok(cliSource.includes('it does not apply old'));
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

async function writePatchOnlyJob(runDir, jobId, patchText, overrides = {}) {
  const taskId = overrides.taskId ?? `${jobId}-task`;
  const lane = overrides.lane ?? 'patch-only';
  const changedFiles = Array.isArray(overrides.changedFiles) ? overrides.changedFiles : ['src/apply.ts'];
  const changedRegions = Array.isArray(overrides.changedRegions) ? overrides.changedRegions : [];
  const allowedWriteGlobs = Array.isArray(overrides.allowedWriteGlobs) ? overrides.allowedWriteGlobs : ['src/**'];
  const jobDir = path.join(runDir, jobId);
  const evidenceDir = path.join(jobDir, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, 'changes.patch'), patchText);
  await fs.writeFile(path.join(evidenceDir, 'evidence.json'), JSON.stringify({
    kind: 'frontier.swarm-codex.worker-evidence',
    version: 1,
    jobId,
    taskId,
    lane,
    status: overrides.status ?? 'passed',
    changedFiles,
    changedRegions,
    allowedWriteGlobs,
    changedPathsWithinAllowedGlobs: overrides.changedPathsWithinAllowedGlobs ?? true
  }, null, 2) + '\n');
  await fs.writeFile(path.join(jobDir, 'last-message.md'), `${jobId} done\n`);
  await fs.writeFile(path.join(jobDir, 'prompt.md'), [
    '# Frontier Swarm Codex Job',
    '',
    `Job: ${jobId}`,
    `Task: ${taskId}`,
    `Lane: ${lane}`,
    '',
    'Raw task JSON:',
    '',
    JSON.stringify({
      kind: 'frontier.swarm.task',
      version: 1,
      id: taskId,
      title: jobId,
      lane,
      allowedWrites: allowedWriteGlobs,
      changedRegions,
      targetRefs: changedFiles
    }, null, 2)
  ].join('\n') + '\n');
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
    ...(typeof overrides.patchPath === 'string' ? { patchPath: overrides.patchPath } : {}),
    ...(typeof overrides.headBefore === 'string' ? { headBefore: overrides.headBefore } : {}),
    ...(typeof overrides.headAfter === 'string' ? { headAfter: overrides.headAfter } : {}),
    startedAt: overrides.startedAt ?? now,
    finishedAt: overrides.finishedAt ?? now,
    dryRun: overrides.dryRun ?? false,
    commands: overrides.commands ?? []
  };
}

function createSyntheticCollectedRerunEntry(root, overrides = {}) {
  const jobId = overrides.jobId ?? 'synthetic-rerun-job';
  const taskId = overrides.taskId ?? `${jobId}-task`;
  const queueItemIds = Array.isArray(overrides.queueItemIds) ? overrides.queueItemIds : [taskId];
  const changedPaths = Array.isArray(overrides.changedPaths) ? overrides.changedPaths : [`src/${taskId}.ts`];
  const changedRegions = Array.isArray(overrides.changedRegions) ? overrides.changedRegions : [];
  const outputDir = overrides.outputDir ?? path.join(root, 'collection-01', 'stale-against-head', jobId);
  const sourcePatchPath = overrides.sourcePatchPath ?? path.join(root, 'workers', jobId, 'changes.patch');
  const sourceBundlePath = overrides.sourceBundlePath ?? path.join(root, 'workers', jobId, 'merge.json');
  return {
    jobId,
    bucket: 'stale-against-head',
    outputDir,
    mergePath: sourceBundlePath,
    bundle: {
      jobId,
      taskId,
      lane: overrides.lane ?? 'rerun-lifecycle',
      queueItemIds,
      patchPath: sourcePatchPath,
      changedPaths,
      changedRegions,
      reasons: overrides.reasons ?? ['stale-against-head'],
      evidencePaths: overrides.evidencePaths ?? [path.join(root, 'workers', jobId, 'evidence.json')],
      allowedWrites: overrides.allowedWrites ?? changedPaths
    }
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
    rerunManifest: {
      paths: [],
      count: 0,
      taskCount: 0,
      conflictBlockedCount: 0,
      decisionRerunCount: 0,
      staleAgainstHeadCount: 0,
      queueRerunCount: 0,
      sourceHeadCount: 0,
      sourcePatchCount: 0,
      targetRefCount: 0
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
      patchCount: 0,
      rerunManifestCount: 0,
      rerunTaskCount: 0
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
