import assert from 'node:assert';
import {
  matchesSemanticImportGlob,
  selectSemanticImportPaths,
  semanticImportCandidatePaths
} from '../../dist/semantic-import-select.js';

export async function testSemanticImportSelection() {
  assert.equal(matchesSemanticImportGlob('src/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('src/internal/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('test/index.js', 'src/**/*.js'), false);
  assert.equal(matchesSemanticImportGlob('snes/packages/domain/src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('packages/domain/src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('src/core.js', 'snes/packages/domain/src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('apps/web/src/core.js', 'snes/packages/domain/src/**/*.js'), false);
  assert.equal(matchesSemanticImportGlob('src/core.ts', 'src/**/*.{js,ts}'), false);

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
}
