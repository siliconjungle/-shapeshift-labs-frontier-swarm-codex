import {
  buildCodexArgs,
  collectCodexSwarmRun,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  createSwarmWorkspaceManifest,
  runCodexSwarm,
  type FrontierCodexWorkspacePlan,
  type FrontierCodexWorkspaceManifest,
  type FrontierCodexCollectResult,
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
    evidenceDir: 'evidence',
    workspaceProofPath: 'evidence/workspace-proof.json',
    patchPath: 'evidence/changes.patch',
    mergeBundlePath: 'evidence/merge.json',
    pidManifestPath: 'pids.json'
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
const workspaceManifest: FrontierCodexWorkspaceManifest = createSwarmWorkspaceManifest(workspacePlan);
const collectPromise: Promise<FrontierCodexCollectResult> = collectCodexSwarmRun({ run: '.', checkStale: false });

args satisfies string[];
workspacePlan satisfies FrontierCodexWorkspacePlan;
workspaceManifest.kind satisfies string;
resultPromise satisfies Promise<FrontierCodexSwarmRunResult>;
collectPromise satisfies Promise<FrontierCodexCollectResult>;
