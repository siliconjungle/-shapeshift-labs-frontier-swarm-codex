import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexWorkspaceIgnoredChangedPathReasonCode } from './types-workspace.js';


export function uniqueStrings(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}


export function arrayOfObjects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) as Record<string, unknown>[] : [];
}


export function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}


export function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}


export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}


export function normalizeWorkspacePath(value: string): string | undefined {
  const clean = value.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('\0') || clean.includes('*') || path.isAbsolute(clean)) return undefined;
  const normalized = path.normalize(clean).replace(/\\/g, '/');
  if (normalized === '.' || normalized.startsWith('..') || path.isAbsolute(normalized)) return undefined;
  return normalized;
}


export function uniqueWorkspacePaths(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeWorkspacePath(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}


export function pathHasIgnoredSegment(file: string, segments: readonly string[]): boolean {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.some((part) => segments.includes(part));
}


const WORKSPACE_NOISE_SUFFIX_REASONS: Array<{ suffix: string; reasonCode: FrontierCodexWorkspaceIgnoredChangedPathReasonCode }> = [
  { suffix: '.tsbuildinfo', reasonCode: 'tsbuildinfo' }
];

const WORKSPACE_NOISE_FILE_REASONS: Array<{ name: string; reasonCode: FrontierCodexWorkspaceIgnoredChangedPathReasonCode }> = [
  { name: '.eslintcache', reasonCode: 'cache' },
  { name: '.stylelintcache', reasonCode: 'cache' }
];

const WORKSPACE_NOISE_SEGMENT_REASONS: Array<{ segment: string; reasonCode: FrontierCodexWorkspaceIgnoredChangedPathReasonCode }> = [
  { segment: '.git', reasonCode: 'git_metadata' },
  { segment: '.cache', reasonCode: 'cache' },
  { segment: '.turbo', reasonCode: 'cache' },
  { segment: '.vite', reasonCode: 'cache' },
  { segment: '.parcel-cache', reasonCode: 'cache' },
  { segment: '.next', reasonCode: 'build_output' },
  { segment: '.nuxt', reasonCode: 'build_output' },
  { segment: '.svelte-kit', reasonCode: 'build_output' },
  { segment: 'node_modules', reasonCode: 'node_modules' },
  { segment: 'dist', reasonCode: 'build_output' },
  { segment: 'build', reasonCode: 'build_output' },
  { segment: 'coverage', reasonCode: 'coverage' },
  { segment: '.frontier-framework', reasonCode: 'frontier_framework' },
  { segment: '.loom', reasonCode: 'generated_setup' },
  { segment: 'agent-runs', reasonCode: 'agent_runs' },
  { segment: 'target', reasonCode: 'build_output' }
];

export function getWorkspaceNoisePathReason(file: string): FrontierCodexWorkspaceIgnoredChangedPathReasonCode | undefined {
  const normalized = String(file ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return undefined;
  for (const entry of WORKSPACE_NOISE_SUFFIX_REASONS) {
    if (normalized.endsWith(entry.suffix)) return entry.reasonCode;
  }
  const parts = normalized.split('/').filter(Boolean);
  const name = parts[parts.length - 1];
  const fileReason = WORKSPACE_NOISE_FILE_REASONS.find((entry) => entry.name === name);
  if (fileReason) return fileReason.reasonCode;
  return WORKSPACE_NOISE_SEGMENT_REASONS.find((entry) => pathHasIgnoredSegment(normalized, [entry.segment]))?.reasonCode;
}


export function isWorkspaceNoisePath(file: string): boolean {
  return !!getWorkspaceNoisePathReason(file);
}


export function shouldPruneWorkspaceWriteFenceTraversal(file: string): boolean {
  return pathHasIgnoredSegment(file, ['node_modules', 'agent-runs']);
}


export async function copyWorkspacePath(cwd: string, workspacePath: string, include: string, excludes: readonly string[]): Promise<void> {
  const relative = normalizeWorkspacePath(include);
  if (!relative) return;
  const from = path.resolve(cwd, relative);
  const to = path.resolve(workspacePath, relative);
  if (!await pathExists(from)) return;
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.cp(from, to, {
    recursive: true,
    force: true,
    filter: (source: string) => !isExcluded(cwd, source, excludes)
  });
}


export function isExcluded(cwd: string, source: string, excludes: readonly string[]): boolean {
  const relative = path.relative(cwd, source).replace(/\\/g, '/');
  return excludes.some((exclude) => workspacePathMatches(relative, exclude));
}


export function workspacePathMatches(file: string, entry: string): boolean {
  const prefix = normalizeWorkspacePath(entry);
  if (!prefix) return false;
  if (file === prefix || file.startsWith(prefix + '/')) return true;
  return !prefix.includes('/') && pathHasIgnoredSegment(file, [prefix]);
}


export async function readOptionalText(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return undefined;
  }
}


export async function runProcess(command: string, args: readonly string[], options: { cwd: string; allowFailure?: boolean }): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('close', (status: number | null) => {
      const result = { status: status ?? 1, stdout, stderr };
      if (!options.allowFailure && result.status !== 0) reject(new Error(stderr || stdout || `${command} failed`));
      else resolve(result);
    });
    child.on('error', (error: Error) => {
      if (options.allowFailure) resolve({ status: 1, stdout, stderr: String(error) });
      else reject(error);
    });
  });
}


export function tail(text: string, maxLines = 24): string[] {
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-maxLines);
}


export function stableHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
}


export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}


function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const object = value as Record<string, unknown>;
  return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + stableStringify(object[key])).join(',') + '}';
}


export function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = nonNegativeNumber(entry);
  }
  return result;
}


export function nonNegativeNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}


export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(tmp, file);
}


export async function findFilesByName(root: string, name: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'collected' || entry.name === 'node_modules' || entry.name === '.git') continue;
        await walk(absolute);
      } else if (entry.isFile() && entry.name === name) {
        out.push(absolute);
      }
    }
  }
  await walk(root);
  return out;
}


export function resolveBundlePatchPath(bundle: FrontierSwarmMergeBundle, mergePath: string): string | undefined {
  if (!bundle.patchPath) return undefined;
  return path.isAbsolute(bundle.patchPath) ? bundle.patchPath : path.resolve(path.dirname(mergePath), bundle.patchPath);
}


export function firstNonEmptyLine(text: string): string | undefined {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}
