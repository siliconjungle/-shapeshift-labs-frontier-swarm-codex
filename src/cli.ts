#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyCodexSwarmCollection,
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
  if (command === 'plan') {
    const plan = await loadPlan(args);
    const outDir = path.resolve(String(args.outDir ?? args.out ?? `agent-runs/frontier-swarm-codex/${stamp()}`));
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
    console.log(JSON.stringify({ ok: plan.validation.valid, outDir, plan }, null, 2));
  } else if (command === 'run') {
    const plan = args.plan ? JSON.parse(await fs.readFile(String(args.plan), 'utf8')) : await loadPlan(args);
    const outDir = path.resolve(String(args.outDir ?? args.out ?? `agent-runs/frontier-swarm-codex/${stamp()}`));
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

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
