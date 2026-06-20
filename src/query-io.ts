import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists } from './common.js';
import type { CliArgs, CliValue, FrontierCodexQueryInput } from './query-types.js';

export async function resolveCollectionDir(input: Pick<FrontierCodexQueryInput, 'collection' | 'run' | 'cwd'>): Promise<string> {
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
