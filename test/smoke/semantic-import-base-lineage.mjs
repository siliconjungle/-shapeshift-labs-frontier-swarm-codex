import assert from 'node:assert';
import {
  createCodexSwarmPlan,
  fs,
  path,
  runCodexSwarm
} from './context.mjs';
import { summarizeSemanticLineageEvidence } from '../../dist/semantic-import-lineage.js';

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
  assert.deepStrictEqual(result.run.results[0].changedPaths, ['src/runtime/remove.ts']);
  assert.deepStrictEqual(result.run.results[0].ownershipViolations, []);
  const workspaceProofPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('workspace-proof.json'));
  assert.ok(workspaceProofPath);
  const workspaceProof = JSON.parse(await fs.readFile(workspaceProofPath, 'utf8'));
  assert.strictEqual(workspaceProof.ignoredChangedPathReasons.find((entry) => entry.path === 'src/runtime')?.reasonCode, 'empty_directory_marker');
  const semanticImportsPath = result.run.results[0].evidencePaths.find((entry) => entry.endsWith('semantic-imports.json'));
  assert.ok(semanticImportsPath);
  const semanticImports = JSON.parse(await fs.readFile(semanticImportsPath, 'utf8'));
  assert.strictEqual(semanticImports.records[0].reason, 'deleted-file');
  assert.strictEqual(semanticImports.records[0].baseSource.source, 'workspace-snapshot');
  assert.strictEqual(semanticImports.records[0].semanticLineage.inferredEvents, 1);
  assert.strictEqual(semanticImports.records[0].semanticLineage.deleted, 1);
  assert.strictEqual(semanticImports.records[0].semanticLineage.needsReview, 1);
  assert.strictEqual(semanticImports.records[0].semanticLineage.reviewRequired, true);
  assert.strictEqual(semanticImports.records[0].semanticLineage.readiness['needs-review'], 1);
  assert.ok(semanticImports.records[0].semanticLineage.eventKinds.includes('deleted'));
  assert.ok(semanticImports.records[0].semanticLineage.reasonCodes.includes('deleted-anchor-lineage-inferred'));
  assert.strictEqual(semanticImports.summary.semanticLineage.inferredEvents, 1);
  assert.strictEqual(semanticImports.summary.semanticLineage.deleted, 1);
  assert.strictEqual(semanticImports.summary.semanticLineage.needsReview, 1);
  assert.strictEqual(semanticImports.summary.semanticLineage.reviewRequired, true);
  assert.strictEqual(semanticImports.summary.semanticLineage.readiness['needs-review'], 1);
  assertCompactDeletedLineageIsReviewNeeded();
}

function assertCompactDeletedLineageIsReviewNeeded() {
  const compactOnly = summarizeSemanticLineageEvidence({
    metadata: {
      semanticLineageInferenceSummary: {
        beforeSymbols: 1,
        afterSymbols: 0,
        inferredEvents: 1,
        deleted: 1
      }
    }
  });
  assert.strictEqual(compactOnly.inferredEvents, 1);
  assert.strictEqual(compactOnly.deleted, 1);
  assert.strictEqual(compactOnly.needsReview, 1);
  assert.strictEqual(compactOnly.reviewRequired, true);
  assert.strictEqual(compactOnly.readiness['needs-review'], 1);
  assert.ok(compactOnly.eventKinds.includes('deleted'));
  assert.ok(compactOnly.reasonCodes.includes('deleted-anchor-lineage-inferred'));

  const nativeFallback = summarizeSemanticLineageEvidence({
    kind: 'frontier.lang.nativeSourceChangeSet',
    changedSymbols: [{ changeKind: 'removed' }]
  });
  assert.strictEqual(nativeFallback.inferredEvents, 0);
  assert.strictEqual(nativeFallback.deleted, 1);
  assert.strictEqual(nativeFallback.needsReview, 1);
  assert.strictEqual(nativeFallback.reviewRequired, true);
  assert.strictEqual(nativeFallback.readiness['needs-review'], 1);
  assert.ok(nativeFallback.eventKinds.includes('deleted'));

  const compactUnmatched = summarizeSemanticLineageEvidence({
    eventKinds: ['unmatched-added'],
    reasonCodes: ['unmatched-added-anchor-review', 'semantic-lineage-inferred'],
    needsReview: 8
  });
  assert.strictEqual(compactUnmatched.inferredEvents, 1);
  assert.strictEqual(compactUnmatched.unmatchedAdded, 1);
  assert.strictEqual(compactUnmatched.needsReview, 8);
  assert.strictEqual(compactUnmatched.reviewRequired, true);
  assert.strictEqual(compactUnmatched.readiness['needs-review'], 8);
  assert.ok(compactUnmatched.eventKinds.includes('unmatched-added'));
  assert.ok(compactUnmatched.reasonCodes.includes('unmatched-added-anchor-review'));

  const compactAmbiguous = summarizeSemanticLineageEvidence({
    summary: {
      eventKinds: ['ambiguous'],
      reasonCodes: ['ambiguous-lineage-candidates']
    }
  });
  assert.strictEqual(compactAmbiguous.inferredEvents, 1);
  assert.strictEqual(compactAmbiguous.ambiguous, 1);
  assert.strictEqual(compactAmbiguous.needsReview, 1);
  assert.strictEqual(compactAmbiguous.reviewRequired, true);
  assert.strictEqual(compactAmbiguous.readiness['needs-review'], 1);

  const inferredOnly = summarizeSemanticLineageEvidence({
    reasonCodes: ['semantic-lineage-inferred']
  });
  assert.strictEqual(inferredOnly.inferredEvents, 1);
  assert.strictEqual(inferredOnly.needsReview, 1);
  assert.strictEqual(inferredOnly.reviewRequired, true);

  const symbolLevelSignals = summarizeSemanticLineageEvidence({
    changedSymbols: [
      { changeKind: 'added', matchStatus: 'unmatched' },
      { changeKind: 'added', matchStatus: 'ambiguous', candidateCount: 2 }
    ]
  });
  assert.strictEqual(symbolLevelSignals.inferredEvents, 2);
  assert.strictEqual(symbolLevelSignals.unmatchedAdded, 1);
  assert.strictEqual(symbolLevelSignals.ambiguous, 1);
  assert.strictEqual(symbolLevelSignals.needsReview, 1);
  assert.strictEqual(symbolLevelSignals.reviewRequired, true);
}
