import assert from 'node:assert';
import { fs, path, runCodexSwarm } from './context.mjs';
import {
  matchesSemanticImportGlob,
  selectSemanticImportPaths,
  semanticImportCandidatePaths,
  semanticImportPathVariants
} from '../../dist/semantic-import-select.js';

export async function testSemanticImportSelection({ plan, tmp }) {
  assert.equal(matchesSemanticImportGlob('src/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('src/internal/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('test/index.js', 'src/**/*.js'), false);
  assert.equal(matchesSemanticImportGlob('snes/packages/domain/src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('packages/domain/src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('apps/web/src/core.js', 'snes/packages/domain/src/**/*.js'), false);
  assert.equal(matchesSemanticImportGlob('src/core.ts', 'src/**/*.{js,ts}'), false);
  assert.deepEqual(semanticImportPathVariants('snes/packages/domain/src/core.js'), [
    'snes/packages/domain/src/core.js',
    'packages/domain/src/core.js',
    'domain/src/core.js',
    'src/core.js'
  ]);
  const workspaceRoot = path.join(tmp, 'absolute-copy-root');
  assert.deepEqual(semanticImportCandidatePaths({
    task: {
      sourceRefs: [],
      targetRefs: [],
      allowedWrites: []
    },
    allowedWrites: []
  }, [
    path.join(workspaceRoot, 'packages/domain/src/core.ts'),
    path.join(workspaceRoot, 'packages/domain/src/core.ts')
  ], workspaceRoot), [
    'packages/domain/src/core.ts'
  ]);

  const selection = selectSemanticImportPaths([
    'src/index.js',
    'src/internal/worker.js',
    'src/index.ts',
    'dist/index.js'
  ], {
    enabled: true,
    maxFiles: 10,
    maxBytes: 500000,
    include: ['src/**/*.js'],
    exclude: []
  });
  assert.equal(selection.eligibleCount, 2);
  assert.equal(selection.candidateCount, 4);
  assert.equal(selection.includeFilteredCount, 1);
  assert.equal(selection.ignoredCount, 1);
  assert.deepEqual(selection.selected.map((file) => file.path), [
    'src/index.js',
    'src/internal/worker.js'
  ]);

  const strippedCopySelection = selectSemanticImportPaths([
    'packages/domain/src/snes-native-core.js',
    'src/snes-native-apu.js',
    'apps/web/src/App.tsx'
  ], {
    enabled: true,
    maxFiles: 10,
    maxBytes: 500000,
    include: ['snes/packages/domain/src/**/*.js'],
    exclude: []
  });
  assert.deepEqual(strippedCopySelection.selected.map((file) => file.path), [
    'packages/domain/src/snes-native-core.js',
    'src/snes-native-apu.js'
  ]);
  assert.equal(strippedCopySelection.includeFilteredCount, 1);

  const unsupported = selectSemanticImportPaths(['src/template.txt'], {
    enabled: true,
    maxFiles: 10,
    maxBytes: 500000,
    include: ['src/**'],
    exclude: []
  });
  assert.equal(unsupported.unsupportedLanguageCount, 1);
  assert.equal(unsupported.selected.length, 0);

  const candidates = semanticImportCandidatePaths({
    task: {
      sourceRefs: ['legacy/runtime.ts', '/absolute/legacy.ts'],
      targetRefs: ['src/runtime/action.ts'],
      allowedWrites: ['src/runtime/owned.ts', 'src/runtime/*.ts', 'README']
    },
    allowedWrites: ['src/lane/concrete.js', 'src/lane/*.js']
  }, [
    'src/runtime/changed.ts',
    'src/runtime/action.ts',
    '../outside.ts'
  ]);
  assert.deepEqual(candidates, [
    'src/runtime/changed.ts',
    'src/runtime/action.ts',
    'legacy/runtime.ts',
    'src/runtime/owned.ts',
    'src/lane/concrete.js'
  ]);

  await testCopiedWorkspacePackageSubdirSemanticImport(plan, tmp);
}

async function testCopiedWorkspacePackageSubdirSemanticImport(plan, tmp) {
  const copyPlan = JSON.parse(JSON.stringify(plan));
  const job = copyPlan.jobs[0];
  job.allowedWrites = ['packages/domain/src/**'];
  job.task.sourceRefs = [];
  job.task.targetRefs = [];
  job.task.allowedWrites = ['packages/domain/src/**'];
  job.verification = [];
  const copyRun = await runCodexSwarm(copyPlan, {
    outDir: path.join(tmp, 'copy-semantic-run'),
    cwd: tmp,
    maxConcurrency: 1,
    semanticImport: {
      enabled: true,
      include: ['snes/packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts'],
      maxFiles: 1,
      maxBytes: 500000
    },
    semanticImportExpected: true,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'copy-workspaces'),
      includes: [],
      linkNodeModules: false
    },
    dryRun: false,
    prepareJobWorkspace: async (input) => {
      const runtimeDir = path.join(input.workspacePath, 'packages/domain/src/runtime');
      await fs.mkdir(runtimeDir, { recursive: true });
      await fs.writeFile(path.join(runtimeDir, 'action.ts'), 'export function action() { return 1; }\n');
      await fs.writeFile(path.join(runtimeDir, 'generated.ts'), 'export const generated = 1;\n');
      await fs.writeFile(path.join(runtimeDir, 'secondary.ts'), 'export function secondary() { return 1; }\n');
      await fs.writeFile(path.join(runtimeDir, 'action.test.ts'), 'export const testValue = 1;\n');
    },
    executor: async (input) => {
      const runtimeDir = path.join(input.workspacePath, 'packages/domain/src/runtime');
      await fs.writeFile(path.join(runtimeDir, 'action.ts'), "import './generated.ts';\nexport function helper() { return 2; }\nexport function action() { return helper(); }\n");
      await fs.writeFile(path.join(runtimeDir, 'secondary.ts'), 'export function secondary() { return 2; }\n');
      await fs.writeFile(path.join(runtimeDir, 'action.test.ts'), 'export const testValue = 2;\n');
      await fs.writeFile(input.paths.lastMessagePath, 'copy semantic import done\n');
      return { exitCode: 0, lastMessage: 'copy semantic import done' };
    }
  });
  assert.strictEqual(copyRun.ok, true);
  const result = copyRun.run.results[0];
  assert.deepStrictEqual(result.changedPaths, [
    'packages/domain/src/runtime/action.test.ts',
    'packages/domain/src/runtime/action.ts',
    'packages/domain/src/runtime/secondary.ts'
  ]);
  const semanticImportsPath = result.evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.summary.selection.candidates, 3);
  assert.strictEqual(semanticImports.summary.selection.excludeFiltered, 1);
  assert.strictEqual(semanticImports.summary.eligible, 2);
  assert.strictEqual(semanticImports.summary.selected, 1);
  assert.strictEqual(semanticImports.summary.omitted, 1);
  assert.strictEqual(semanticImports.summary.imported, 1);
  assert.strictEqual(semanticImports.records[0].path, 'packages/domain/src/runtime/action.ts');
  assert.strictEqual(semanticImports.records[0].language, 'typescript');
  assert.ok(Array.isArray(semanticImports.records[0].dependencyEdges));
  assert.ok(semanticImports.records[0].dependencyEdges.includes('import:./generated.ts'));
  assert.ok(Array.isArray(semanticImports.summary.dependencyEdges));
  assert.ok(semanticImports.summary.dependencyEdges.includes('import:./generated.ts'));
  await testCopiedWorkspaceEmptyChangedPathsFallback(copyPlan, tmp);
}

async function testCopiedWorkspaceEmptyChangedPathsFallback(plan, tmp) {
  const fallbackPlan = JSON.parse(JSON.stringify(plan));
  const job = fallbackPlan.jobs[0];
  job.allowedWrites = ['packages/domain/src/**'];
  job.task.sourceRefs = [];
  job.task.targetRefs = [];
  job.task.allowedWrites = ['packages/domain/src/**'];
  job.verification = [];
  const fallbackRun = await runCodexSwarm(fallbackPlan, {
    outDir: path.join(tmp, 'copy-semantic-fallback-run'),
    cwd: tmp,
    maxConcurrency: 1,
    semanticImport: {
      enabled: true,
      include: ['snes/packages/domain/src/**/*.ts'],
      maxFiles: 1,
      maxBytes: 500000
    },
    semanticImportExpected: true,
    workspace: {
      mode: 'copy',
      root: path.join(tmp, 'copy-fallback-workspaces'),
      includes: [],
      linkNodeModules: false
    },
    dryRun: false,
    prepareJobWorkspace: async (input) => {
      const runtimeDir = path.join(input.workspacePath, 'packages/domain/src/runtime');
      await fs.mkdir(runtimeDir, { recursive: true });
      await fs.writeFile(path.join(runtimeDir, 'fallback.ts'), 'export function fallback() { return 1; }\n');
    },
    executor: async (input) => {
      await fs.writeFile(input.paths.lastMessagePath, 'copy semantic fallback done\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'copy semantic fallback done' };
    }
  });
  assert.strictEqual(fallbackRun.ok, true);
  const result = fallbackRun.run.results[0];
  assert.deepStrictEqual(result.changedPaths, []);
  const semanticImportsPath = result.evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.summary.selection.fallback, 1);
  assert.strictEqual(semanticImports.summary.selection.fallbackReason, 'expected-semantic-import-empty-selection');
  assert.strictEqual(semanticImports.summary.selected, 1);
  assert.strictEqual(semanticImports.summary.imported, 1);
  assert.strictEqual(semanticImports.summary.semanticImportExpectedSatisfied, true);
  assert.strictEqual(semanticImports.records[0].path, 'packages/domain/src/runtime/fallback.ts');
}
