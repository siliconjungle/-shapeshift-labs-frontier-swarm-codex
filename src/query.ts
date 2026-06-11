import fs from 'node:fs/promises';
import path from 'node:path';
import { FRONTIER_SWARM_CODEX_QUERY_KIND, FRONTIER_SWARM_CODEX_QUERY_VERSION } from './constants.js';
import type { FrontierCodexArtifactRecord } from './index.js';
import { isObject, pathExists, uniqueStrings } from './common.js';
import { readCodexArtifactRecords } from './artifact-store.js';
import {
  jobSemanticEditAdmission,
  jobSemanticEditProjection,
  jobSemanticEditScript,
  matchesEvidenceSemanticEdit,
  matchesSemanticEdit,
  matchesSemanticEditProjection,
  semanticEditAdmissionSummary,
  semanticEditProjectionSummary,
  semanticEditScriptAdmissionSummary
} from './query-semantic-edit.js';
import {
  evidenceSemanticEditReplay,
  jobSemanticEditReplay,
  matchesSemanticEditReplay,
  semanticEditReplaySummary
} from './query-semantic-edit-replay.js';
import { semanticPatchBundleOverlapJobIds } from './semantic-bundle-overlaps.js';

type CliValue = string | boolean | string[];
type CliArgs = Record<string, CliValue | undefined> & { _: string[] };

export interface FrontierCodexQueryInput {
  collection?: string;
  run?: string;
  q?: string;
  jobId?: string;
  bucket?: string;
  kind?: string;
  pathIncludes?: string;
  symbol?: string;
  tag?: string;
  stale?: boolean;
  semantic?: boolean;
  lineage?: boolean;
  semanticEditStatus?: string;
  semanticEditAdmission?: string;
  semanticEditProjection?: string;
  semanticEditReplay?: string;
  semanticEditReplayStatus?: string;
  semanticEditReplayAdmission?: string;
  semanticEditKey?: string;
  semanticBundleOverlap?: string;
  semanticIdentityHash?: string;
  sourceIdentityHash?: string;
  operationContentHash?: string;
  editContentHash?: string;
  semanticTransformKey?: string;
  semanticTransformIdentityHash?: string;
  semanticTransformContentHash?: string;
  projectionIdentityHash?: string;
  readiness?: string;
  passedTests?: boolean;
  limit?: number;
  cwd?: string;
}

export async function queryCodexSwarmCollection(input: FrontierCodexQueryInput) {
  const collectionDir = await resolveCollectionDir(input);
  const [artifacts, dashboard, evidenceIndex] = await Promise.all([
    readCodexArtifactRecords(collectionDir).catch(() => []),
    readJsonIfExists<{ jobs?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'coordinator-query.json')),
    readJsonIfExists<{ entries?: unknown[]; summary?: unknown }>(path.join(collectionDir, 'evidence-index.json'))
  ]);
  const semanticPatchBundleOverlaps = isObject(dashboard?.summary) ? dashboard.summary.semanticPatchBundleOverlaps : undefined;
  const overlapJobIds = semanticPatchBundleOverlapJobIds(semanticPatchBundleOverlaps, input.semanticBundleOverlap);
  const jobs = (Array.isArray(dashboard?.jobs) ? dashboard.jobs : [])
    .filter(isObject)
    .filter((job) => matchesJob(job, input, overlapJobIds))
    .slice(0, input.limit ?? 50);
  const artifactRows = artifacts.filter((record) => matchesArtifact(record, input)).slice(0, input.limit ?? 100);
  const evidenceRows = (Array.isArray(evidenceIndex?.entries) ? evidenceIndex.entries : [])
    .filter(isObject)
    .filter((entry) => matchesEvidence(entry, input))
    .slice(0, input.limit ?? 100);
  return {
    kind: FRONTIER_SWARM_CODEX_QUERY_KIND,
    version: FRONTIER_SWARM_CODEX_QUERY_VERSION,
    ok: true,
    collectionDir,
    query: input,
    summary: {
      jobs: jobs.length,
      artifacts: artifactRows.length,
      evidence: evidenceRows.length,
      touchedPaths: uniqueStrings(jobs.flatMap((job) => Array.isArray(job.changedPaths) ? job.changedPaths.filter((entry): entry is string => typeof entry === 'string') : [])),
      semanticEditAdmission: semanticEditAdmissionSummary(jobs),
      semanticEditProjection: semanticEditProjectionSummary(jobs),
      semanticEditReplay: semanticEditReplaySummary(jobs),
      semanticEditScriptAdmission: semanticEditScriptAdmissionSummary(jobs),
      semanticPatchBundleOverlaps
    },
    jobs,
    artifacts: artifactRows,
    evidence: evidenceRows
  };
}

export async function handleCodexQueryCommand(args: CliArgs): Promise<void> {
  const result = await queryCodexSwarmCollection({
    cwd: process.cwd(),
    collection: stringArg(args.collection),
    run: stringArg(args.run),
    q: stringArg(args.q ?? args.query),
    jobId: stringArg(args.job ?? args.jobId ?? args['job-id']),
    bucket: stringArg(args.bucket),
    kind: stringArg(args.kind),
    pathIncludes: stringArg(args.path ?? args['path-includes']),
    symbol: stringArg(args.symbol ?? args.function ?? args['function']),
    tag: stringArg(args.tag),
    stale: optionalBoolArg(args.stale),
    semantic: optionalBoolArg(args.semantic),
    lineage: optionalBoolArg(args.lineage ?? args['semantic-lineage']),
    semanticEditStatus: stringArg(args.semanticEditStatus ?? args['semantic-edit-status']),
    semanticEditAdmission: stringArg(args.semanticEditAdmission ?? args['semantic-edit-admission']),
    semanticEditProjection: stringArg(args.semanticEditProjection ?? args['semantic-edit-projection']),
    semanticEditReplay: stringArg(args.semanticEditReplay ?? args['semantic-edit-replay']),
    semanticEditReplayStatus: stringArg(args.semanticEditReplayStatus ?? args['semantic-edit-replay-status']),
    semanticEditReplayAdmission: stringArg(args.semanticEditReplayAdmission ?? args['semantic-edit-replay-admission']),
    semanticEditKey: stringArg(args.semanticEditKey ?? args['semantic-edit-key'] ?? args.semanticKey ?? args['semantic-key']),
    semanticBundleOverlap: stringArg(args.semanticBundleOverlap ?? args['semantic-bundle-overlap'] ?? args.semanticPatchBundleOverlap ?? args['semantic-patch-bundle-overlap']),
    semanticIdentityHash: stringArg(args.semanticIdentityHash ?? args['semantic-identity-hash'] ?? args['semantic-edit-identity-hash']),
    sourceIdentityHash: stringArg(args.sourceIdentityHash ?? args['source-identity-hash'] ?? args['semantic-source-identity-hash']),
    operationContentHash: stringArg(args.operationContentHash ?? args['operation-content-hash'] ?? args['semantic-operation-content-hash']),
    editContentHash: stringArg(args.editContentHash ?? args['edit-content-hash'] ?? args['semantic-edit-content-hash']),
    semanticTransformKey: stringArg(args.semanticTransformKey ?? args['semantic-transform-key']),
    semanticTransformIdentityHash: stringArg(args.semanticTransformIdentityHash ?? args['semantic-transform-identity-hash']),
    semanticTransformContentHash: stringArg(args.semanticTransformContentHash ?? args['semantic-transform-content-hash']),
    projectionIdentityHash: stringArg(args.projectionIdentityHash ?? args['projection-identity-hash']),
    readiness: stringArg(args.readiness ?? args.view),
    passedTests: optionalBoolArg(args.passedTests ?? args['passed-tests']),
    limit: numberArg(args.limit)
  });
  await writeMaybe(args, result);
  console.log(JSON.stringify(result, null, 2));
}

async function resolveCollectionDir(input: Pick<FrontierCodexQueryInput, 'collection' | 'run' | 'cwd'>): Promise<string> {
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

function matchesJob(job: Record<string, unknown>, input: FrontierCodexQueryInput, overlapJobIds?: Set<string>): boolean {
  const haystack = JSON.stringify(job).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || job.jobId === input.jobId)
    && (overlapJobIds === undefined || overlapJobIds.has(String(job.jobId ?? '')))
    && (input.bucket === undefined || job.disposition === input.bucket || job.admissionStatus === input.bucket)
    && (input.pathIncludes === undefined || arrayIncludes(job.changedPaths, input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.stale === undefined || Boolean(job.staleAgainstHead) === input.stale)
    && (input.semantic === undefined || Boolean(job.semanticImport) === input.semantic || Boolean(job.semanticImportQuality) === input.semantic)
    && (input.lineage === undefined || jobHasLineage(job) === input.lineage)
    && matchesSemanticEdit(jobSemanticEditScript(job), input, haystack, jobSemanticEditAdmission(job))
    && matchesSemanticEditProjection(jobSemanticEditProjection(job), input, haystack)
    && matchesSemanticEditReplay(jobSemanticEditReplay(job), input, haystack)
    && (input.readiness === undefined || matchesReadiness(job, input.readiness))
    && (input.passedTests === undefined || testsPassed(job) === input.passedTests);
}

function matchesArtifact(record: FrontierCodexArtifactRecord, input: FrontierCodexQueryInput): boolean {
  const haystack = JSON.stringify(record).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || record.jobId === input.jobId)
    && (input.bucket === undefined || record.bucket === input.bucket)
    && (input.kind === undefined || record.kind === input.kind)
    && (input.pathIncludes === undefined || record.path.includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || record.tags.includes(input.tag))
    && (input.semantic === undefined || record.tags.includes('semantic-sidecar') === input.semantic)
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && matchesSemanticEdit(artifactSemanticEditScript(record), input, haystack, artifactSemanticEditAdmission(record))
    && matchesSemanticEditProjection(artifactSemanticEditProjection(record), input, haystack)
    && matchesSemanticEditReplay(artifactSemanticEditReplay(record), input, haystack);
}

function matchesEvidence(entry: Record<string, unknown>, input: FrontierCodexQueryInput): boolean {
  const haystack = JSON.stringify(entry).toLowerCase();
  return matchesText(haystack, input)
    && (input.jobId === undefined || entry.jobId === input.jobId)
    && (input.bucket === undefined || entry.status === input.bucket)
    && (input.kind === undefined || entry.kind === input.kind)
    && (input.pathIncludes === undefined || String(entry.path ?? '').includes(input.pathIncludes))
    && (input.symbol === undefined || haystack.includes(input.symbol.toLowerCase()))
    && (input.tag === undefined || Array.isArray(entry.tags) && entry.tags.includes(input.tag))
    && (input.lineage === undefined || textHasLineage(haystack) === input.lineage)
    && matchesEvidenceSemanticEdit(entry, input, haystack)
    && matchesSemanticEditReplay(evidenceSemanticEditReplay(entry), input, haystack);
}

function matchesText(haystack: string, input: FrontierCodexQueryInput): boolean {
  return input.q === undefined || haystack.includes(input.q.toLowerCase());
}

function testsPassed(job: Record<string, unknown>): boolean {
  const tests = isObject(job.tests) ? job.tests : {};
  return Number(tests.requiredFailed ?? 0) === 0 && Number(tests.failed ?? 0) === 0;
}

function jobHasLineage(job: Record<string, unknown>): boolean {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  return Number(quality.semanticLineageEvents ?? 0) > 0 ||
    Number(quality.semanticLineageMoved ?? 0) > 0 ||
    Number(quality.semanticLineageRenamed ?? 0) > 0 ||
    Number(quality.semanticLineageDeleted ?? 0) > 0;
}

function textHasLineage(haystack: string): boolean {
  return haystack.includes('semanticlineage') || haystack.includes('lineageinference');
}

function matchesReadiness(job: Record<string, unknown>, value: string): boolean {
  const readiness = value.toLowerCase();
  if (readiness === 'ready-to-port') return job.disposition === 'needs-port' || job.mergeReadiness === 'verified-patch';
  if (readiness === 'ready-to-apply') return job.disposition === 'auto-mergeable' || job.admissionStatus === 'ready-to-apply';
  if (readiness === 'stale') return Boolean(job.staleAgainstHead) || job.disposition === 'stale-against-head';
  if (readiness === 'discovery-only') return job.mergeReadiness === 'discovery-only' || job.disposition === 'discovery-only';
  if (readiness === 'blocked') return job.status === 'blocked' || job.mergeReadiness === 'blocked' || job.disposition === 'blocked';
  if (readiness === 'evidence-only') return job.mergeReadiness === 'evidence-only' || job.disposition === 'evidence-only';
  return JSON.stringify(job).toLowerCase().includes(readiness);
}

function artifactSemanticEditScript(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditScript ?? semanticEdit.script;
}

function artifactSemanticEditAdmission(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditAdmission ?? semanticEdit.admission;
}

function artifactSemanticEditProjection(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditProjection ?? semanticEdit.projection;
}

function artifactSemanticEditReplay(record: FrontierCodexArtifactRecord): unknown {
  const compact = isObject(record.metadata.semanticCompactSummary) ? record.metadata.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return record.metadata.semanticEditReplay ?? semanticEdit.replay;
}

function arrayIncludes(value: unknown, needle: string): boolean {
  return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.includes(needle));
}

async function readJsonIfExists<T>(file: string): Promise<T | undefined> {
  if (!await pathExists(file)) return undefined;
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

async function writeMaybe(args: CliArgs, result: unknown): Promise<void> {
  const out = stringArg(args.out ?? args.outFile ?? args['out-file']);
  if (out) await fs.writeFile(path.resolve(process.cwd(), out), JSON.stringify(result, null, 2) + '\n');
}

function stringArg(value: CliValue | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberArg(value: CliValue | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalBoolArg(value: CliValue | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === true) return true;
  return /^(1|true|yes|on)$/i.test(String(value));
}
