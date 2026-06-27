import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import {
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_KIND,
  FRONTIER_SWARM_CODEX_ARTIFACT_STORE_VERSION,
  FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND
} from './constants.js';
import type { FrontierCodexArtifactRecord, FrontierCodexArtifactStoreResult, FrontierCodexCollectResult } from './index.js';
import { isObject, pathExists, uniqueStrings } from './common.js';
import { compressArtifactBytes } from './artifact-compression.js';
import { readSqliteArtifactIndex, writeSqliteArtifactIndex } from './artifact-sqlite.js';
import { createSemanticCompactSummary } from './semantic-compact-summary.js';
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
  const sqliteWritten = input.sqlite === false ? false : await writeSqliteArtifactIndex(sqlitePath, records).catch(() => false);
  const summary = {
    artifactCount: records.length,
    totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    compressedBytes: records.reduce((sum, record) => sum + (record.compressedBytes ?? record.bytes), 0),
    blobCount: new Set(records.map((record) => record.sha256)).size,
    zstdCount: records.filter((record) => record.compression === 'zstd').length,
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
  const sqlitePath = path.join(collectionDir, 'artifact-store', 'artifact-index.sqlite');
  const sqliteRecords = await readSqliteArtifactIndex(sqlitePath).catch(() => []);
  if (sqliteRecords.length > 0) {
    return sqliteRecords.map((record) => ({
      ...record,
      runDir: record.runDir || '',
      collectionDir: record.collectionDir || collectionDir
    }));
  }
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
      for (const evidencePath of entry.bundle.evidencePaths ?? []) {
        out.push({ file: evidencePath, jobId: entry.jobId, bucket, kind: artifactKindForEvidencePath(evidencePath) });
      }
    }
  }
  for (const name of ['collection.json', 'merge-index.json', 'queue-overlay.json', 'strategy-tournament.json', 'strategy-history.json', 'tournament-adaptive-feedback.json', 'evidence-index.json', 'merge-admission.json', 'coordinator-query.json', 'compact-dashboard.json', 'queue-outcome-model.json', 'terminal-state.json', 'proof-route-backlog.json']) {
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
  const compressed = await compressArtifactBytes(bytes, {
    enabled: options.compress,
    compressible: COMPRESS_EXTENSIONS.has(path.extname(candidate.file).toLowerCase())
  });
  const blobPath = path.join(options.blobDir, sha256.slice(0, 2), `${sha256}${compressed.extension}`);
  await fs.mkdir(path.dirname(blobPath), { recursive: true });
  if (!await pathExists(blobPath)) await fs.writeFile(blobPath, compressed.bytes);
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
    compression: compressed.compression,
    ...(compressed.compression !== 'none' ? { compressedBytes: compressed.bytes.byteLength } : {}),
    mtimeMs: stat.mtimeMs,
    tags: artifactTags(candidate, metadata),
    metadata
  };
}

async function readArtifactMetadata(file: string): Promise<Record<string, unknown>> {
  try {
    const parsed = await readJsonArtifact(file);
    if (!isObject(parsed)) return {};
    const semanticImport = semanticImportSummaryForArtifact(parsed, file);
    const lineage = semanticLineageForArtifact(parsed, semanticImport);
    const semanticCompactSummary = createSemanticCompactSummary({
      summary: semanticImport,
      sidecar: parsed,
      expected: semanticExpectedForArtifact(semanticImport)
    });
    const semanticEdit = semanticCompactSummary?.semanticEdit;
    return isObject(parsed) ? {
      artifactKind: typeof parsed.kind === 'string' ? parsed.kind : undefined,
      disposition: parsed.disposition,
      status: parsed.status,
      mergeReadiness: parsed.mergeReadiness,
      staleAgainstHead: parsed.staleAgainstHead,
      changedPaths: Array.isArray(parsed.changedPaths) ? parsed.changedPaths.length : undefined,
      semanticPresent: Boolean(semanticImport),
      semanticRecordCount: numberField(semanticImport, 'total'),
      semanticSelected: numberField(semanticImport, 'selected'),
      semanticEligible: numberField(semanticImport, 'eligible'),
      semanticImported: numberField(semanticImport, 'imported'),
      semanticSymbols: numberField(readObject(semanticImport?.semanticIndex), 'symbols'),
      semanticOwnershipRegions: numberField(readObject(semanticImport?.semanticSidecars), 'ownershipRegions'),
      semanticPatchHints: numberField(readObject(semanticImport?.semanticSidecars), 'patchHints'),
      semanticDependencyRelations: numberField(readObject(semanticImport?.dependencies), 'total'),
      semanticDependencyPredicates: stringArray(readObject(semanticImport?.dependencies)?.predicates),
      semanticLineageEvents: numberField(lineage, 'inferredEvents'),
      semanticLineageMoved: numberField(lineage, 'moved'),
      semanticLineageRenamed: numberField(lineage, 'renamed'),
      semanticLineageDeleted: numberField(lineage, 'deleted'),
      lineagePresent: Boolean(lineage) && numberField(lineage, 'inferredEvents') > 0,
      semanticCompactSummary,
      semanticEditScript: semanticEdit?.script,
      semanticEditAdmission: semanticEdit?.admission,
      semanticEditAdmissionStatus: semanticEdit?.status,
      semanticEditAdmissionAutoMergeCandidate: semanticEdit?.autoMergeCandidate,
      semanticEditAdmissionCleanEligible: semanticEdit?.cleanEligible,
      semanticEditScriptPortable: semanticEdit?.script.portable,
      semanticEditScriptConflicts: semanticEdit?.script.conflicts,
      semanticEditScriptStale: semanticEdit?.script.stale,
      semanticEditScriptNeedsPort: semanticEdit?.script.needsPort,
      semanticEditProjectionProjected: semanticEdit?.projection?.projected,
      semanticEditProjectionBlocked: semanticEdit?.projection?.blocked,
      semanticEditProjectionMatchesWorker: semanticEdit?.projection?.projectedSourceMatchesWorker,
      semanticEditProjectionMismatchesWorker: semanticEdit?.projection?.projectedSourceMismatchesWorker,
      semanticEditProjectionMatchUnknown: semanticEdit?.projection?.projectedSourceMatchUnknown,
      semanticSourceCount: semanticCompactSummary?.sourceCount,
      traceShards: Array.isArray(parsed.traceShards) ? parsed.traceShards.length : undefined
    } : {};
  } catch {
    return {};
  }
}

function artifactTags(candidate: { bucket?: string; kind: string }, metadata: Record<string, unknown>): string[] {
  const semanticPresent = Boolean(metadata.semanticPresent);
  const lineagePresent = Boolean(metadata.lineagePresent);
  return uniqueStrings([
    candidate.kind,
    ...(candidate.bucket ? [candidate.bucket] : []),
    semanticPresent ? 'semantic-sidecar' : '',
    semanticPresent ? 'semantic-import' : '',
    candidate.kind === 'semantic-imports' ? 'semantic-imports' : '',
    lineagePresent ? 'semantic-lineage' : '',
    typeof metadata.semanticEditAdmissionStatus === 'string' ? `semantic-edit-admission-${metadata.semanticEditAdmissionStatus}` : '',
    metadata.semanticEditAdmissionAutoMergeCandidate ? 'semantic-edit-admission-auto-merge-candidate' : '',
    metadata.semanticEditAdmissionCleanEligible ? 'semantic-edit-admission-clean-eligible' : '',
    Number(metadata.semanticEditScriptPortable ?? 0) > 0 ? 'semantic-edit-portable' : '',
    Number(metadata.semanticEditProjectionProjected ?? 0) > 0 ? 'semantic-edit-projected' : '',
    Number(metadata.semanticEditProjectionBlocked ?? 0) > 0 ? 'semantic-edit-projection-blocked' : '',
    Number(metadata.semanticEditProjectionMatchesWorker ?? 0) > 0 ? 'semantic-edit-projection-worker-match' : '',
    Number(metadata.semanticEditProjectionMismatchesWorker ?? 0) > 0 ? 'semantic-edit-projection-worker-mismatch' : '',
    Number(metadata.semanticEditProjectionMatchUnknown ?? 0) > 0 ? 'semantic-edit-projection-worker-unknown' : '',
    Number(metadata.semanticEditScriptConflicts ?? 0) > 0 ? 'semantic-edit-conflict' : '',
    Number(metadata.semanticEditScriptStale ?? 0) > 0 ? 'semantic-edit-stale' : '',
    Number(metadata.semanticEditScriptNeedsPort ?? 0) > 0 ? 'semantic-edit-needs-port' : '',
    metadata.staleAgainstHead ? 'stale' : '',
    Number(metadata.traceShards ?? 0) > 0 ? 'trace' : '',
    Number(metadata.semanticDependencyRelations ?? 0) > 0 ? 'semantic-dependencies' : ''
  ]);
}

function renderArtifactSql(records: readonly FrontierCodexArtifactRecord[]): string {
  const rows = records.map((record) => `insert into artifacts values (${[
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
  ].map(sqlValue).join(', ')});`);
  return [
    [
      'create table if not exists artifacts (id text, run_dir text, collection_dir text, job_id text, bucket text,',
      'kind text, path text, relative_path text, sha256 text, blob_path text, compression text, bytes integer,',
      'compressed_bytes integer, mtime_ms real, tags text, metadata_json text);'
    ].join(' '),
    ...rows
  ].join('\n') + '\n';
}

function artifactKindForEvidencePath(file: string): string {
  const name = path.basename(logicalArtifactPath(file)).toLowerCase();
  if (name === 'semantic-imports.json') return 'semantic-imports';
  if (name === 'patch-intent.json') return 'patch-intent';
  if (name === 'log-summary.json') return 'log-summary';
  if (name === 'resource-allocation.json') return 'resource-allocation';
  if (name === 'workspace-proof.json') return 'workspace-proof';
  if (name === 'merge.json') return 'merge-bundle';
  if (name === 'evidence.json') return 'evidence';
  return 'worker-evidence';
}

function semanticImportSummaryForArtifact(parsed: Record<string, unknown>, file: string): Record<string, unknown> | undefined {
  if (path.basename(logicalArtifactPath(file)) === 'semantic-imports.json' || parsed.kind === FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND) {
    return readObject(parsed.summary) ?? {};
  }
  const metadata = readObject(parsed.metadata);
  return readObject(parsed.semanticImport) ?? readObject(metadata?.semanticImport);
}

function semanticLineageForArtifact(
  parsed: Record<string, unknown>,
  semanticImport: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  return readObject(parsed.semanticLineage) ??
    readObject(semanticImport?.semanticLineage) ??
    readObject(semanticImport?.semanticLineageInference);
}

function semanticExpectedForArtifact(semanticImport: Record<string, unknown> | undefined): boolean {
  return semanticImport?.semanticImportExpected === true ||
    semanticImport?.expected === true ||
    readObject(semanticImport?.quality)?.expected === true ||
    readObject(semanticImport?.admission)?.expected === true;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isObject(value) ? value : undefined;
}

function numberField(value: Record<string, unknown> | undefined, key: string): number {
  const number = Number(value?.[key]);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

async function readJsonArtifact(file: string): Promise<unknown> {
  const logical = logicalArtifactPath(file);
  if (path.extname(logical) !== '.json') return undefined;
  const bytes = await fs.readFile(file);
  const gzip = file.endsWith('.gz') || hasGzipMagic(bytes);
  const raw = gzip ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8');
  return JSON.parse(raw);
}

function logicalArtifactPath(file: string): string {
  return file.endsWith('.gz') ? file.slice(0, -3) : file;
}

function hasGzipMagic(bytes: Buffer): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(Math.floor(value));
  return `'${String(value).replace(/'/g, "''")}'`;
}
