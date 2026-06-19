#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { applyCodexSwarmCollection, checkCodexDependencyHealth, collectCodexSwarmRun, continueCodexSwarmLoop, repairCodexWorkspacePackageLinks, resumeCodexSwarmRun, runCodexSwarm, scoreCodexSwarmPatches, stopCodexSwarmRun, writeCodexDependencyHealthReport } from './index.js';
import { printHelp } from './cli-help.js';
import { handleCodexTournamentCommand } from './tournament-query.js';
import { handleCodexQueryCommand } from './query.js';
import { handleCodexCleanupCommand } from './cleanup.js';
import { collectResultForCli } from './cli-output.js';
import {
  boolArg,
  bucketArg,
  commandListArg,
  continuationInputFromRunArgs,
  listArg,
  loadPlan,
  numberArg,
  optionalBoolArg,
  parseArgs,
  routingContextArg,
  routingModeArg,
  runOptionsArg,
  shouldContinueAfterRun,
  stamp,
  stringArg
} from './cli-args.js';
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
    const result = await runCodexSwarm(plan, runOptionsArg(args, outDir));
    const continuation = shouldContinueAfterRun(args)
      ? await continueCodexSwarmLoop(continuationInputFromRunArgs(args, outDir))
      : undefined;
    console.log(JSON.stringify(continuation ? { ...result, continuation } : result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'resume') {
    const run = String(args.run ?? '');
    if (!run) throw new Error('resume requires --run <prior-run-dir|swarm-results.json>');
    const outDir = path.resolve(String(args.outDir ?? args.out ?? `agent-runs/frontier-swarm-codex/${stamp()}-resume`));
    const result = await resumeCodexSwarmRun({
      ...runOptionsArg(args, outDir),
      run,
      includeCompleted: boolArg(args.includeCompleted ?? args['include-completed'], false),
      includeFailed: optionalBoolArg(args.includeFailed ?? args['include-failed']),
      includeBlocked: optionalBoolArg(args.includeBlocked ?? args['include-blocked']),
      outFile: stringArg(args.resumeOverlay ?? args['resume-overlay'])
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
      cwd: stringArg(args.cwd),
      checkStale: boolArg(args.checkStale ?? args['check-stale'], true),
      semanticImportExpected: boolArg(args.semanticImportExpected ?? args['semantic-import-expected'], false),
      branchPrefix: stringArg(args.branchPrefix ?? args['branch-prefix'])
    });
    console.log(JSON.stringify(collectResultForCli(result, boolArg(args.full, false)), null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'continue' || command === 'next-wave') {
    const run = stringArg(args.run);
    const collection = stringArg(args.collection);
    if (!run && !collection) throw new Error(`${command} requires --run <run-dir|swarm-results.json> or --collection <collection-dir|collection.json>`);
    const result = await continueCodexSwarmLoop({
      run,
      collection,
      outDir: stringArg(args.outDir ?? args.out),
      collectionOutDir: stringArg(args.collectionOutDir ?? args['collection-out-dir']),
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
      cwd: stringArg(args.cwd),
      write: boolArg(args.write, false),
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
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'apply') {
    const result = await applyCodexSwarmCollection({
      collection: stringArg(args.collection),
      run: stringArg(args.run),
      cwd: stringArg(args.cwd),
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
      cwd: stringArg(args.cwd),
      bucket: bucketArg(args.bucket),
      jobIds: listArg(args.job ?? args.jobId ?? args['job-id']),
      workspaceIncludes: listArg(args.workspaceInclude ?? args['workspace-include'] ?? args.include),
      workspaceExcludes: listArg(args.workspaceExclude ?? args['workspace-exclude'] ?? args.exclude),
      focusedCommands: commandListArg(args.focusedCommand ?? args['focused-command']),
      globalCommands: commandListArg(args.globalCommand ?? args['global-command']),
      globalGlobs: listArg(args.globalGlob ?? args['global-glob']),
      limit: numberArg(args.limit, undefined),
      keepWorkspaces: boolArg(args.keepWorkspaces ?? args['keep-workspaces'], false)
    });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'tournament') {
    await handleCodexTournamentCommand(args);
  } else if (command === 'query') {
    await handleCodexQueryCommand(args);
  } else if (command === 'cleanup') {
    await handleCodexCleanupCommand(args);
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
