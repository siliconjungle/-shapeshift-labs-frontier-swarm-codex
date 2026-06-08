import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND, FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION } from './constants.js';
import type { FrontierCodexArtifactRecord, FrontierCodexArtifactStoreResult, FrontierCodexCollectResult } from './index.js';
import { isObject, pathExists, uniqueStrings } from './common.js';

const gzipAsync = promisify(gzip);
const require = createRequire(import.meta.url);
const COMPRESS_EXTENSIONS = new Set(['.json', '.jsonl', '.log', '.txt', '.patch', '.md']);

export async function createCodexArtifactStore(input: {
  collection: FrontierCodexCollectResult;
  compress?: boolean;
  sqlite?: boolean;
  maxArtifactBytes?: number;
}): Promise<FrontierCodexArtifactStoreResult> {
  const generatedAt = Date.now();
  const storeDir = path.join(input.collection.outDir, 'artifact-store');
  const blobDir = path.join(storeDir, 'blobs');
  const candidates = collectArtifactCandidates(input.collection);
  const records: FrontierCodexArtifactRecord[] = [];
  await fs.mkdir(blobDir, { recursive: true });
  for (const candidate of candidates) {
    const record = await createArtifactRecord(candidate, input.collection, {
      blobDir,
      compress: input.compress !== false,
      maxArtifactBytes: input.maxArtifactBytes ?? 64 * 1024 * 1024
    });
    if (record) records.push(record);
  }
  const jsonlPath = path.join(storeDir, 'artifacts.jsonl');
  const sqlPath = path.join(storeDir, 'artifact-index.sql');
  const sqlitePath = path.join(storeDir, 'artifact-index.sqlite');
  await fs.writeFile(jsonlPath, records.map((record) => JSON.stringify(record)).join('\n') + (records.length ? '\n' : ''));
  await fs.writeFile(sqlPath, renderArtifactSql(records));
  const sqliteWritten = input.sqlite === false ? false : await writeSqliteIndex(sqlitePath, records).catch(() => false);
  const summary = {
    artifactCount: records.length,
    totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    compressedBytes: records.reduce((sum, record) => sum + (record.compressedBytes ?? record.bytes), 0),
    blobCount: new Set(records.map((record) => record.sha256)).size,
    gzipCount: records.filter((record) => record.compression === 'gzip').length,
    sqliteWritten
  };
  const result: FrontierCodexArtifactStoreResult = {
    kind: FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND,
    version: FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION,
    generatedAt,
    runDir: input.collection.runDir,
    collectionDir: input.collection.outDir,
    storeDir,
    jsonlPath,
    sqlPath,
    ...(sqliteWritten ? { sqlitePath } : {}),
    records,
    summary
  };
  await fs.writeFile(path.join(storeDir, 'artifact-store.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(input.collection.outDir, 'collected-and-indexed.json'), JSON.stringify({
    runDir: input.collection.runDir,
    collectionDir: input.collection.outDir,
    generatedAt,
    artifactStore: path.join(storeDir, 'artifact-store.json'),
    summary
  }, null, 2) + '\n');
  return result;
}

export async function readCodexArtifactRecords(collectionDir: string): Promise<FrontierCodexArtifactRecord[]> {
  const jsonlPath = path.join(collectionDir, 'artifact-store', 'artifacts.jsonl');
  const text = await fs.readFile(jsonlPath, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as FrontierCodexArtifactRecord);
}

function collectArtifactCandidates(collection: FrontierCodexCollectResult): Array<{ file: string; jobId?: string; bucket?: string; kind: string }> {
  const out: Array<{ file: string; jobId?: string; bucket?: string; kind: string }> = [];
  for (const [bucket, entries] of Object.entries(collection.buckets)) {
    for (const entry of entries) {
      out.push({ file: path.join(entry.outputDir, 'merge.json'), jobId: entry.jobId, bucket, kind: 'merge-bundle' });
      out.push({ file: path.join(entry.outputDir, 'changes.patch'), jobId: entry.jobId, bucket, kind: 'patch' });
      out.push({ file: path.join(entry.outputDir, 'evidence.json'), jobId: entry.jobId, bucket, kind: 'evidence' });
      for (const evidencePath of entry.bundle.evidencePaths) out.push({ file: evidencePath, jobId: entry.jobId, bucket, kind: 'worker-evidence' });
    }
  }
  for (const name of ['collection.json', 'merge-index.json', 'queue-overlay.json', 'strategy-tournament.json', 'strategy-history.json', 'tournament-adaptive-feedback.json', 'evidence-index.json', 'merge-admission.json', 'coordinator-query.json', 'compact-dashboard.json']) {
    out.push({ file: path.join(collection.outDir, name), kind: 'coordinator-index' });
  }
  const seen = new Set<string>();
  return out.filter((entry) => {
    const key = path.resolve(entry.file);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function createArtifactRecord(
  candidate: { file: string; jobId?: string; bucket?: string; kind: string },
  collection: FrontierCodexCollectResult,
  options: { blobDir: string; compress: boolean; maxArtifactBytes: number }
): Promise<FrontierCodexArtifactRecord | undefined> {
  if (!await pathExists(candidate.file)) return undefined;
  const stat = await fs.stat(candidate.file);
  if (!stat.isFile() || stat.size > options.maxArtifactBytes) return undefined;
  const bytes = await fs.readFile(candidate.file);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const relativePath = path.relative(collection.outDir, candidate.file).replace(/\\/g, '/');
  const compress = options.compress && COMPRESS_EXTENSIONS.has(path.extname(candidate.file).toLowerCase());
  const blobBytes = compress ? await gzipAsync(bytes) : bytes;
  const blobPath = path.join(options.blobDir, sha256.slice(0, 2), `${sha256}${compress ? '.gz' : ''}`);
  await fs.mkdir(path.dirname(blobPath), { recursive: true });
  if (!await pathExists(blobPath)) await fs.writeFile(blobPath, blobBytes);
  const metadata = await readArtifactMetadata(candidate.file);
  return {
    id: `artifact:${sha256}`,
    runDir: collection.runDir,
    collectionDir: collection.outDir,
    path: candidate.file,
    relativePath,
    kind: candidate.kind,
    ...(candidate.jobId ? { jobId: candidate.jobId } : {}),
    ...(candidate.bucket ? { bucket: candidate.bucket } : {}),
    bytes: stat.size,
    sha256,
    blobPath,
    compression: compress ? 'gzip' : 'none',
    ...(compress ? { compressedBytes: blobBytes.byteLength } : {}),
    mtimeMs: stat.mtimeMs,
    tags: artifactTags(candidate, metadata),
    metadata
  };
}

async function readArtifactMetadata(file: string): Promise<Record<string, unknown>> {
  if (path.extname(file) !== '.json') return {};
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(parsed) ? {
      disposition: parsed.disposition,
      status: parsed.status,
      mergeReadiness: parsed.mergeReadiness,
      staleAgainstHead: parsed.staleAgainstHead,
      changedPaths: Array.isArray(parsed.changedPaths) ? parsed.changedPaths.length : undefined,
      semanticPresent: Boolean(parsed.semanticImport),
      traceShards: Array.isArray(parsed.traceShards) ? parsed.traceShards.length : undefined
    } : {};
  } catch {
    return {};
  }
}

function artifactTags(candidate: { bucket?: string; kind: string }, metadata: Record<string, unknown>): string[] {
  return uniqueStrings([
    candidate.kind,
    ...(candidate.bucket ? [candidate.bucket] : []),
    metadata.semanticPresent ? 'semantic-sidecar' : '',
    metadata.staleAgainstHead ? 'stale' : '',
    Number(metadata.traceShards ?? 0) > 0 ? 'trace' : ''
  ]);
}

function renderArtifactSql(records: readonly FrontierCodexArtifactRecord[]): string {
  const rows = records.map((record) => `insert into artifacts values (${[
    record.id,
    record.jobId ?? null,
    record.bucket ?? null,
    record.kind,
    record.path,
    record.relativePath,
    record.sha256,
    record.blobPath,
    record.compression,
    record.bytes,
    record.compressedBytes ?? null,
    record.tags.join(',')
  ].map(sqlValue).join(', ')});`);
  return [
    'create table if not exists artifacts (id text, job_id text, bucket text, kind text, path text, relative_path text, sha256 text, blob_path text, compression text, bytes integer, compressed_bytes integer, tags text);',
    ...rows
  ].join('\n') + '\n';
}

async function writeSqliteIndex(file: string, records: readonly FrontierCodexArtifactRecord[]): Promise<boolean> {
  const sqlite = require('node:sqlite') as { DatabaseSync?: new (file: string) => { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): void }; close(): void } };
  if (!sqlite.DatabaseSync) return false;
  await fs.rm(file, { force: true });
  const db = new sqlite.DatabaseSync(file);
  db.exec('create table artifacts (id text, job_id text, bucket text, kind text, path text, relative_path text, sha256 text, blob_path text, compression text, bytes integer, compressed_bytes integer, tags text)');
  const stmt = db.prepare('insert into artifacts values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const record of records) stmt.run(record.id, record.jobId ?? null, record.bucket ?? null, record.kind, record.path, record.relativePath, record.sha256, record.blobPath, record.compression, record.bytes, record.compressedBytes ?? null, record.tags.join(','));
  db.close();
  return true;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(Math.floor(value));
  return `'${String(value).replace(/'/g, "''")}'`;
}
