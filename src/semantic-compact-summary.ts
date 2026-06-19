import { isObject, nonNegativeNumber, readStringArray } from './common.js';
import { summarizeCodexSemanticImportQuality } from './semantic-import-quality.js';
import type {
  FrontierCodexSemanticCompactSourceSnapshot,
  FrontierCodexSemanticCompactSourceSummary,
  FrontierCodexSemanticCompactSummary
} from './types-semantic-compact.js';

const MAX_COMPACT_SOURCES = 50;

export function createSemanticCompactSummary(input: {
  summary?: unknown;
  sidecar?: unknown;
  expected?: boolean;
}): FrontierCodexSemanticCompactSummary | undefined {
  const summary = readSummary(input.summary, input.sidecar);
  const sidecar = isObject(input.sidecar) ? input.sidecar : undefined;
  const quality = summarizeCodexSemanticImportQuality(
    summary as Parameters<typeof summarizeCodexSemanticImportQuality>[0],
    input.expected ?? false
  );
  if (!quality.present && !sidecar) return undefined;
  const sources = compactSourceSummaries(sidecar);
  return {
    version: 1,
    present: quality.present,
    expected: quality.expected,
    expectedSatisfied: quality.expectedSatisfied,
    expectedMissingReasonCodes: quality.expectedMissingReasonCodes,
    selected: quality.selected,
    eligible: quality.eligible,
    imported: quality.imported,
    errors: quality.errors,
    sourceMapMappings: quality.sourceMapMappings,
    symbols: quality.symbols,
    ownershipRegions: quality.ownershipRegions,
    patchHints: quality.patchHints,
    semanticFacts: quality.semanticFacts,
    dependencyRelations: quality.dependencyRelations,
    universalAstLayers: quality.universalAstLayers,
    proofSpecObligations: quality.proofSpecObligations,
    proofSpecFailedObligations: quality.proofSpecFailedObligations,
    lineage: {
      events: quality.semanticLineageEvents,
      moved: quality.semanticLineageMoved,
      renamed: quality.semanticLineageRenamed,
      deleted: quality.semanticLineageDeleted,
      ambiguous: quality.semanticLineageAmbiguous,
      blocked: quality.semanticLineageBlocked,
      needsReview: quality.semanticLineageNeedsReview,
      eventKinds: quality.semanticLineageEventKinds,
      reasonCodes: quality.semanticLineageReasonCodes
    },
    semanticEdit: {
      status: quality.semanticEditAdmission.status,
      autoMergeCandidate: quality.semanticEditAdmission.autoMergeCandidate,
      cleanEligible: quality.semanticEditAdmission.cleanEligible,
      admission: quality.semanticEditAdmission,
      script: quality.semanticEditScript,
      projection: quality.semanticEditProjection,
      replay: quality.semanticEditReplay
    },
    warnings: quality.warnings,
    sourceCount: sourceRecords(sidecar).length,
    truncatedSourceCount: Math.max(0, sourceRecords(sidecar).length - sources.length),
    sources
  };
}

function readSummary(summary: unknown, sidecar: unknown): unknown {
  if (summary !== undefined) return summary;
  if (!isObject(sidecar)) return undefined;
  return sidecar.summary;
}

function compactSourceSummaries(sidecar: Record<string, unknown> | undefined): FrontierCodexSemanticCompactSourceSummary[] {
  return sourceRecords(sidecar).slice(0, MAX_COMPACT_SOURCES).map((record) => {
    const nativeDiff = isObject(record.nativeDiff) ? record.nativeDiff : {};
    return {
      path: String(record.path ?? ''),
      ...(typeof record.requestedPath === 'string' ? { requestedPath: record.requestedPath } : {}),
      ...(typeof record.language === 'string' ? { language: record.language } : {}),
      status: String(record.status ?? 'unknown'),
      ...(typeof record.reason === 'string' ? { reason: record.reason } : {}),
      ...(typeof record.bytes === 'number' ? { bytes: record.bytes } : {}),
      ...(sourceSnapshot(record.baseSource, stringField(nativeDiff, 'beforeHash')) ? { baseSource: sourceSnapshot(record.baseSource, stringField(nativeDiff, 'beforeHash'))! } : {}),
      ...(sourceSnapshot(record.headSource, stringField(nativeDiff, 'afterHash')) ? { headSource: sourceSnapshot(record.headSource, stringField(nativeDiff, 'afterHash'))! } : {}),
      hashes: {
        ...(stringField(nativeDiff, 'beforeHash') ? { before: stringField(nativeDiff, 'beforeHash') } : {}),
        ...(stringField(nativeDiff, 'afterHash') ? { after: stringField(nativeDiff, 'afterHash') } : {}),
        ...(typeof record.universalAstHash === 'string' ? { universalAst: record.universalAstHash } : {}),
        ...(typeof record.nativeAstId === 'string' ? { nativeAst: record.nativeAstId } : {}),
        ...(typeof record.nativeSourceId === 'string' ? { nativeSource: record.nativeSourceId } : {})
      },
      changedSymbols: nonNegativeNumber(nativeDiff.changedSymbols),
      changedRegions: nonNegativeNumber(nativeDiff.changedRegions),
      ...(typeof nativeDiff.readiness === 'string' ? { readiness: nativeDiff.readiness } : {}),
      reasonCodes: readStringArray(nativeDiff.reasons)
    };
  });
}

function sourceRecords(sidecar: Record<string, unknown> | undefined): Record<string, unknown>[] {
  return Array.isArray(sidecar?.records)
    ? sidecar.records.filter((entry): entry is Record<string, unknown> => isObject(entry))
    : [];
}

function sourceSnapshot(value: unknown, hash?: string): FrontierCodexSemanticCompactSourceSnapshot | undefined {
  if (!isObject(value)) return undefined;
  return {
    path: String(value.path ?? ''),
    source: String(value.source ?? 'unknown'),
    bytes: nonNegativeNumber(value.bytes),
    foundBy: String(value.foundBy ?? 'unknown'),
    ...(hash ? { hash } : {})
  };
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  return typeof value[key] === 'string' ? value[key] : undefined;
}
