import { isObject, nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';

export function nestedObject(source: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  return isObject(source[key]) ? source[key] : undefined;
}

export function jobIds(jobs: Record<string, unknown>[]): string[] {
  return uniqueStrings(jobs.map((job) => String(job.jobId ?? '')).filter(Boolean)).sort();
}

export function incrementCount(out: Record<string, number>, key: string): void {
  out[key] = (out[key] ?? 0) + 1;
}

export function ratio(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10000) / 10000 : 0;
}

export function sumMetric<T>(values: readonly T[], read: (value: T) => number): number {
  return values.reduce((sum, value) => sum + read(value), 0);
}

export function maxMetric<T>(values: readonly T[], read: (value: T) => number): number {
  return Math.max(0, ...values.map(read));
}

export function mergeCountRecords(records: readonly Record<string, number>[]): Record<string, number> {
  return records.reduce<Record<string, number>>((out, record) => {
    for (const [key, value] of Object.entries(record)) out[key] = (out[key] ?? 0) + value;
    return out;
  }, {});
}

export function firstPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    const number = nonNegativeNumber(value);
    if (number > 0) return number;
  }
  return 0;
}

export function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return readStringArray(value);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

export function normalizeMetricKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

export function isNumberRecord(value: unknown): value is Record<string, number> {
  return isObject(value) && Object.values(value).every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

export function testsPassed(job: Record<string, unknown>): boolean {
  const tests = isObject(job.tests) ? job.tests : {};
  return Number(tests.requiredFailed ?? 0) === 0 && Number(tests.failed ?? 0) === 0;
}

export function isGeneratedChangedPath(value: string): boolean {
  const normalized = value.replace(/\\/g, '/');
  return normalized.includes('/.cache/') ||
    normalized.startsWith('.cache/') ||
    normalized.includes('/dist/') ||
    normalized.startsWith('dist/') ||
    normalized.includes('/node_modules/') ||
    normalized.startsWith('node_modules/') ||
    normalized.endsWith('.tsbuildinfo');
}

export function canonicalGeneratedChangedPath(value: string): string | undefined {
  if (!isGeneratedChangedPath(value)) return undefined;
  const normalized = value.replace(/\\/g, '/');
  for (const marker of ['/.cache/', '/dist/', '/node_modules/']) {
    const index = normalized.indexOf(marker);
    if (index >= 0) return normalized.slice(index + 1);
  }
  return normalized;
}
