import assert from 'node:assert';
import {
  createCodexSwarmPlan,
  fs,
  path,
  runCodexSwarm
} from './context.mjs';

export async function testSemanticImportBaseLineage({ tmp }) {
  const repo = path.join(tmp, 'semantic-base-lineage-fixture');
  await fs.mkdir(path.join(repo, 'src', 'runtime'), { recursive: true });
  await fs.writeFile(
    path.join(repo, 'src', 'runtime', 'action.ts'),
    'export function step(value: number) { return value + 1; }\n'
  );
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'semantic-base-lineage',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/runtime/**'] }]
    },
    tasks: {
      items: [{
        id: 'rename-action',
        lane: 'runtime',
        ownedFiles: ['src/runtime/action.ts'],
        sourceRefs: ['src/runtime/action.ts']
      }]
    }
  });
  const result = await runCodexSwarm(plan, {
    outDir: path.join(repo, 'run'),
    cwd: repo,
    maxConcurrency: 1,
    semanticImport: true,
    semanticImportExpected: true,
    dependencyHealth: false,
    workspace: {
      mode: 'copy',
      includes: ['src'],
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.writeFile(
        path.join(input.workspacePath, 'src', 'runtime', 'action.ts'),
        'export function advance(value: number) { return value + 1; }\n'
      );
      await fs.writeFile(input.paths.lastMessagePath, 'renamed action\n');
      return {
        exitCode: 0,
        changedPaths: ['src/runtime/action.ts'],
        lastMessage: 'renamed action'
      };
    }
  });
  assert.strictEqual(result.ok, true);
  const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.records[0].baseSource.source, 'workspace-snapshot');
  assert.strictEqual(semanticImports.records[0].headSource.source, 'coordinator-workspace');
  assert.strictEqual(semanticImports.records[0].nativeDiff.changedSymbols, 2);
  assert.strictEqual(semanticImports.records[0].semanticEditScript.admission['auto-merge-candidate'], 1);
  assert.ok(semanticImports.records[0].semanticEditScript.portable >= 1);
  assert.ok(!semanticImports.records[0].semanticEditScript.reasonCodes.includes('head-source-not-provided'));
  assert.ok(semanticImports.records[0].semanticLineage.inferredEvents >= 1);
  assert.ok(semanticImports.summary.semanticLineage.inferredEvents >= 1);
  assert.strictEqual(semanticImports.summary.semanticEditScripts.admission['auto-merge-candidate'], 1);
  assert.strictEqual(result.run.results[0].metadata.semanticImport.semanticLineage.inferredEvents >= 1, true);
  await testConflictingHeadSource(tmp);
  await testDeletedSourceLineage(tmp);
}

async function testConflictingHeadSource(tmp) {
  const repo = path.join(tmp, 'semantic-conflicting-head-fixture');
  await fs.mkdir(path.join(repo, 'src', 'runtime'), { recursive: true });
  await fs.writeFile(
    path.join(repo, 'src', 'runtime', 'action.ts'),
    'export function step(value: number) { return value + 1; }\n'
  );
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'semantic-conflicting-head',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/runtime/**'] }]
    },
    tasks: {
      items: [{
        id: 'conflict-action',
        lane: 'runtime',
        ownedFiles: ['src/runtime/action.ts'],
        sourceRefs: ['src/runtime/action.ts']
      }]
    }
  });
  const result = await runCodexSwarm(plan, {
    outDir: path.join(repo, 'run'),
    cwd: repo,
    maxConcurrency: 1,
    semanticImport: true,
    semanticImportExpected: true,
    dependencyHealth: false,
    workspace: {
      mode: 'copy',
      includes: ['src'],
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.writeFile(
        path.join(input.workspacePath, 'src', 'runtime', 'action.ts'),
        'export function step(value: number) { return value + 2; }\n'
      );
      await fs.writeFile(
        path.join(repo, 'src', 'runtime', 'action.ts'),
        'export function step(value: number) { return value + 3; }\n'
      );
      await fs.writeFile(input.paths.lastMessagePath, 'changed action with conflicting coordinator head\n');
      return {
        exitCode: 0,
        changedPaths: ['src/runtime/action.ts'],
        lastMessage: 'changed action with conflicting coordinator head'
      };
    }
  });
  assert.strictEqual(result.ok, true);
  const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.records[0].baseSource.source, 'workspace-snapshot');
  assert.strictEqual(semanticImports.records[0].headSource.source, 'coordinator-workspace');
  assert.strictEqual(semanticImports.records[0].semanticEditScript.conflicts >= 1, true);
  assert.strictEqual(semanticImports.summary.semanticEditScripts.admission.conflict, 1);
}

async function testDeletedSourceLineage(tmp) {
  const repo = path.join(tmp, 'semantic-deleted-lineage-fixture');
  await fs.mkdir(path.join(repo, 'src', 'runtime'), { recursive: true });
  await fs.writeFile(
    path.join(repo, 'src', 'runtime', 'remove.ts'),
    'export function removeMe(value: number) { return value + 1; }\n'
  );
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'semantic-deleted-lineage',
      lanes: [{ id: 'runtime', allowedGlobs: ['src/runtime/**'] }]
    },
    tasks: {
      items: [{
        id: 'delete-action',
        lane: 'runtime',
        ownedFiles: ['src/runtime/remove.ts'],
        sourceRefs: ['src/runtime/remove.ts']
      }]
    }
  });
  const result = await runCodexSwarm(plan, {
    outDir: path.join(repo, 'run'),
    cwd: repo,
    maxConcurrency: 1,
    semanticImport: true,
    semanticImportExpected: true,
    dependencyHealth: false,
    workspace: {
      mode: 'copy',
      includes: ['src'],
      linkNodeModules: false
    },
    executor: async (input) => {
      await fs.rm(path.join(input.workspacePath, 'src', 'runtime', 'remove.ts'));
      await fs.writeFile(input.paths.lastMessagePath, 'deleted action\n');
      return {
        exitCode: 0,
        changedPaths: ['src/runtime/remove.ts'],
        lastMessage: 'deleted action'
      };
    }
  });
  assert.strictEqual(result.ok, true);
  const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.records[0].reason, 'deleted-file');
  assert.strictEqual(semanticImports.records[0].baseSource.source, 'workspace-snapshot');
  assert.ok(semanticImports.records[0].semanticLineage.deleted >= 1);
  assert.ok(semanticImports.summary.semanticLineage.deleted >= 1);
}
