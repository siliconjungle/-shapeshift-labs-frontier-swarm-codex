import fs from 'node:fs/promises';
import path from 'node:path';
import { isObject } from './common.js';
import { DASHBOARD_FULL_COLLECTION_MAX_BYTES } from './dashboard-ui-constants.js';
import type { CollectedDashboardSource } from './dashboard-ui-types.js';

export async function readCollectedDashboardSource(cwd: string, value: string | undefined): Promise<CollectedDashboardSource | undefined> {
  if (!value) return undefined;
  const absolute = path.resolve(cwd, value);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (!stat) return undefined;
  const dir = stat.isDirectory() ? absolute : path.dirname(absolute);
  const collectionFile = stat.isDirectory() ? path.join(absolute, 'collection.json') : absolute;
  const collectionStat = await fs.stat(collectionFile).catch(() => undefined);
  if (collectionStat && collectionStat.size <= DASHBOARD_FULL_COLLECTION_MAX_BYTES) return undefined;
  const dashboardSource = await readArtifact<Record<string, unknown>>(cwd, dir, 'coordinator-query.json');
  if (!dashboardSource || !Array.isArray(dashboardSource.json.jobs)) return undefined;
  return { file: dashboardSource.file, dir: dashboardSource.dir, dashboard: dashboardSource.json };
}

export async function readArtifact<T>(cwd: string, value: string | undefined, defaultFile: string): Promise<{ file: string; dir: string; json: T } | undefined> {
  if (!value) return undefined;
  const absolute = path.resolve(cwd, value);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (!stat) return undefined;
  const file = stat.isDirectory() ? path.join(absolute, defaultFile) : absolute;
  const text = await fs.readFile(file, 'utf8').catch(() => undefined);
  if (!text) return undefined;
  const json = JSON.parse(text) as T;
  return { file, dir: stat.isDirectory() ? absolute : path.dirname(file), json };
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {};
}
