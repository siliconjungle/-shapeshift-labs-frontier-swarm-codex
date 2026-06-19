import assert from 'node:assert';
import {
  createCodexDashboardSteeringIntent,
  fs,
  path,
  queryCodexSwarmCollection,
  readCodexDashboardSnapshot,
  writeCodexDashboardSteeringIntent
} from './context.mjs';

export async function testDashboardUi(context, collectionDir, continuation) {
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

  const auditCollectionDir = path.join(tmp, 'audit-collection');
  await fs.mkdir(auditCollectionDir, { recursive: true });
  const auditGeneratedAt = 1700000000000;
  const auditBucketAt = Math.floor(auditGeneratedAt / 60000) * 60000;
  const auditWorkspaceProofPath = path.join(auditCollectionDir, 'evidence', 'workspace-proof.json');
  await fs.mkdir(path.dirname(auditWorkspaceProofPath), { recursive: true });
  await fs.writeFile(auditWorkspaceProofPath, JSON.stringify({
    ignoredChangedPaths: ['.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
    ignoredChangedPathReasons: [
      { path: '.cache/tsconfig.tsbuildinfo', reasonCode: 'tsbuildinfo' },
      { path: 'dist/index.js', reasonCode: 'build_output' }
    ],
    observedChangedPaths: ['src/runtime/action.ts', 'src/forbidden.ts', '.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
    reportedChangedPaths: ['src/runtime/action.ts', 'src/forbidden.ts', '.cache/tsconfig.tsbuildinfo'],
    summary: {
      ignoredChangedPathCount: 2,
      ignoredChangedPathReasonCounts: { tsbuildinfo: 1, build_output: 1 },
      observedChangedPathCount: 4,
      reportedChangedPathCount: 3
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(auditCollectionDir, 'collection.json'), JSON.stringify({
    ok: false,
    summary: { total: 4, 'ready-to-apply': 0, 'needs-human-port': 2, 'failed-evidence': 1, 'stale-against-head': 1 },
    dashboard: {
      board: {
        entries: [
          {
            id: 'merge-candidate-internal',
            kind: 'merge-candidate',
            status: 'needs-review',
            title: 'Internal merge candidate',
            text: 'This should stay in merge review, not the human question queue.'
          },
          {
            id: 'human-question-timeout',
            kind: 'human-question',
            status: 'open',
            title: 'Choose timeout policy',
            question: 'Should stalled workers be retried automatically after ten minutes?',
            lane: 'runtime',
            metadata: {
              code: 'Q-TIME',
              priority: 'important',
              requestedAnswer: 'Answer with Q-TIME and yes or no.',
              why: 'This controls whether the coordinator spends time on retry churn.',
              options: [
                { label: 'Yes', detail: 'Retry faster, but may spend more tokens.' },
                { label: 'No', detail: 'Lower spend, but needs manual intervention.' }
              ]
            }
          }
        ]
      }
    },
    buckets: {
      'ready-to-apply': [],
      'needs-human-port': [{
        bucket: 'needs-human-port',
        jobId: 'needs-port-job',
        outputDir: auditCollectionDir,
        bundle: {
          jobId: 'needs-port-job',
          taskId: 'needs-port-task',
          lane: 'runtime',
          generatedAt: auditGeneratedAt + 60000,
          startedAt: auditGeneratedAt + 50000,
          finishedAt: auditGeneratedAt + 60000,
          status: 'completed',
          mergeReadiness: 'verified-patch',
          disposition: 'needs-port',
          changedPaths: ['src/runtime/needs-port.ts'],
          ownershipViolations: [],
          evidencePaths: [],
          reasons: ['manual port required'],
          metadata: {
            semanticEditAdmissionStatus: 'needs-port',
            semanticEditAdmissionReasons: 'manual port required'
          }
        }
      }, {
        bucket: 'needs-human-port',
        jobId: 'resolved-rejected-job',
        outputDir: auditCollectionDir,
        bundle: {
          jobId: 'resolved-rejected-job',
          taskId: 'resolved-rejected-task',
          lane: 'runtime',
          generatedAt: auditGeneratedAt + 180000,
          startedAt: auditGeneratedAt + 170000,
          finishedAt: auditGeneratedAt + 180000,
          status: 'completed',
          mergeReadiness: 'review-resolved',
          disposition: 'rejected',
          changedPaths: [],
          ownershipViolations: [],
          evidencePaths: [],
          reasons: ['needs-human-port'],
          metadata: {
            collect: { reasonClasses: ['raw run evidence discovered'] },
            semanticEditAdmissionStatus: 'needs-port',
            semanticEditAdmissionReasons: 'needs-human-port'
          }
        }
      }],
      'stale-against-head': [{
        bucket: 'stale-against-head',
        jobId: 'stale-job',
        outputDir: auditCollectionDir,
        bundle: {
          jobId: 'stale-job',
          taskId: 'stale-task',
          lane: 'runtime',
          generatedAt: auditGeneratedAt + 120000,
          startedAt: auditGeneratedAt + 100000,
          finishedAt: auditGeneratedAt + 120000,
          status: 'completed',
          mergeReadiness: 'blocked',
          disposition: 'stale-against-head',
          changedPaths: ['src/runtime/stale.ts'],
          ownershipViolations: [],
          evidencePaths: [],
          reasons: ['stale-against-head'],
          metadata: {
            semanticEditAdmissionStatus: 'stale',
            semanticEditAdmissionReasons: 'stale-against-head'
          }
        }
      }],
      'failed-evidence': [{
        bucket: 'failed-evidence',
        jobId: 'audit-job',
        outputDir: auditCollectionDir,
        bundle: {
          jobId: 'audit-job',
          taskId: 'audit-task',
          lane: 'codex-write-policy',
          generatedAt: auditGeneratedAt,
          startedAt: auditGeneratedAt - 12000,
          finishedAt: auditGeneratedAt,
          status: 'failed',
          mergeReadiness: 'blocked',
          disposition: 'blocked',
          changedPaths: ['src/runtime/action.ts', 'src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
          ownershipViolations: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo'],
          evidencePaths: ['evidence.json', auditWorkspaceProofPath],
          reasons: ['ownership violations present'],
          metadata: {
            contextBudget: {
              status: 'warning',
              measured: {
                promptBytes: 64000,
                estimatedInputTokens: 16000
              },
              usage: {
                inputTokens: 28000,
                cachedInputTokens: 20000,
                uncachedInputTokens: 8000
              },
              warnings: ['actual input tokens 28000 exceeded warning budget 20000'],
              errors: []
            },
            semanticEditAdmissionStatus: 'auto-merge-candidate',
            semanticEditAdmissionAutoMergeCandidate: true,
            semanticEditAdmissionCleanEligible: true,
            semanticEditAdmissionReasons: 'clean projection',
            workspacePatchQuarantine: {
              quarantinedChangedPaths: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']
            },
            logSummary: {
              eventBytes: 2000,
              eventBytesTruncated: 100,
              stderrBytes: 300,
              stderrBytesTruncated: 25
            }
          }
        }
      }]
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(auditCollectionDir, 'coordinator-query.json'), JSON.stringify({
    summary: {
      jobCount: 4,
      readyToApplyCount: 0,
      needsHumanPortCount: 2,
      failedEvidenceCount: 1,
      staleAgainstHeadCount: 1,
      averageMergeScore: 0.5
    },
    jobs: [
      {
        jobId: 'needs-port-job',
        taskId: 'needs-port-task',
        lane: 'runtime',
        generatedAt: auditGeneratedAt + 60000,
        status: 'completed',
        liveness: 'finished',
        mergeReadiness: 'verified-patch',
        disposition: 'needs-port',
        mergeScore: 0.6,
        changedPaths: ['src/runtime/needs-port.ts'],
        ownershipViolations: [],
        sourceOwnershipViolations: [],
        ignoredOwnershipViolations: [],
        staleAgainstHead: false,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: [],
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'needs-port', autoMergeCandidate: false, cleanEligible: false, reasons: ['manual port required'] },
          semanticEditScript: { needsPort: 1 },
          semanticEditProjection: {},
          semanticEditReplay: {}
        }
      },
      {
        jobId: 'resolved-rejected-job',
        taskId: 'resolved-rejected-task',
        lane: 'runtime',
        generatedAt: auditGeneratedAt + 180000,
        status: 'completed',
        liveness: 'finished',
        mergeReadiness: 'review-resolved',
        disposition: 'rejected',
        mergeScore: 1,
        changedPaths: [],
        ownershipViolations: [],
        sourceOwnershipViolations: [],
        ignoredOwnershipViolations: [],
        staleAgainstHead: false,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: [],
        reasons: ['needs-human-port'],
        collectReasonClasses: ['raw run evidence discovered'],
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'needs-port', autoMergeCandidate: false, cleanEligible: false, reasons: ['needs-human-port'] },
          semanticEditScript: {},
          semanticEditProjection: {},
          semanticEditReplay: {}
        }
      },
      {
        jobId: 'stale-job',
        taskId: 'stale-task',
        lane: 'runtime',
        generatedAt: auditGeneratedAt + 120000,
        status: 'completed',
        liveness: 'finished',
        mergeReadiness: 'blocked',
        disposition: 'stale-against-head',
        mergeScore: 0.3,
        changedPaths: ['src/runtime/stale.ts'],
        ownershipViolations: [],
        sourceOwnershipViolations: [],
        ignoredOwnershipViolations: [],
        staleAgainstHead: true,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: [],
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'stale', autoMergeCandidate: false, cleanEligible: false, reasons: ['stale-against-head'] },
          semanticEditScript: { stale: 1 },
          semanticEditProjection: {},
          semanticEditReplay: {}
        }
      },
      {
        jobId: 'audit-job',
        taskId: 'audit-task',
        lane: 'codex-write-policy',
        generatedAt: auditGeneratedAt,
        status: 'failed',
        liveness: 'finished',
        mergeReadiness: 'blocked',
        disposition: 'failed-evidence',
        mergeScore: 0.1,
        changedPaths: ['src/runtime/action.ts', 'src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
        ownershipViolations: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo'],
        sourceOwnershipViolations: ['src/forbidden.ts'],
        ignoredOwnershipViolations: ['frontier-swarm-codex/.cache/tsconfig.tsbuildinfo'],
        ownershipViolationCount: 2,
        sourceOwnershipViolationCount: 1,
        ignoredOwnershipViolationCount: 1,
        quarantinedChangedPaths: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo'],
        quarantinedChangedPathCount: 2,
        ignoredChangedPathCount: 2,
        ignoredChangedPathSamples: ['.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
        ignoredChangedPathReasonCounts: { tsbuildinfo: 1, build_output: 1 },
        observedChangedPathCount: 4,
        reportedChangedPathCount: 3,
        staleAgainstHead: false,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: ['evidence.json', auditWorkspaceProofPath],
        contextBudget: {
          status: 'warning',
          measured: { promptBytes: 64000, estimatedInputTokens: 16000 },
          usage: { inputTokens: 28000, cachedInputTokens: 20000, uncachedInputTokens: 8000 },
          warnings: ['actual input tokens 28000 exceeded warning budget 20000'],
          errors: []
        },
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'auto-merge-candidate', autoMergeCandidate: true, cleanEligible: true, reasons: ['clean projection'] },
          semanticEditScript: { autoMergeCandidates: 1, portable: 1 },
          semanticEditProjection: { projected: 1, appliedEditCount: 1 },
          semanticEditReplay: { acceptedClean: 1 }
        }
      }
    ]
  }, null, 2) + '\n');
  const auditSnapshot = await readCodexDashboardSnapshot({ collection: auditCollectionDir });
  const auditJob = auditSnapshot.jobs.find((job) => job.id === 'audit-job');
  assert.ok(auditJob);
  assert.deepStrictEqual(auditJob.changedPaths, ['src/runtime/action.ts', 'src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo', 'dist/index.js']);
  assert.deepStrictEqual(auditJob.ownershipViolations, ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.deepStrictEqual(auditJob.sourceOwnershipViolations, ['src/forbidden.ts']);
  assert.deepStrictEqual(auditJob.ignoredOwnershipViolations, ['frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.deepStrictEqual(auditJob.quarantinedChangedPaths, ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']);
  assert.strictEqual(auditJob.sourceOwnershipViolationCount, 1);
  assert.strictEqual(auditJob.ignoredOwnershipViolationCount, 1);
  assert.strictEqual(auditJob.ignoredChangedPathCount, 2);
  assert.deepStrictEqual(auditJob.ignoredChangedPathSamples, ['.cache/tsconfig.tsbuildinfo', 'dist/index.js']);
  assert.deepStrictEqual(auditJob.ignoredChangedPathReasonCounts, { tsbuildinfo: 1, build_output: 1 });
  assert.deepStrictEqual(auditJob.ignoredChangedPathReasonSamples, [
    { path: '.cache/tsconfig.tsbuildinfo', reasonCode: 'tsbuildinfo' },
    { path: 'dist/index.js', reasonCode: 'build_output' }
  ]);
  assert.strictEqual(auditJob.observedChangedPathCount, 4);
  assert.strictEqual(auditJob.reportedChangedPathCount, 3);
  assert.strictEqual(auditJob.contextBudgetStatus, 'warning');
  assert.strictEqual(auditJob.contextBudgetWarningCount, 1);
  assert.strictEqual(auditJob.actualInputTokens, 28000);
  assert.strictEqual(auditJob.cachedInputTokens, 20000);
  assert.strictEqual(auditJob.uncachedInputTokens, 8000);
  assert.strictEqual(auditJob.durationMs, 12000);
  assert.strictEqual(auditJob.health, 'failed');
  assert.strictEqual(auditJob.semanticAdmissionStatus, 'auto-merge-candidate');
  assert.strictEqual(auditJob.semanticAutoMergeCandidate, true);
  assert.strictEqual(auditJob.semanticCleanEligible, true);
  assert.strictEqual(auditJob.semanticReadiness, 'clean');
  assert.deepStrictEqual(auditJob.semanticReadinessReasons, ['clean projection']);
  assert.strictEqual(auditSnapshot.summary.sourceOwnershipViolationCount, 1);
  assert.strictEqual(auditSnapshot.summary.ignoredOwnershipViolationCount, 1);
  assert.strictEqual(auditSnapshot.summary.ignoredChangedPathCount, 2);
  const resolvedRejectedJob = auditSnapshot.jobs.find((job) => job.id === 'resolved-rejected-job');
  assert.ok(resolvedRejectedJob);
  assert.notStrictEqual(resolvedRejectedJob.bucket, 'failed-evidence');
  assert.strictEqual(resolvedRejectedJob.health, 'warning');
  assert.strictEqual(auditSnapshot.summary.terminalCount, 4);
  assert.strictEqual(auditSnapshot.summary.failureCount, 1);
  assert.strictEqual(auditSnapshot.summary.warningCount, 3);
  assert.strictEqual(auditSnapshot.summary.contextWarningCount, 1);
  assert.strictEqual(auditSnapshot.summary.semanticCleanCount, 1);
  assert.strictEqual(auditSnapshot.summary.durationMs, 52000);
  assert.strictEqual(auditSnapshot.summary.averageDurationMs, 13000);
  assert.strictEqual(auditSnapshot.summary.maxDurationMs, 20000);
  assert.strictEqual(auditSnapshot.summary.actualInputTokens, 28000);
  assert.strictEqual(auditSnapshot.humanActions.length, 1);
  assert.strictEqual(auditSnapshot.humanActions[0].code, 'Q-TIME');
  assert.strictEqual(auditSnapshot.humanActions[0].question, 'Should stalled workers be retried automatically after ten minutes?');
  assert.strictEqual(auditSnapshot.humanActions[0].requestedAnswer, 'Answer with Q-TIME and yes or no.');
  assert.strictEqual(auditSnapshot.humanActions[0].options.length, 2);
  assert.strictEqual(auditSnapshot.quality.summary.sourceOwnershipViolationCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.ignoredChangedPathCount, 2);
  assert.strictEqual(auditSnapshot.quality.summary.generatedChangedPathCount, 2);
  assert.strictEqual(auditSnapshot.quality.summary.quarantinedChangedPathCount, 2);
  assert.strictEqual(auditSnapshot.quality.summary.failureJobCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.failedEvidenceJobCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.needsPortJobCount, 2);
  assert.strictEqual(auditSnapshot.quality.summary.staleJobCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetJobCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetWarningCount, 1);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetMaxPromptBytes, 64000);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetMaxEstimatedInputTokens, 16000);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetMaxActualInputTokens, 28000);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetMaxCachedInputTokens, 20000);
  assert.strictEqual(auditSnapshot.quality.summary.contextBudgetMaxUncachedInputTokens, 8000);
  assert.strictEqual(auditSnapshot.health.status, 'failed');
  assert.strictEqual(auditSnapshot.health.summary.failedJobCount, 1);
  assert.strictEqual(auditSnapshot.health.summary.warningJobCount, 3);
  assert.strictEqual(auditSnapshot.health.summary.readyToApplyJobCount, 0);
  assert.strictEqual(auditSnapshot.health.summary.notReadyToApplyJobCount, 4);
  assert.strictEqual(auditSnapshot.health.summary.contextWarningJobCount, 1);
  assert.strictEqual(auditSnapshot.health.summary.semanticCleanJobCount, 1);
  assert.strictEqual(auditSnapshot.health.summary.semanticUnknownJobCount, 0);
  assert.strictEqual(auditSnapshot.health.summary.durationMs, 52000);
  assert.strictEqual(auditSnapshot.health.summary.averageDurationMs, 13000);
  assert.strictEqual(auditSnapshot.health.summary.maxDurationMs, 20000);
  assert.strictEqual(auditSnapshot.health.summary.actualInputTokens, 28000);
  assert.ok(auditSnapshot.health.summary.failureRatio > 0.2);
  assert.ok(auditSnapshot.health.points.some((point) => point.id === 'semantic:clean' && point.jobIds.includes('audit-job')));
  assert.strictEqual(auditSnapshot.quality.series.sourceOwnership.id, 'source-ownership');
  assert.strictEqual(auditSnapshot.quality.series.ignoredChangedPaths.id, 'ignored-changed-paths');
  assert.strictEqual(auditSnapshot.quality.series.generatedChangedPaths.id, 'generated-changed-paths');
  assert.strictEqual(auditSnapshot.quality.series.quarantines.id, 'quarantines');
  assert.strictEqual(auditSnapshot.quality.series.failures.id, 'failures');
  assert.strictEqual(auditSnapshot.quality.series.needsPort.id, 'needs-port');
  assert.strictEqual(auditSnapshot.quality.series.stale.id, 'stale');
  assert.strictEqual(auditSnapshot.quality.series.contextBudget.id, 'context-budget');
  assert.ok(auditSnapshot.quality.series.contextBudget.points.some((point) => point.id === 'warning' && point.value === 1));
  assert.ok(auditSnapshot.quality.series.generatedChangedPaths.points.some((point) => point.id === 'paths' && point.value === 2));
  assert.strictEqual(auditSnapshot.timeSeries.bucketMs, 60000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.terminalJobCount, 4);
  assert.strictEqual(auditSnapshot.timeSeries.summary.failureJobCount, 1);
  assert.strictEqual(auditSnapshot.timeSeries.summary.warningJobCount, 3);
  assert.strictEqual(auditSnapshot.timeSeries.summary.semanticCleanJobCount, 1);
  assert.strictEqual(auditSnapshot.timeSeries.summary.contextLoadJobCount, 1);
  assert.strictEqual(auditSnapshot.timeSeries.summary.logVolumeJobCount, 1);
  assert.strictEqual(auditSnapshot.timeSeries.summary.missingTimestampJobCount, 0);
  assert.strictEqual(auditSnapshot.timeSeries.summary.promptBytes, 64000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.estimatedInputTokens, 16000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.actualInputTokens, 28000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.cachedInputTokens, 20000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.uncachedInputTokens, 8000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.durationMs, 52000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.averageDurationMs, 13000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.maxDurationMs, 20000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.eventBytes, 2000);
  assert.strictEqual(auditSnapshot.timeSeries.summary.stderrBytes, 300);
  assert.strictEqual(auditSnapshot.timeSeries.summary.logBytes, 2300);
  assert.strictEqual(auditSnapshot.timeSeries.summary.logBytesTruncated, 125);
  assert.ok(auditSnapshot.timeSeries.points.some((point) => point.at === auditBucketAt && point.failureJobCount === 1 && point.durationMs === 12000 && point.semanticCleanJobCount === 1 && point.jobIds.includes('audit-job')));
  const auditQuery = await queryCodexSwarmCollection({ collection: auditCollectionDir, limit: 10 });
  assert.strictEqual(auditQuery.summary.queryable.runHealth.failedJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.runHealth.warningJobCount, 2);
  assert.strictEqual(auditQuery.summary.queryable.runHealth.blockedJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.context.contextWarningJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.context.tokenTotals.actualInputTokens, 28000);
  assert.strictEqual(auditQuery.summary.queryable.semantic.readiness.cleanJobCount, 1);
  assert.strictEqual(auditQuery.summary.queryable.semantic.readiness.needsPortJobCount, 1);
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

  const legacyCollectionDir = path.join(tmp, 'legacy-collection');
  await fs.mkdir(legacyCollectionDir, { recursive: true });
  await fs.writeFile(path.join(legacyCollectionDir, 'collection.json'), JSON.stringify({
    ok: true,
    summary: { total: 1, 'ready-to-apply': 1, 'needs-human-port': 0, 'failed-evidence': 0, 'stale-against-head': 0 },
    buckets: {
      'ready-to-apply': [{
        bucket: 'ready-to-apply',
        jobId: 'legacy-job',
        outputDir: legacyCollectionDir,
        bundle: {
          jobId: 'legacy-job',
          taskId: 'legacy-task',
          lane: 'runtime',
          status: 'completed',
          mergeReadiness: 'verified-patch',
          disposition: 'ready-to-apply',
          changedPaths: [],
          ownershipViolations: [],
          evidencePaths: [],
          reasons: [],
          metadata: {
            contextBudget: {
              status: 'ok',
              measured: {
                promptBytes: 1000,
                estimatedInputTokens: 250
              },
              usage: {
                inputTokens: 400,
                cachedInputTokens: 125,
                uncachedInputTokens: 275
              },
              warnings: [],
              errors: []
            },
            logSummary: {
              eventBytes: 20,
              eventBytesTruncated: 0,
              stderrBytes: 5,
              stderrBytesTruncated: 0
            }
          }
        }
      }],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  const legacySnapshot = await readCodexDashboardSnapshot({ collection: legacyCollectionDir });
  assert.strictEqual(legacySnapshot.health.summary.readyToApplyJobCount, 1);
  assert.strictEqual(legacySnapshot.health.summary.notReadyToApplyJobCount, 0);
  assert.strictEqual(legacySnapshot.timeSeries.summary.missingTimestampJobCount, 1);
  assert.strictEqual(legacySnapshot.timeSeries.summary.terminalJobCount, 0);
  assert.strictEqual(legacySnapshot.timeSeries.summary.contextLoadJobCount, 1);
  assert.strictEqual(legacySnapshot.timeSeries.summary.logVolumeJobCount, 1);
  assert.deepStrictEqual(legacySnapshot.timeSeries.points, []);

  const landedCollectionDir = path.join(tmp, 'landed-collection');
  const applyLedger = {
    path: path.join(landedCollectionDir, 'apply-ledger', 'apply-ledger.json'),
    generatedAt: 1700000100000,
    dryRun: false,
    total: 2,
    checked: 0,
    applied: 1,
    committed: 1,
    skipped: 0,
    failed: 0,
    landed: 2,
    appliedJobIds: ['applied-job'],
    committedJobIds: ['committed-job'],
    landedJobIds: ['applied-job', 'committed-job'],
    failedJobIds: [],
    landedEntries: [
      {
        jobId: 'applied-job',
        status: 'applied',
        bundlePath: path.join(landedCollectionDir, 'ready-to-apply', 'applied-job', 'merge.json'),
        patchPath: path.join(landedCollectionDir, 'ready-to-apply', 'applied-job', 'changes.patch')
      },
      {
        jobId: 'committed-job',
        status: 'committed',
        bundlePath: path.join(landedCollectionDir, 'ready-to-apply', 'committed-job', 'merge.json'),
        commit: '0123456789abcdef0123456789abcdef01234567'
      }
    ]
  };
  await fs.mkdir(landedCollectionDir, { recursive: true });
  await fs.writeFile(path.join(landedCollectionDir, 'collection.json'), JSON.stringify({
    ok: true,
    summary: {
      total: 2,
      'ready-to-apply': 0,
      'needs-human-port': 2,
      'failed-evidence': 0,
      'stale-against-head': 0,
      landed: 2,
      landedJobIds: ['applied-job', 'committed-job'],
      applyLedger
    },
    buckets: {
      'ready-to-apply': [],
      'needs-human-port': [],
      'failed-evidence': [],
      'stale-against-head': []
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(landedCollectionDir, 'coordinator-query.json'), JSON.stringify({
    summary: {
      jobCount: 2,
      readyToApplyCount: 0,
      needsHumanPortCount: 2,
      failedEvidenceCount: 0,
      staleAgainstHeadCount: 0,
      averageMergeScore: 0.8,
      applyLedger,
      landedJobIds: ['applied-job', 'committed-job']
    },
    jobs: [
      {
        jobId: 'applied-job',
        taskId: 'applied-task',
        lane: 'runtime',
        status: 'completed',
        liveness: 'finished',
        disposition: 'needs-port',
        mergeReadiness: 'verified-patch',
        mergeScore: 0.8,
        changedPaths: ['src/runtime/applied.ts'],
        ownershipViolations: [],
        staleAgainstHead: false,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: [],
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'needs-port', autoMergeCandidate: false, cleanEligible: false, reasons: [] },
          semanticEditScript: {},
          semanticEditProjection: {},
          semanticEditReplay: {}
        }
      },
      {
        jobId: 'committed-job',
        taskId: 'committed-task',
        lane: 'runtime',
        status: 'completed',
        liveness: 'finished',
        disposition: 'needs-port',
        mergeReadiness: 'verified-patch',
        mergeScore: 0.8,
        changedPaths: ['src/runtime/committed.ts'],
        ownershipViolations: [],
        staleAgainstHead: false,
        tests: { failed: 0, requiredFailed: 0 },
        evidencePaths: [],
        semanticImportQuality: {
          expected: false,
          warnings: [],
          semanticEditAdmission: { status: 'needs-port', autoMergeCandidate: false, cleanEligible: false, reasons: [] },
          semanticEditScript: {},
          semanticEditProjection: {},
          semanticEditReplay: {}
        }
      }
    ]
  }, null, 2) + '\n');
  const landedSnapshot = await readCodexDashboardSnapshot({ collection: landedCollectionDir });
  assert.strictEqual(landedSnapshot.summary.landed, 2);
  assert.strictEqual(landedSnapshot.summary.applyLedgerLandedCount, 2);
  assert.deepStrictEqual(landedSnapshot.summary.landedJobIds, ['applied-job', 'committed-job']);
  assert.deepStrictEqual(landedSnapshot.summary.applyLedger, applyLedger);
  const landedQuery = await queryCodexSwarmCollection({ collection: landedCollectionDir, landed: true });
  assert.deepStrictEqual(landedQuery.jobs.map((job) => job.jobId).sort(), ['applied-job', 'committed-job']);
  assert.strictEqual(landedQuery.summary.queryable.landed.landed, 2);
  assert.strictEqual(landedQuery.summary.queryable.landed.matchedLandedJobCount, 2);
  assert.strictEqual(landedQuery.summary.landed.matchedLandedRatio, 1);

  const intent = createCodexDashboardSteeringIntent({
    collection: collectionDir,
    routingMode: 'observe',
    maxConcurrency: 8,
    laneFocus: ['runtime', 'runtime'],
    modelTierPreference: 'fast',
    nextWaveNote: 'Prefer fast model for smoke runtime follow-up.'
  });
  assert.strictEqual(intent.kind, 'frontier.swarm-codex.steering-intent');
  assert.deepStrictEqual(intent.laneFocus, ['runtime']);
  assert.strictEqual(intent.maxConcurrency, 8);
  assert.strictEqual(intent.routingMode, 'observe');

  const write = await writeCodexDashboardSteeringIntent({
    cwd: tmp,
    outDir: 'steering',
    intent
  });
  assert.strictEqual(write.ok, true);
  assert.ok(write.file.startsWith(path.join(tmp, 'steering')));
  assert.deepStrictEqual(JSON.parse(await fs.readFile(write.file, 'utf8')).laneFocus, ['runtime']);
}
