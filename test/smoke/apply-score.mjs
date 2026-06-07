import assert from 'node:assert';
import {
  applyCodexSwarmCollection,
  execFileP,
  fs,
  path,
  scoreCodexSwarmPatches
} from './context.mjs';

const readySemanticImport = {
  total: 1,
  selected: 1,
  eligible: 1,
  omitted: 0,
  imported: 1,
  skipped: 0,
  errors: 0,
  sourceMapCount: 1,
  sourceMapMappingCount: 1,
  lossCount: 0,
  lossesBySeverity: {},
  semanticIndex: { documents: 1, symbols: 2, occurrences: 2, relations: 1, facts: 0 },
  dependencies: { total: 1, calls: 1, uses: 0, references: 0, imports: 0, depends: 0, extends: 0, implements: 0, includes: 0, requires: 0, byPredicate: { calls: 1 }, predicates: ['calls'], ids: ['rel_action_calls_helper'], sourceSymbolIds: ['symbol:action'], targetSymbolIds: ['symbol:helper'] },
  semanticSidecars: { total: 1, symbols: 1, ownershipRegions: 1, patchHints: 1, empty: 0 },
  universalAstLayers: {
    total: 2,
    names: ['semanticSymbols', 'projectionEvidence'],
    ids: ['layer:semanticSymbols', 'layer:projectionEvidence'],
    byName: { semanticSymbols: 1, projectionEvidence: 1 },
    empty: false
  },
  proofSpec: {
    total: 2,
    ids: ['proof:apply', 'contract:apply', 'obligation:apply'],
    contracts: 1,
    refinements: 0,
    invariants: 0,
    termination: 0,
    temporal: 0,
    obligations: 1,
    artifacts: 0,
    assumptions: 0,
    evidence: 1,
    discharged: 1,
    failed: 0,
    open: 0,
    unknown: 0,
    stale: 0,
    assumed: 0,
    contractKinds: ['postcondition'],
    artifactKinds: [],
    byStatus: { discharged: 1 },
    byContractKind: { postcondition: 1 },
    byArtifactKind: {},
    empty: false
  },
  paradigmSemantics: {
    total: 3,
    ids: ['paradigm:apply', 'logic:apply', 'lower:apply'],
    groups: ['logicPrograms', 'stackEffects', 'loweringRecords'],
    kinds: ['hornClause', 'concatenativeStackEffect', 'frontierToTarget'],
    evidence: 1,
    bindingScopes: 0,
    bindings: 0,
    patterns: 0,
    typeConstraints: 0,
    evaluationModels: 0,
    memoryLocations: 0,
    effectRegions: 0,
    controlRegions: 0,
    logicPrograms: 1,
    actorSystems: 0,
    stackEffects: 1,
    arrayShapes: 0,
    numericKernels: 0,
    dataflowNetworks: 0,
    clockModels: 0,
    objectModels: 0,
    macroExpansions: 0,
    reflectionBoundaries: 0,
    loweringRecords: 1,
    byGroup: { logicPrograms: 1, stackEffects: 1, loweringRecords: 1 },
    byKind: { hornClause: 1, concatenativeStackEffect: 1, frontierToTarget: 1 },
    hasRuntimeSemantics: false,
    hasLogicSemantics: true,
    hasStackSemantics: true,
    hasArraySemantics: false,
    hasMacroOrReflection: false,
    hasLowering: true,
    empty: false
  },
  sourceProjections: { total: 1, preserved: 1, stubs: 0, ready: 1, needsReview: 0, blocked: 0 },
  nativeCompiles: { total: 1, emitted: 1, preserved: 1, targetStubs: 0, ready: 1, needsReview: 0, blocked: 0 },
  readiness: { ready: 1 }
};

export async function testApplyAndScore({ tmp }, mergeBundle) {
  const applyRepo = path.join(tmp, 'apply-repo');
  await fs.mkdir(path.join(applyRepo, 'src'), { recursive: true });
  await fs.writeFile(path.join(applyRepo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['init'], { cwd: applyRepo });
  const readyDir = path.join(tmp, 'ready-collection', 'ready-to-apply', 'apply-job');
  await fs.mkdir(readyDir, { recursive: true });
  await fs.writeFile(path.join(readyDir, 'changes.patch'), [
    'diff --git a/src/apply.ts b/src/apply.ts',
    '--- a/src/apply.ts',
    '+++ b/src/apply.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    ''
  ].join('\n'));
  await fs.writeFile(path.join(readyDir, 'merge.json'), JSON.stringify({
    ...mergeBundle,
    jobId: 'apply-job',
    taskId: 'apply-task',
    status: 'verified',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    riskLevel: 'low',
    autoMergeable: true,
    changedPaths: ['src/apply.ts'],
    changedRegions: [],
    ownedFilesTouched: ['src/apply.ts'],
    patchPath: 'changes.patch',
    commandsPassed: [],
    commandsFailed: [],
    queueItemIds: ['apply-task'],
    staleAgainstHead: false,
    semanticImport: readySemanticImport,
    metadata: { ...mergeBundle.metadata, semanticImport: readySemanticImport },
    reasons: []
  }, null, 2) + '\n');

  const applyDryRun = await applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo });
  assert.strictEqual(applyDryRun.ok, true);
  assert.strictEqual(applyDryRun.dryRun, true);
  assert.strictEqual(applyDryRun.summary.checked, 1);
  assert.strictEqual(applyDryRun.entries[0].dryRun, true);
  assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');
  await testScore(applyRepo, tmp);
  await testScoreIndexOnlyCollection(applyRepo, tmp, readyDir);
  await testMissingSemanticScore(applyRepo, tmp, readyDir);
  await assert.rejects(
    () => applyCodexSwarmCollection({ collection: path.join(tmp, 'ready-collection'), cwd: applyRepo, dryRun: false }),
    /dirty worktree/
  );
  await testCommitApply(tmp);
}

async function testScoreIndexOnlyCollection(applyRepo, tmp, readyDir) {
  const indexOnlyCollection = path.join(tmp, 'index-only-collection');
  await fs.mkdir(indexOnlyCollection, { recursive: true });
  await fs.writeFile(path.join(indexOnlyCollection, 'collection.json'), JSON.stringify({
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'apply-job',
        mergePath: path.join(readyDir, 'merge.json'),
        outputDir: readyDir
      }],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  const indexOnlyScore = await scoreCodexSwarmPatches({
    collection: indexOnlyCollection,
    cwd: applyRepo,
    workspaceIncludes: ['src']
  });
  assert.strictEqual(indexOnlyScore.summary.total, 1);
  assert.strictEqual(indexOnlyScore.summary['accepted-clean'], 1);
}

async function testScore(applyRepo, tmp) {
  const patchScore = await scoreCodexSwarmPatches({
    collection: path.join(tmp, 'ready-collection'),
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  assert.strictEqual(patchScore.ok, true);
  assert.strictEqual(patchScore.summary['accepted-clean'], 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.present, true);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.cleanEligible, true);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.sourceMapMappings, 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.dependencyRelations, 1);
  assert.deepStrictEqual(patchScore.entries[0].semanticEvidence.dependencyPredicates, ['calls']);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.universalAstLayers, 2);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.proofSpecObligations, 1);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.proofSpecFailedObligations, 0);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.paradigmSemanticsRecords, 3);
  assert.strictEqual(patchScore.entries[0].semanticEvidence.paradigmSemanticsLoweringRecords, 1);
  assert.ok(patchScore.entries[0].semanticEvidence.universalAstLayerNames.includes('semanticSymbols'));
  assert.strictEqual(await fs.readFile(path.join(applyRepo, 'src', 'apply.ts'), 'utf8'), 'old\n');

  const cliScore = await execFileP(process.execPath, [
    new URL('../../dist/cli.js', import.meta.url).pathname,
    'score',
    '--collection',
    path.join(tmp, 'ready-collection'),
    '--include',
    'src',
    '--focused-command',
    "node -e \"const fs=require('fs'); const label='a,b'; if(label !== 'a,b' || fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);\""
  ], { cwd: applyRepo });
  assert.strictEqual(JSON.parse(cliScore.stdout).ok, true);
}

async function testMissingSemanticScore(applyRepo, tmp, readyDir) {
  const missingSemanticCollection = path.join(tmp, 'missing-semantic-collection');
  const missingSemanticDir = path.join(missingSemanticCollection, 'ready-to-apply', 'missing-semantic-job');
  await fs.mkdir(missingSemanticDir, { recursive: true });
  await fs.writeFile(path.join(missingSemanticDir, 'changes.patch'), await fs.readFile(path.join(readyDir, 'changes.patch'), 'utf8'));
  const missingSemanticBundle = {
    ...JSON.parse(await fs.readFile(path.join(readyDir, 'merge.json'), 'utf8')),
    id: 'missing-semantic-bundle',
    jobId: 'missing-semantic-job',
    taskId: 'missing-semantic-task',
    queueItemIds: ['missing-semantic-task']
  };
  delete missingSemanticBundle.semanticImport;
  delete missingSemanticBundle.metadata;
  await fs.writeFile(path.join(missingSemanticDir, 'merge.json'), JSON.stringify(missingSemanticBundle, null, 2) + '\n');
  const missingSemanticScore = await scoreCodexSwarmPatches({
    collection: missingSemanticCollection,
    cwd: applyRepo,
    workspaceIncludes: ['src'],
    focusedCommands: [{ name: 'assert-new', command: 'node', args: ['-e', "const fs=require('fs'); if(fs.readFileSync('src/apply.ts','utf8')!=='new\\n') process.exit(1);"] }]
  });
  assert.strictEqual(missingSemanticScore.ok, true);
  assert.strictEqual(missingSemanticScore.summary['accepted-needs-port'], 1);
  assert.strictEqual(missingSemanticScore.entries[0].semanticEvidence.present, false);
  assert.strictEqual(missingSemanticScore.entries[0].semanticEvidence.cleanEligible, false);
  assert.strictEqual(missingSemanticScore.entries[0].score, 60);
  assert.ok(missingSemanticScore.entries[0].reasons.includes('missing semantic import sidecar'));
}

async function testCommitApply(tmp) {
  const cleanApplyRepo = path.join(tmp, 'clean-apply-repo');
  await fs.mkdir(path.join(cleanApplyRepo, 'src'), { recursive: true });
  await execFileP('git', ['init'], { cwd: cleanApplyRepo });
  await execFileP('git', ['config', 'user.email', 'frontier-swarm-codex@example.test'], { cwd: cleanApplyRepo });
  await execFileP('git', ['config', 'user.name', 'Frontier Swarm Codex'], { cwd: cleanApplyRepo });
  await fs.writeFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'old\n');
  await execFileP('git', ['add', '--', 'src/apply.ts'], { cwd: cleanApplyRepo });
  await execFileP('git', ['commit', '-m', 'Initial apply fixture'], { cwd: cleanApplyRepo });
  const committedApply = await applyCodexSwarmCollection({
    collection: path.join(tmp, 'ready-collection'),
    cwd: cleanApplyRepo,
    dryRun: false,
    branchPrefix: 'codex/tiny',
    commit: true
  });
  assert.strictEqual(committedApply.ok, true);
  assert.strictEqual(committedApply.dryRun, false);
  assert.strictEqual(committedApply.summary.committed, 1);
  assert.strictEqual(committedApply.entries[0].status, 'committed');
  assert.strictEqual(committedApply.entries[0].branchName, 'codex/tiny/apply-job');
  assert.match(committedApply.entries[0].commit, /^[0-9a-f]{40}$/);
  assert.strictEqual(await fs.readFile(path.join(cleanApplyRepo, 'src', 'apply.ts'), 'utf8'), 'new\n');
  assert.strictEqual((await execFileP('git', ['branch', '--show-current'], { cwd: cleanApplyRepo })).stdout.trim(), 'codex/tiny/apply-job');
  assert.strictEqual((await execFileP('git', ['status', '--porcelain'], { cwd: cleanApplyRepo })).stdout, '');
}
