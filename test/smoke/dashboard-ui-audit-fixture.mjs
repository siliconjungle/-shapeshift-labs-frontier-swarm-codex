import { fs, path } from './context.mjs';

export async function writeDashboardAuditFixture(tmp) {
  const auditCollectionDir = path.join(tmp, 'audit-collection');
  await fs.mkdir(auditCollectionDir, { recursive: true });
  const generatedAt = 1700000000000;
  const bucketAt = Math.floor(generatedAt / 60000) * 60000;
  const workspaceProofPath = path.join(auditCollectionDir, 'evidence', 'workspace-proof.json');
  await fs.mkdir(path.dirname(workspaceProofPath), { recursive: true });
  await fs.writeFile(workspaceProofPath, JSON.stringify(workspaceProof(), null, 2) + '\n');
  await fs.writeFile(path.join(auditCollectionDir, 'collection.json'), JSON.stringify({
    ok: false,
    summary: { total: 4, 'ready-to-apply': 0, 'needs-human-port': 2, 'failed-evidence': 1, 'stale-against-head': 1 },
    dashboard: { board: { entries: [mergeCandidateEntry(), humanQuestionEntry()] } },
    buckets: {
      'ready-to-apply': [],
      'needs-human-port': [
        bucketEntry(auditCollectionDir, 'needs-human-port', bundle('needs-port-job', {
          taskId: 'needs-port-task',
          generatedAt: generatedAt + 60000,
          startedAt: generatedAt + 50000,
          finishedAt: generatedAt + 60000,
          mergeReadiness: 'verified-patch',
          disposition: 'needs-port',
          changedPaths: ['src/runtime/needs-port.ts'],
          reasons: ['manual port required'],
          metadata: semanticMetadata('needs-port', false, false, 'manual port required')
        })),
        bucketEntry(auditCollectionDir, 'needs-human-port', bundle('resolved-rejected-job', {
          taskId: 'resolved-rejected-task',
          generatedAt: generatedAt + 180000,
          startedAt: generatedAt + 170000,
          finishedAt: generatedAt + 180000,
          mergeReadiness: 'review-resolved',
          disposition: 'rejected',
          changedPaths: [],
          reasons: ['needs-human-port'],
          metadata: { collect: { reasonClasses: ['raw run evidence discovered'] }, ...semanticMetadata('needs-port', false, false, 'needs-human-port') }
        }))
      ],
      'stale-against-head': [
        bucketEntry(auditCollectionDir, 'stale-against-head', bundle('stale-job', {
          taskId: 'stale-task',
          generatedAt: generatedAt + 120000,
          startedAt: generatedAt + 100000,
          finishedAt: generatedAt + 120000,
          mergeReadiness: 'blocked',
          disposition: 'stale-against-head',
          changedPaths: ['src/runtime/stale.ts'],
          reasons: ['stale-against-head'],
          metadata: semanticMetadata('stale', false, false, 'stale-against-head')
        }))
      ],
      'failed-evidence': [bucketEntry(auditCollectionDir, 'failed-evidence', auditBundle({ generatedAt, workspaceProofPath }))]
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(auditCollectionDir, 'coordinator-query.json'), JSON.stringify({
    summary: { jobCount: 4, readyToApplyCount: 0, needsHumanPortCount: 2, failedEvidenceCount: 1, staleAgainstHeadCount: 1, averageMergeScore: 0.5 },
    jobs: [
      dashboardJob('needs-port-job', { taskId: 'needs-port-task', generatedAt: generatedAt + 60000, disposition: 'needs-port', mergeReadiness: 'verified-patch', changedPaths: ['src/runtime/needs-port.ts'], semanticImportQuality: semanticQuality('needs-port', 'manual port required') }),
      dashboardJob('resolved-rejected-job', { taskId: 'resolved-rejected-task', generatedAt: generatedAt + 180000, disposition: 'rejected', mergeReadiness: 'review-resolved', mergeScore: 1, changedPaths: [], reasons: ['needs-human-port'], collectReasonClasses: ['raw run evidence discovered'], semanticImportQuality: semanticQuality('needs-port', 'needs-human-port') }),
      dashboardJob('stale-job', { taskId: 'stale-task', generatedAt: generatedAt + 120000, disposition: 'stale-against-head', mergeReadiness: 'blocked', mergeScore: 0.3, changedPaths: ['src/runtime/stale.ts'], staleAgainstHead: true, semanticImportQuality: semanticQuality('stale', 'stale-against-head') }),
      dashboardJob('audit-job', auditDashboardJob({ generatedAt, workspaceProofPath }))
    ]
  }, null, 2) + '\n');
  return { auditCollectionDir, auditBucketAt: bucketAt };
}

function workspaceProof() {
  return {
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
  };
}

function mergeCandidateEntry() {
  return {
    id: 'merge-candidate-internal',
    kind: 'merge-candidate',
    status: 'needs-review',
    title: 'Internal merge candidate',
    text: 'This should stay in merge review, not the human question queue.'
  };
}

function humanQuestionEntry() {
  return {
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
  };
}

function bucketEntry(outputDir, bucket, bundle) {
  return { bucket, jobId: bundle.jobId, outputDir, bundle };
}

function bundle(jobId, overrides) {
  return {
    jobId,
    taskId: jobId,
    lane: 'runtime',
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'needs-port',
    changedPaths: [],
    ownershipViolations: [],
    evidencePaths: [],
    reasons: [],
    ...overrides
  };
}

function auditBundle({ generatedAt, workspaceProofPath }) {
  return bundle('audit-job', {
    taskId: 'audit-task',
    lane: 'codex-write-policy',
    generatedAt,
    startedAt: generatedAt - 12000,
    finishedAt: generatedAt,
    status: 'failed',
    mergeReadiness: 'blocked',
    disposition: 'blocked',
    changedPaths: ['src/runtime/action.ts', 'src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo', 'dist/index.js'],
    ownershipViolations: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo'],
    evidencePaths: ['evidence.json', workspaceProofPath],
    reasons: ['ownership violations present'],
    metadata: {
      model: 'gpt-5.4-mini',
      contextBudget: contextBudget(),
      ...semanticMetadata('auto-merge-candidate', true, true, 'clean projection'),
      workspacePatchQuarantine: {
        quarantinedChangedPaths: ['src/forbidden.ts', 'frontier-swarm-codex/.cache/tsconfig.tsbuildinfo']
      },
      logSummary: { eventBytes: 2000, eventBytesTruncated: 100, stderrBytes: 300, stderrBytesTruncated: 25 }
    }
  });
}

function dashboardJob(jobId, overrides) {
  return {
    jobId,
    taskId: jobId,
    lane: 'runtime',
    status: 'completed',
    liveness: 'finished',
    mergeReadiness: 'verified-patch',
    disposition: 'needs-port',
    mergeScore: 0.6,
    changedPaths: [],
    ownershipViolations: [],
    sourceOwnershipViolations: [],
    ignoredOwnershipViolations: [],
    staleAgainstHead: false,
    tests: { failed: 0, requiredFailed: 0 },
    evidencePaths: [],
    ...overrides
  };
}

function auditDashboardJob({ generatedAt, workspaceProofPath }) {
  return {
    taskId: 'audit-task',
    lane: 'codex-write-policy',
    model: 'gpt-5.4-mini',
    generatedAt,
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
    tests: { failed: 0, requiredFailed: 0 },
    evidencePaths: ['evidence.json', workspaceProofPath],
    contextBudget: contextBudget(),
    semanticImportQuality: semanticQuality('auto-merge-candidate')
  };
}

function semanticMetadata(status, autoMergeCandidate, cleanEligible, reasons) {
  return {
    semanticEditAdmissionStatus: status,
    semanticEditAdmissionAutoMergeCandidate: autoMergeCandidate,
    semanticEditAdmissionCleanEligible: cleanEligible,
    semanticEditAdmissionReasons: reasons
  };
}

function semanticQuality(status, reason = status) {
  return {
    expected: false,
    warnings: [],
    semanticEditAdmission: {
      status,
      autoMergeCandidate: status === 'auto-merge-candidate',
      cleanEligible: status === 'auto-merge-candidate',
      reasons: [status === 'auto-merge-candidate' ? 'clean projection' : reason]
    },
    semanticEditScript: status === 'stale' ? { stale: 1 } : status === 'needs-port' ? { needsPort: 1 } : { autoMergeCandidates: 1, portable: 1 },
    semanticEditProjection: status === 'auto-merge-candidate' ? { projected: 1, appliedEditCount: 1 } : {},
    semanticEditReplay: status === 'auto-merge-candidate' ? { acceptedClean: 1 } : {}
  };
}

function contextBudget() {
  return {
    status: 'warning',
    measured: { promptBytes: 64000, estimatedInputTokens: 16000 },
    usage: { inputTokens: 28000, cachedInputTokens: 20000, uncachedInputTokens: 8000 },
    warnings: ['actual input tokens 28000 exceeded warning budget 20000'],
    errors: []
  };
}
