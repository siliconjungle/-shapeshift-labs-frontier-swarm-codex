import fs from 'node:fs/promises';
import path from 'node:path';
import {
  coerceCodexSwarmManifestInput,
  coerceCodexSwarmTasksInput,
  createCodexSwarmPlan,
  type FrontierCodexModelPolicy,
  type FrontierCodexSwarmRunOptions
} from './index.js';
import { contextBudgetArg } from './cli-context-budget.js';

export type CliValue = string | boolean | string[];
export type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export function parseArgs(argv: string[]): CliArgs {
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

export async function loadPlan(options: CliArgs) {
  const manifestPath = String(options.manifest ?? '');
  const tasksPath = String(options.tasks ?? '');
  const backlogPath = stringArg(options.backlog);
  const routingPolicyPath = stringArg(options.routingPolicy ?? options['routing-policy']);
  const routingContext = routingContextArg(options);
  if (!manifestPath) throw new Error('missing --manifest <file>');
  if (!tasksPath && !backlogPath) throw new Error('missing --tasks <file> or --backlog <file>');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const tasks = tasksPath ? JSON.parse(await fs.readFile(tasksPath, 'utf8')) : [];
  const backlog = backlogPath ? JSON.parse(await fs.readFile(backlogPath, 'utf8')) : undefined;
  const routingPolicy = routingPolicyPath ? JSON.parse(await fs.readFile(routingPolicyPath, 'utf8')) : undefined;
  return createCodexSwarmPlan({
    manifest: coerceCodexSwarmManifestInput(manifest),
    tasks: coerceCodexSwarmTasksInput(tasks),
    ...(backlog ? {
      backlog,
      backlogPlan: {
        backlogPath,
        recursive: boolArg(options.recursiveBacklog ?? options['recursive-backlog'], true),
        maxDepth: numberArg(options.maxBacklogDepth ?? options['max-backlog-depth'], undefined),
        decomposeLane: stringArg(options.decomposeLane ?? options['decompose-lane']),
        decomposeCompute: stringArg(options.decomposeCompute ?? options['decompose-compute']),
        decomposeWorkKind: stringArg(options.decomposeWorkKind ?? options['decompose-work-kind']),
        childArtifactPath: stringArg(options.childArtifactPath ?? options['child-artifact-path'])
      }
    } : {}),
    ...(routingPolicy ? { routingPolicy } : {}),
    routingMode: routingModeArg(options.routingMode ?? options['routing-mode']),
    plan: {
      limit: numberArg(options.limit, undefined),
      lanes: listArg(options.lane),
      layers: listArg(options.layer),
      selectors: listArg(options.selector),
      statuses: listArg(options.status),
      includeCompleted: boolArg(options.includeCompleted ?? options['include-completed'], false),
      compute: stringArg(options.compute),
      routingMode: routingModeArg(options.routingMode ?? options['routing-mode']),
      ...(routingContext ? { routingContext } : {})
    }
  });
}

export function shouldContinueAfterRun(args: CliArgs): boolean {
  return boolArg(args.closedLoop ?? args['closed-loop'], false)
    || stringArg(args.continueOut ?? args['continue-out'] ?? args.nextWaveOut ?? args['next-wave-out']) !== undefined;
}

export function continuationInputFromRunArgs(args: CliArgs, runDir: string) {
  return {
    cwd: stringArg(args.cwd),
    run: runDir,
    outDir: stringArg(args.continueOut ?? args['continue-out'] ?? args.nextWaveOut ?? args['next-wave-out'])
      ?? path.join(runDir, 'continuation'),
    collectionOutDir: stringArg(args.continueCollectionOut ?? args['continue-collection-out']),
    checkStale: boolArg(args.checkStale ?? args['check-stale'], true),
    semanticImportExpected: boolArg(args.semanticImportExpected ?? args['semantic-import-expected'], false),
    branchPrefix: stringArg(args.branchPrefix ?? args['branch-prefix']),
    backlogPath: stringArg(args.backlog),
    routingPolicyPath: stringArg(args.routingPolicy ?? args['routing-policy']),
    humanAnswersPath: stringArg(args.humanAnswers ?? args['human-answers'] ?? args.humanActionAnswers ?? args['human-action-answers']),
    manifestPath: stringArg(args.manifest),
    tasksPath: stringArg(args.tasks),
    routingMode: routingModeArg(args.routingMode ?? args['routing-mode']),
    childBacklogNames: listArg(args.childBacklogName ?? args['child-backlog-name'] ?? args.childBacklog ?? args['child-backlog']),
    repository: stringArg(args.repository ?? args.repo),
    package: stringArg(args.package ?? args.pkg),
    write: boolArg(args.continueWrite ?? args['continue-write'], false),
    backlogPlan: {
      backlogPath: stringArg(args.backlog),
      recursive: boolArg(args.recursiveBacklog ?? args['recursive-backlog'], true),
      maxDepth: numberArg(args.maxBacklogDepth ?? args['max-backlog-depth'], undefined),
      decomposeLane: stringArg(args.decomposeLane ?? args['decompose-lane']),
      decomposeCompute: stringArg(args.decomposeCompute ?? args['decompose-compute']),
      decomposeWorkKind: stringArg(args.decomposeWorkKind ?? args['decompose-work-kind']),
      childArtifactPath: stringArg(args.childArtifactPath ?? args['child-artifact-path'])
    },
    plan: {
      limit: numberArg(args.limit, undefined),
      lanes: listArg(args.lane),
      layers: listArg(args.layer),
      selectors: listArg(args.selector),
      statuses: listArg(args.status),
      includeCompleted: boolArg(args.includeCompleted ?? args['include-completed'], false),
      compute: stringArg(args.compute),
      routingMode: routingModeArg(args.routingMode ?? args['routing-mode']),
      routingContext: routingContextArg(args)
    }
  };
}

export function runOptionsArg(args: CliArgs, outDir: string): FrontierCodexSwarmRunOptions {
  const allowedWritePolicy = allowedWritePolicyArg(args);
  return {
    outDir,
    cwd: stringArg(args.cwd),
    codexPath: stringArg(args.codex),
    maxConcurrency: numberArg(args.maxConcurrency ?? args['max-concurrency'], 1),
    adaptiveConcurrency: adaptiveConcurrencyArg(args),
    compactLogs: compactLogsArg(args),
    contextBudget: contextBudgetArg(args),
    dependencyHealth: dependencyHealthArg(args),
    semanticImportExpected: boolArg(args.semanticImportExpected ?? args['semantic-import-expected'], false),
    adaptiveFeedbackPath: stringArg(args.adaptiveFeedback ?? args['adaptive-feedback'] ?? args.tournamentFeedback ?? args['tournament-feedback']),
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
    workspace: workspaceArg(args),
    allowedWritePolicy,
    collectGitStatus: allowedWritePolicy?.mode === 'off' ? false : undefined
  };
}

export function listArg(value: CliValue | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => String(item).trim()).filter(Boolean);
}

export function numberArg(value: CliValue | undefined, fallback: number | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function routingModeArg(value: CliValue | undefined) {
  const mode = stringArg(value);
  if (mode === undefined && value !== undefined) throw new Error('missing --routing-mode value; expected fill, override, or observe');
  if (mode === undefined) return undefined;
  if (mode === 'fill' || mode === 'override' || mode === 'observe') return mode;
  throw new Error(`unsupported --routing-mode ${mode}; expected fill, override, or observe`);
}

export function routingContextArg(args: CliArgs) {
  const repository = stringArg(args.repository ?? args.repo);
  const projectId = stringArg(args.projectId ?? args['project-id']);
  const packageName = stringArg(args.package ?? args.pkg);
  if (!repository && !projectId && !packageName) return undefined;
  return {
    ...(repository ? { repository } : {}),
    ...(projectId ? { projectId } : {}),
    ...(packageName ? { package: packageName } : {})
  };
}

export function bucketArg(value: CliValue | undefined) {
  const bucket = stringArg(value);
  if (bucket === undefined) return undefined;
  if (bucket === 'all' || bucket === 'ready-to-apply' || bucket === 'needs-human-port' || bucket === 'rerun-work' || bucket === 'failed-evidence' || bucket === 'stale-against-head') return bucket;
  throw new Error(`unsupported --bucket ${bucket}`);
}

export function commandListArg(value: CliValue | undefined) {
  if (value === undefined) return undefined;
  const raw = Array.isArray(value) ? value : [String(value)];
  return raw.map((command) => command.trim()).filter(Boolean).map((command) => ({ name: command, command: 'sh', args: ['-c', command], required: true }));
}

export function boolArg(value: CliValue | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}

export function optionalBoolArg(value: CliValue | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return boolArg(value, false);
}

export function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
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

function workspaceArg(args: CliArgs): FrontierCodexSwarmRunOptions['workspace'] {
  return {
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
  };
}

function allowedWritePolicyArg(args: CliArgs): FrontierCodexSwarmRunOptions['allowedWritePolicy'] {
  if (boolArg(args.strictAllowedWrites ?? args['strict-allowed-writes'], false)) return { mode: 'strict' };
  const rawMode = args.writeFence ?? args['write-fence'] ?? args.allowedWritePolicy ?? args['allowed-write-policy'] ?? args.writePolicy ?? args['write-policy'];
  const flag = args.writeFence !== undefined || args['write-fence'] !== undefined ? '--write-fence' : '--allowed-write-policy';
  const mode = stringArg(rawMode);
  if (mode === undefined && rawMode !== undefined) throw new Error(`missing ${flag} value; expected audit, strict, or off`);
  if (mode) {
    if (mode === 'audit' || mode === 'strict' || mode === 'off') return { mode };
    throw new Error(`unsupported ${flag} ${mode}; expected audit, strict, or off`);
  }
  const workspaceMode = readWorkspaceMode(args.workspace);
  if (workspaceMode === 'copy' || workspaceMode === 'snapshot') return { mode: 'strict' };
  return undefined;
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
