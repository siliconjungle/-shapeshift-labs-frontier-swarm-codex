import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions, FrontierCodexSemanticImportRecord, FrontierCodexSemanticImportSidecar } from './index.js';
import { summarizeUniversalAstLayers, summarizeNativeSourceProjection, summarizeNativeSourceCompile, summarizeSemanticLosses, summarizeSemanticMergeCandidate } from './semantic-import-layers.js';
import { summarizeParadigmSemantics } from './semantic-import-paradigm.js';
import { summarizeProofSpec } from './semantic-import-proof.js';
import {
  readSemanticImportBaseSource,
  readSemanticImportHeadSource,
  summarizeNativeSourceChangeSet
} from './semantic-import-base.js';
import {
  createSemanticImportSidecar,
  summarizeLangSemanticImportSidecar,
  summarizeSemanticIndex,
  summarizeSemanticSlice,
  summarizeSemanticSliceAdmission
} from './semantic-import-sidecar.js';
import { mergeSemanticFactSummaries, semanticImportFactSummary, summarizeLangSidecarSemanticFacts } from './semantic-import-facts.js';
import { summarizeSemanticDependencies } from './semantic-import-dependencies.js';
import { summarizeSemanticEditScript } from './semantic-edit-script.js';
import { summarizeSemanticEditProjection } from './semantic-edit-projection.js';
import { summarizeSemanticEditReplay } from './semantic-edit-replay.js';
import { summarizeSemanticLineageEvidence } from './semantic-import-lineage.js';
import { loadFrontierLangForSemanticImport, normalizeSemanticImportOptions, selectSemanticImportPaths, semanticImportCandidatePaths } from './semantic-import-select.js';
import { discoverSemanticImportFallbackPaths, withSemanticImportFallback } from './semantic-import-fallback.js';
import type { SemanticImportBaseSourceSnapshot } from './semantic-import-base.js';
import { resolveSemanticImportWorkspacePath } from './semantic-import-path.js';

type CodexSemanticImportSidecarInput = { job: FrontierSwarmJob; workspace: string; changedPaths: readonly string[]; evidenceDir: string; baseCwd?: string; baseSources?: SemanticImportBaseSourceSnapshot; options?: boolean | FrontierCodexSemanticImportOptions; semanticImportExpected?: boolean };
type SemanticImportBaseSourceSummaryInput = { path: string; source: 'workspace-snapshot' | 'coordinator-workspace' | 'git-head'; bytes: number; foundBy: string };
type SemanticImportHeadSourceSummaryInput = { path: string; source: 'coordinator-workspace' | 'git-head'; bytes: number; foundBy: string };

const DEFAULT_SEMANTIC_IMPORT_SIDECAR_MAX_BYTES = 16 * 1024 * 1024;
const DEFAULT_SEMANTIC_IMPORT_ARCHIVE_NAME = 'semantic-imports.full.json.gz';

export interface FrontierCodexSemanticImportEvidence {
  path: string;
  archivePath?: string;
  evidencePaths: string[];
  sidecar: FrontierCodexSemanticImportSidecar;
  summary: FrontierCodexSemanticImportSidecar['summary'];
}

export async function createCodexSemanticImportSidecar(input: CodexSemanticImportSidecarInput): Promise<FrontierCodexSemanticImportEvidence | undefined> {
  const options = normalizeSemanticImportOptions(input.options);
  if (!options) return undefined;
  const candidatePaths = semanticImportCandidatePaths(input.job, input.changedPaths, input.workspace);
  let selection = selectSemanticImportPaths(candidatePaths, options);
  if (!selection.selected.length && input.semanticImportExpected === true) {
    const fallbackPaths = await discoverSemanticImportFallbackPaths(input.job, input.workspace, options);
    if (fallbackPaths.length) {
      selection = withSemanticImportFallback(
        selectSemanticImportPaths([...candidatePaths, ...fallbackPaths], options),
        fallbackPaths.length,
        'expected-semantic-import-empty-selection'
      );
    }
  }
  const selected = selection.selected;
  const records: FrontierCodexSemanticImportRecord[] = [];
  const importPath = path.join(input.evidenceDir, 'semantic-imports.json');
  if (!selected.length) {
    const sidecar = createSemanticImportSidecar(input.job, records, selection, input.semanticImportExpected === true);
    return writeSemanticImportEvidence({ importPath, evidenceDir: input.evidenceDir, sidecar, options });
  }
  const api = await loadFrontierLangForSemanticImport();
  if (!api.ok) {
    for (const file of selected) {
      records.push({
        path: file.path,
        language: file.language,
        status: 'skipped',
        reason: 'frontier-lang-unavailable',
        error: api.error
      });
    }
    const sidecar = createSemanticImportSidecar(input.job, records, selection, input.semanticImportExpected === true);
    return writeSemanticImportEvidence({ importPath, evidenceDir: input.evidenceDir, sidecar, options });
  }
  for (const file of selected) {
    const resolved = await resolveSemanticImportWorkspacePath(input.workspace, file.path);
    const absolute = resolved.absolute;
    const stat = await fs.stat(absolute).catch(() => undefined);
    const baseSource = await readSemanticImportBaseSource({
      baseCwd: input.baseCwd,
      workspace: input.workspace,
      file: resolved.path,
      maxBytes: options.maxBytes,
      snapshot: input.baseSources
    });
    if (!stat?.isFile()) {
      if (baseSource && api.diffNativeSources) {
        const nativeDiff = api.diffNativeSources({
          language: file.language,
          sourcePath: resolved.path,
          parser: 'source-text',
          beforeSourceText: baseSource.sourceText,
          beforeMetadata: semanticImportMetadata(input.job, 'before', baseSource.path),
          metadata: semanticImportMetadata(input.job, 'diff', resolved.path)
        });
        records.push({
          path: resolved.path,
          ...(resolved.path !== file.path ? { requestedPath: file.path } : {}),
          language: file.language,
          status: 'imported',
          reason: 'deleted-file',
          bytes: baseSource.bytes,
          baseSource: summarizeSemanticImportBaseSource(baseSource),
          semanticLineage: summarizeSemanticLineageEvidence(nativeDiff),
          nativeDiff: summarizeNativeSourceChangeSet(nativeDiff),
          mergeCandidate: summarizeSemanticMergeCandidate(nativeDiff?.mergeCandidate)
        });
        continue;
      }
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'not-a-file' });
      continue;
    }
    if (stat.size > options.maxBytes) {
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'too-large', bytes: stat.size });
      continue;
    }
    try {
      const sourceText = await fs.readFile(absolute, 'utf8');
      const headSource = await readSemanticImportHeadSource({
        headCwd: input.baseCwd,
        file: resolved.path,
        maxBytes: options.maxBytes
      });
      const importResult = api.importNativeSource({
        language: file.language,
        sourcePath: resolved.path,
        sourceText,
        parser: 'source-text',
        metadata: semanticImportMetadata(input.job, 'after', resolved.path)
      });
      const nativeDiff = baseSource && api.diffNativeSources
        ? api.diffNativeSources({
          language: file.language,
          sourcePath: resolved.path,
          parser: 'source-text',
          beforeSourceText: baseSource.sourceText,
          afterSourceText: sourceText,
          beforeMetadata: semanticImportMetadata(input.job, 'before', baseSource.path),
          afterMetadata: semanticImportMetadata(input.job, 'after', resolved.path),
          metadata: semanticImportMetadata(input.job, 'diff', resolved.path)
        })
        : undefined;
      const semanticEditScript = baseSource && api.createSemanticEditScript
        ? api.createSemanticEditScript({
          language: file.language,
          sourcePath: resolved.path,
          parser: 'source-text',
          baseSourceText: baseSource.sourceText,
          workerSourceText: sourceText,
          ...(headSource ? { headSourceText: headSource.sourceText } : {}),
          baseMetadata: semanticImportMetadata(input.job, 'base', baseSource.path),
          workerMetadata: semanticImportMetadata(input.job, 'worker', resolved.path),
          ...(headSource ? { headMetadata: semanticImportMetadata(input.job, 'head', headSource.path) } : {}),
          metadata: semanticImportMetadata(input.job, 'semantic-edit-script', resolved.path)
        })
        : undefined;
      const semanticEditProjection = semanticEditScript && headSource && api.projectSemanticEditScriptToSource
        ? api.projectSemanticEditScriptToSource({
          script: semanticEditScript,
          workerSourceText: sourceText,
          headSourceText: headSource.sourceText,
          metadata: semanticImportMetadata(input.job, 'semantic-edit-projection', resolved.path)
        })
        : undefined;
      const semanticEditReplay = semanticEditProjection && headSource && api.replaySemanticEditProjection
        ? api.replaySemanticEditProjection({
          projection: semanticEditProjection,
          currentSourceText: headSource.sourceText,
          currentSourcePath: headSource.path,
          language: file.language,
          metadata: semanticImportMetadata(input.job, 'semantic-edit-replay', resolved.path)
        })
        : undefined;
      const mergeCandidate = api.createSemanticMergeCandidateFromImport({ importResult });
      const semanticSidecar = api.createSemanticImportSidecar
        ? api.createSemanticImportSidecar(importResult, {
          targetPath: resolved.path,
          expected: input.semanticImportExpected === true,
          semanticImportExpected: input.semanticImportExpected === true,
          metadata: {
            swarmJobId: input.job.id,
            swarmTaskId: input.job.taskId,
            swarmLane: input.job.lane
          }
        })
        : undefined;
      const sourceProjection = api.projectNativeImportToSource
        ? api.projectNativeImportToSource(importResult, { sourceText, sourcePath: resolved.path })
        : undefined;
      const nativeCompile = api.compileNativeSource
        ? api.compileNativeSource(importResult, { target: file.language, sourceText, sourcePath: resolved.path, emitOnBlocked: true })
        : undefined;
      const semanticSlice = api.createSemanticSlice
        ? api.createSemanticSlice(importResult, {
          includeDependencies: true,
          focusedCommands: (input.job.verification ?? []).map((entry) => entry.command).filter(Boolean),
          metadata: {
            swarmJobId: input.job.id,
            swarmTaskId: input.job.taskId,
            swarmLane: input.job.lane
          }
        })
        : undefined;
      const semanticSliceGate = semanticSlice && api.testSemanticSlice
        ? api.testSemanticSlice(semanticSlice, { currentSources: { [file.path]: sourceText } })
        : undefined;
      const semanticSliceAdmission = semanticSlice && api.createSemanticSliceAdmissionRecord
        ? api.createSemanticSliceAdmissionRecord(semanticSlice, { testResult: semanticSliceGate })
        : undefined;
      const sourceMaps = Array.isArray(importResult?.sourceMaps)
        ? importResult.sourceMaps
        : Array.isArray(importResult?.universalAst?.sourceMaps)
          ? importResult.universalAst.sourceMaps
          : [];
      const dependencyEdges = summarizeSemanticDependencyEdges(sourceText);
      const dependencyEdgeHints = dependencyEdges.length > 0 ? [...dependencyEdges] : undefined;
      const semanticIndex = summarizeSemanticIndex(importResult?.semanticIndex);
      const semanticFacts = mergeSemanticFactSummaries([
        summarizeLangSidecarSemanticFacts(semanticSidecar),
        semanticImportFactSummary({ semanticIndex })
      ]);
      records.push({
        path: resolved.path,
        ...(resolved.path !== file.path ? { requestedPath: file.path } : {}),
        language: file.language,
        status: 'imported',
        bytes: stat.size,
        ...(dependencyEdges.length > 0 ? { dependencyEdges } : {}),
        ...(dependencyEdgeHints ? { dependencyEdgeHints } : {}),
        ...(baseSource ? { baseSource: summarizeSemanticImportBaseSource(baseSource) } : {}),
        ...(headSource ? { headSource: summarizeSemanticImportHeadSource(headSource) } : {}),
        importId: importResult?.id,
        universalAstHash: api.hashUniversalAstEnvelope && importResult?.universalAst
          ? api.hashUniversalAstEnvelope(importResult.universalAst)
          : undefined,
        nativeAstId: importResult?.nativeAst?.id,
        nativeSourceId: importResult?.nativeSource?.id,
        sourceMapCount: sourceMaps.length,
        sourceMapMappingCount: sourceMaps.reduce((sum: number, sourceMap: any) => sum + (Array.isArray(sourceMap?.mappings) ? sourceMap.mappings.length : 0), 0),
        evidenceCount: Array.isArray(importResult?.evidence) ? importResult.evidence.length : 0,
        lossCount: Array.isArray(importResult?.losses) ? importResult.losses.length : 0,
        losses: summarizeSemanticLosses(importResult?.losses),
        semanticIndex,
        semanticFacts,
        dependencies: summarizeSemanticDependencies(importResult?.semanticIndex, semanticSidecar),
        semanticSidecar: summarizeLangSemanticImportSidecar(semanticSidecar),
        universalAstLayers: summarizeUniversalAstLayers(importResult?.universalAst, semanticSidecar),
        proofSpec: summarizeProofSpec(importResult?.universalAst?.proof, semanticSidecar),
        paradigmSemantics: summarizeParadigmSemantics(importResult?.universalAst?.paradigmSemantics, semanticSidecar),
        semanticLineage: summarizeSemanticLineageEvidence(nativeDiff ?? semanticSidecar),
        semanticEditScript: summarizeSemanticEditScript(semanticEditScript),
        semanticEditProjection: summarizeSemanticEditProjection(semanticEditProjection),
        semanticEditReplay: summarizeSemanticEditReplay(semanticEditReplay),
        nativeDiff: summarizeNativeSourceChangeSet(nativeDiff),
        sourceProjection: summarizeNativeSourceProjection(sourceProjection),
        nativeCompile: summarizeNativeSourceCompile(nativeCompile),
        mergeCandidate: summarizeSemanticMergeCandidate(mergeCandidate, dependencyEdgeHints),
        semanticSlice: summarizeSemanticSlice(semanticSlice),
        semanticSliceAdmission: summarizeSemanticSliceAdmission(semanticSliceAdmission)
      });
    } catch (error) {
      records.push({
        path: file.path,
        language: file.language,
        status: 'error',
        bytes: stat.size,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  const sidecar = createSemanticImportSidecar(input.job, records, selection, input.semanticImportExpected === true);
  return writeSemanticImportEvidence({ importPath, evidenceDir: input.evidenceDir, sidecar, options });
}

async function writeSemanticImportEvidence(input: {
  importPath: string;
  evidenceDir: string;
  sidecar: FrontierCodexSemanticImportSidecar;
  options: ReturnType<typeof normalizeSemanticImportOptions> & {};
}): Promise<FrontierCodexSemanticImportEvidence> {
  const fullJson = JSON.stringify(input.sidecar, null, 2) + '\n';
  const originalBytes = Buffer.byteLength(fullJson, 'utf8');
  const maxBytes = semanticImportSidecarMaxBytes(input.options.outputPolicy?.maxBytes);
  const shouldArchive = originalBytes > maxBytes && input.options.outputPolicy?.archive !== false;
  if (!shouldArchive) {
    await fs.writeFile(input.importPath, fullJson);
    return {
      path: input.importPath,
      evidencePaths: [input.importPath],
      sidecar: input.sidecar,
      summary: input.sidecar.summary
    };
  }
  const archiveName = path.basename(input.options.outputPolicy?.archiveName ?? DEFAULT_SEMANTIC_IMPORT_ARCHIVE_NAME);
  const archivePath = path.join(input.evidenceDir, archiveName);
  const archiveBytes = gzipSync(Buffer.from(fullJson));
  await fs.writeFile(archivePath, archiveBytes);
  const originalSha256 = sha256Text(fullJson);
  const archiveSha256 = sha256Buffer(archiveBytes);
  const compactSidecar = compactSemanticImportSidecar(input.sidecar, {
    maxBytes,
    originalBytes,
    archivePath,
    archiveBytes: archiveBytes.byteLength,
    originalSha256,
    archiveSha256
  });
  await fs.writeFile(input.importPath, JSON.stringify(compactSidecar, null, 2) + '\n');
  return {
    path: input.importPath,
    archivePath,
    evidencePaths: [input.importPath, archivePath],
    sidecar: compactSidecar,
    summary: compactSidecar.summary
  };
}

function semanticImportSidecarMaxBytes(value: unknown): number {
  const parsed = Number(value ?? process.env.FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_SIDECAR_MAX_BYTES);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_SEMANTIC_IMPORT_SIDECAR_MAX_BYTES;
}

function compactSemanticImportSidecar(
  sidecar: FrontierCodexSemanticImportSidecar,
  policy: {
    maxBytes: number;
    originalBytes: number;
    archivePath: string;
    archiveBytes: number;
    originalSha256: string;
    archiveSha256: string;
  }
): FrontierCodexSemanticImportSidecar {
  let compactRecords = sidecar.records.map(compactSemanticImportRecord);
  let compact = semanticImportSidecarWithOutputPolicy(sidecar, compactRecords, { ...policy, summaryBytes: 0 });
  let compactBytes = Buffer.byteLength(JSON.stringify(compact, null, 2) + '\n', 'utf8');
  if (compactBytes > policy.maxBytes) {
    compactRecords = sidecar.records.map(minimalSemanticImportRecord);
    compact = semanticImportSidecarWithOutputPolicy(sidecar, compactRecords, {
      ...policy,
      summaryBytes: 0,
      reason: 'compact-records-minimized'
    });
    compactBytes = Buffer.byteLength(JSON.stringify(compact, null, 2) + '\n', 'utf8');
  }
  if (compactBytes > policy.maxBytes) {
    compactRecords = [];
    compact = semanticImportSidecarWithOutputPolicy(sidecar, compactRecords, {
      ...policy,
      summaryBytes: 0,
      reason: 'records-omitted-after-compaction'
    });
    compactBytes = Buffer.byteLength(JSON.stringify(compact, null, 2) + '\n', 'utf8');
  }
  return semanticImportSidecarWithOutputPolicy(compact, compactRecords, {
    ...policy,
    summaryBytes: compactBytes,
    reason: compact.summary.sidecarOutputPolicy?.reason
  });
}

function semanticImportSidecarWithOutputPolicy(
  sidecar: FrontierCodexSemanticImportSidecar,
  records: FrontierCodexSemanticImportRecord[],
  policy: {
    maxBytes: number;
    originalBytes: number;
    summaryBytes: number;
    archivePath: string;
    archiveBytes: number;
    originalSha256: string;
    archiveSha256: string;
    reason?: string;
  }
): FrontierCodexSemanticImportSidecar {
  return {
    ...sidecar,
    records,
    summary: {
      ...sidecar.summary,
      sidecarOutputPolicy: {
        mode: 'compact-summary',
        maxBytes: policy.maxBytes,
        originalBytes: policy.originalBytes,
        summaryBytes: policy.summaryBytes,
        archivePath: policy.archivePath,
        archiveBytes: policy.archiveBytes,
        originalSha256: policy.originalSha256,
        archiveSha256: policy.archiveSha256,
        ...(policy.reason ? { reason: policy.reason } : {})
      }
    }
  };
}

function compactSemanticImportRecord(record: FrontierCodexSemanticImportRecord): FrontierCodexSemanticImportRecord {
  return {
    path: record.path,
    ...(record.requestedPath ? { requestedPath: record.requestedPath } : {}),
    ...(record.language ? { language: record.language } : {}),
    status: record.status,
    ...(record.reason ? { reason: record.reason } : {}),
    ...(record.bytes !== undefined ? { bytes: record.bytes } : {}),
    ...(record.importId ? { importId: record.importId } : {}),
    ...(record.universalAstHash ? { universalAstHash: record.universalAstHash } : {}),
    ...(record.nativeAstId ? { nativeAstId: record.nativeAstId } : {}),
    ...(record.nativeSourceId ? { nativeSourceId: record.nativeSourceId } : {}),
    ...(record.sourceMapCount !== undefined ? { sourceMapCount: record.sourceMapCount } : {}),
    ...(record.sourceMapMappingCount !== undefined ? { sourceMapMappingCount: record.sourceMapMappingCount } : {}),
    ...(record.lossCount !== undefined ? { lossCount: record.lossCount } : {}),
    ...(record.semanticIndex ? { semanticIndex: record.semanticIndex } : {}),
    ...(record.semanticSidecar ? { semanticSidecar: record.semanticSidecar } : {}),
    ...(record.semanticLineage ? { semanticLineage: record.semanticLineage } : {}),
    ...(record.semanticEditScript ? { semanticEditScript: record.semanticEditScript } : {}),
    ...(record.semanticEditProjection ? { semanticEditProjection: record.semanticEditProjection } : {}),
    ...(record.semanticEditReplay ? { semanticEditReplay: record.semanticEditReplay } : {}),
    ...(record.nativeDiff ? { nativeDiff: record.nativeDiff } : {}),
    ...(record.sourceProjection ? { sourceProjection: record.sourceProjection } : {}),
    ...(record.nativeCompile ? { nativeCompile: record.nativeCompile } : {}),
    ...(record.mergeCandidate ? { mergeCandidate: record.mergeCandidate } : {}),
    ...(record.semanticSliceAdmission ? { semanticSliceAdmission: record.semanticSliceAdmission } : {}),
    ...(record.error ? { error: record.error } : {})
  };
}

function minimalSemanticImportRecord(record: FrontierCodexSemanticImportRecord): FrontierCodexSemanticImportRecord {
  return {
    path: record.path,
    ...(record.requestedPath ? { requestedPath: record.requestedPath } : {}),
    ...(record.language ? { language: record.language } : {}),
    status: record.status,
    ...(record.reason ? { reason: record.reason } : {}),
    ...(record.bytes !== undefined ? { bytes: record.bytes } : {}),
    ...(record.universalAstHash ? { universalAstHash: record.universalAstHash } : {}),
    ...(record.nativeAstId ? { nativeAstId: record.nativeAstId } : {}),
    ...(record.nativeSourceId ? { nativeSourceId: record.nativeSourceId } : {}),
    ...(record.nativeDiff ? { nativeDiff: record.nativeDiff } : {}),
    ...(record.error ? { error: record.error } : {})
  };
}

function sha256Text(value: string): string {
  return sha256Buffer(Buffer.from(value));
}

function sha256Buffer(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function semanticImportMetadata(job: FrontierSwarmJob, phase: string, sourcePath: string): Record<string, unknown> {
  return { swarmJobId: job.id, swarmTaskId: job.taskId, swarmLane: job.lane, phase, sourcePath };
}

function summarizeSemanticImportBaseSource(baseSource: SemanticImportBaseSourceSummaryInput) {
  return {
    path: baseSource.path,
    source: baseSource.source,
    bytes: baseSource.bytes,
    foundBy: baseSource.foundBy
  };
}

function summarizeSemanticImportHeadSource(headSource: SemanticImportHeadSourceSummaryInput) {
  return {
    path: headSource.path,
    source: headSource.source,
    bytes: headSource.bytes,
    foundBy: headSource.foundBy
  };
}

function summarizeSemanticDependencyEdges(sourceText: string): string[] {
  const edges = new Set<string>();
  const importPattern = /^\s*import(?:\s+type)?(?:[\s\S]*?\s+from\s+|\s+)['"]([^'"]+)['"]/gm;
  const namespaceExportPattern = /^\s*export\s+\*\s+as\s+[\w$]+\s+from\s+['"]([^'"]+)['"]/gm;
  const exportFromPattern = /^\s*export\s+(?:\*\s+from|\{[\s\S]*?\}\s+from)\s+['"]([^'"]+)['"]/gm;

  for (const pattern of [importPattern, namespaceExportPattern, exportFromPattern]) {
    for (let match = pattern.exec(sourceText); match; match = pattern.exec(sourceText)) {
      const specifier = match[1]?.trim();
      if (!specifier) continue;
      edges.add(
        pattern === importPattern
          ? `import:${specifier}`
          : pattern === namespaceExportPattern
            ? `namespace-export:${specifier}`
            : `re-export:${specifier}`
      );
    }
  }

  return Array.from(edges).sort();
}
