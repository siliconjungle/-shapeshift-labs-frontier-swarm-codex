import fs from 'node:fs/promises';
import path from 'node:path';
import { isObject, pathExists, stableHash } from './common.js';
import type { FrontierCodexSwarmRunOptions } from './types-run.js';

export const FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE = 'model-telemetry.jsonl';
export const FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE = 'model-telemetry-summary.json';
export const FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE = 'human-actions.jsonl';
export const FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE = 'human-actions-state.json';

export interface FrontierCodexRuntimeProjectionPaths {
  modelTelemetryPath?: string;
  modelTelemetrySummaryPath?: string;
  humanActionEventsPath?: string;
  humanActionStatePath?: string;
}

const appendQueues = new Map<string, Promise<void>>();

export function resolveCodexRuntimeProjectionPaths(
  options: FrontierCodexSwarmRunOptions,
  outDir: string
): FrontierCodexRuntimeProjectionPaths {
  return {
    modelTelemetryPath: resolveProjectionPath(options.cwd, outDir, options.modelTelemetryPath, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_EVENTS_FILE),
    modelTelemetrySummaryPath: resolveProjectionPath(options.cwd, outDir, options.modelTelemetrySummaryPath, FRONTIER_SWARM_CODEX_MODEL_TELEMETRY_SUMMARY_FILE),
    humanActionEventsPath: resolveProjectionPath(options.cwd, outDir, options.humanActionEventsPath, FRONTIER_SWARM_CODEX_HUMAN_ACTION_EVENTS_FILE),
    humanActionStatePath: resolveProjectionPath(options.cwd, outDir, options.humanActionStatePath, FRONTIER_SWARM_CODEX_HUMAN_ACTION_STATE_FILE)
  };
}

export async function initCodexRuntimeProjectionStores(paths: FrontierCodexRuntimeProjectionPaths): Promise<void> {
  await Promise.all([
    paths.modelTelemetryPath ? initJsonl(paths.modelTelemetryPath) : undefined,
    paths.humanActionEventsPath ? initJsonl(paths.humanActionEventsPath) : undefined
  ]);
}

export async function appendJsonlQueued(file: string, value: unknown): Promise<void> {
  const absolute = path.resolve(file);
  const previous = appendQueues.get(absolute) ?? Promise.resolve();
  let next: Promise<void>;
  next = previous
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.appendFile(absolute, JSON.stringify(value) + '\n');
    })
    .finally(() => {
      if (appendQueues.get(absolute) === next) appendQueues.delete(absolute);
    });
  appendQueues.set(absolute, next);
  return next;
}

export async function readJsonl(file: string): Promise<unknown[]> {
  if (!await pathExists(file)) return [];
  const text = await fs.readFile(file, 'utf8');
  return text.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export function humanActionsFromResult(result: { metadata?: unknown }): Record<string, unknown>[] {
  const metadata = isObject(result.metadata) ? result.metadata : {};
  return Array.isArray(metadata.humanActions) ? metadata.humanActions.filter(isObject) : [];
}

export function humanActionIsOpen(action: Record<string, unknown>): boolean {
  const status = normalizedStatus(action.status);
  if (['answered', 'resolved', 'dismissed', 'cancelled', 'canceled', 'closed'].includes(status)) return false;
  return !stringValue(action.answer) && !stringValue(action.resolution) && optionalNumberValue(action.answeredAt) === undefined && optionalNumberValue(action.resolvedAt) === undefined;
}

export function normalizedStatus(value: unknown): string {
  return stringValue(value)?.toLowerCase() ?? 'open';
}

export function stableActionKey(action: Record<string, unknown>): string {
  return stringValue(action.code) ?? stringValue(action.id) ?? stableHash(action);
}

export function countBy(values: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function numberValue(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function optionalNumberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function roundUsd(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function resolveProjectionPath(cwd: string | undefined, outDir: string, value: string | false | undefined, defaultName: string): string | undefined {
  if (value === false) return undefined;
  if (typeof value === 'string' && value.trim()) return path.resolve(cwd ?? process.cwd(), value);
  return path.join(outDir, defaultName);
}

async function initJsonl(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, '');
}
