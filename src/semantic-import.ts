import fs from 'node:fs/promises';
import path from 'node:path';
import { type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions, FrontierCodexSemanticImportRecord, FrontierCodexSemanticImportSidecar } from './index.js';
import { summarizeUniversalAstLayers, summarizeNativeSourceProjection, summarizeNativeSourceCompile, summarizeSemanticLosses, summarizeSemanticMergeCandidate } from './semantic-import-layers.js';
import { summarizeParadigmSemantics } from './semantic-import-paradigm.js';
import { summarizeProofSpec } from './semantic-import-proof.js';
import {
  createSemanticImportSidecar,
  summarizeLangSemanticImportSidecar,
  summarizeSemanticIndex,
  summarizeSemanticSlice,
  summarizeSemanticSliceAdmission
} from './semantic-import-sidecar.js';
import { loadFrontierLangForSemanticImport, normalizeSemanticImportOptions, selectSemanticImportPaths, semanticImportCandidatePaths } from './semantic-import-select.js';

export async function createCodexSemanticImportSidecar(input: {
  job: FrontierSwarmJob;
  workspace: string;
  changedPaths: readonly string[];
  evidenceDir: string;
  options?: boolean | FrontierCodexSemanticImportOptions;
}): Promise<{ path: string; sidecar: FrontierCodexSemanticImportSidecar } | undefined> {
  const options = normalizeSemanticImportOptions(input.options);
  if (!options) return undefined;
  const selection = selectSemanticImportPaths(semanticImportCandidatePaths(input.job, input.changedPaths), options);
  const selected = selection.selected;
  const records: FrontierCodexSemanticImportRecord[] = [];
  const importPath = path.join(input.evidenceDir, 'semantic-imports.json');
  if (!selected.length) {
    const sidecar = createSemanticImportSidecar(input.job, records, selection);
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
  }
  const api = await loadFrontierLangForSemanticImport();
  if (!api.ok) {
    for (const file of selected) {
      records.push({
        path: file.path,
        language: file.language,
        status: 'error',
        reason: 'frontier-lang-unavailable',
        error: api.error
      });
    }
    const sidecar = createSemanticImportSidecar(input.job, records, selection);
    await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
    return { path: importPath, sidecar };
  }
  for (const file of selected) {
    const absolute = path.join(input.workspace, file.path);
    const stat = await fs.stat(absolute).catch(() => undefined);
    if (!stat?.isFile()) {
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'not-a-file' });
      continue;
    }
    if (stat.size > options.maxBytes) {
      records.push({ path: file.path, language: file.language, status: 'skipped', reason: 'too-large', bytes: stat.size });
      continue;
    }
    try {
      const sourceText = await fs.readFile(absolute, 'utf8');
      const importResult = api.importNativeSource({
        language: file.language,
        sourcePath: file.path,
        sourceText,
        parser: 'source-text',
        metadata: {
          swarmJobId: input.job.id,
          swarmTaskId: input.job.taskId,
          swarmLane: input.job.lane
        }
      });
      const mergeCandidate = api.createSemanticMergeCandidateFromImport({ importResult });
      const semanticSidecar = api.createSemanticImportSidecar
        ? api.createSemanticImportSidecar(importResult, {
          targetPath: file.path,
          metadata: {
            swarmJobId: input.job.id,
            swarmTaskId: input.job.taskId,
            swarmLane: input.job.lane
          }
        })
        : undefined;
      const sourceProjection = api.projectNativeImportToSource
        ? api.projectNativeImportToSource(importResult, { sourceText, sourcePath: file.path })
        : undefined;
      const nativeCompile = api.compileNativeSource
        ? api.compileNativeSource(importResult, { target: file.language, sourceText, sourcePath: file.path, emitOnBlocked: true })
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
      records.push({
        path: file.path,
        language: file.language,
        status: 'imported',
        bytes: stat.size,
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
        semanticIndex: summarizeSemanticIndex(importResult?.semanticIndex),
        semanticSidecar: summarizeLangSemanticImportSidecar(semanticSidecar),
        universalAstLayers: summarizeUniversalAstLayers(importResult?.universalAst, semanticSidecar),
        proofSpec: summarizeProofSpec(importResult?.universalAst?.proof, semanticSidecar),
        paradigmSemantics: summarizeParadigmSemantics(importResult?.universalAst?.paradigmSemantics, semanticSidecar),
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
  const sidecar = createSemanticImportSidecar(input.job, records, selection);
  await fs.writeFile(importPath, JSON.stringify(sidecar, null, 2) + '\n');
  return { path: importPath, sidecar };
}
