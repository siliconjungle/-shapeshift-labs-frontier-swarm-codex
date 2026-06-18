#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyCodexSwarmCollection,
  autonomousApplyCodexSwarmRun,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  collectCodexSwarmRun,
  createCodexSwarmPlan,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  stopCodexSwarmRun,
  type FrontierCodexModelPolicy
} from './index.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? 'plan';

try {
  if (command === 'help' || args.help === true || args.h === true) {
    printHelp();
  } else if (command === 'plan') {
    const plan = await loadPlan(args);
    const outDir = path.resolve(String(args.outDir ?? args.out ?? `agent-runs/frontier-swarm-codex/${stamp()}`));
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
    console.log(JSON.stringify({ ok: plan.validation.valid, outDir, plan }, null, 2));
  } else if (command === 'run') {
    const plan = args.plan ? JSON.parse(await fs.readFile(String(args.plan), 'utf8')) : await loadPlan(args);
    const outDir = path.resolve(String(args.outDir ?? args.out ?? `agent-runs/frontier-swarm-codex/${stamp()}`));
    const disableAutoDrainPatchCandidatePromotion = boolArg(
      args.noAutoDrainPromotePatchCandidates ?? args['no-auto-drain-promote-patch-candidates'],
      false
    );
    const result = await runCodexSwarm(plan, {
      outDir,
      codexPath: stringArg(args.codex),
      maxConcurrency: numberArg(args.maxConcurrency ?? args['max-concurrency'], 1),
      sandbox: stringArg(args.sandbox),
      approval: stringArg(args.approval ?? args['ask-for-approval'] ?? args['approval-policy']),
      model: stringArg(args.model),
      modelPolicy: modelPolicyArg(args.modelPolicy ?? args['model-policy']),
      forwardPlanModel: boolArg(args.forwardPlanModel ?? args['forward-plan-model'], false),
      forwardPlanReasoningEffort: boolArg(args.forwardPlanReasoningEffort ?? args['forward-plan-reasoning-effort'], false),
      reasoningEffort: stringArg(args.reasoningEffort ?? args['reasoning-effort']),
      profile: stringArg(args.profile),
      dryRun: boolArg(args.dryRun ?? args['dry-run'], false),
      runVerification: boolArg(args.verify, false),
      semanticImport: semanticImportArg(args),
      autoDrain: boolArg(args.noAutoDrain ?? args['no-auto-drain'], false) ? false : {
        outDir: stringArg(args.autoDrainOutDir ?? args['auto-drain-out-dir']),
        dryRun: boolArg(args.autoDrainDryRun ?? args['auto-drain-dry-run'], false),
        allowDirty: boolArg(args.autoDrainAllowDirty ?? args['auto-drain-allow-dirty'], false),
        commit: boolArg(args.autoDrainCommit ?? args['auto-drain-commit'], false),
        branchPrefix: stringArg(args.autoDrainBranchPrefix ?? args['auto-drain-branch-prefix'] ?? args.branchPrefix ?? args['branch-prefix']),
        limit: numberArg(args.autoDrainLimit ?? args['auto-drain-limit'], undefined),
        maxIterations: numberArg(args.autoDrainMaxIterations ?? args['auto-drain-max-iterations'], undefined),
        maxReady: numberArg(args.autoDrainMaxReady ?? args['auto-drain-max-ready'], undefined),
        maxChangedPaths: numberArg(args.autoDrainMaxChangedPaths ?? args['auto-drain-max-changed-paths'], undefined),
        maxChangedRegions: numberArg(args.autoDrainMaxChangedRegions ?? args['auto-drain-max-changed-regions'], undefined),
        maxHighRisk: numberArg(args.autoDrainMaxHighRisk ?? args['auto-drain-max-high-risk'], undefined),
        allowRisks: listArg(args.autoDrainAllowRisk ?? args['auto-drain-allow-risk']),
        promotePatchCandidates: disableAutoDrainPatchCandidatePromotion ? false : optionalBoolArg(args.autoDrainPromotePatchCandidates ?? args['auto-drain-promote-patch-candidates']),
        checkStale: boolArg(args.autoDrainCheckStale ?? args['auto-drain-check-stale'], true),
        focusedCommands: commandListArg(args.focusedCommand ?? args['focused-command']),
        globalCommands: commandListArg(args.globalCommand ?? args['global-command']),
        globalGlobs: listArg(args.globalGlob ?? args['global-glob']),
        decisionLogPath: stringArg(args.autoDrainDecisionLog ?? args['auto-drain-decision-log'] ?? args.decisionLog ?? args['decision-log']),
        lockPath: stringArg(args.autoDrainLockPath ?? args['auto-drain-lock-path'] ?? args.lockPath ?? args['lock-path']),
        lockTimeoutMs: numberArg(args.autoDrainLockTimeoutMs ?? args['auto-drain-lock-timeout-ms'] ?? args.lockTimeoutMs ?? args['lock-timeout-ms'], undefined),
        lockStaleMs: numberArg(args.autoDrainLockStaleMs ?? args['auto-drain-lock-stale-ms'] ?? args.lockStaleMs ?? args['lock-stale-ms'], undefined)
      },
      workspace: {
        mode: readWorkspaceMode(args.workspace),
        root: stringArg(args.worktreeRoot ?? args['worktree-root']),
        create: boolArg(args.createWorktrees ?? args['create-worktrees'], false),
        replace: boolArg(args.replaceWorkspace ?? args['replace-workspace'], false),
        includes: listArg(args.include),
        excludes: listArg(args.exclude),
        artifactIncludes: listArg(args.artifact ?? args['artifact-include']),
        linkPaths: listArg(args.link ?? args['link-path']),
        linkNodeModules: boolArg(args.linkNodeModules ?? args['link-node-modules'], true),
        skipGitRepoCheck: boolArg(args.skipGitRepoCheck ?? args['skip-git-repo-check'], readWorkspaceMode(args.workspace) !== 'git-worktree')
      }
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'verify') {
    const runFile = String(args.run ?? args.results ?? '');
    if (!runFile) throw new Error('verify requires --run <swarm-results.json>');
    const result = JSON.parse(await fs.readFile(runFile, 'utf8'));
    const ok = Boolean(result.ok);
    console.log(JSON.stringify({ ok, proof: result.proof ?? null }, null, 2));
    if (!ok) process.exitCode = 1;
  } else if (command === 'stop') {
    const run = String(args.run ?? args.pidManifest ?? args['pid-manifest'] ?? '');
    if (!run) throw new Error('stop requires --run <run-dir|swarm-results.json|pids.json>');
    const signal = String(args.signal ?? 'SIGTERM') as NodeJS.Signals;
    const result = await stopCodexSwarmRun({ run, signal });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'collect') {
    const run = String(args.run ?? '');
    if (!run) throw new Error('collect requires --run <run-dir|swarm-results.json>');
    const result = await collectCodexSwarmRun({
      run,
      outDir: stringArg(args.outDir ?? args.out),
      checkStale: boolArg(args.checkStale ?? args['check-stale'], true),
      branchPrefix: stringArg(args.branchPrefix ?? args['branch-prefix'])
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'apply') {
    const result = await applyCodexSwarmCollection({
      collection: stringArg(args.collection),
      run: stringArg(args.run),
      outDir: stringArg(args.outDir ?? args.out),
      bucket: bucketArg(args.bucket),
      jobIds: listArg(args.job ?? args.jobId ?? args['job-id']),
      dryRun: boolArg(args.dryRun ?? args['dry-run'], true),
      allowDirty: boolArg(args.allowDirty ?? args['allow-dirty'], false),
      commit: boolArg(args.commit, false),
      branchPrefix: stringArg(args.branchPrefix ?? args['branch-prefix']),
      limit: numberArg(args.limit, undefined)
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'autonomous-apply' || command === 'drain') {
    const result = await autonomousApplyCodexSwarmRun({
      collection: stringArg(args.collection),
      run: stringArg(args.run),
      outDir: stringArg(args.outDir ?? args.out),
      jobIds: listArg(args.job ?? args.jobId ?? args['job-id']),
      dryRun: boolArg(args.dryRun ?? args['dry-run'], false),
      allowDirty: boolArg(args.allowDirty ?? args['allow-dirty'], false),
      commit: boolArg(args.commit, false),
      branchPrefix: stringArg(args.branchPrefix ?? args['branch-prefix']),
      limit: numberArg(args.limit, undefined),
      checkStale: boolArg(args.checkStale ?? args['check-stale'], true),
      focusedCommands: commandListArg(args.focusedCommand ?? args['focused-command']),
      globalCommands: commandListArg(args.globalCommand ?? args['global-command']),
      globalGlobs: listArg(args.globalGlob ?? args['global-glob']),
      decisionLogPath: stringArg(args.decisionLog ?? args['decision-log']),
      lockPath: stringArg(args.lockPath ?? args['lock-path']),
      lockTimeoutMs: numberArg(args.lockTimeoutMs ?? args['lock-timeout-ms'], undefined),
      lockStaleMs: numberArg(args.lockStaleMs ?? args['lock-stale-ms'], undefined)
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'score') {
    const result = await scoreCodexSwarmPatches({
      collection: stringArg(args.collection),
      run: stringArg(args.run),
      outDir: stringArg(args.outDir ?? args.out),
      bucket: bucketArg(args.bucket),
      jobIds: listArg(args.job ?? args.jobId ?? args['job-id']),
      workspaceIncludes: listArg(args.include),
      workspaceExcludes: listArg(args.exclude),
      focusedCommands: commandListArg(args.focusedCommand ?? args['focused-command']),
      globalCommands: commandListArg(args.globalCommand ?? args['global-command']),
      globalGlobs: listArg(args.globalGlob ?? args['global-glob']),
      limit: numberArg(args.limit, undefined),
      keepWorkspaces: boolArg(args.keepWorkspaces ?? args['keep-workspaces'], false)
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else {
    throw new Error(`unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function printHelp() {
  console.log([
    'frontier-swarm <command> [options]',
    '',
    'Commands:',
    '  plan      Build a swarm plan from --manifest and --tasks',
    '  run       Run workers, then produce/drain coordinator-agent work by default',
    '  stop      Stop a run using pids.json',
    '  collect   Collect merge bundles into ready/needs-port/failed/stale buckets',
    '  score     Score collected patches in throwaway workspaces',
    '  apply     Dry-run or apply collected patch bundles',
    '  autonomous-apply',
    '            Drain admitted coordinator-agent work under repo locks and gates',
    '  drain     Alias for autonomous-apply',
    '  verify    Verify a swarm-results.json proof',
    '',
    'Useful options:',
    '  --model-policy config-default|plan|explicit',
    '  --approval never|on-request|on-failure|untrusted',
    '  --workspace current|copy|snapshot|git-worktree',
    '  --include <path> --exclude <path> --link <path>',
    '  --semantic-import --semantic-import-include <glob> --semantic-import-exclude <glob>',
    '  --semantic-import-max-files <n> --semantic-import-max-bytes <n>',
    '  --no-auto-drain (raw worker diagnostics only; skips coordinator drain-work)',
    '  --auto-drain-out-dir <path> --auto-drain-allow-dirty --auto-drain-check-stale',
    '  --auto-drain-branch-prefix <prefix>',
    '  --auto-drain-dry-run',
    '  --auto-drain-commit (create audited coordinator commits tied to queue item ids and the decision ledger)',
    '  --auto-drain-limit <n> --auto-drain-max-iterations <n>',
    '  --auto-drain-max-ready <n> --auto-drain-max-changed-paths <n>',
    '  --auto-drain-max-changed-regions <n> --auto-drain-max-high-risk <n>',
    '  --auto-drain-allow-risk <risk>',
    '  --auto-drain-promote-patch-candidates[=true|false]',
    '  --no-auto-drain-promote-patch-candidates',
    '  --auto-drain-decision-log <path> --auto-drain-lock-path <path>',
    '  --auto-drain-lock-timeout-ms <n> --auto-drain-lock-stale-ms <n>',
    '  --focused-command <cmd> --global-command <cmd>',
    '',
    'Default run auto-drain is autonomous coordinator drain work. It collects',
    'worker merge bundles into hierarchical queues and writes the generic',
    'frontier.swarm.coordinator-agent-drain-work contract plus the Codex',
    'selected/deferred drain artifact. The coordinator then acquires queue',
    'leases and repo locks, applies only admitted ready work, and records',
    'terminal coordinator decisions.',
    '',
    'Terminal coordinator decisions such as applied, committed, checked,',
    'rejected, rerun, skipped, and conflict-blocked are queue outcomes, not',
    'human blockers. True blockers require an explicit human/authority question',
    'with an owner. Use --no-auto-drain only for raw worker diagnostics.',
    '',
    'Workers write last-message.md, codex-events.jsonl, resource-allocation.json,',
    'merge.json, changes.patch, and discovered debug/replay/watchpoint/trace artifacts.'
  ].join('\n'));
}

async function loadPlan(options: CliArgs) {
  const manifestPath = String(options.manifest ?? '');
  const tasksPath = String(options.tasks ?? '');
  if (!manifestPath) throw new Error('missing --manifest <file>');
  if (!tasksPath) throw new Error('missing --tasks <file>');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const tasks = JSON.parse(await fs.readFile(tasksPath, 'utf8'));
  return createCodexSwarmPlan({
    manifest: coerceCodexSwarmManifestInput(manifest),
    tasks: coerceCodexSwarmTasksInput(tasks),
    plan: {
      limit: numberArg(options.limit, undefined),
      lanes: listArg(options.lane),
      layers: listArg(options.layer),
      selectors: listArg(options.selector),
      statuses: listArg(options.status),
      includeCompleted: boolArg(options.includeCompleted ?? options['include-completed'], false),
      compute: stringArg(options.compute)
    }
  });
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const body = token.slice(2);
    const equals = body.indexOf('=');
    const key = equals >= 0 ? body.slice(0, equals) : body;
    const value: string | boolean = equals >= 0 ? body.slice(equals + 1) : argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] as string : true;
    if (out[key] === undefined) out[key] = value;
    else if (Array.isArray(out[key])) (out[key] as string[]).push(String(value));
    else out[key] = [String(out[key]), String(value)];
  }
  return out;
}

function listArg(value: CliValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

function numberArg(value: CliValue | undefined, fallback: number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function modelPolicyArg(value: CliValue | undefined): FrontierCodexModelPolicy | undefined {
  const policy = stringArg(value);
  if (policy === undefined) return undefined;
  if (policy === 'config-default' || policy === 'plan' || policy === 'explicit') return policy;
  throw new Error(`unsupported --model-policy ${policy}; expected config-default, plan, or explicit`);
}

function readWorkspaceMode(value: CliValue | undefined) {
  const mode = stringArg(value);
  if (mode === 'snapshot' || mode === 'copy' || mode === 'git-worktree') return mode;
  return 'current';
}

function bucketArg(value: CliValue | undefined) {
  const bucket = stringArg(value);
  if (bucket === undefined) return undefined;
  if (bucket === 'all' || bucket === 'ready-to-apply' || bucket === 'needs-human-port' || bucket === 'failed-evidence' || bucket === 'stale-against-head') return bucket;
  throw new Error(`unsupported --bucket ${bucket}`);
}

function semanticImportArg(args: CliArgs): boolean | { enabled: true; maxFiles?: number; maxBytes?: number; include?: string[]; exclude?: string[] } {
  const enabled = boolArg(args.semanticImport ?? args['semantic-import'], false);
  if (!enabled) return false;
  return {
    enabled: true,
    maxFiles: numberArg(args.semanticImportMaxFiles ?? args['semantic-import-max-files'], undefined),
    maxBytes: numberArg(args.semanticImportMaxBytes ?? args['semantic-import-max-bytes'], undefined),
    include: listArg(args.semanticImportInclude ?? args['semantic-import-include']),
    exclude: listArg(args.semanticImportExclude ?? args['semantic-import-exclude'])
  };
}

function commandListArg(value: CliValue | undefined) {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [String(value)];
  return raw.map((command) => command.trim()).filter(Boolean).map((command) => ({ name: command, command: 'sh', args: ['-c', command], required: true }));
}

function boolArg(value: CliValue | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function optionalBoolArg(value: CliValue | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return boolArg(value, true);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
