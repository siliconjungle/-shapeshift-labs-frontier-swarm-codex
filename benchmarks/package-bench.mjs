import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  buildCodexArgs,
  createCodexSwarmPlan,
  createCodexWorkspacePlan,
  createSwarmWorkspaceManifest,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  renderCodexPrompt
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.basename(path.dirname(packageDir)) === 'packages'
  ? path.resolve(packageDir, '..', '..')
  : packageDir;
const args = parseArgs(process.argv.slice(2));
const taskCount = readPositiveInt(args.tasks, 1000);
const rounds = readPositiveInt(args.rounds, 30);
const outPath = args.out ? path.resolve(repoRoot, args.out) : null;

const input = makeInput(taskCount);
let plan = createCodexSwarmPlan(input);
let cursor = 0;
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

const rows = [
  measure('coerce-plan-' + taskCount, 8, () => {
    plan = createCodexSwarmPlan(input);
    return plan.jobs.length;
  }),
  measure('build-args-config-default-' + taskCount, 64, () => buildCodexArgs(plan.jobs[cursor++ % plan.jobs.length], { outDir: '.', workspacePath: '.', paths }).length),
  measure('build-args-plan-model-' + taskCount, 64, () => buildCodexArgs(plan.jobs[cursor++ % plan.jobs.length], { outDir: '.', workspacePath: '.', paths, modelPolicy: 'plan', approval: 'full-auto' }).length),
  measure('workspace-manifest-' + taskCount, 32, () => {
    const workspacePlan = createCodexWorkspacePlan(plan.jobs[cursor++ % plan.jobs.length], {
      outDir: '.',
      workspace: { mode: 'copy', includes: ['AGENTS.md', 'package.json'], linkPaths: ['packages'], linkNodeModules: true }
    });
    return createSwarmWorkspaceManifest(workspacePlan).includeCount;
  }),
  measure('compat-normalize', 256, () => (normalizeCodexModelFlag('default') ? 1 : 0) + normalizeCodexApprovalPolicy('full-auto').length),
  measure('render-prompt-' + taskCount, 32, () => renderCodexPrompt(plan.jobs[cursor++ % plan.jobs.length], { workspacePath: '.', paths }).length)
];

const report = {
  package: '@shapeshift-labs/frontier-swarm-codex',
  version: readPackageVersion(),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform + ' ' + process.arch,
  taskCount,
  rounds,
  rows
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

console.log(report.package + ' package benchmark');
console.log('Node ' + report.node + ' on ' + report.platform + ', tasks=' + taskCount + ', rounds=' + rounds);
console.log('These are Frontier-only package measurements, not competitor comparisons.');
console.log('');
console.log('Fixture'.padEnd(28) + 'Median'.padStart(12) + 'p95'.padStart(12));
for (const row of rows) console.log(row.fixture.padEnd(28) + formatUs(row.medianUs).padStart(12) + formatUs(row.p95Us).padStart(12));
if (outPath) console.log('\nwrote ' + path.relative(repoRoot, outPath));

function makeInput(count) {
  const items = [];
  for (let i = 0; i < count; i += 1) items.push({ id: 'task-' + i, lane: 'runtime', ownedFiles: [`src/runtime/file-${i}.ts`] });
  return {
    manifest: { lanes: [{ id: 'runtime', allowedGlobs: ['src/runtime/**'], evidenceOutDirPrefix: 'evidence/runtime/' }] },
    tasks: { items }
  };
}

function measure(fixture, operationsPerRound, fn) {
  const samples = [];
  let checksum = 0;
  for (let round = 0; round < rounds; round += 1) {
    const start = performance.now();
    for (let op = 0; op < operationsPerRound; op += 1) checksum += Number(fn()) || 0;
    samples.push(((performance.now() - start) * 1000) / operationsPerRound);
  }
  samples.sort((a, b) => a - b);
  return { fixture, operationsPerRound, medianUs: samples[Math.floor(samples.length / 2)], p95Us: samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))], checksum };
}

function formatUs(value) {
  if (value >= 1000) return (value / 1000).toFixed(2) + 'ms';
  return value.toFixed(2) + 'us';
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--tasks') out.tasks = argv[++i];
    else if (argv[i] === '--rounds') out.rounds = argv[++i];
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
}
