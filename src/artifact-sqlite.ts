import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import type { FrontierCodexArtifactRecord } from './index.js';

const require = createRequire(import.meta.url);

export async function writeSqliteArtifactIndex(
  file: string,
  records: readonly FrontierCodexArtifactRecord[]
): Promise<boolean> {
  const sqlite = loadSqlite();
  if (!sqlite?.DatabaseSync) return false;
  await fs.rm(file, { force: true });
  const db = new sqlite.DatabaseSync(file);
  db.exec([
    'create table artifacts (',
    'id text, run_dir text, collection_dir text, job_id text, bucket text, kind text, path text, relative_path text,',
    'sha256 text, blob_path text, compression text, bytes integer, compressed_bytes integer, mtime_ms real,',
    'tags text, metadata_json text)'
  ].join(' '));
  const stmt = db.prepare('insert into artifacts values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const record of records) {
    stmt.run(
      record.id,
      record.runDir,
      record.collectionDir,
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
      record.mtimeMs,
      record.tags.join(','),
      JSON.stringify(record.metadata)
    );
  }
  db.close();
  return true;
}

export async function readSqliteArtifactIndex(file: string): Promise<FrontierCodexArtifactRecord[]> {
  const sqlite = loadSqlite();
  if (!sqlite?.DatabaseSync) return [];
  const db = new sqlite.DatabaseSync(file, { readOnly: true });
  try {
    const rows = readSqliteRows(db);
    return rows.map(rowToRecord);
  } finally {
    db.close();
  }
}

interface SqliteArtifactRow {
  id: string;
  run_dir?: string | null;
  collection_dir?: string | null;
  job_id: string | null;
  bucket: string | null;
  kind: string;
  path: string;
  relative_path: string;
  sha256: string;
  blob_path: string;
  compression: string;
  bytes: number;
  compressed_bytes: number | null;
  mtime_ms?: number | null;
  tags: string | null;
  metadata_json: string | null;
}

function readSqliteRows(db: SqliteDatabase): SqliteArtifactRow[] {
  try {
    return db.prepare([
      'select id, run_dir, collection_dir, job_id, bucket, kind, path, relative_path, sha256,',
      'blob_path, compression, bytes, compressed_bytes, mtime_ms, tags, metadata_json from artifacts'
    ].join(' ')).all() as SqliteArtifactRow[];
  } catch {
    return db.prepare([
      'select id, job_id, bucket, kind, path, relative_path, sha256,',
      'blob_path, compression, bytes, compressed_bytes, tags, metadata_json from artifacts'
    ].join(' ')).all() as SqliteArtifactRow[];
  }
}

function rowToRecord(row: SqliteArtifactRow): FrontierCodexArtifactRecord {
  return {
    id: row.id,
    ...(row.job_id ? { jobId: row.job_id } : {}),
    ...(row.bucket ? { bucket: row.bucket } : {}),
    kind: row.kind,
    path: row.path,
    relativePath: row.relative_path,
    sha256: row.sha256,
    blobPath: row.blob_path,
    compression: row.compression,
    bytes: Number(row.bytes),
    ...(row.compressed_bytes === null ? {} : { compressedBytes: Number(row.compressed_bytes) }),
    mtimeMs: Number(row.mtime_ms ?? 0),
    tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
    metadata: parseMetadata(row.metadata_json),
    runDir: row.run_dir ?? '',
    collectionDir: row.collection_dir ?? ''
  };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function loadSqlite(): { DatabaseSync?: new (file: string, options?: { readOnly?: boolean }) => SqliteDatabase } | undefined {
  try {
    return require('node:sqlite') as { DatabaseSync?: new (file: string, options?: { readOnly?: boolean }) => SqliteDatabase };
  } catch {
    return undefined;
  }
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...args: unknown[]): void; all(): unknown[] };
  close(): void;
}
