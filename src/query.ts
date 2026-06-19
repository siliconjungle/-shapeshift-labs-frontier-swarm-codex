import fs from 'node:fs/promises';
import path from 'node:path';
import { FRONTIER_SWARM_CODEX_QUERY_KIND, FRONTIER_SWARM_CODEX_QUERY_VERSION } from './constants.js';
import type { FrontierCodexArtifactRecord } from './index.js';
import { isObject, nonNegativeNumber, pathExists, readStringArray, uniqueStrings } from './common.js';
import { readCodexArtifactRecords } from './artifact-store.js';
import {
  jobSemanticEditAdmission,
  jobSemanticEditProjection,
  jobSemanticEditScript,
  matchesEvidenceSemanticEdit,
  matchesSemanticEdit,
  matchesSemanticEditProjection,
  semanticEditAdmissionSummary,
  semanticEditProjectionSummary,
  semanticEditScriptAdmissionSummary
} from './query-semantic-edit.js';
import {
  evidenceSemanticEditReplay,
  jobSemanticEditReplay,
  matchesSemanticEditReplay,
  semanticEditReplaySummary
} from './query-semantic-edit-replay.js';
import { semanticPatchBundleOverlapJobIds } from './semantic-bundle-overlaps.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export interface FrontierCodexQueryInput {
  collection?: string;
  run?: string;
  q?: string;
  jobId?: string;
  bucket?: string;
  kind?: string;
  pathIncludes?: string;
  symbol?: string;
  tag?: string;
  stale?: boolean;
  semantic?: boolean;
  lineage?: boolean;
  semanticEditStatus?: string;
  semanticEditAdmission?: string;
  semanticEditProjection?: string;
  semanticEditReplay?: string;
  semanticEditReplayStatus?: string;
  semanticEditReplayAdmission?: string;
  semanticEditKey?: string;
  semanticBundleOverlap?: string;
  semanticIdentityHash?: string;
  sourceIdentityHash?: string;
  operationContentHash?: string;
  editContentHash?: string;
  semanticTransformKey?: string;
  semanticTransformIdentityHash?: string;
  semanticTransformContentHash?: string;
  projectionIdentityHash?: string;
  readiness?: string;
  health?: string;
  pressure?: string;
  cleanup?: string;
  ownership?: string;
  semanticReadiness?: string;
  landed?: boolean;
  passedTests?: boolean;
  limit?: number;
  cwd?: string;
}

export async function queryCodexSwarmCollection(input: FrontierCodexQueryInput) {
  const collectionDir = await resolveCollectionDir(input);
  const [artifacts, dashboard, evidenceIndex, collection, compactDashboard] = await Promise.all([
    readCodexArtifactRecords(collectionDir).catch(() => []),
    readJsonIfExists<{ jobs?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'coordinator-query.json')),
    readJsonIfExists<{ entries?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'evidence-index.json')),
    readJsonIfExists<Record<string, unknown>>(path.join(collectionDir, 'collection.json')),
    readJsonIfExists<Record<string, unknown>>(path.join(collectionDir, 'compact-dashboard.json'))
  ]);
  const dashboardRecord = isObject(dashboard) ? dashboard : {};
  const collectionRecord = isObject(collection) ? collection : {};
  const compactDashboardRecord = isObject(compactDashboard) ? compactDashboard : {};
  const landedJobIds = landedJobIdsFromSources(dashboardRecord, collectionRecord, compactDashboardRecord);
  const semanticPatchBundleOverlaps = isObject(dashboardRecord.summary) ? dashboardRecord.summary.semanticPatchBundleOverlaps : undefined;
  const overlapJobIds = semanticPatchBundleOverlapJobIds(semanticPatchBundleOverlaps, input.semanticBundleOverlap);
  const sourceJobs = (Array.isArray(dashboard?.jobs) ? dashboard.jobs : []).filter(isObject);
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

async function resolveCollectionDir(input: Pick<FrontierCodexQueryInput, 'collection' | 'run' | 'cwd'>): Promise<string> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const candidates = [
    input.collection,
    input.run ? path.join(input.run, 'collected') : undefined,
    input.run ? path.join(input.run, 'collection') : undefined,
    input.run
  ].filter((entry): entry is string => !!entry).map((entry) => path.resolve(cwd, entry));
  for (const candidate of candidates) {
    if (
      await pathExists(path.join(candidate, 'coordinator-query.json')) ||
      await pathExists(path.join(candidate, 'artifact-store', 'artifacts.jsonl')) ||
      await pathExists(path.join(candidate, 'artifact-store', 'artifact-index.sqlite')) ||
      await pathExists(path.join(candidate, 'collected-and-indexed.json'))
    ) {
      return candidate;
    }
  }
  throw new Error('query requires --collection <dir> or --run <run-dir> with collected artifacts');
}

function matchesJob(job: Record<string, unknown>, input: FrontierCodexQueryInput, overlapJobIds?: Set<string>, landedJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(job).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || job.jobId === input.jobId)
    && (overlapJobIds === undefined || overlapJobIds.has(String(job.jobId ?? '')))
    && matchesLandedJobId(String(job.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || job.disposition === input.bucket || job.admissionStatus === input.bucket)
    && (input.pathIncludes === undefined || arrayIncludes(job.changedPaths, input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.stale === undefined || Boolean(job.staleAgainstHead) === input.stale)
    && (input.semantic === undefined || Boolean(job.semanticImport) === input.semantic || Boolean(job.semanticImportQuality) === input.semantic)
    && (input.lineage === undefined || jobHasLineage(job) === input.lineage)
    && matchesSemanticEdit(jobSemanticEditScript(job), input, haystack, jobSemanticEditAdmission(job))
    && matchesSemanticEditProjection(jobSemanticEditProjection(job), input, haystack)
    && matchesSemanticEditReplay(jobSemanticEditReplay(job), input, haystack)
    && (input.readiness === undefined || matchesReadiness(job, input.readiness))
    && (input.health === undefined || matchesHealth(job, input.health))
    && (input.pressure === undefined || matchesPressure(job, input.pressure))
    && (input.cleanup === undefined || matchesCleanup(job, input.cleanup))
    && (input.ownership === undefined || matchesOwnership(job, input.ownership))
    && (input.semanticReadiness === undefined || matchesSemanticReadiness(job, input.semanticReadiness))
    && (input.passedTests === undefined || testsPassed(job) === input.passedTests);
}

function matchesArtifact(record: FrontierCodexArtifactRecord, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(record).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || record.jobId === input.jobId)
    && matchesLandedJobId(String(record.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || record.bucket === input.bucket)
    && (input.kind === undefined || record.kind === input.kind)
    && (input.pathIncludes === undefined || record.path.includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || record.tags.includes(input.tag))
    && (input.semantic === undefined || record.tags.includes('semantic-sidecar') === input.semantic)
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && (input.cleanup === undefined || metricTextMatches(haystack, input.cleanup))
    && (input.ownership === undefined || metricTextMatches(haystack, input.ownership))
    && matchesSemanticEdit(artifactSemanticEditScript(record), input, haystack, artifactSemanticEditAdmission(record))
    && matchesSemanticEditProjection(artifactSemanticEditProjection(record), input, haystack)
    && matchesSemanticEditReplay(artifactSemanticEditReplay(record), input, haystack);
}

function matchesEvidence(entry: Record<string, unknown>, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(entry).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || entry.jobId === input.jobId)
    && matchesLandedJobId(String(entry.jobId ?? ''), input, landedJobIds)
    && (input.bucket === undefined || entry.status === input.bucket)
    && (input.kind === undefined || entry.kind === input.kind)
    && (input.pathIncludes === undefined || String(entry.path ?? '').includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || Array.isArray(entry.tags) && entry.tags.includes(input.tag))
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && (input.health === undefined || matchesEvidenceHealth(entry, input.health))
    && (input.pressure === undefined || matchesEvidencePressure(entry, input.pressure))
    && (input.cleanup === undefined || matchesEvidenceCleanup(entry, input.cleanup))
    && (input.ownership === undefined || matchesEvidenceOwnership(entry, input.ownership))
    && (input.semanticReadiness === undefined || matchesEvidenceSemanticReadiness(entry, input.semanticReadiness))
    && matchesEvidenceSemanticEdit(entry, input, haystack)
    && matchesSemanticEditReplay(evidenceSemanticEditReplay(entry), input, haystack);
}

function matchesText(haystack: string, input: FrontierCodexQueryInput): boolean {
  return input.q === undefined || haystack.includes(input.q.toLowerCase());
}

function metricTextMatches(haystack: string, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  return haystack.includes(wanted) || haystack.includes(value.toLowerCase());
}

function testsPassed(job: Record<string, unknown>): boolean {
  const tests = isObject(job.tests) ? job.tests : {};
  return Number(tests.requiredFailed ?? 0) === 0 && Number(tests.failed ?? 0) === 0;
}

function jobHasLineage(job: Record<string, unknown>): boolean {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  return Number(quality.semanticLineageEvents ?? 0) > 0 ||
    Number(quality.semanticLineageMoved ?? 0) > 0 ||
    Number(quality.semanticLineageRenamed ?? 0) > 0 ||
    Number(quality.semanticLineageDeleted ?? 0) > 0;
}

function textHasLineage(haystack: string): boolean {
  return haystack.includes('semanticlineage') || haystack.includes('lineageinference');
}

function matchesReadiness(job: Record<string, unknown>, value: string): boolean {
  const readiness = value.toLowerCase();
  if (readiness === 'ready-to-port') return job.disposition === 'needs-port' || job.mergeReadiness === 'verified-patch';
  if (readiness === 'ready-to-apply') return job.disposition === 'auto-mergeable' || job.admissionStatus === 'ready-to-apply';
  if (readiness === 'stale') return Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head';
  if (readiness === 'discovery-only') return job.mergeReadiness === 'discovery-only' || job.disposition === 'discovery-only';
  if (readiness === 'blocked') return job.status === 'blocked' || job.mergeReadiness === 'blocked' || job.disposition === 'blocked';
  if (readiness === 'evidence-only') return job.mergeReadiness === 'evidence-only' || job.disposition === 'evidence-only';
  return JSON.stringify(job).toLowerCase().includes(readiness);
}

function queryHealthSummary(jobs: Record<string, unknown>[]) {
  const statusCounts = jobs.reduce<Record<string, number>>((out, job) => {
    incrementCount(out, jobHealth(job));
    return out;
  }, {});
  const readyToApplyJobs = jobs.filter((job) => job.disposition === 'auto-mergeable' || job.admissionStatus === 'ready-to-apply');
  const terminalJobs = jobs.filter((job) => job.liveness === 'finished' || ['completed', 'failed', 'blocked'].includes(String(job.status ?? '')));
  const failedJobs = jobs.filter((job) => jobHealth(job) === 'failed');
  const blockedJobs = jobs.filter((job) => jobHealth(job) === 'blocked');
  const warningJobs = jobs.filter((job) => jobHealth(job) === 'warning');
  const runningJobs = jobs.filter((job) => jobHealth(job) === 'running');
  return {
    status: aggregateHealthStatus(statusCounts, jobs.length),
    jobCount: jobs.length,
    statusCounts,
    healthyJobCount: statusCounts.healthy ?? 0,
    warningJobCount: warningJobs.length,
    failedJobCount: failedJobs.length,
    blockedJobCount: blockedJobs.length,
    runningJobCount: runningJobs.length,
    unknownJobCount: statusCounts.unknown ?? 0,
    readyToApplyJobCount: readyToApplyJobs.length,
    needsHumanPortJobCount: jobs.filter((job) => job.disposition === 'needs-port').length,
    staleJobCount: jobs.filter((job) => Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head').length,
    failedEvidenceJobCount: jobs.filter((job) => job.disposition === 'failed-evidence').length,
    testsFailedJobCount: jobs.filter((job) => !testsPassed(job)).length,
    contextWarningJobCount: jobs.filter((job) => jobContextBudget(job).status === 'warning').length,
    contextFailedJobCount: jobs.filter((job) => jobContextBudget(job).status === 'failed').length,
    semanticBlockedJobCount: jobs.filter((job) => jobSemanticReadinessStatus(job) === 'blocked').length,
    terminalJobCount: terminalJobs.length,
    completionRatio: ratio(terminalJobs.length, jobs.length),
    failureRatio: ratio(failedJobs.length + blockedJobs.length, jobs.length),
    warningJobIds: jobIds(warningJobs),
    failedJobIds: jobIds(failedJobs),
    blockedJobIds: jobIds(blockedJobs),
    runningJobIds: jobIds(runningJobs)
  };
}

function queryLandedSummary(
  jobs: Record<string, unknown>[],
  landedJobIds: Set<string>,
  dashboard: Record<string, unknown>,
  collection: Record<string, unknown>,
  compactDashboard: Record<string, unknown>
) {
  const ledger = applyLedgerFromSources(dashboard, collection, compactDashboard);
  const matchedJobIds = jobIds(jobs);
  const landedMatchedJobIds = matchedJobIds.filter((jobId) => landedJobIds.has(jobId));
  const failedJobIds = uniqueStrings([
    ...readStringArray(ledger?.failedJobIds),
    ...readStringArray(nestedObject(collection, 'summary')?.failedJobIds)
  ]);
  const total = firstPositiveNumber(ledger?.total, nestedObject(collection, 'summary')?.total, matchedJobIds.length);
  const collectionJobCount = firstPositiveNumber(nestedObject(collection, 'summary')?.total, nestedObject(dashboard, 'summary')?.jobCount, matchedJobIds.length);
  const landed = firstPositiveNumber(ledger?.landed, compactDashboard.landedCount, landedJobIds.size);
  return {
    total,
    collectionJobCount,
    landed,
    applied: nonNegativeNumber(ledger?.applied),
    committed: nonNegativeNumber(ledger?.committed),
    skipped: nonNegativeNumber(ledger?.skipped),
    failed: nonNegativeNumber(ledger?.failed),
    landedRatio: ratio(landed, total),
    collectionLandedRatio: ratio(landed, collectionJobCount),
    matchedJobCount: matchedJobIds.length,
    matchedLandedJobCount: landedMatchedJobIds.length,
    matchedUnlandedJobCount: Math.max(0, matchedJobIds.length - landedMatchedJobIds.length),
    matchedLandedRatio: ratio(landedMatchedJobIds.length, matchedJobIds.length),
    landedJobIds: Array.from(landedJobIds).sort(),
    matchedLandedJobIds: landedMatchedJobIds,
    failedJobIds
  };
}

function queryPressureSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const budgets = jobs.map((job) => jobContextBudget(job));
  const contextBudgets = budgets.filter((budget) => budget.hasBudget);
  const contextWarningBudgets = budgets.filter((budget) => budget.status === 'warning' || budget.warnings.length > 0);
  const contextFailedBudgets = budgets.filter((budget) => budget.status === 'failed' || budget.errors.length > 0);
  const generatedAt = jobs.map((job) => nonNegativeNumber(job.generatedAt)).filter((value) => value > 0);
  const evidenceBudgets = evidenceRows.map((entry) => evidenceContextBudget(entry)).filter((budget) => budget.hasBudget);
  const actualInputTokens = sumMetric(budgets, (budget) => budget.actualInputTokens);
  const cachedInputTokens = sumMetric(budgets, (budget) => budget.cachedInputTokens);
  const uncachedInputTokens = sumMetric(budgets, (budget) => budget.uncachedInputTokens);
  return {
    jobCount: jobs.length,
    contextBudgetJobCount: contextBudgets.length,
    contextWarningJobCount: contextWarningBudgets.length,
    contextFailedJobCount: contextFailedBudgets.length,
    actualUsageJobCount: budgets.filter((budget) => budget.actualInputTokens > 0).length,
    tokenTotals: {
      promptBytes: sumMetric(budgets, (budget) => budget.promptBytes),
      estimatedInputTokens: sumMetric(budgets, (budget) => budget.estimatedInputTokens),
      actualInputTokens,
      cachedInputTokens,
      uncachedInputTokens,
      outputTokens: sumMetric(budgets, (budget) => budget.outputTokens),
      cacheHitRatio: ratio(cachedInputTokens, actualInputTokens),
      uncachedRatio: ratio(uncachedInputTokens, actualInputTokens)
    },
    tokenMax: {
      promptBytes: maxMetric(budgets, (budget) => budget.promptBytes),
      estimatedInputTokens: maxMetric(budgets, (budget) => budget.estimatedInputTokens),
      actualInputTokens: maxMetric(budgets, (budget) => budget.actualInputTokens),
      cachedInputTokens: maxMetric(budgets, (budget) => budget.cachedInputTokens),
      uncachedInputTokens: maxMetric(budgets, (budget) => budget.uncachedInputTokens),
      outputTokens: maxMetric(budgets, (budget) => budget.outputTokens)
    },
    time: {
      runningJobCount: jobs.filter((job) => job.liveness === 'running' || job.status === 'running').length,
      finishedJobCount: jobs.filter((job) => job.liveness === 'finished' || job.status === 'completed').length,
      generatedAtCount: generatedAt.length,
      ...(generatedAt.length ? { oldestGeneratedAt: Math.min(...generatedAt), newestGeneratedAt: Math.max(...generatedAt), generatedAtSpanMs: Math.max(...generatedAt) - Math.min(...generatedAt) } : {})
    },
    evidence: {
      contextBudgetEntryCount: evidenceBudgets.length,
      contextWarningEntryCount: evidenceBudgets.filter((budget) => budget.status === 'warning' || budget.warnings.length > 0).length,
      contextFailedEntryCount: evidenceBudgets.filter((budget) => budget.status === 'failed' || budget.errors.length > 0).length,
      actualUsageEntryCount: evidenceBudgets.filter((budget) => budget.actualInputTokens > 0).length
    },
    warnings: uniqueStrings(budgets.flatMap((budget) => budget.warnings)),
    errors: uniqueStrings(budgets.flatMap((budget) => budget.errors))
  };
}

function querySemanticReadinessSummary(jobs: Record<string, unknown>[]) {
  const statusCounts = jobs.reduce<Record<string, number>>((out, job) => {
    incrementCount(out, jobSemanticReadinessStatus(job));
    return out;
  }, {});
  const qualities = jobs.map((job) => isObject(job.semanticImportQuality) ? job.semanticImportQuality : {});
  return {
    jobCount: jobs.length,
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    cleanJobCount: statusCounts.clean ?? 0,
    candidateJobCount: statusCounts.candidate ?? 0,
    reviewRequiredJobCount: statusCounts['review-required'] ?? 0,
    needsPortJobCount: statusCounts['needs-port'] ?? 0,
    staleJobCount: statusCounts.stale ?? 0,
    blockedJobCount: statusCounts.blocked ?? 0,
    unknownJobCount: statusCounts.unknown ?? 0,
    expectedSatisfiedJobCount: qualities.filter((quality) => quality.expected === true && quality.expectedSatisfied === true).length,
    expectedUnsatisfiedJobCount: qualities.filter((quality) => quality.expected === true && quality.expectedSatisfied === false).length,
    universalAstReadyJobCount: qualities.filter((quality) => nonNegativeNumber(quality.universalAstLayers) > 0).length,
    proofSpecReadyJobCount: qualities.filter((quality) => nonNegativeNumber(quality.proofSpecObligations) > 0 && nonNegativeNumber(quality.proofSpecFailedObligations) === 0).length,
    lineageReviewJobCount: qualities.filter((quality) => nonNegativeNumber(quality.semanticLineageNeedsReview) > 0).length,
    warningJobCount: qualities.filter((quality) => readStringArray(quality.warnings).length > 0).length,
    warnings: uniqueStrings(qualities.flatMap((quality) => readStringArray(quality.warnings))),
    reasonCodes: uniqueStrings(qualities.flatMap((quality) => readStringArray(quality.semanticLineageReasonCodes)))
  };
}

function queryCleanupSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const signals = jobs.map((job) => jobCleanupSignal(job));
  const evidenceSignals = evidenceRows.map((entry) => evidenceCleanupSignal(entry));
  const statusCounts = signals.reduce<Record<string, number>>((out, signal) => {
    incrementCount(out, signal.status);
    return out;
  }, {});
  return {
    jobCount: jobs.length,
    status: aggregateCleanupStatus(statusCounts, jobs.length),
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    cleanupJobCount: signals.filter((signal) => signal.status !== 'clean').length,
    ignoredChangedPathJobCount: signals.filter((signal) => signal.ignoredChangedPathCount > 0).length,
    ignoredChangedPathCount: sumMetric(signals, (signal) => signal.ignoredChangedPathCount),
    generatedChangedPathJobCount: signals.filter((signal) => signal.generatedChangedPathCount > 0).length,
    generatedChangedPathCount: sumMetric(signals, (signal) => signal.generatedChangedPathCount),
    quarantinedJobCount: signals.filter((signal) => signal.quarantinedChangedPathCount > 0).length,
    quarantinedChangedPathCount: sumMetric(signals, (signal) => signal.quarantinedChangedPathCount),
    observedChangedPathCount: sumMetric(signals, (signal) => signal.observedChangedPathCount),
    reportedChangedPathCount: sumMetric(signals, (signal) => signal.reportedChangedPathCount),
    evidenceCleanupEntryCount: evidenceSignals.filter((signal) => signal.status !== 'clean').length,
    evidenceQuarantinedEntryCount: evidenceSignals.filter((signal) => signal.quarantinedChangedPathCount > 0).length,
    ignoredChangedPathReasonCounts: mergeCountRecords(signals.map((signal) => signal.ignoredChangedPathReasonCounts)),
    jobIds: jobIds(jobs.filter((job) => jobCleanupSignal(job).status !== 'clean')),
    quarantinedJobIds: jobIds(jobs.filter((job) => jobCleanupSignal(job).quarantinedChangedPathCount > 0))
  };
}

function queryOwnershipSummary(jobs: Record<string, unknown>[], evidenceRows: Record<string, unknown>[]) {
  const signals = jobs.map((job) => jobOwnershipSignal(job));
  const evidenceSignals = evidenceRows.map((entry) => evidenceOwnershipSignal(entry));
  const statusCounts = signals.reduce<Record<string, number>>((out, signal) => {
    incrementCount(out, signal.status);
    return out;
  }, {});
  return {
    jobCount: jobs.length,
    status: aggregateOwnershipStatus(statusCounts, jobs.length),
    statusCounts,
    statuses: Object.keys(statusCounts).sort(),
    violationJobCount: signals.filter((signal) => signal.violationCount > 0).length,
    violationCount: sumMetric(signals, (signal) => signal.violationCount),
    sourceViolationJobCount: signals.filter((signal) => signal.sourceViolationCount > 0).length,
    sourceViolationCount: sumMetric(signals, (signal) => signal.sourceViolationCount),
    ignoredViolationJobCount: signals.filter((signal) => signal.ignoredViolationCount > 0).length,
    ignoredViolationCount: sumMetric(signals, (signal) => signal.ignoredViolationCount),
    strictWriteIsolationFailedJobCount: signals.filter((signal) => signal.sourceViolationCount > 0).length,
    evidenceViolationEntryCount: evidenceSignals.filter((signal) => signal.violationCount > 0).length,
    evidenceSourceViolationEntryCount: evidenceSignals.filter((signal) => signal.sourceViolationCount > 0).length,
    jobIds: jobIds(jobs.filter((job) => jobOwnershipSignal(job).violationCount > 0)),
    sourceViolationJobIds: jobIds(jobs.filter((job) => jobOwnershipSignal(job).sourceViolationCount > 0))
  };
}

function queryableCounts(
  jobs: Record<string, unknown>[],
  evidenceRows: Record<string, unknown>[],
  landedJobIds: Set<string>,
  dashboard: Record<string, unknown>,
  collection: Record<string, unknown>,
  compactDashboard: Record<string, unknown>
) {
  return {
    runHealth: queryHealthSummary(jobs),
    landed: queryLandedSummary(jobs, landedJobIds, dashboard, collection, compactDashboard),
    context: queryPressureSummary(jobs, evidenceRows),
    semantic: {
      readiness: querySemanticReadinessSummary(jobs),
      editAdmission: semanticEditAdmissionSummary(jobs),
      editProjection: semanticEditProjectionSummary(jobs),
      editReplay: semanticEditReplaySummary(jobs),
      editScriptAdmission: semanticEditScriptAdmissionSummary(jobs)
    },
    cleanup: queryCleanupSummary(jobs, evidenceRows),
    ownership: queryOwnershipSummary(jobs, evidenceRows)
  };
}

function matchesHealth(job: Record<string, unknown>, value: string): boolean {
  return healthMatches(jobHealth(job), value);
}

function matchesEvidenceHealth(entry: Record<string, unknown>, value: string): boolean {
  return healthMatches(evidenceHealth(entry), value);
}

function matchesPressure(job: Record<string, unknown>, value: string): boolean {
  return pressureMatches(jobContextBudget(job), job, value);
}

function matchesEvidencePressure(entry: Record<string, unknown>, value: string): boolean {
  return pressureMatches(evidenceContextBudget(entry), entry, value);
}

function matchesCleanup(job: Record<string, unknown>, value: string): boolean {
  return cleanupMatches(jobCleanupSignal(job), value);
}

function matchesEvidenceCleanup(entry: Record<string, unknown>, value: string): boolean {
  return cleanupMatches(evidenceCleanupSignal(entry), value);
}

function matchesOwnership(job: Record<string, unknown>, value: string): boolean {
  return ownershipMatches(jobOwnershipSignal(job), value);
}

function matchesEvidenceOwnership(entry: Record<string, unknown>, value: string): boolean {
  return ownershipMatches(evidenceOwnershipSignal(entry), value);
}

function matchesSemanticReadiness(job: Record<string, unknown>, value: string): boolean {
  return semanticReadinessMatches(jobSemanticReadinessStatus(job), value);
}

function matchesEvidenceSemanticReadiness(entry: Record<string, unknown>, value: string): boolean {
  return semanticReadinessMatches(evidenceSemanticReadinessStatus(entry), value);
}

function matchesLandedJobId(jobId: string, input: FrontierCodexQueryInput, landedJobIds?: Set<string>): boolean {
  if (input.landed === undefined) return true;
  if (!jobId) return input.landed === false;
  return Boolean(landedJobIds?.has(jobId)) === input.landed;
}

type QueryHealthStatus = 'healthy' | 'warning' | 'failed' | 'blocked' | 'running' | 'unknown';
type QuerySemanticReadinessStatus = 'clean' | 'candidate' | 'review-required' | 'needs-port' | 'stale' | 'blocked' | 'unknown';
type QueryCleanupStatus = 'clean' | 'ignored' | 'generated' | 'quarantined';
type QueryOwnershipStatus = 'clean' | 'ignored' | 'violation';

interface QueryContextBudget {
  status?: string;
  warnings: string[];
  errors: string[];
  promptBytes: number;
  estimatedInputTokens: number;
  actualInputTokens: number;
  cachedInputTokens: number;
  uncachedInputTokens: number;
  outputTokens: number;
  hasBudget: boolean;
}

interface QueryCleanupSignal {
  status: QueryCleanupStatus;
  ignoredChangedPathCount: number;
  generatedChangedPathCount: number;
  quarantinedChangedPathCount: number;
  observedChangedPathCount: number;
  reportedChangedPathCount: number;
  ignoredChangedPathReasonCounts: Record<string, number>;
}

interface QueryOwnershipSignal {
  status: QueryOwnershipStatus;
  violationCount: number;
  sourceViolationCount: number;
  ignoredViolationCount: number;
}

function jobHealth(job: Record<string, unknown>): QueryHealthStatus {
  const status = String(job.status ?? '').toLowerCase();
  const liveness = String(job.liveness ?? '').toLowerCase();
  const disposition = String(job.disposition ?? '').toLowerCase();
  const contextBudget = jobContextBudget(job);
  if (status === 'running' || liveness === 'running') return 'running';
  if (status === 'failed' || disposition === 'failed-evidence' || disposition === 'rejected') return 'failed';
  if (status === 'blocked' || disposition === 'blocked' || job.mergeReadiness === 'blocked') return 'blocked';
  if (!testsPassed(job) || contextBudget.status === 'failed' || contextBudget.errors.length > 0 || readStringArray(job.ownershipViolations).length > 0) return 'failed';
  if (
    contextBudget.status === 'warning' ||
    contextBudget.warnings.length > 0 ||
    disposition === 'needs-port' ||
    disposition === 'stale-against-head' ||
    Boolean(job.staleAgainstHead) ||
    ['blocked', 'needs-port', 'stale', 'review-required'].includes(jobSemanticReadinessStatus(job))
  ) return 'warning';
  if (status || liveness) return 'healthy';
  return 'unknown';
}

function evidenceHealth(entry: Record<string, unknown>): QueryHealthStatus {
  const status = String(entry.status ?? '').toLowerCase();
  const budget = evidenceContextBudget(entry);
  if (status === 'failed-evidence' || budget.status === 'failed' || budget.errors.length > 0) return 'failed';
  if (status === 'blocked') return 'blocked';
  if (status === 'needs-human-port' || status === 'stale-against-head' || budget.status === 'warning' || budget.warnings.length > 0) return 'warning';
  if (status) return 'healthy';
  return 'unknown';
}

function aggregateHealthStatus(statusCounts: Record<string, number>, total: number): QueryHealthStatus {
  if ((statusCounts.failed ?? 0) > 0) return 'failed';
  if ((statusCounts.blocked ?? 0) > 0) return 'blocked';
  if ((statusCounts.warning ?? 0) > 0) return 'warning';
  if ((statusCounts.running ?? 0) > 0) return 'running';
  if ((statusCounts.unknown ?? 0) === total && total > 0) return 'unknown';
  return 'healthy';
}

function healthMatches(actual: QueryHealthStatus, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === actual) return true;
  if (wanted === 'ok') return actual === 'healthy';
  if (wanted === 'warn') return actual === 'warning';
  if (wanted === 'failure') return actual === 'failed';
  if (wanted === 'unhealthy' || wanted === 'attention') return actual === 'warning' || actual === 'failed' || actual === 'blocked';
  return false;
}

function pressureMatches(budget: QueryContextBudget, job: Record<string, unknown>, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  const warning = budget.status === 'warning' || budget.warnings.length > 0;
  const failed = budget.status === 'failed' || budget.errors.length > 0;
  if (wanted === 'context') return budget.hasBudget;
  if (wanted === 'context-warning' || wanted === 'warning' || wanted === 'warn') return warning;
  if (wanted === 'context-failed' || wanted === 'failed' || wanted === 'failure') return failed;
  if (wanted === 'token' || wanted === 'tokens' || wanted === 'actual-usage') return budget.actualInputTokens > 0 || budget.estimatedInputTokens > 0;
  if (wanted === 'uncached') return budget.uncachedInputTokens > 0;
  if (wanted === 'prompt') return budget.promptBytes > 0;
  if (wanted === 'high') return warning || failed || budget.uncachedInputTokens > 0;
  if (wanted === 'time' || wanted === 'running') return job.liveness === 'running' || job.status === 'running';
  if (wanted === 'none') return !budget.hasBudget && job.liveness !== 'running' && job.status !== 'running';
  return warning && budget.warnings.some((entry) => normalizeMetricKey(entry).includes(wanted));
}

function semanticReadinessMatches(actual: QuerySemanticReadinessStatus, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === actual) return true;
  if (wanted === 'ready') return actual === 'clean' || actual === 'candidate';
  if (wanted === 'attention') return actual === 'review-required' || actual === 'needs-port' || actual === 'stale' || actual === 'blocked';
  if (wanted === 'review') return actual === 'review-required';
  return false;
}

function cleanupMatches(signal: QueryCleanupSignal, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === signal.status) return true;
  if (wanted === 'attention' || wanted === 'cleanup' || wanted === 'cleanup-needed') return signal.status !== 'clean';
  if (wanted === 'ignored-changed-paths' || wanted === 'ignored-paths') return signal.ignoredChangedPathCount > 0;
  if (wanted === 'generated-changed-paths' || wanted === 'generated-paths' || wanted === 'build-output') return signal.generatedChangedPathCount > 0;
  if (wanted === 'quarantine' || wanted === 'quarantined-changes') return signal.quarantinedChangedPathCount > 0;
  if (wanted === 'observed') return signal.observedChangedPathCount > 0;
  if (wanted === 'reported') return signal.reportedChangedPathCount > 0;
  return false;
}

function ownershipMatches(signal: QueryOwnershipSignal, value: string): boolean {
  const wanted = normalizeMetricKey(value);
  if (wanted === signal.status) return true;
  if (wanted === 'attention' || wanted === 'violation' || wanted === 'violations') return signal.violationCount > 0;
  if (wanted === 'source' || wanted === 'source-violation' || wanted === 'source-violations' || wanted === 'strict-write-isolation') return signal.sourceViolationCount > 0;
  if (wanted === 'ignored' || wanted === 'ignored-violation' || wanted === 'ignored-violations') return signal.ignoredViolationCount > 0;
  return false;
}

function aggregateCleanupStatus(statusCounts: Record<string, number>, total: number): QueryCleanupStatus {
  if ((statusCounts.quarantined ?? 0) > 0) return 'quarantined';
  if ((statusCounts.generated ?? 0) > 0) return 'generated';
  if ((statusCounts.ignored ?? 0) > 0) return 'ignored';
  if (total > 0) return 'clean';
  return 'clean';
}

function aggregateOwnershipStatus(statusCounts: Record<string, number>, total: number): QueryOwnershipStatus {
  if ((statusCounts.violation ?? 0) > 0) return 'violation';
  if ((statusCounts.ignored ?? 0) > 0) return 'ignored';
  if (total > 0) return 'clean';
  return 'clean';
}

function jobSemanticReadinessStatus(job: Record<string, unknown>): QuerySemanticReadinessStatus {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const admission = isObject(jobSemanticEditAdmission(job)) ? jobSemanticEditAdmission(job) as Record<string, unknown> : {};
  const script = isObject(jobSemanticEditScript(job)) ? jobSemanticEditScript(job) as Record<string, unknown> : {};
  const projection = isObject(jobSemanticEditProjection(job)) ? jobSemanticEditProjection(job) as Record<string, unknown> : {};
  const replay = isObject(jobSemanticEditReplay(job)) ? jobSemanticEditReplay(job) as Record<string, unknown> : {};
  if (Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head' || nonNegativeNumber(replay.stale) > 0 || nonNegativeNumber(script.stale) > 0) return 'stale';
  if (
    quality.expected === true && quality.expectedSatisfied === false ||
    nonNegativeNumber(quality.proofSpecFailedObligations) > 0 ||
    nonNegativeNumber(replay.conflicts) > 0 ||
    nonNegativeNumber(script.conflicts) > 0 ||
    nonNegativeNumber(replay.blocked) > 0 ||
    nonNegativeNumber(script.blocked) > 0 ||
    nonNegativeNumber(projection.blocked) > 0 ||
    String(admission.status ?? '').includes('blocked')
  ) return 'blocked';
  if (job.disposition === 'needs-port' || nonNegativeNumber(replay.needsPort) > 0 || nonNegativeNumber(script.needsPort) > 0) return 'needs-port';
  if (admission.cleanEligible === true || nonNegativeNumber(replay.acceptedClean) > 0) return 'clean';
  if (admission.autoMergeCandidate === true || nonNegativeNumber(script.autoMergeCandidates) > 0 || nonNegativeNumber(script.portable) > 0 || nonNegativeNumber(script.autoApplyCandidates) > 0) return 'candidate';
  if (typeof admission.status === 'string' || readStringArray(quality.warnings).length > 0) return 'review-required';
  return 'unknown';
}

function evidenceSemanticReadinessStatus(entry: Record<string, unknown>): QuerySemanticReadinessStatus {
  const facets = isObject(entry.facets) ? entry.facets : {};
  if (facets.staleAgainstHead === true || entry.status === 'stale-against-head' || nonNegativeNumber(facets.semanticEditReplayStale) > 0) return 'stale';
  if (
    facets.semanticExpected === true && facets.semanticExpectedSatisfied === false ||
    nonNegativeNumber(facets.proofSpecFailedObligations) > 0 ||
    nonNegativeNumber(facets.semanticEditReplayConflicts) > 0 ||
    nonNegativeNumber(facets.semanticEditReplayBlocked) > 0 ||
    nonNegativeNumber(facets.semanticEditProjectionBlocked) > 0
  ) return 'blocked';
  if (entry.status === 'needs-human-port' || nonNegativeNumber(facets.semanticEditReplayNeedsPort) > 0 || nonNegativeNumber(facets.semanticEditScriptNeedsPort) > 0) return 'needs-port';
  if (facets.semanticEditAdmissionCleanEligible === true || String(facets.semanticEditAdmissionCleanEligible) === 'true' || nonNegativeNumber(facets.semanticEditReplayAcceptedClean) > 0) return 'clean';
  if (facets.semanticEditAdmissionAutoMergeCandidate === true || String(facets.semanticEditAdmissionAutoMergeCandidate) === 'true' || nonNegativeNumber(facets.semanticEditScriptAutoMergeCandidates) > 0) return 'candidate';
  if (typeof facets.semanticEditAdmissionStatus === 'string' || nonNegativeNumber(facets.semanticWarningCount) > 0) return 'review-required';
  return 'unknown';
}

function jobContextBudget(job: Record<string, unknown>): QueryContextBudget {
  const budget = isObject(job.contextBudget) ? job.contextBudget : {};
  const measured = isObject(budget.measured) ? budget.measured : {};
  const usage = isObject(budget.usage) ? budget.usage : {};
  const actualInputTokens = nonNegativeNumber(usage.inputTokens) || nonNegativeNumber(measured.actualInputTokens);
  const cachedInputTokens = nonNegativeNumber(usage.cachedInputTokens);
  const uncachedInputTokens = nonNegativeNumber(usage.uncachedInputTokens) || Math.max(0, actualInputTokens - cachedInputTokens);
  return {
    status: typeof budget.status === 'string' ? budget.status : undefined,
    warnings: stringList(budget.warnings),
    errors: stringList(budget.errors),
    promptBytes: nonNegativeNumber(measured.promptBytes),
    estimatedInputTokens: nonNegativeNumber(measured.estimatedInputTokens),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: nonNegativeNumber(usage.outputTokens),
    hasBudget: isObject(job.contextBudget)
  };
}

function evidenceContextBudget(entry: Record<string, unknown>): QueryContextBudget {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const actualInputTokens = nonNegativeNumber(facets.contextBudgetActualInputTokens);
  const cachedInputTokens = nonNegativeNumber(facets.contextBudgetCachedInputTokens);
  const uncachedInputTokens = nonNegativeNumber(facets.contextBudgetUncachedInputTokens) || Math.max(0, actualInputTokens - cachedInputTokens);
  return {
    status: typeof facets.contextBudgetStatus === 'string' ? facets.contextBudgetStatus : undefined,
    warnings: stringList(facets.contextBudgetWarnings),
    errors: stringList(facets.contextBudgetErrors),
    promptBytes: nonNegativeNumber(facets.contextBudgetPromptBytes),
    estimatedInputTokens: nonNegativeNumber(facets.contextBudgetEstimatedInputTokens),
    actualInputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens: 0,
    hasBudget: hasEvidenceContextBudget(facets)
  };
}

function jobCleanupSignal(job: Record<string, unknown>): QueryCleanupSignal {
  const metadata = isObject(job.metadata) ? job.metadata : {};
  const quarantine = isObject(metadata.workspacePatchQuarantine) ? metadata.workspacePatchQuarantine : {};
  const changedPaths = readStringArray(job.changedPaths);
  const ignoredPaths = uniqueStrings([
    ...readStringArray(job.ignoredChangedPaths),
    ...readStringArray(job.ignoredChangedPathSamples)
  ]);
  const quarantinedPaths = uniqueStrings([
    ...readStringArray(job.quarantinedChangedPaths),
    ...readStringArray(quarantine.quarantinedChangedPaths)
  ]);
  const generatedPaths = uniqueStrings([...changedPaths, ...ignoredPaths, ...quarantinedPaths]
    .map(canonicalGeneratedChangedPath)
    .filter((entry): entry is string => Boolean(entry)));
  const ignoredChangedPathCount = nonNegativeNumber(job.ignoredChangedPathCount) || ignoredPaths.length;
  const quarantinedChangedPathCount = nonNegativeNumber(job.quarantinedChangedPathCount) || quarantinedPaths.length;
  const generatedChangedPathCount = Math.max(nonNegativeNumber(job.generatedChangedPathCount), generatedPaths.length);
  return {
    status: quarantinedChangedPathCount > 0 ? 'quarantined' : generatedChangedPathCount > 0 ? 'generated' : ignoredChangedPathCount > 0 ? 'ignored' : 'clean',
    ignoredChangedPathCount,
    generatedChangedPathCount,
    quarantinedChangedPathCount,
    observedChangedPathCount: nonNegativeNumber(job.observedChangedPathCount),
    reportedChangedPathCount: nonNegativeNumber(job.reportedChangedPathCount),
    ignoredChangedPathReasonCounts: isNumberRecord(job.ignoredChangedPathReasonCounts) ? job.ignoredChangedPathReasonCounts : {}
  };
}

function evidenceCleanupSignal(entry: Record<string, unknown>): QueryCleanupSignal {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const ignoredChangedPathCount = nonNegativeNumber(facets.ignoredChangedPathCount);
  const generatedChangedPathCount = nonNegativeNumber(facets.generatedChangedPathCount);
  const quarantinedChangedPathCount = nonNegativeNumber(facets.quarantinedChangedPathCount);
  return {
    status: quarantinedChangedPathCount > 0 ? 'quarantined' : generatedChangedPathCount > 0 ? 'generated' : ignoredChangedPathCount > 0 ? 'ignored' : 'clean',
    ignoredChangedPathCount,
    generatedChangedPathCount,
    quarantinedChangedPathCount,
    observedChangedPathCount: nonNegativeNumber(facets.observedChangedPathCount),
    reportedChangedPathCount: nonNegativeNumber(facets.reportedChangedPathCount),
    ignoredChangedPathReasonCounts: isNumberRecord(facets.ignoredChangedPathReasonCounts) ? facets.ignoredChangedPathReasonCounts : {}
  };
}

function jobOwnershipSignal(job: Record<string, unknown>): QueryOwnershipSignal {
  const ownershipViolations = readStringArray(job.ownershipViolations);
  const sourceOwnershipViolations = readStringArray(job.sourceOwnershipViolations);
  const ignoredOwnershipViolations = readStringArray(job.ignoredOwnershipViolations);
  const ignoredViolationCount = nonNegativeNumber(job.ignoredOwnershipViolationCount) || ignoredOwnershipViolations.length;
  const violationCount = nonNegativeNumber(job.ownershipViolationCount) || ownershipViolations.length || sourceOwnershipViolations.length + ignoredViolationCount;
  const sourceViolationCount = nonNegativeNumber(job.sourceOwnershipViolationCount) || sourceOwnershipViolations.length || Math.max(0, violationCount - ignoredViolationCount);
  return {
    status: sourceViolationCount > 0 ? 'violation' : ignoredViolationCount > 0 ? 'ignored' : 'clean',
    violationCount,
    sourceViolationCount,
    ignoredViolationCount
  };
}

function evidenceOwnershipSignal(entry: Record<string, unknown>): QueryOwnershipSignal {
  const facets = isObject(entry.facets) ? entry.facets : {};
  const ignoredViolationCount = nonNegativeNumber(facets.ignoredOwnershipViolationCount);
  const violationCount = nonNegativeNumber(facets.ownershipViolationCount);
  const sourceViolationCount = nonNegativeNumber(facets.sourceOwnershipViolationCount) || Math.max(0, violationCount - ignoredViolationCount);
  return {
    status: sourceViolationCount > 0 ? 'violation' : ignoredViolationCount > 0 ? 'ignored' : 'clean',
    violationCount,
    sourceViolationCount,
    ignoredViolationCount
  };
}

function hasEvidenceContextBudget(facets: Record<string, unknown>): boolean {
  return Boolean(facets.contextBudgetStatus) ||
    Boolean(facets.contextBudgetWarnings) ||
    Boolean(facets.contextBudgetErrors) ||
    nonNegativeNumber(facets.contextBudgetPromptBytes) > 0 ||
    nonNegativeNumber(facets.contextBudgetEstimatedInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetActualInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetCachedInputTokens) > 0 ||
    nonNegativeNumber(facets.contextBudgetUncachedInputTokens) > 0;
}

function landedJobIdsFromSources(...sources: Record<string, unknown>[]): Set<string> {
  const values: string[] = [];
  for (const source of sources) {
    const summary = nestedObject(source, 'summary');
    const ledger = applyLedgerFromSource(source);
    values.push(
      ...readStringArray(source.landedJobIds),
      ...readStringArray(summary?.landedJobIds),
      ...readStringArray(ledger?.landedJobIds),
      ...readStringArray(ledger?.appliedJobIds),
      ...readStringArray(ledger?.committedJobIds)
    );
  }
  return new Set(uniqueStrings(values));
}

function applyLedgerFromSources(...sources: Record<string, unknown>[]): Record<string, unknown> | undefined {
  for (const source of sources) {
    const ledger = applyLedgerFromSource(source);
    if (ledger) return ledger;
  }
  return undefined;
}

function applyLedgerFromSource(source: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isObject(source.applyLedger)) return source.applyLedger;
  const summary = nestedObject(source, 'summary');
  if (isObject(summary?.applyLedger)) return summary.applyLedger;
  const metadata = nestedObject(source, 'metadata');
  if (isObject(metadata?.applyLedger)) return metadata.applyLedger;
  return undefined;
}

function nestedObject(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  return isObject(source[key]) ? source[key] : undefined;
}

function jobIds(jobs: Record<string, unknown>[]): string[] {
  return uniqueStrings(jobs.map((job) => String(job.jobId ?? '')).filter(Boolean)).sort();
}

function incrementCount(out: Record<string, number>, key: string): void {
  out[key] = (out[key] ?? 0) + 1;
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10000) / 10000 : 0;
}

function sumMetric<T>(values: readonly T[], read: (value: T) => number): number {
  return values.reduce((sum, value) => sum + read(value), 0);
}

function maxMetric<T>(values: readonly T[], read: (value: T) => number): number {
  return Math.max(0, ...values.map(read));
}

function mergeCountRecords(records: readonly Record<string, number>[]): Record<string, number> {
  return records.reduce<Record<string, number>>((out, record) => {
    for (const [key, value] of Object.entries(record)) out[key] = (out[key] ?? 0) + value;
    return out;
  }, {});
}

function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const number = nonNegativeNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return readStringArray(value);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function normalizeMetricKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function isGeneratedChangedPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return normalized.includes('/.cache/') ||
    normalized.startsWith('.cache/') ||
    normalized.includes('/dist/') ||
    normalized.startsWith('dist/') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/') ||
    normalized.endsWith('.tsbuildinfo');
}

function canonicalGeneratedChangedPath(value: string): string | undefined {
  if (!isGeneratedChangedPath(value)) return undefined;
  const normalized = value.replace(/\\/g, '/');
  for (const marker of ['/.cache/', '/dist/', '/node_modules/']) {
    const index = normalized.indexOf(marker);
    if (index >= 0) return normalized.slice(index + 1);
  }
  return normalized;
}

function artifactSemanticEditScript(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditScript ?? semanticEdit.script;
}

function artifactSemanticEditAdmission(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditAdmission ?? semanticEdit.admission;
}

function artifactSemanticEditProjection(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditProjection ?? semanticEdit.projection;
}

function artifactSemanticEditReplay(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditReplay ?? semanticEdit.replay;
}

function arrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.includes(needle));
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!await pathExists(file)) return undefined;
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

async function writeMaybe(args: CliArgs, result: unknown): Promise<void> {
  const out = stringArg(args.out ?? args.outFile ?? args['out-file']);
  if (out) await fs.writeFile(path.resolve(process.cwd(), out), JSON.stringify(result, null, 2) + '\n');
}

function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolArg(value: CliValue | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}
