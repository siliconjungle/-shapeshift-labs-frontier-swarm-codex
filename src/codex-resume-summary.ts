import { isObject } from './common.js';
import type {
  FrontierCodexResumeJob,
  FrontierCodexResumeOverlay
} from './types-resume.js';

export function summarizeResumeJobs(jobs: readonly FrontierCodexResumeJob[]): FrontierCodexResumeOverlay['summary'] {
  const summary = { total: jobs.length, completed: 0, failed: 0, blocked: 0, evidenceOnly: 0, rerunNeeded: 0, resume: 0 };
  for (const job of jobs) {
    if (job.status === 'evidence-only') summary.evidenceOnly += 1;
    else if (job.status === 'rerun-needed') summary.rerunNeeded += 1;
    else summary[job.status] += 1;
    if (job.shouldResume) summary.resume += 1;
  }
  return summary;
}

export function readResumeString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value.toLowerCase() : undefined;
}

export function readResumeObjectArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) as Record<string, unknown>[] : [];
}

export function readResumeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
