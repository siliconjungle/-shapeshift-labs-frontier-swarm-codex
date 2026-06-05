import {
  applyCodexSwarmCollection,
  buildCodexArgs,
  collectCodexSwarmRun,
  createCodexResourceAllocation,
  createCodexWorkspacePlan,
  createCodexSwarmPlan,
  createSwarmWorkspaceManifest,
  discoverCodexHandoffArtifacts,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  type FrontierCodexHandoffArtifact,
  type FrontierCodexWorkspacePlan,
  type FrontierCodexWorkspaceManifest,
  type FrontierCodexCollectResult,
  type FrontierCodexApplyResult,
  type FrontierCodexPatchScoreResult,
  type FrontierCodexResourceAllocation,
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
    resourceAllocationPath: 'evidence/resource-allocation.json',
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
const resourceAllocation: FrontierCodexResourceAllocation = createCodexResourceAllocation(job, {
  outDir: '.',
  workspacePath: '.'
});
const workspaceManifest: FrontierCodexWorkspaceManifest = createSwarmWorkspaceManifest(workspacePlan);
const collectPromise: Promise<FrontierCodexCollectResult> = collectCodexSwarmRun({ run: '.', checkStale: false });
const applyPromise: Promise<FrontierCodexApplyResult> = applyCodexSwarmCollection({ collection: '.', dryRun: true });
const scorePromise: Promise<FrontierCodexPatchScoreResult> = scoreCodexSwarmPatches({ collection: '.', focusedCommands: ['npm test'] });
const handoffArtifactsPromise: Promise<FrontierCodexHandoffArtifact[]> = discoverCodexHandoffArtifacts({ root: '.' });

args satisfies string[];
workspacePlan satisfies FrontierCodexWorkspacePlan;
resourceAllocation.env satisfies Record<string, string>;
workspaceManifest.kind satisfies string;
resultPromise satisfies Promise<FrontierCodexSwarmRunResult>;
collectPromise satisfies Promise<FrontierCodexCollectResult>;
applyPromise satisfies Promise<FrontierCodexApplyResult>;
scorePromise satisfies Promise<FrontierCodexPatchScoreResult>;
handoffArtifactsPromise satisfies Promise<readonly { kind: string; path: string }[]>;
