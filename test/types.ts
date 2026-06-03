import {
  buildCodexArgs,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  runCodexSwarm,
  type FrontierCodexWorkspacePlan,
  type FrontierCodexSwarmRunResult
} from '../dist/index.js';

const plan = createCodexSwarmPlan({
  manifest: { lanes: [{ id: 'runtime', allowedWrites: ['src/**'] }] },
  tasks: [{ id: 'task', lane: 'runtime', targetRefs: ['src/index.ts'] }]
});

const job = plan.jobs[0];
const args = buildCodexArgs(job, {
  outDir: '.',
  workspacePath: '.',
  paths: {
    jobDir: '.',
    promptPath: 'prompt.md',
    eventsPath: 'events.jsonl',
    stderrPath: 'stderr.log',
    lastMessagePath: 'last.md',
    evidenceDir: 'evidence'
  }
});

const resultPromise: Promise<FrontierCodexSwarmRunResult> = runCodexSwarm(plan, {
  outDir: '.',
  dryRun: true,
  workspace: {
    mode: 'copy',
    includes: ['package.json'],
    excludes: ['node_modules'],
    linkPaths: ['packages'],
    artifactIncludes: ['agent-runs/latest/evidence.json'],
    skipGitRepoCheck: true
  }
});
const workspacePlan: FrontierCodexWorkspacePlan = createCodexWorkspacePlan(job, {
  outDir: '.',
  workspace: { mode: 'snapshot', includes: ['src'], linkNodeModules: false }
});

args satisfies string[];
workspacePlan satisfies FrontierCodexWorkspacePlan;
resultPromise satisfies Promise<FrontierCodexSwarmRunResult>;
