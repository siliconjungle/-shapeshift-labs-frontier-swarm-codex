import assert from 'node:assert';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  buildCodexArgs,
  checkCodexDependencyHealth,
  compareCodexSwarmTournaments,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexResumeOverlay,
  createCodexResourceAllocation,
  createCodexSwarmPlan,
  createCodexDashboardSteeringIntent,
  createCodexSwarmTournamentHistory,
  continueCodexSwarmLoop,
  createCodexWorkspacePlan,
  createCodexCleanupPlan,
  createSwarmWorkspaceProof,
  collectCodexSwarmRun,
  discoverCodexHandoffArtifacts,
  importCodexLegacyRunEvents,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  queryCodexSwarmCollection,
  queryCodexSwarmTournament,
  readCodexRunEvents,
  readCodexDashboardSnapshot,
  readCodexArtifactRecords,
  readCodexPidManifest,
  readCodexTournamentAdaptiveFeedback,
  renderCodexPrompt,
  repairCodexWorkspacePackageLinks,
  resumeCodexSwarmRun,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  spawnCodexExecutor,
  stopCodexSwarmRun,
  writeCodexDashboardSteeringIntent,
  writeCodexDependencyHealthReport
} from '../../dist/index.js';

export {
  appendCodexPidManifest,
  applyCodexSwarmCollection,
  buildCodexArgs,
  checkCodexDependencyHealth,
  compareCodexSwarmTournaments,
  collectCodexSwarmRun,
  createCodexResumeOverlay,
  createCodexResourceAllocation,
  createCodexSwarmPlan,
  createCodexDashboardSteeringIntent,
  createCodexSwarmTournamentHistory,
  continueCodexSwarmLoop,
  createCodexWorkspacePlan,
  createCodexCleanupPlan,
  createSwarmWorkspaceProof,
  discoverCodexHandoffArtifacts,
  importCodexLegacyRunEvents,
  fs,
  normalizeCodexApprovalPolicy,
  normalizeCodexModelFlag,
  path,
  queryCodexSwarmCollection,
  queryCodexSwarmTournament,
  readCodexRunEvents,
  readCodexDashboardSnapshot,
  readCodexArtifactRecords,
  readCodexPidManifest,
  readCodexTournamentAdaptiveFeedback,
  renderCodexPrompt,
  repairCodexWorkspacePackageLinks,
  resumeCodexSwarmRun,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  spawnCodexExecutor,
  stopCodexSwarmRun,
  writeCodexDependencyHealthReport,
  writeCodexDashboardSteeringIntent
};

export const manifestInput = {
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

export const tasksInput = {
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

export async function createSmokeContext() {
  const manifest = coerceCodexSwarmManifestInput(manifestInput);
  const tasks = coerceCodexSwarmTasksInput(tasksInput);
  const plan = createCodexSwarmPlan({ manifest, tasks });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'frontier-swarm-codex-'));
  const paths = {
    jobDir: tmp,
    promptPath: path.join(tmp, 'prompt.md'),
    eventsPath: path.join(tmp, 'events.jsonl'),
    stderrPath: path.join(tmp, 'stderr.log'),
    lastMessagePath: path.join(tmp, 'last.md'),
    evidenceDir: path.join(tmp, 'evidence'),
    resourceAllocationPath: path.join(tmp, 'resource-allocation.json'),
    contextBudgetPath: path.join(tmp, 'context-budget.json'),
    workspaceProofPath: path.join(tmp, 'workspace-proof.json'),
    patchPath: path.join(tmp, 'changes.patch'),
    mergeBundlePath: path.join(tmp, 'merge.json'),
    patchIntentPath: path.join(tmp, 'patch-intent.json'),
    logSummaryPath: path.join(tmp, 'log-summary.json'),
    pidManifestPath: path.join(tmp, 'pids.json')
  };

  const prompt = renderCodexPrompt(plan.jobs[0], { workspacePath: tmp, paths });
  assert.ok(prompt.includes('For out-of-scope or cross-stream needs, write an evidence handoff naming target lane, target files, and rationale; do not patch them.'));
  for (const token of [
    'Cross-stream handoff artifacts must live under this job evidence directory',
    'target lane',
    'target files',
    'rationale',
    'suggested verification commands',
    'expected result',
    'evidence path'
  ]) {
    assert.ok(prompt.includes(token), `missing cross-stream handoff prompt token: ${token}`);
  }

  return { manifest, tasks, plan, tmp, paths };
}

export function createBrowserPlan() {
  return createCodexSwarmPlan({
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
}

export async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function execFileP(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
  });
}
