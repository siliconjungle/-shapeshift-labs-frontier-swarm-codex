import type { FrontierCodexDashboardJob, FrontierCodexDashboardSnapshot } from './types-dashboard.js';

export function createLaneRows(jobs: readonly FrontierCodexDashboardJob[]): FrontierCodexDashboardSnapshot['lanes'] {
  const rows = new Map<string, FrontierCodexDashboardSnapshot['lanes'][number]>();
  for (const job of jobs) {
    const id = job.lane ?? 'unassigned';
    const row = rows.get(id) ?? { id, jobCount: 0, completedCount: 0, failedCount: 0, runningCount: 0 };
    row.jobCount += 1;
    if (job.status === 'completed') row.completedCount += 1;
    if (job.status === 'failed') row.failedCount += 1;
    if (job.status === 'running') row.runningCount += 1;
    rows.set(id, row);
  }
  return Array.from(rows.values()).sort((left, right) => left.id.localeCompare(right.id));
}
