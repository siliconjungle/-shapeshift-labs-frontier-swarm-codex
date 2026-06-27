import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists } from './common.js';
import type { CliArgs, CliValue, FrontierCodexQueryInput } from './query-types.js';

const PROOF_PARENT_APPLY_CANDIDATES_FILE = 'proof-parent-apply-candidates.json';
const CONTINUATION_FILE = 'continuation.json';

export async function resolveCollectionDir(input: Pick<FrontierCodexQueryInput, 'collection' | 'run' | 'continuation' | 'cwd'>): Promise<string> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const continuationCollectionDir = await resolveContinuationProofParentApplyCandidateCollection({ cwd, continuation: input.continuation });
  const candidates = [
    input.collection,
    continuationCollectionDir,
    input.run ? path.join(input.run, 'collected') : undefined,
    input.run ? path.join(input.run, 'collection') : undefined,
    input.run
  ].filter((entry): entry is string => !!entry).map((entry) => path.resolve(cwd, entry));
  for (const candidate of candidates) {
    if (
      await pathExists(path.join(candidate, 'coordinator-query.json')) ||
      await pathExists(path.join(candidate, 'artifact-store', 'artifacts.jsonl')) ||
      await pathExists(path.join(candidate, 'artifact-store', 'artifact-index.sqlite')) ||
      await pathExists(path.join(candidate, 'collected-and-indexed.json')) ||
      await pathExists(path.join(candidate, PROOF_PARENT_APPLY_CANDIDATES_FILE))
    ) {
      return candidate;
    }
  }
  throw new Error('query requires --collection <dir>, --continuation <dir>, or --run <run-dir> with collected artifacts');
}

export async function resolveContinuationProofParentApplyCandidateCollection(input: {
  cwd?: string;
  continuation?: string;
}): Promise<string | undefined> {
  if (!input.continuation) return undefined;
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const target = path.resolve(cwd, input.continuation);
  if (await pathExists(path.join(target, PROOF_PARENT_APPLY_CANDIDATES_FILE))) return target;
  for (const file of continuationJsonCandidates(target)) {
    if (!await pathExists(file)) continue;
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as { proofParentApplyCandidateCollectionDir?: unknown };
    const value = typeof parsed.proofParentApplyCandidateCollectionDir === 'string'
      ? parsed.proofParentApplyCandidateCollectionDir
      : undefined;
    if (!value) continue;
    for (const candidate of candidateArtifactPaths(cwd, path.dirname(file), value)) {
      if (await pathExists(path.join(candidate, PROOF_PARENT_APPLY_CANDIDATES_FILE))) return candidate;
    }
  }
  return undefined;
}

export async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!await pathExists(file)) return undefined;
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

export async function writeMaybe(args: CliArgs, result: unknown): Promise<void> {
  const out = stringArg(args.out ?? args.outFile ?? args['out-file']);
  if (out) await fs.writeFile(path.resolve(process.cwd(), out), JSON.stringify(result, null, 2) + '\n');
}

export function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function optionalBoolArg(value: CliValue | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}

function continuationJsonCandidates(target: string): string[] {
  if (path.basename(target) === CONTINUATION_FILE) return [target];
  return [path.join(target, CONTINUATION_FILE), target];
}

function candidateArtifactPaths(cwd: string, baseDir: string, value: string): string[] {
  if (path.isAbsolute(value)) return [value];
  return uniquePaths([path.resolve(baseDir, value), path.resolve(cwd, value)]);
}

function uniquePaths(values: string[]): string[] {
  return [...new Set(values)];
}
