import { DASHBOARD_TIME_SERIES_BUCKET_MS } from './dashboard-ui-constants.js';
import {
  hasDashboardCostSignal,
  hasDashboardContextLoad,
  hasDashboardLogVolume,
  isDashboardBlockedJob,
  isDashboardFailureJob,
  isDashboardTerminalJob
} from './dashboard-ui-health.js';
import { averageJobMetric, maxJobMetric } from './dashboard-ui-metric-utils.js';
import { roundDashboardUsd, timestampValue } from './dashboard-ui-values.js';
import type {
  FrontierCodexDashboardJob,
  FrontierCodexDashboardTimeSeries,
  FrontierCodexDashboardTimeSeriesPoint
} from './types-dashboard.js';
import type { FrontierCodexSwarmRunResult } from './types-run.js';

export function createDashboardTimeSeries(
  run: FrontierCodexSwarmRunResult | undefined,
  jobs: readonly FrontierCodexDashboardJob[]
): FrontierCodexDashboardTimeSeries {
  const points = new Map<number, FrontierCodexDashboardTimeSeriesPoint>();
  const bucketMs = DASHBOARD_TIME_SERIES_BUCKET_MS;
  let missingTimestampJobCount = 0;
  for (const event of run?.run.events ?? []) {
    const at = timestampValue(event.at);
    if (at !== undefined) pointForTimeSeriesBucket(points, at, bucketMs).eventCount += 1;
  }
  for (const job of jobs) {
    const hasContextLoad = hasDashboardContextLoad(job);
    const hasLogVolume = hasDashboardLogVolume(job);
    const terminal = isDashboardTerminalJob(job);
    if (!terminal && !hasContextLoad && !hasLogVolume) continue;
    const at = dashboardJobTimeSeriesTimestamp(job);
    if (at === undefined) {
      missingTimestampJobCount += 1;
      continue;
    }
    addJobToPoint(pointForTimeSeriesBucket(points, at, bucketMs), job, terminal);
  }
  const sortedPoints = Array.from(points.values()).sort((left, right) => left.at - right.at);
  for (const point of sortedPoints) point.jobIds.sort();
  const contextLoadJobs = jobs.filter(hasDashboardContextLoad);
  const logVolumeJobs = jobs.filter(hasDashboardLogVolume);
  const durationJobs = jobs.filter((job) => job.durationMs > 0);
  return {
    bucketMs,
    summary: {
      pointCount: sortedPoints.length,
      eventCount: sumPoints(sortedPoints, 'eventCount'),
      terminalJobCount: sumPoints(sortedPoints, 'terminalJobCount'),
      failureJobCount: sumPoints(sortedPoints, 'failureJobCount'),
      blockedJobCount: sumPoints(sortedPoints, 'blockedJobCount'),
      runningJobCount: sumPoints(sortedPoints, 'runningJobCount'),
      warningJobCount: sumPoints(sortedPoints, 'warningJobCount'),
      semanticCleanJobCount: sumPoints(sortedPoints, 'semanticCleanJobCount'),
      semanticCandidateJobCount: sumPoints(sortedPoints, 'semanticCandidateJobCount'),
      semanticBlockedJobCount: sumPoints(sortedPoints, 'semanticBlockedJobCount'),
      contextLoadJobCount: contextLoadJobs.length,
      logVolumeJobCount: logVolumeJobs.length,
      missingTimestampJobCount,
      ...(sortedPoints[0] ? { earliestAt: sortedPoints[0].at } : {}),
      ...(sortedPoints[sortedPoints.length - 1] ? { latestAt: sortedPoints[sortedPoints.length - 1].at } : {}),
      promptBytes: sumPoints(sortedPoints, 'promptBytes'),
      estimatedInputTokens: sumPoints(sortedPoints, 'estimatedInputTokens'),
      actualInputTokens: sumPoints(sortedPoints, 'actualInputTokens'),
      cachedInputTokens: sumPoints(sortedPoints, 'cachedInputTokens'),
      uncachedInputTokens: sumPoints(sortedPoints, 'uncachedInputTokens'),
      outputTokens: sumPoints(sortedPoints, 'outputTokens'),
      billableInputTokens: sumPoints(sortedPoints, 'billableInputTokens'),
      priceKnownJobCount: sumPoints(sortedPoints, 'priceKnownJobCount'),
      unknownPriceJobCount: sumPoints(sortedPoints, 'unknownPriceJobCount'),
      inputOnlyCostJobCount: sumPoints(sortedPoints, 'inputOnlyCostJobCount'),
      estimatedInputCostJobCount: sumPoints(sortedPoints, 'estimatedInputCostJobCount'),
      estimatedCostUsd: roundDashboardUsd(sumPoints(sortedPoints, 'estimatedCostUsd')),
      estimatedInputCostUsd: roundDashboardUsd(sumPoints(sortedPoints, 'estimatedInputCostUsd')),
      estimatedOutputCostUsd: roundDashboardUsd(sumPoints(sortedPoints, 'estimatedOutputCostUsd')),
      estimatedCostMicroUsd: sumPoints(sortedPoints, 'estimatedCostMicroUsd'),
      durationMs: sumPoints(sortedPoints, 'durationMs'),
      averageDurationMs: averageJobMetric(durationJobs, (job) => job.durationMs),
      maxDurationMs: maxJobMetric(durationJobs, (job) => job.durationMs),
      eventBytes: sumPoints(sortedPoints, 'eventBytes'),
      eventBytesTruncated: sumPoints(sortedPoints, 'eventBytesTruncated'),
      stderrBytes: sumPoints(sortedPoints, 'stderrBytes'),
      stderrBytesTruncated: sumPoints(sortedPoints, 'stderrBytesTruncated'),
      logBytes: sumPoints(sortedPoints, 'logBytes'),
      logBytesTruncated: sumPoints(sortedPoints, 'logBytesTruncated')
    },
    points: sortedPoints
  };
}

export function dashboardJobTimeSeriesTimestamp(job: FrontierCodexDashboardJob): number | undefined {
  return timestampValue(job.finishedAt) ?? timestampValue(job.generatedAt) ?? timestampValue(job.startedAt);
}

export function dashboardDurationMs(startedAt: number | undefined, finishedAt: number | undefined): number {
  if (startedAt === undefined || finishedAt === undefined || finishedAt < startedAt) return 0;
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function addJobToPoint(point: FrontierCodexDashboardTimeSeriesPoint, job: FrontierCodexDashboardJob, terminal: boolean): void {
  if (terminal) point.terminalJobCount += 1;
  if (isDashboardFailureJob(job)) point.failureJobCount += 1;
  if (isDashboardBlockedJob(job)) point.blockedJobCount += 1;
  if (job.health === 'running') point.runningJobCount += 1;
  if (job.health === 'warning') point.warningJobCount += 1;
  if (job.semanticReadiness === 'clean') point.semanticCleanJobCount += 1;
  if (job.semanticReadiness === 'candidate') point.semanticCandidateJobCount += 1;
  if (job.semanticReadiness === 'blocked') point.semanticBlockedJobCount += 1;
  addJobTokenAndCostMetrics(point, job);
  point.durationMs += job.durationMs;
  point.averageDurationMs = point.terminalJobCount > 0 ? Math.round(point.durationMs / point.terminalJobCount) : 0;
  point.eventBytes += job.eventBytes;
  point.eventBytesTruncated += job.eventBytesTruncated;
  point.stderrBytes += job.stderrBytes;
  point.stderrBytesTruncated += job.stderrBytesTruncated;
  point.logBytes += job.eventBytes + job.stderrBytes;
  point.logBytesTruncated += job.eventBytesTruncated + job.stderrBytesTruncated;
  if (!point.jobIds.includes(job.id)) point.jobIds.push(job.id);
}

function addJobTokenAndCostMetrics(point: FrontierCodexDashboardTimeSeriesPoint, job: FrontierCodexDashboardJob): void {
  point.promptBytes += job.promptBytes;
  point.estimatedInputTokens += job.estimatedInputTokens;
  point.actualInputTokens += job.actualInputTokens;
  point.cachedInputTokens += job.cachedInputTokens;
  point.uncachedInputTokens += job.uncachedInputTokens;
  point.outputTokens += job.outputTokens;
  point.billableInputTokens += job.billableInputTokens;
  const hasCostSignal = hasDashboardCostSignal(job);
  if (hasCostSignal) {
    if (job.priceKnown) point.priceKnownJobCount += 1;
    else point.unknownPriceJobCount += 1;
  }
  if (hasCostSignal && job.costEstimateInputOnly) point.inputOnlyCostJobCount += 1;
  if (hasCostSignal && job.costEstimateEstimatedInput) point.estimatedInputCostJobCount += 1;
  point.estimatedCostUsd = roundDashboardUsd(point.estimatedCostUsd + job.estimatedCostUsd);
  point.estimatedInputCostUsd = roundDashboardUsd(point.estimatedInputCostUsd + job.estimatedInputCostUsd);
  point.estimatedOutputCostUsd = roundDashboardUsd(point.estimatedOutputCostUsd + job.estimatedOutputCostUsd);
  point.estimatedCostMicroUsd += job.estimatedCostMicroUsd;
}

function pointForTimeSeriesBucket(points: Map<number, FrontierCodexDashboardTimeSeriesPoint>, at: number, bucketMs: number): FrontierCodexDashboardTimeSeriesPoint {
  const bucketAt = Math.floor(at / bucketMs) * bucketMs;
  const existing = points.get(bucketAt);
  if (existing) return existing;
  const point = emptyPoint(bucketAt);
  points.set(bucketAt, point);
  return point;
}

function emptyPoint(bucketAt: number): FrontierCodexDashboardTimeSeriesPoint {
  return {
    at: bucketAt,
    label: new Date(bucketAt).toISOString(),
    eventCount: 0,
    terminalJobCount: 0,
    failureJobCount: 0,
    blockedJobCount: 0,
    runningJobCount: 0,
    warningJobCount: 0,
    semanticCleanJobCount: 0,
    semanticCandidateJobCount: 0,
    semanticBlockedJobCount: 0,
    promptBytes: 0,
    estimatedInputTokens: 0,
    actualInputTokens: 0,
    cachedInputTokens: 0,
    uncachedInputTokens: 0,
    outputTokens: 0,
    billableInputTokens: 0,
    priceKnownJobCount: 0,
    unknownPriceJobCount: 0,
    inputOnlyCostJobCount: 0,
    estimatedInputCostJobCount: 0,
    estimatedCostUsd: 0,
    estimatedInputCostUsd: 0,
    estimatedOutputCostUsd: 0,
    estimatedCostMicroUsd: 0,
    durationMs: 0,
    averageDurationMs: 0,
    eventBytes: 0,
    eventBytesTruncated: 0,
    stderrBytes: 0,
    stderrBytesTruncated: 0,
    logBytes: 0,
    logBytesTruncated: 0,
    jobIds: []
  };
}

function sumPoints(points: readonly FrontierCodexDashboardTimeSeriesPoint[], key: keyof FrontierCodexDashboardTimeSeriesPoint): number {
  return points.reduce((sum, point) => sum + Number(point[key] ?? 0), 0);
}
