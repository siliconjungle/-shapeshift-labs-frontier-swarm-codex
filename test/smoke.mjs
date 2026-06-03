import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexArgs,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  renderCodexPrompt,
  runCodexSwarm
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

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-'));
const paths = {
  jobDir: tmp,
  promptPath: path.join(tmp, 'prompt.md'),
  eventsPath: path.join(tmp, 'events.jsonl'),
  stderrPath: path.join(tmp, 'stderr.log'),
  lastMessagePath: path.join(tmp, 'last.md'),
  evidenceDir: path.join(tmp, 'evidence')
};
const args = buildCodexArgs(plan.jobs[0], { outDir: tmp, workspacePath: tmp, paths });
assert.ok(args.includes('--model'));
assert.ok(args.includes('gpt-5.5'));
assert.ok(args.includes('model_reasoning_effort="xhigh"'));
assert.ok(!args.includes('--skip-git-repo-check'));
const copyArgs = buildCodexArgs(plan.jobs[0], {
  outDir: tmp,
  workspacePath: tmp,
  paths,
  workspace: { mode: 'copy' }
});
assert.ok(copyArgs.includes('--skip-git-repo-check'));

const prompt = renderCodexPrompt(plan.jobs[0], { workspacePath: tmp, paths });
assert.ok(prompt.includes('Allowed write globs'));
assert.ok(prompt.includes('src/runtime/action.ts'));

const result = await runCodexSwarm(plan, {
  outDir: path.join(tmp, 'run'),
  cwd: tmp,
  dryRun: false,
  executor: async (input) => {
    await fs.writeFile(input.paths.lastMessagePath, 'done\n');
    return { exitCode: 0, changedPaths: ['src/runtime/action.ts'], lastMessage: 'done' };
  }
});
assert.strictEqual(result.ok, true);
assert.strictEqual(result.run.results[0].ownershipViolations.length, 0);
assert.ok(result.proof.hash);

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
    await fs.writeFile(input.paths.lastMessagePath, 'changed\n');
    return { exitCode: 0, lastMessage: 'changed' };
  }
});
assert.strictEqual(changedResult.ok, true);
assert.deepStrictEqual(changedResult.run.results[0].changedPaths, ['src/runtime/action.ts']);

const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);

const cliSource = await fs.readFile(new URL('../dist/cli.js', import.meta.url), 'utf8');
assert.ok(cliSource.includes("from './index.js'"));

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
