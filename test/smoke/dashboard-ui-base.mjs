import assert from 'node:assert';
import { fs, path, readCodexDashboardSnapshot } from './context.mjs';

export async function runDashboardBaseSmoke(context, collectionDir, continuation) {
  const { tmp } = context;
  const dashboardSource = await fs.readFile(path.resolve('src/dashboard-ui.ts'), 'utf8');
  const dashboardTypes = await fs.readFile(path.resolve('src/types-dashboard.ts'), 'utf8');
  assert.ok(dashboardSource.includes('createDashboardQualityMetrics'));
  assert.ok(dashboardSource.includes('createDashboardTimeSeries'));
  assert.ok(dashboardTypes.includes('FrontierCodexDashboardQualityMetrics'));
  assert.ok(dashboardTypes.includes('FrontierCodexDashboardHealthMetrics'));
  assert.ok(dashboardTypes.includes('FrontierCodexDashboardTimeSeries'));

  const snapshot = await readCodexDashboardSnapshot({
    collection: collectionDir,
    continuation: path.dirname(continuation.summary.paths.nextPlanPath)
  });
  assert.strictEqual(snapshot.kind, 'frontier.swarm-codex.dashboard-snapshot');
  assert.strictEqual(snapshot.ok, true);
  assert.strictEqual(snapshot.sources.collectionDir, collectionDir);
  assert.strictEqual(snapshot.summary.bucketCounts.total, 1);
  assert.strictEqual(snapshot.summary.childBacklogEntryCount, 1);
  assert.strictEqual(typeof snapshot.summary.routingPreferenceCount, 'number');
  assert.ok(snapshot.jobs.some((job) => job.id === 'runtime-runtime-action'));
  assert.ok(snapshot.lanes.some((lane) => lane.id === 'runtime'));
  assert.ok(snapshot.routing.policyId);
  assert.strictEqual(snapshot.backlog.entryCount, 2);

  const semanticCollectionDir = path.join(tmp, 'semantic-collection');
  await fs.mkdir(semanticCollectionDir, { recursive: true });
  await fs.writeFile(path.join(semanticCollectionDir, 'collection.json'), JSON.stringify({
    ok: true,
    summary: {
      total: 1,
      semanticImportExpectedCount: 1,
      semanticImportExpectedSatisfiedCount: 1,
      semanticImportExpectedUnsatisfiedCount: 0,
      semanticImportCandidateCount: 4,
      semanticImportSelectedCount: 3,
      semanticImportEligibleCount: 2,
      semanticImportImportedCount: 2,
      semanticImportWarningCount: 1,
      semanticImportWarnings: ['weak-symbol'],
      semanticImportFactCount: 5,
      semanticImportFactPredicates: ['owns-symbol'],
      semanticLineageEvents: 7,
      semanticLineageMoved: 2,
      semanticLineageRenamed: 1,
      semanticLineageDeleted: 0,
      semanticLineageBlocked: 1,
      semanticEditScriptAutoMergeCandidates: 2,
      semanticEditScriptConflicts: 1,
      semanticEditScriptStale: 0,
      semanticEditScriptNeedsPort: 1,
      semanticEditScriptPortable: 3,
      semanticEditProjectionProjected: 2,
      semanticEditProjectionBlocked: 1,
      semanticEditProjectionEdits: 8,
      semanticEditProjectionAppliedEdits: 6,
      semanticEditProjectionAlreadyAppliedEdits: 1,
      semanticEditProjectionDeletedBytes: 12,
      semanticEditProjectionReplacementBytes: 18,
      semanticEditProjectionMatchesWorker: 2,
      semanticEditProjectionMismatchesWorker: 1,
      semanticEditProjectionMatchUnknown: 3,
      semanticEditReplayAcceptedClean: 2,
      semanticEditReplayAlreadyApplied: 1,
      semanticEditReplayConflicts: 1,
      semanticEditReplayStale: 0,
      semanticEditReplayBlocked: 1,
      semanticEditReplayNeedsPort: 2,
      semanticEditReplays: { total: 9 },
      semanticEditAdmission: {
        statusCounts: { 'auto-merge-candidate': 2, blocked: 1 },
        statuses: ['auto-merge-candidate', 'blocked'],
        autoMergeCandidateCount: 2,
        cleanEligibleCount: 1
      },
      semanticEditScriptAdmission: {
        statusCounts: { portable: 3 },
        statuses: ['portable'],
        autoMergeCandidateCount: 2,
        portableCount: 3,
        cleanEligibleCandidateCount: 2
      },
      semanticImportExpectedMissingReasonCodes: ['missing-facts']
    },
    buckets: {}
  }, null, 2) + '\n');
  const semanticSnapshot = await readCodexDashboardSnapshot({ collection: semanticCollectionDir });
  assert.strictEqual(semanticSnapshot.semantic.import.importedCount, 2);
  assert.deepStrictEqual(semanticSnapshot.semantic.import.factPredicates, ['owns-symbol']);
  assert.strictEqual(semanticSnapshot.semantic.edit.script.autoMergeCandidateCount, 2);
  assert.strictEqual(semanticSnapshot.semantic.edit.projection.appliedEditCount, 6);
  assert.strictEqual(semanticSnapshot.semantic.replay.totalCount, 9);
  assert.deepStrictEqual(semanticSnapshot.semantic.admission.jobs.statusCounts, { 'auto-merge-candidate': 2, blocked: 1 });
  assert.strictEqual(semanticSnapshot.semantic.admission.scripts.cleanEligibleCandidateCount, 2);
  assert.strictEqual(semanticSnapshot.quality.summary.semanticAdmissionAutoMergeCandidateCount, 2);
  assert.strictEqual(semanticSnapshot.quality.summary.semanticAdmissionScriptAutoMergeCandidateCount, 2);
  assert.strictEqual(semanticSnapshot.quality.summary.semanticAdmissionScriptCleanEligibleCandidateCount, 2);
  assert.strictEqual(semanticSnapshot.quality.series.semanticAdmissions.id, 'semantic-admissions');
  assert.ok(semanticSnapshot.quality.series.semanticAdmissions.points.some((point) => point.id === 'job:auto-merge-candidate' && point.value === 2));
  assert.ok(semanticSnapshot.quality.series.semanticAdmissions.points.some((point) => point.id === 'script:portable' && point.value === 3));
}
