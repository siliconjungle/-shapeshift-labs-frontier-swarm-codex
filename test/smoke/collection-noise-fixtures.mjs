import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

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
  await writeMerge(runDir, jobId, {
    status: input.status ?? 'completed',
    disposition: input.disposition,
    autoMergeable: input.autoMergeable,
    changedPaths: [input.changedPath ?? 'tracked.txt'],
    patchPath: 'changes.patch',
    traceShards: [],
    semanticPatchBundles: [],
    commandsFailed: input.commandsFailed ?? []
  });
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
