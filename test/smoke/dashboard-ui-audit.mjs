import assert from 'node:assert';
import { queryCodexSwarmCollection, readCodexDashboardSnapshot } from './context.mjs';
import { writeDashboardAuditFixture } from './dashboard-ui-audit-fixture.mjs';

export async function runDashboardAuditSmoke(context) {
  const { auditCollectionDir, auditBucketAt } = await writeDashboardAuditFixture(context.tmp);
  const snapshot = await readCodexDashboardSnapshot({ collection: auditCollectionDir });
  assertAuditJob(snapshot);
  assertAuditSummary(snapshot);
  assertAuditQuality(snapshot);
  assertAuditHealthAndTime(snapshot, auditBucketAt);
  await assertAuditQueries(auditCollectionDir);
}

function assertAuditJob(snapshot) {
  const job = snapshot.jobs.find((entry) => entry.id === 'audit-job');
  assert.ok(job);
  assert.deepStrictEqual(job.changedPaths, ['src/runtime/action.ts', 'src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo', 'dist/index.js']);
  assert.deepStrictEqual(job.ownershipViolations, ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.deepStrictEqual(job.sourceOwnershipViolations, ['src/forbidden.ts']);
  assert.deepStrictEqual(job.ignoredOwnershipViolations, ['frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.deepStrictEqual(job.quarantinedChangedPaths, ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.strictEqual(job.sourceOwnershipViolationCount, 1);
  assert.strictEqual(job.ignoredOwnershipViolationCount, 1);
  assert.strictEqual(job.ignoredChangedPathCount, 2);
  assert.deepStrictEqual(job.ignoredChangedPathSamples, ['.cache/tsconfig.tsbuildinfo', 'dist/index.js']);
  assert.deepStrictEqual(job.ignoredChangedPathReasonCounts, { tsbuildinfo: 1, build_output: 1 });
  assert.deepStrictEqual(job.ignoredChangedPathReasonSamples, [
    { path: '.cache/tsconfig.tsbuildinfo', reasonCode: 'tsbuildinfo' },
    { path: 'dist/index.js', reasonCode: 'build_output' }
  ]);
  assert.strictEqual(job.observedChangedPathCount, 4);
  assert.strictEqual(job.reportedChangedPathCount, 3);
  assert.strictEqual(job.contextBudgetStatus, 'warning');
  assert.strictEqual(job.contextBudgetWarningCount, 1);
  assert.strictEqual(job.actualInputTokens, 28000);
  assert.strictEqual(job.cachedInputTokens, 20000);
  assert.strictEqual(job.uncachedInputTokens, 8000);
  assert.strictEqual(job.billableInputTokens, 28000);
  assert.strictEqual(job.priceKnown, true);
  assert.strictEqual(job.pricingModel, 'gpt-5.4-mini');
  assert.strictEqual(job.estimatedCostUsd, 0.0075);
  assert.strictEqual(job.estimatedInputCostUsd, 0.0075);
  assert.strictEqual(job.estimatedOutputCostUsd, 0);
  assert.strictEqual(job.estimatedCostMicroUsd, 7500);
  assert.strictEqual(job.costEstimateInputOnly, true);
  assert.strictEqual(job.costEstimateMissingOutputTokens, true);
  assert.strictEqual(job.durationMs, 12000);
  assert.strictEqual(job.health, 'failed');
  assert.strictEqual(job.semanticAdmissionStatus, 'auto-merge-candidate');
  assert.strictEqual(job.semanticAutoMergeCandidate, true);
  assert.strictEqual(job.semanticCleanEligible, true);
  assert.strictEqual(job.semanticReadiness, 'clean');
  assert.deepStrictEqual(job.semanticReadinessReasons, ['clean projection']);
}

function assertAuditSummary(snapshot) {
  assert.strictEqual(snapshot.summary.sourceOwnershipViolationCount, 1);
  assert.strictEqual(snapshot.summary.ignoredOwnershipViolationCount, 1);
  assert.strictEqual(snapshot.summary.ignoredChangedPathCount, 2);
  const resolved = snapshot.jobs.find((job) => job.id === 'resolved-rejected-job');
  assert.ok(resolved);
  assert.notStrictEqual(resolved.bucket, 'failed-evidence');
  assert.strictEqual(resolved.health, 'warning');
  assert.strictEqual(snapshot.summary.terminalCount, 4);
  assert.strictEqual(snapshot.summary.failureCount, 1);
  assert.strictEqual(snapshot.summary.warningCount, 3);
  assert.strictEqual(snapshot.summary.contextWarningCount, 1);
  assert.strictEqual(snapshot.summary.semanticCleanCount, 1);
  assert.strictEqual(snapshot.summary.durationMs, 52000);
  assert.strictEqual(snapshot.summary.averageDurationMs, 13000);
  assert.strictEqual(snapshot.summary.maxDurationMs, 20000);
  assert.strictEqual(snapshot.summary.actualInputTokens, 28000);
  assert.strictEqual(snapshot.summary.billableInputTokens, 28000);
  assert.strictEqual(snapshot.summary.priceKnownJobCount, 1);
  assert.strictEqual(snapshot.summary.unknownPriceJobCount, 0);
  assert.strictEqual(snapshot.summary.inputOnlyCostJobCount, 1);
  assert.strictEqual(snapshot.summary.estimatedCostUsd, 0.0075);
  assert.strictEqual(snapshot.summary.estimatedCostMicroUsd, 7500);
  assert.strictEqual(snapshot.humanActions.length, 1);
  assert.strictEqual(snapshot.humanActions[0].code, 'Q-TIME');
  assert.strictEqual(snapshot.humanActions[0].question, 'Should stalled workers be retried automatically after ten minutes?');
  assert.strictEqual(snapshot.humanActions[0].requestedAnswer, 'Answer with Q-TIME and yes or no.');
  assert.strictEqual(snapshot.humanActions[0].options.length, 2);
}

function assertAuditQuality(snapshot) {
  assert.strictEqual(snapshot.quality.summary.sourceOwnershipViolationCount, 1);
  assert.strictEqual(snapshot.quality.summary.ignoredChangedPathCount, 2);
  assert.strictEqual(snapshot.quality.summary.generatedChangedPathCount, 2);
  assert.strictEqual(snapshot.quality.summary.quarantinedChangedPathCount, 2);
  assert.strictEqual(snapshot.quality.summary.failureJobCount, 1);
  assert.strictEqual(snapshot.quality.summary.failedEvidenceJobCount, 1);
  assert.strictEqual(snapshot.quality.summary.needsPortJobCount, 2);
  assert.strictEqual(snapshot.quality.summary.staleJobCount, 1);
  assert.strictEqual(snapshot.quality.summary.contextBudgetJobCount, 1);
  assert.strictEqual(snapshot.quality.summary.contextBudgetWarningCount, 1);
  assert.strictEqual(snapshot.quality.summary.contextBudgetMaxPromptBytes, 64000);
  assert.strictEqual(snapshot.quality.summary.contextBudgetMaxEstimatedInputTokens, 16000);
  assert.strictEqual(snapshot.quality.summary.contextBudgetMaxActualInputTokens, 28000);
  assert.strictEqual(snapshot.quality.summary.contextBudgetMaxCachedInputTokens, 20000);
  assert.strictEqual(snapshot.quality.summary.contextBudgetMaxUncachedInputTokens, 8000);
  assert.strictEqual(snapshot.quality.series.sourceOwnership.id, 'source-ownership');
  assert.strictEqual(snapshot.quality.series.ignoredChangedPaths.id, 'ignored-changed-paths');
  assert.strictEqual(snapshot.quality.series.generatedChangedPaths.id, 'generated-changed-paths');
  assert.strictEqual(snapshot.quality.series.quarantines.id, 'quarantines');
  assert.strictEqual(snapshot.quality.series.failures.id, 'failures');
  assert.strictEqual(snapshot.quality.series.needsPort.id, 'needs-port');
  assert.strictEqual(snapshot.quality.series.stale.id, 'stale');
  assert.strictEqual(snapshot.quality.series.contextBudget.id, 'context-budget');
  assert.ok(snapshot.quality.series.contextBudget.points.some((point) => point.id === 'warning' && point.value === 1));
  assert.ok(snapshot.quality.series.generatedChangedPaths.points.some((point) => point.id === 'paths' && point.value === 2));
}

function assertAuditHealthAndTime(snapshot, auditBucketAt) {
  assert.strictEqual(snapshot.health.status, 'failed');
  assert.strictEqual(snapshot.health.summary.failedJobCount, 1);
  assert.strictEqual(snapshot.health.summary.warningJobCount, 3);
  assert.strictEqual(snapshot.health.summary.readyToApplyJobCount, 0);
  assert.strictEqual(snapshot.health.summary.notReadyToApplyJobCount, 4);
  assert.strictEqual(snapshot.health.summary.contextWarningJobCount, 1);
  assert.strictEqual(snapshot.health.summary.semanticCleanJobCount, 1);
  assert.strictEqual(snapshot.health.summary.semanticUnknownJobCount, 0);
  assert.strictEqual(snapshot.health.summary.durationMs, 52000);
  assert.strictEqual(snapshot.health.summary.averageDurationMs, 13000);
  assert.strictEqual(snapshot.health.summary.maxDurationMs, 20000);
  assert.strictEqual(snapshot.health.summary.actualInputTokens, 28000);
  assert.ok(snapshot.health.summary.failureRatio > 0.2);
  assert.ok(snapshot.health.points.some((point) => point.id === 'semantic:clean' && point.jobIds.includes('audit-job')));
  assert.strictEqual(snapshot.timeSeries.bucketMs, 60000);
  assert.strictEqual(snapshot.timeSeries.summary.terminalJobCount, 4);
  assert.strictEqual(snapshot.timeSeries.summary.failureJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.warningJobCount, 3);
  assert.strictEqual(snapshot.timeSeries.summary.semanticCleanJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.contextLoadJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.logVolumeJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.missingTimestampJobCount, 0);
  assert.strictEqual(snapshot.timeSeries.summary.promptBytes, 64000);
  assert.strictEqual(snapshot.timeSeries.summary.estimatedInputTokens, 16000);
  assert.strictEqual(snapshot.timeSeries.summary.actualInputTokens, 28000);
  assert.strictEqual(snapshot.timeSeries.summary.cachedInputTokens, 20000);
  assert.strictEqual(snapshot.timeSeries.summary.uncachedInputTokens, 8000);
  assert.strictEqual(snapshot.timeSeries.summary.billableInputTokens, 28000);
  assert.strictEqual(snapshot.timeSeries.summary.priceKnownJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.inputOnlyCostJobCount, 1);
  assert.strictEqual(snapshot.timeSeries.summary.estimatedCostUsd, 0.0075);
  assert.strictEqual(snapshot.timeSeries.summary.estimatedCostMicroUsd, 7500);
  assert.strictEqual(snapshot.timeSeries.summary.durationMs, 52000);
  assert.strictEqual(snapshot.timeSeries.summary.averageDurationMs, 13000);
  assert.strictEqual(snapshot.timeSeries.summary.maxDurationMs, 20000);
  assert.strictEqual(snapshot.timeSeries.summary.eventBytes, 2000);
  assert.strictEqual(snapshot.timeSeries.summary.stderrBytes, 300);
  assert.strictEqual(snapshot.timeSeries.summary.logBytes, 2300);
  assert.strictEqual(snapshot.timeSeries.summary.logBytesTruncated, 125);
  assert.ok(snapshot.timeSeries.points.some((point) => point.at === auditBucketAt && point.failureJobCount === 1 && point.durationMs === 12000 && point.semanticCleanJobCount === 1 && point.jobIds.includes('audit-job')));
}

async function assertAuditQueries(auditCollectionDir) {
  const auditQuery = await queryCodexSwarmCollection({ collection: auditCollectionDir, limit: 10 });
  assert.strictEqual(auditQuery.summary.queryable.runHealth.failedJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.runHealth.warningJobCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.runHealth.blockedJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.context.contextWarningJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.context.tokenTotals.actualInputTokens, 28000);
  assert.strictEqual(auditQuery.summary.queryable.semantic.readiness.cleanJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.semantic.readiness.needsPortJobCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.semantic.readiness.staleJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.cleanup.ignoredChangedPathCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.cleanup.generatedChangedPathCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.cleanup.quarantinedChangedPathCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.ownership.sourceViolationCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.ownership.ignoredViolationCount, 1);
  assert.strictEqual(auditQuery.summary.context.tokenTotals.actualInputTokens, 28000);
  assert.strictEqual(auditQuery.summary.cleanup.quarantinedChangedPathCount, 2);
  assert.strictEqual(auditQuery.summary.ownership.strictWriteIsolationFailedJobCount, 1);
  const cleanupQuery = await queryCodexSwarmCollection({ collection: auditCollectionDir, cleanup: 'quarantined' });
  assert.deepStrictEqual(cleanupQuery.jobs.map((job) => job.jobId), ['audit-job']);
  const ownershipQuery = await queryCodexSwarmCollection({ collection: auditCollectionDir, ownership: 'strict-write-isolation' });
  assert.deepStrictEqual(ownershipQuery.jobs.map((job) => job.jobId), ['audit-job']);
}
