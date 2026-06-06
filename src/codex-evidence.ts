import fs from 'node:fs/promises';
import type { FrontierSwarmJob, FrontierSwarmJobResultInput, FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND,
  FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION,
  FRONTIER_SWARM_CODEX_PATCH_INTENT_KIND,
  FRONTIER_SWARM_CODEX_PATCH_INTENT_VERSION
} from './constants.js';
import type { FrontierCodexHandoffArtifact, FrontierCodexJobEvidenceSummary, FrontierCodexLogSummary, FrontierCodexPatchHunkSummary, FrontierCodexPatchIntent, FrontierCodexSemanticImportSidecar } from './index.js';
import { firstNonEmptyLine, uniqueStrings } from './common.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';


export async function writeCodexJobEvidenceSummary(input: {
  file: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
  mergeBundlePath: string;
  patchPath?: string;
  patchIntentPath?: string;
  logSummary?: FrontierCodexLogSummary;
  semanticImportPath?: string;
  semanticImport?: FrontierCodexSemanticImportSidecar;
  handoffArtifacts: readonly FrontierCodexHandoffArtifact[];
}): Promise<void> {
  const patchHunks = input.patchPath ? await readPatchHunks(input.patchPath) : [];
  const sourceCitations = createCodexEvidenceSourceCitations(input.mergeBundle, input.semanticImport);
  const evidence: FrontierCodexJobEvidenceSummary = {
    kind: FRONTIER_SWARM_CODEX_JOB_EVIDENCE_KIND,
    version: FRONTIER_SWARM_CODEX_JOB_EVIDENCE_VERSION,
    generatedAt: Date.now(),
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    status: input.result.status ?? 'unknown',
    mergeReadiness: input.mergeBundle.mergeReadiness,
    disposition: input.mergeBundle.disposition,
    riskLevel: input.mergeBundle.riskLevel,
    changedPaths: [...input.mergeBundle.changedPaths],
    changedRegions: [...input.mergeBundle.changedRegions],
    ownershipViolations: [...input.mergeBundle.ownershipViolations],
    ...(input.patchPath ? { patchPath: input.patchPath } : {}),
    mergeBundlePath: input.mergeBundlePath,
    ...(input.patchIntentPath ? { patchIntentPath: input.patchIntentPath } : {}),
    ...(input.semanticImportPath ? { semanticImportPath: input.semanticImportPath } : {}),
    evidencePaths: uniqueStrings(input.mergeBundle.evidencePaths),
    handoffArtifacts: input.handoffArtifacts.map((artifact) => ({ ...artifact })),
    commands: {
      passed: input.mergeBundle.commandsPassed.map((command) => ({
        name: command.name,
        command: [...command.command],
        ...(command.status !== undefined ? { status: command.status } : {})
      })),
      failed: input.mergeBundle.commandsFailed.map((command) => ({
        name: command.name,
        command: [...command.command],
        ...(command.status !== undefined ? { status: command.status } : {})
      }))
    },
    patchHunks,
    readyToPortHunkCount: input.mergeBundle.disposition === 'needs-port' || input.mergeBundle.disposition === 'auto-mergeable' ? patchHunks.length : 0,
    ...(input.semanticImport ? { semanticImport: input.semanticImport.summary } : {}),
    sourceCitations,
    metadata: {
      autoMergeable: input.mergeBundle.autoMergeable,
      staleAgainstHead: input.mergeBundle.staleAgainstHead,
      ...(input.logSummary ? { logSummary: input.logSummary } : {}),
      reasons: input.mergeBundle.reasons
    }
  };
  await fs.writeFile(input.file, JSON.stringify(evidence, null, 2) + '\n');
}


export async function writeCodexPatchIntent(input: {
  file: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
  patchPath?: string;
  semanticImport?: FrontierCodexSemanticImportSidecar;
  semanticImportExpected: boolean;
  evidencePaths: readonly string[];
}): Promise<void> {
  const patchHunks = input.patchPath ? await readPatchHunks(input.patchPath) : [];
  const semanticImportQuality = summarizeCodexSemanticImportQuality(input.semanticImport?.summary, input.semanticImportExpected);
  const warnings = uniqueStrings([
    ...semanticImportQuality.warnings,
    ...(input.mergeBundle.staleAgainstHead ? ['stale against coordinator head'] : []),
    ...(input.mergeBundle.ownershipViolations.length ? ['ownership violations present'] : []),
    ...(input.mergeBundle.commandsFailed.length ? ['verification commands failed'] : []),
    ...(input.mergeBundle.disposition === 'discovery-only' ? ['discovery-only output'] : [])
  ]);
  const intent: FrontierCodexPatchIntent = {
    kind: FRONTIER_SWARM_CODEX_PATCH_INTENT_KIND,
    version: FRONTIER_SWARM_CODEX_PATCH_INTENT_VERSION,
    generatedAt: Date.now(),
    jobId: input.job.id,
    taskId: input.job.taskId,
    lane: input.job.lane,
    changedPaths: [...input.mergeBundle.changedPaths],
    changedRegions: [...input.mergeBundle.changedRegions],
    intent: input.mergeBundle.changedPaths.length
      ? `Patch ${input.mergeBundle.changedPaths.slice(0, 5).join(', ')}`
      : 'No source patch produced',
    why: input.result.lastMessage ? firstNonEmptyLine(input.result.lastMessage) ?? input.job.task.objective : input.job.task.objective,
    riskLevel: input.mergeBundle.riskLevel,
    mergeReadiness: input.mergeBundle.mergeReadiness,
    disposition: input.mergeBundle.disposition,
    safeToPortManually: input.mergeBundle.commandsFailed.length === 0
      && input.mergeBundle.ownershipViolations.length === 0
      && !input.mergeBundle.staleAgainstHead
      && input.mergeBundle.disposition !== 'rejected'
      && input.mergeBundle.disposition !== 'blocked',
    verification: input.mergeBundle.commandsPassed.concat(input.mergeBundle.commandsFailed).map((command) => ({
      name: command.name,
      command: [...command.command],
      ...(command.status !== undefined ? { status: command.status } : {}),
      required: command.required
    })),
    evidencePaths: uniqueStrings(input.evidencePaths),
    semanticImportQuality,
    patchHunks,
    warnings
  };
  await fs.writeFile(input.file, JSON.stringify(intent, null, 2) + '\n');
}


export async function readPatchHunks(file: string): Promise<FrontierCodexPatchHunkSummary[]> {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  if (!text.trim()) return [];
  const hunks: FrontierCodexPatchHunkSummary[] = [];
  let currentFile: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('+++ ')) {
      currentFile = line.slice(4).replace(/^b\//, '').trim();
      continue;
    }
    if (!line.startsWith('@@')) continue;
    const match = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?/.exec(line);
    hunks.push({
      ...(currentFile ? { file: currentFile } : {}),
      header: line,
      ...(match ? {
        oldStart: Number(match[1]),
        oldLines: Number(match[2] ?? '1'),
        newStart: Number(match[3]),
        newLines: Number(match[4] ?? '1')
      } : {})
    });
  }
  return hunks;
}


export function createCodexEvidenceSourceCitations(
  bundle: FrontierSwarmMergeBundle,
  semanticImport?: FrontierCodexSemanticImportSidecar
): Array<{ path: string; kind: string; language?: string; hash?: string }> {
  const citations: Array<{ path: string; kind: string; language?: string; hash?: string }> = [
    ...bundle.changedPaths.map((file) => ({ path: file, kind: 'changed-source' })),
    ...(semanticImport?.records ?? []).map((record) => ({
      path: record.path,
      kind: 'semantic-import',
      ...(record.language ? { language: record.language } : {}),
      ...(record.universalAstHash ? { hash: record.universalAstHash } : {})
    }))
  ];
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.kind}:${citation.path}:${citation.language ?? ''}:${citation.hash ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
