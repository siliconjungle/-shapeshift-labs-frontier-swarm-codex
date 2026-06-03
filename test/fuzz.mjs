import assert from 'node:assert';
import {
  buildCodexArgs,
  createCodexSwarmPlan,
  renderCodexPrompt
} from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 100);
let seed = readPositiveInt(args.seed, 0xc0de55);
let checked = 0;

for (let i = 0; i < cases; i += 1) {
  const lane = maybe() ? 'runtime' : 'tests';
  const plan = createCodexSwarmPlan({
    manifest: {
      compute: [{ id: 'codex.deep', kind: 'codex', model: 'gpt-5.5', reasoningEffort: 'xhigh' }],
      lanes: [{ id: lane, allowedGlobs: [`${lane}/**`], evidenceOutDirPrefix: `evidence/${lane}/` }]
    },
    tasks: [{ id: 'task-' + i, lane, ownedFiles: [`${lane}/file-${i}.ts`] }]
  });
  const job = plan.jobs[0];
  const paths = {
    jobDir: '.',
    promptPath: 'prompt.md',
    eventsPath: 'events.jsonl',
    stderrPath: 'stderr.log',
    lastMessagePath: 'last.md',
    evidenceDir: 'evidence',
    workspaceProofPath: 'workspace-proof.json',
    patchPath: 'changes.patch',
    mergeBundlePath: 'merge.json',
    pidManifestPath: 'pids.json'
  };
  const codexArgs = buildCodexArgs(job, { outDir: '.', workspacePath: '.', paths });
  assert.ok(!codexArgs.includes('--model'));
  assert.ok(buildCodexArgs(job, { outDir: '.', workspacePath: '.', paths, modelPolicy: 'plan' }).includes('--model'));
  assert.ok(renderCodexPrompt(job, { workspacePath: '.', paths }).includes(job.id));
  checked += 1;
}

console.log('frontier-swarm-codex fuzz ok: ' + checked + ' cases');

function maybe() {
  return (next() & 1) === 1;
}

function next() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cases') out.cases = argv[++i];
    else if (argv[i] === '--seed') out.seed = argv[++i];
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
