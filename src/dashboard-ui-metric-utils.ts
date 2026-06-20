import { uniqueStrings } from './common.js';
import { DASHBOARD_QUALITY_SAMPLE_LIMIT } from './dashboard-ui-constants.js';
import type {
  FrontierCodexDashboardJob,
  FrontierCodexDashboardQualityMetricPoint,
  FrontierCodexDashboardQualityMetricSeries
} from './types-dashboard.js';

export function qualityMetricSeries(
  id: FrontierCodexDashboardQualityMetricSeries['id'],
  label: string,
  total: number,
  points: FrontierCodexDashboardQualityMetricPoint[]
): FrontierCodexDashboardQualityMetricSeries {
  return { id, label, total, points };
}

export function qualityMetricPoint(
  id: string,
  label: string,
  value: number,
  extras: Omit<FrontierCodexDashboardQualityMetricPoint, 'id' | 'label' | 'value'> = {}
): FrontierCodexDashboardQualityMetricPoint {
  return { id, label, value, ...extras };
}

export function recordQualityMetricPoints(prefix: string, counts: Record<string, number>): FrontierCodexDashboardQualityMetricPoint[] {
  return Object.entries(counts)
    .filter((entry) => entry[1] > 0)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([id, value]) => qualityMetricPoint(`${prefix}:${id}`, qualityLabel(id), value));
}

export function qualityLabel(value: string): string {
  return value
    .split(/[-_.:]/g)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

export function sampleJobIds(jobs: readonly FrontierCodexDashboardJob[]): string[] {
  return sampleQualityStrings(jobs.map((job) => job.id));
}

export function sampleQualityStrings(values: readonly string[]): string[] {
  return uniqueStrings(values.filter((value) => value.length > 0)).slice(0, DASHBOARD_QUALITY_SAMPLE_LIMIT);
}

export function mergeNumberRecords(records: readonly Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (Number.isFinite(value)) out[key] = (out[key] ?? 0) + value;
    }
  }
  return out;
}

export function sumNumberRecordValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

export function maxJobMetric(jobs: readonly FrontierCodexDashboardJob[], metric: (job: FrontierCodexDashboardJob) => number): number {
  return Math.max(0, ...jobs.map(metric));
}

export function averageJobMetric(jobs: readonly FrontierCodexDashboardJob[], metric: (job: FrontierCodexDashboardJob) => number): number {
  if (jobs.length === 0) return 0;
  return Math.round(jobs.reduce((sum, job) => sum + metric(job), 0) / jobs.length);
}

export function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}
