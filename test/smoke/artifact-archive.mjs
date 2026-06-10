import assert from 'node:assert';
import {
  createCodexCleanupPlan,
  exists,
  fs,
  path,
  queryCodexSwarmCollection,
  readCodexArtifactRecords
} from './context.mjs';

export async function testArtifactArchiveCompaction({ tmp }, collectionDir) {
  const records = await readCodexArtifactRecords(collectionDir);
  const runSide = records.find((record) =>
    record.kind === 'semantic-imports' &&
    record.path.includes(`${path.sep}run${path.sep}`) &&
    !record.path.includes(`${path.sep}artifact-store${path.sep}`)
  );
  assert.ok(runSide, 'expected a run-side semantic imports artifact');
  assert.strictEqual(runSide.runDir, path.join(tmp, 'run'));
  assert.strictEqual(runSide.collectionDir, collectionDir);
  assert.ok(await exists(runSide.path));
  assert.ok(await exists(runSide.blobPath));

  await fs.rm(path.join(collectionDir, 'artifact-store', 'artifacts.jsonl'));
  const sqliteQuery = await queryCodexSwarmCollection({
    collection: collectionDir,
    kind: 'semantic-imports',
    semantic: true
  });
  assert.ok(sqliteQuery.artifacts.some((record) =>
    record.kind === 'semantic-imports' &&
    record.runDir === path.join(tmp, 'run') &&
    record.collectionDir === collectionDir
  ));

  const dryRun = await createCodexCleanupPlan({
    run: path.join(tmp, 'run'),
    collection: collectionDir,
    keepActive: false,
    pruneArtifacts: true
  });
  assert.ok(dryRun.summary.artifactSourceCount >= 1);
  assert.ok(await exists(runSide.path));

  const cleanup = await createCodexCleanupPlan({
    run: path.join(tmp, 'run'),
    collection: collectionDir,
    keepActive: false,
    pruneArtifacts: true,
    dryRun: false
  });
  assert.ok(cleanup.summary.deletedCount >= 1);
  assert.strictEqual(await exists(runSide.path), false);
  assert.ok(await exists(runSide.blobPath));
}
