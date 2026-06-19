import assert from 'node:assert';
import {
  buildCodexArgs,
  createBrowserPlan,
  createCodexResourceAllocation,
  discoverCodexHandoffArtifacts,
  exists,
  fs,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  path,
  renderCodexPrompt,
  repairCodexWorkspacePackageLinks
} from './context.mjs';

export async function testPlanningAndLinks({ manifest, tasks, plan, tmp, paths }) {
  assert.strictEqual(manifest.compute?.[0]?.model, 'gpt-5.5');
  assert.strictEqual(tasks[0].targetRefs?.[0], 'src/runtime/action.ts');
  assert.strictEqual(plan.jobs.length, 1);
  assert.strictEqual(plan.jobs[0].compute.model, 'gpt-5.5');
  assert.strictEqual(plan.jobs[0].compute.reasoningEffort, 'xhigh');

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

  const linkRoot = path.join(tmp, 'link-root');
  const linkPackages = path.join(tmp, 'local-packages');
  await fs.mkdir(path.join(linkRoot, 'node_modules', '@test'), { recursive: true });
  await fs.mkdir(path.join(linkPackages, 'frontier-foo'), { recursive: true });
  await fs.mkdir(path.join(linkPackages, 'frontier-bar'), { recursive: true });
  await fs.writeFile(path.join(linkRoot, 'package.json'), JSON.stringify({
    dependencies: {
      '@test/frontier-foo': '^1.0.0',
      '@test/frontier-swarm': '^1.0.0'
    },
    devDependencies: {
      '@test/frontier-bar': '^1.0.0'
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(linkPackages, 'frontier-foo', 'package.json'), JSON.stringify({ name: '@test/frontier-foo' }) + '\n');
  await fs.writeFile(path.join(linkPackages, 'frontier-bar', 'package.json'), JSON.stringify({ name: '@test/frontier-bar' }) + '\n');
  const linkPlan = await repairCodexWorkspacePackageLinks({
    root: linkRoot,
    packageRoots: [linkPackages],
    scope: '@test',
    excludePackages: ['@test/frontier-swarm']
  });
  assert.strictEqual(linkPlan.summary.planned, 2);
  assert.strictEqual(linkPlan.summary.excluded, 1);
  assert.strictEqual(linkPlan.summary.conflicts, 0);
  const linkRepair = await repairCodexWorkspacePackageLinks({
    root: linkRoot,
    packageRoots: [linkPackages],
    scope: '@test',
    excludePackages: ['@test/frontier-swarm'],
    write: true
  });
  assert.strictEqual(linkRepair.summary.linked, 2);
  assert.ok((await fs.lstat(path.join(linkRoot, 'node_modules', '@test', 'frontier-foo'))).isSymbolicLink());
  assert.strictEqual(await exists(path.join(linkRoot, 'node_modules', '@test', 'frontier-swarm')), false);

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
  assert.strictEqual(normalizeCodexApprovalPolicy('on_request'), 'on-request');
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
  assert.ok(prompt.includes('src/runtime/action.ts'));

  const browserPlan = createBrowserPlan();
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
}
