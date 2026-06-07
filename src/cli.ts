#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  applyCodexSwarmCollection,
  checkCodexDependencyHealth,
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  collectCodexSwarmRun,
  createCodexSwarmPlan,
  repairCodexWorkspacePackageLinks,
  runCodexSwarm,
  scoreCodexSwarmPatches,
  stopCodexSwarmRun,
  writeCodexDependencyHealthReport,
  type FrontierCodexModelPolicy
} from './index.js';
import { printHelp } from './cli-help.js';

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
    const result = await runCodexSwarm(plan, {
      outDir,
      codexPath: stringArg(args.codex),
      maxConcurrency: numberArg(args.maxConcurrency ?? args['max-concurrency'], 1),
      adaptiveConcurrency: adaptiveConcurrencyArg(args),
      compactLogs: compactLogsArg(args),
      dependencyHealth: dependencyHealthArg(args),
      semanticImportExpected: boolArg(args.semanticImportExpected ?? args['semantic-import-expected'], false),
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
      workspace: {
        mode: readWorkspaceMode(args.workspace),
        root: stringArg(args.worktreeRoot ?? args['worktree-root']),
        create: boolArg(args.createWorktrees ?? args['create-worktrees'], false),
        replace: optionalBoolArg(args.replaceWorkspace ?? args['replace-workspace']),
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
  } else if (command === 'doctor') {
    const outFile = stringArg(args.out ?? args.outFile ?? args['out-file']);
    const result = await checkCodexDependencyHealth({
      root: stringArg(args.root),
      packageRoot: stringArg(args.packageRoot ?? args['package-root']),
      semanticImport: boolArg(args.semanticImport ?? args['semantic-import'], false),
      outFile,
      failOnWarnings: boolArg(args.failOnWarnings ?? args['fail-on-warnings'], false)
    });
    if (outFile) await writeCodexDependencyHealthReport(result, path.resolve(outFile));
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
      semanticImportExpected: boolArg(args.semanticImportExpected ?? args['semantic-import-expected'], false),
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
  } else if (command === 'repair-links') {
    const result = await repairCodexWorkspacePackageLinks({
      root: stringArg(args.root),
      packageRoots: listArg(args.packageRoot ?? args['package-root']),
      scope: stringArg(args.scope),
      packages: listArg(args.package ?? args.pkg),
      excludePackages: listArg(args.excludePackage ?? args['exclude-package']),
      write: boolArg(args.write, false),
      replace: boolArg(args.replace, false),
      outFile: stringArg(args.out ?? args.outFile ?? args['out-file'])
    });
    console.log(JSON.stringify(result, null, 2));
    if (result.summary.conflicts > 0 || result.summary.missingLocalPackage > 0) process.exitCode = 1;
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

function adaptiveConcurrencyArg(args: CliArgs): boolean | { enabled: true; mode?: string; minConcurrency?: number; maxConcurrency?: number } {
  const enabled = boolArg(args.adaptive ?? args.adaptiveConcurrency ?? args['adaptive-concurrency'], false);
  if (!enabled) return false;
  return {
    enabled: true,
    mode: stringArg(args.adaptiveMode ?? args['adaptive-mode']),
    minConcurrency: numberArg(args.adaptiveMinConcurrency ?? args['adaptive-min-concurrency'], undefined),
    maxConcurrency: numberArg(args.adaptiveMaxConcurrency ?? args['adaptive-max-concurrency'], undefined)
  };
}

function compactLogsArg(args: CliArgs): boolean | { enabled: boolean; maxEventBytes?: number; maxStderrBytes?: number } {
  const enabled = boolArg(args.compactLogs ?? args['compact-logs'], true);
  return {
    enabled,
    maxEventBytes: numberArg(args.maxEventBytes ?? args['max-event-bytes'], undefined),
    maxStderrBytes: numberArg(args.maxStderrBytes ?? args['max-stderr-bytes'], undefined)
  };
}

function dependencyHealthArg(args: CliArgs): boolean | { semanticImport?: boolean; outFile?: string; failOnWarnings?: boolean } | undefined {
  const raw = args.dependencyHealth ?? args['dependency-health'];
  if (raw !== undefined && !boolArg(raw, true)) return false;
  return {
    semanticImport: boolArg(args.semanticImport ?? args['semantic-import'] ?? args.semanticImportExpected ?? args['semantic-import-expected'], false),
    outFile: stringArg(args.dependencyHealthOut ?? args['dependency-health-out']),
    failOnWarnings: boolArg(args.failOnWarnings ?? args['fail-on-warnings'], false)
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
  return boolArg(value, false);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}
