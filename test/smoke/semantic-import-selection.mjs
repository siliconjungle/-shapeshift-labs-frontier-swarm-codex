import assert from 'node:assert';
import {
  matchesSemanticImportGlob,
  selectSemanticImportPaths
} from '../../dist/semantic-import-select.js';

export async function testSemanticImportSelection() {
  assert.equal(matchesSemanticImportGlob('src/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('src/internal/index.js', 'src/**/*.js'), true);
  assert.equal(matchesSemanticImportGlob('test/index.js', 'src/**/*.js'), false);

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

  const unsupported = selectSemanticImportPaths(['src/template.txt'], {
    enabled: true,
    maxFiles: 10,
    maxBytes: 500000,
    include: ['src/**'],
    exclude: []
  });
  assert.equal(unsupported.unsupportedLanguageCount, 1);
  assert.equal(unsupported.selected.length, 0);
}
