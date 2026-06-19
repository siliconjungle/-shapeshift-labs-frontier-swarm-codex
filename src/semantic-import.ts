import fs from 'node:fs/promises';
import path from 'node:path';
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

export async function createCodexSemanticImportSidecar(input: {
  job: FrontierSwarmJob;
  workspace: string;
  changedPaths: readonly string[];
  evidenceDir: string;
  baseCwd?: string;
  baseSources?: SemanticImportBaseSourceSnapshot;
  options?: boolean | FrontierCodexSemanticImportOptions;
  semanticImportExpected?: boolean;
}): Promise<{ path: string; sidecar: FrontierCodexSemanticImportSidecar } | undefined> {
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
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
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
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
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
        mergeCandidate: summarizeSemanticMergeCandidate(mergeCandidate),
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
  await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
  return { path: importPath, sidecar };
}

function semanticImportMetadata(job: FrontierSwarmJob, phase: string, sourcePath: string): Record<string, unknown> {
  return {
    swarmJobId: job.id,
    swarmTaskId: job.taskId,
    swarmLane: job.lane,
    phase,
    sourcePath
  };
}

function summarizeSemanticImportBaseSource(baseSource: {
  path: string;
  source: 'workspace-snapshot' | 'coordinator-workspace' | 'git-head';
  bytes: number;
  foundBy: string;
}) {
  return {
    path: baseSource.path,
    source: baseSource.source,
    bytes: baseSource.bytes,
    foundBy: baseSource.foundBy
  };
}

function summarizeSemanticImportHeadSource(headSource: {
  path: string;
  source: 'coordinator-workspace' | 'git-head';
  bytes: number;
  foundBy: string;
}) {
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
