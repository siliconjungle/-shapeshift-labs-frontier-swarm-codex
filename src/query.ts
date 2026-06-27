import path from 'node:path';
import { FRONTIER_SWARM_CODEX_QUERY_KIND, FRONTIER_SWARM_CODEX_QUERY_VERSION } from './constants.js';
import { isObject, uniqueStrings } from './common.js';
import { readCodexArtifactRecords } from './artifact-store.js';
import {
  kernelSemanticMergeSummary,
  safeMergeApplyDecisionSummary,
  semanticEditAdmissionSummary,
  semanticEditProjectionSummary,
  semanticEditScriptAdmissionSummary,
  semanticMergeAdmissionSummary
} from './query-semantic-edit.js';
import { semanticEditReplaySummary } from './query-semantic-edit-replay.js';
import { semanticPatchBundleOverlapJobIds } from './semantic-bundle-overlaps.js';
import { resolveCollectionDir, readJsonIfExists, writeMaybe, stringArg, numberArg, optionalBoolArg } from './query-io.js';
import { landedJobIdsFromSources, queryLandedSummary } from './query-landed.js';
import { matchesArtifact, matchesEvidence, matchesJob } from './query-matchers.js';
import {
  FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE,
  codexProofParentApplyCandidateJobRows,
  projectCodexProofParentApplyCandidates
} from './proof-parent-apply-candidates.js';
import {
  queryCleanupSummary,
  queryHealthSummary,
  queryOwnershipSummary,
  queryPressureSummary,
  querySemanticReadinessSummary,
  queryableCounts
} from './query-summaries.js';
import type { CliArgs, FrontierCodexQueryInput } from './query-types.js';
import type { FrontierCodexProofParentApplyCandidates } from './proof-parent-apply-candidates.js';

export type { CliArgs, CliValue, FrontierCodexQueryInput } from './query-types.js';

export async function queryCodexSwarmCollection(input: FrontierCodexQueryInput) {
  const collectionDir = await resolveCollectionDir(input);
  const [artifacts, dashboard, evidenceIndex, collection, compactDashboard, proofParentApplyCandidates] = await Promise.all([
    readCodexArtifactRecords(collectionDir).catch(() => []),
    readJsonIfExists<{ jobs?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'coordinator-query.json')),
    readJsonIfExists<{ entries?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'evidence-index.json')),
    readJsonIfExists<Record<string, unknown>>(path.join(collectionDir, 'collection.json')),
    readJsonIfExists<Record<string, unknown>>(path.join(collectionDir, 'compact-dashboard.json')),
    readJsonIfExists<FrontierCodexProofParentApplyCandidates>(path.join(collectionDir, FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_APPLY_CANDIDATES_FILE))
  ]);
  const dashboardRecord = isObject(dashboard) ? dashboard : {};
  const collectionRecord = isObject(collection) ? collection : {};
  const compactDashboardRecord = isObject(compactDashboard) ? compactDashboard : {};
  const landedJobIds = landedJobIdsFromSources(dashboardRecord, collectionRecord, compactDashboardRecord);
  const semanticPatchBundleOverlaps = isObject(dashboardRecord.summary) ? dashboardRecord.summary.semanticPatchBundleOverlaps : undefined;
  const overlapJobIds = semanticPatchBundleOverlapJobIds(semanticPatchBundleOverlaps, input.semanticBundleOverlap);
  const proofParentApplyCandidateProjection = projectCodexProofParentApplyCandidates(proofParentApplyCandidates);
  const sourceJobs = [
    ...(Array.isArray(dashboard?.jobs) ? dashboard.jobs : []).filter(isObject),
    ...codexProofParentApplyCandidateJobRows(proofParentApplyCandidates)
  ];
  const sourceEvidenceRows = (Array.isArray(evidenceIndex?.entries) ? evidenceIndex.entries : []).filter(isObject);
  const jobs = sourceJobs
    .filter((job) => matchesJob(job, input, overlapJobIds, landedJobIds))
    .slice(0, input.limit ?? 50);
  const artifactRows = artifacts.filter((record) => matchesArtifact(record, input, landedJobIds)).slice(0, input.limit ?? 100);
  const evidenceRows = sourceEvidenceRows
    .filter((entry) => matchesEvidence(entry, input, landedJobIds))
    .slice(0, input.limit ?? 100);
  const context = queryPressureSummary(jobs, evidenceRows);
  return {
    kind: FRONTIER_SWARM_CODEX_QUERY_KIND,
    version: FRONTIER_SWARM_CODEX_QUERY_VERSION,
    ok: true,
    collectionDir,
    query: input,
    summary: {
      jobs: jobs.length,
      artifacts: artifactRows.length,
      evidence: evidenceRows.length,
      touchedPaths: uniqueStrings(jobs.flatMap((job) => Array.isArray(job.changedPaths) ? job.changedPaths.filter((entry): entry is string => typeof entry === 'string') : [])),
      semanticEditAdmission: semanticEditAdmissionSummary(jobs),
      kernelSemanticMerge: kernelSemanticMergeSummary(jobs),
      semanticMergeAdmission: semanticMergeAdmissionSummary(jobs),
      safeMergeApplyDecision: safeMergeApplyDecisionSummary(jobs),
      semanticEditProjection: semanticEditProjectionSummary(jobs),
      semanticEditReplay: semanticEditReplaySummary(jobs),
      semanticEditScriptAdmission: semanticEditScriptAdmissionSummary(jobs),
      health: queryHealthSummary(jobs),
      landed: queryLandedSummary(jobs, landedJobIds, dashboardRecord, collectionRecord, compactDashboardRecord),
      context,
      pressure: context,
      semanticReadiness: querySemanticReadinessSummary(jobs),
      cleanup: queryCleanupSummary(jobs, evidenceRows),
      ownership: queryOwnershipSummary(jobs, evidenceRows),
      proofParentApplyCandidates: proofParentApplyCandidateProjection.summary,
      queryable: queryableCounts(sourceJobs, sourceEvidenceRows, landedJobIds, dashboardRecord, collectionRecord, compactDashboardRecord),
      semanticPatchBundleOverlaps
    },
    jobs,
    artifacts: artifactRows,
    evidence: evidenceRows
  };
}

export async function handleCodexQueryCommand(args: CliArgs): Promise<void> {
  const result = await queryCodexSwarmCollection({
    cwd: process.cwd(),
    collection: stringArg(args.collection),
    run: stringArg(args.run),
    q: stringArg(args.q ?? args.query),
    jobId: stringArg(args.job ?? args.jobId ?? args['job-id']),
    bucket: stringArg(args.bucket),
    kind: stringArg(args.kind),
    pathIncludes: stringArg(args.path ?? args['path-includes']),
    symbol: stringArg(args.symbol ?? args.function ?? args['function']),
    tag: stringArg(args.tag),
    stale: optionalBoolArg(args.stale),
    semantic: optionalBoolArg(args.semantic),
    lineage: optionalBoolArg(args.lineage ?? args['semantic-lineage']),
    semanticEditStatus: stringArg(args.semanticEditStatus ?? args['semantic-edit-status']),
    semanticEditAdmission: stringArg(args.semanticEditAdmission ?? args['semantic-edit-admission']),
    semanticEditProjection: stringArg(args.semanticEditProjection ?? args['semantic-edit-projection']),
    semanticMergeAdmission: stringArg(args.semanticMergeAdmission ?? args['semantic-merge-admission'] ?? args.kernelSafeMergeAdmission ?? args['kernel-safe-merge-admission'] ?? args.kernelSafeMergeStatus ?? args['kernel-safe-merge-status'] ?? args.safeMergeAdmission ?? args['safe-merge-admission']),
    safeMergeApplyDecision: stringArg(args.safeMergeApplyDecision ?? args['safe-merge-apply-decision'] ?? args.jsTsSafeMergeApplyDecision ?? args['js-ts-safe-merge-apply-decision'] ?? args.semanticMergeDecision ?? args['semantic-merge-decision'] ?? args.semanticApplyDecision ?? args['semantic-apply-decision']),
    semanticMergeDecision: stringArg(args.semanticMergeDecision ?? args['semantic-merge-decision'] ?? args.semanticApplyDecision ?? args['semantic-apply-decision']),
    semanticEditReplay: stringArg(args.semanticEditReplay ?? args['semantic-edit-replay']),
    semanticEditReplayStatus: stringArg(args.semanticEditReplayStatus ?? args['semantic-edit-replay-status']),
    semanticEditReplayAdmission: stringArg(args.semanticEditReplayAdmission ?? args['semantic-edit-replay-admission']),
    semanticEditKey: stringArg(args.semanticEditKey ?? args['semantic-edit-key'] ?? args.semanticKey ?? args['semantic-key']),
    semanticBundleOverlap: stringArg(args.semanticBundleOverlap ?? args['semantic-bundle-overlap'] ?? args.semanticPatchBundleOverlap ?? args['semantic-patch-bundle-overlap']),
    semanticIdentityHash: stringArg(args.semanticIdentityHash ?? args['semantic-identity-hash'] ?? args['semantic-edit-identity-hash']),
    sourceIdentityHash: stringArg(args.sourceIdentityHash ?? args['source-identity-hash'] ?? args['semantic-source-identity-hash']),
    operationContentHash: stringArg(args.operationContentHash ?? args['operation-content-hash'] ?? args['semantic-operation-content-hash']),
    editContentHash: stringArg(args.editContentHash ?? args['edit-content-hash'] ?? args['semantic-edit-content-hash']),
    semanticTransformKey: stringArg(args.semanticTransformKey ?? args['semantic-transform-key']),
    semanticTransformIdentityHash: stringArg(args.semanticTransformIdentityHash ?? args['semantic-transform-identity-hash']),
    semanticTransformContentHash: stringArg(args.semanticTransformContentHash ?? args['semantic-transform-content-hash']),
    projectionIdentityHash: stringArg(args.projectionIdentityHash ?? args['projection-identity-hash']),
    readiness: stringArg(args.readiness ?? args.view),
    health: stringArg(args.health),
    pressure: stringArg(args.pressure ?? args.contextPressure ?? args['context-pressure'] ?? args.tokenPressure ?? args['token-pressure'] ?? args.timePressure ?? args['time-pressure']),
    cleanup: stringArg(args.cleanup),
    ownership: stringArg(args.ownership ?? args.writeIsolation ?? args['write-isolation']),
    semanticReadiness: stringArg(args.semanticReadiness ?? args['semantic-readiness']),
    landed: optionalBoolArg(args.landed),
    passedTests: optionalBoolArg(args.passedTests ?? args['passed-tests']),
    limit: numberArg(args.limit)
  });
  await writeMaybe(args, result);
  console.log(JSON.stringify(result, null, 2));
}
