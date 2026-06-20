import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cleanEditScriptSemanticImportSummary } from './semantic-import-quality-fixtures.mjs';

export async function writeMerge(runDir, jobId, input) {
  const dir = path.join(runDir, jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'merge.json'), JSON.stringify({
    jobId,
    taskId: jobId,
    lane: 'collector-quality',
    status: 'completed',
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    riskLevel: 'medium',
    autoMergeable: false,
    changedPaths: [],
    changedRegions: [],
    ownedFilesTouched: [],
    allowedWrites: [],
    ownershipViolations: [],
    evidencePaths: [],
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: [jobId],
    staleAgainstHead: false,
    reasons: [],
    ...input
  }, null, 2) + '\n');
}

export async function writePatchMerge(runDir, jobId, input) {
  const dir = path.join(runDir, jobId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'changes.patch'), input.patchText);
  const semanticImport = input.semanticImport ?? (input.autoMergeable
    ? cleanAutoMergeSemanticImportSummary(input.changedPath ?? 'tracked.txt')
    : undefined);
  await writeMerge(runDir, jobId, {
    status: input.status ?? 'completed',
    disposition: input.disposition,
    autoMergeable: input.autoMergeable,
    changedPaths: [input.changedPath ?? 'tracked.txt'],
    patchPath: 'changes.patch',
    traceShards: [],
    semanticPatchBundles: [],
    ...(semanticImport ? { semanticImport, metadata: { semanticImport } } : {}),
    commandsFailed: input.commandsFailed ?? []
  });
}

function cleanAutoMergeSemanticImportSummary(file) {
  const summary = cleanEditScriptSemanticImportSummary();
  return {
    ...summary,
    lossCount: 0,
    lossesBySeverity: {},
    universalAstLayers: { total: 1, names: ['program'], ids: ['layer:program'], byName: { program: 1 }, empty: false },
    proofSpec: { total: 1, obligations: 1, discharged: 1, failed: 0, stale: 0, open: 0, unknown: 0 },
    sourceProjections: { total: 1, preserved: 1, stubs: 0, ready: 1, needsReview: 0, blocked: 0 },
    nativeCompiles: { total: 1, emitted: 1, preserved: 1, targetStubs: 0, ready: 1, needsReview: 0, blocked: 0 },
    semanticSliceAdmissions: { total: 1, admitted: 1, prioritized: 1, rejected: 0, averageScore: 1, byAction: { admit: 1 }, byRisk: { low: 1 } },
    readiness: { ready: 1 },
    semanticEditProjections: {
      ...summary.semanticEditProjections,
      total: 1,
      autoMergeCandidates: 1,
      appliedOperations: 1,
      skippedOperations: 0,
      sourcePaths: [file],
      transformSourcePaths: [file],
      transformTargetPaths: [file],
      admission: { ...summary.semanticEditProjections.admission, 'auto-merge-candidate': 1 },
      statusCounts: { projected: 1 },
      empty: false
    },
    semanticEditReplays: {
      ...summary.semanticEditReplays,
      sourcePaths: [file],
      empty: false
    }
  };
}

export function patchText(before, after) {
  return patchTextFor('tracked.txt', before, after);
}

export function patchTextFor(file, before, after) {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    `+++ b/${file}`,
    '@@ -1 +1 @@',
    `-${before}`,
    `+${after}`,
    ''
  ].join('\n');
}

export async function initPatchRepo(repo) {
  await fs.mkdir(repo, { recursive: true });
  await execFileP('git', ['init'], { cwd: repo });
  await execFileP('git', ['config', 'user.email', 'frontier@example.invalid'], { cwd: repo });
  await execFileP('git', ['config', 'user.name', 'Frontier Test'], { cwd: repo });
  await fs.writeFile(path.join(repo, 'tracked.txt'), 'base\n');
  await fs.writeFile(path.join(repo, 'tracked-commit.txt'), 'base\n');
  await execFileP('git', ['add', 'tracked.txt', 'tracked-commit.txt'], { cwd: repo });
  await execFileP('git', ['commit', '-m', 'initial'], { cwd: repo });
  return repo;
}

export function contextBudgetReport(jobId, status, warnings, errors, inputTokens) {
  return {
    kind: 'frontier.swarm-codex.context-budget',
    version: 1,
    generatedAt: 1,
    jobId,
    taskId: jobId,
    lane: 'collector-quality',
    status,
    action: status === 'failed' ? 'fail-after-run' : status === 'warning' ? 'warn' : 'allow',
    options: {
      enabled: true,
      mode: status === 'failed' ? 'fail' : 'warn'
    },
    measured: {
      promptBytes: inputTokens * 4,
      promptChars: inputTokens * 4,
      estimatedInputTokens: inputTokens,
      sourceRefCount: 0,
      targetRefCount: 0,
      allowedWriteCount: 0,
      workspaceIncludeCount: 0,
      workspaceMode: 'copy'
    },
    usage: {
      source: 'smoke',
      inputTokens,
      cachedInputTokens: Math.max(0, inputTokens - 30),
      uncachedInputTokens: Math.min(inputTokens, 30)
    },
    warnings,
    errors
  };
}

function execFileP(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
