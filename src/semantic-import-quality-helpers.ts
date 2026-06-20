import { nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';

type SemanticImportExpectedSatisfiedInput = { expected: boolean; present: boolean; empty: boolean; imported: number; symbols: number; ownershipRegions: number; patchHints: number; reasonCodes: readonly string[] };
type SemanticImportExpectedMissingInput = { expected: boolean; present: boolean; empty: boolean; selected: number; imported: number; symbols: number; ownershipRegions: number; patchHints: number };

export function semanticImportCandidateCount(summary: unknown): number {
  const record = summaryRecord(summary);
  return nonNegativeNumber((record?.selection as { candidates?: unknown } | undefined)?.candidates ?? record?.total);
}

export function semanticImportExpected(summary: unknown, fallback: boolean): boolean {
  if (fallback) return true;
  const record = summaryRecord(summary);
  if (!record) return false;
  return record.semanticImportExpected === true ||
    record.expected === true ||
    (record.quality as { expected?: unknown } | undefined)?.expected === true ||
    (record.admission as { expected?: unknown } | undefined)?.expected === true;
}

export function semanticImportExpectedSatisfied(summary: unknown, input: SemanticImportExpectedSatisfiedInput): boolean {
  if (!input.expected) return true;
  const explicit = semanticImportExplicitExpectedSatisfied(summary);
  if (explicit !== undefined) return explicit && input.reasonCodes.length === 0;
  return input.present &&
    !input.empty &&
    input.imported > 0 &&
    input.symbols > 0 &&
    input.ownershipRegions > 0 &&
    input.patchHints > 0 &&
    input.reasonCodes.length === 0;
}

export function semanticImportExpectedMissingReasonCodes(summary: unknown, input: SemanticImportExpectedMissingInput): string[] {
  const record = summaryRecord(summary);
  const explicitCodes = uniqueStrings([
    ...readStringArray(record?.semanticImportExpectedMissingReasonCodes),
    ...readStringArray((record?.quality as { expectedMissingReasonCodes?: unknown } | undefined)?.expectedMissingReasonCodes),
    ...readStringArray((record?.admission as { expectedMissingReasonCodes?: unknown } | undefined)?.expectedMissingReasonCodes)
  ]);
  if (!input.expected) return explicitCodes;
  const inferredCodes: string[] = [];
  if (!input.present) inferredCodes.push('expected-semantic-import-missing');
  if (input.present && input.selected === 0) inferredCodes.push('expected-semantic-import-missing');
  if (input.present && input.selected > 0 && input.imported === 0) inferredCodes.push('missing-imports');
  if (input.present && input.imported > 0 && input.symbols === 0) {
    inferredCodes.push('expected-semantic-import-empty', 'empty-semantic-index');
  }
  if (input.present && input.imported > 0 && input.ownershipRegions === 0) inferredCodes.push('missing-ownership-regions');
  if (input.present && input.imported > 0 && input.patchHints === 0) inferredCodes.push('missing-patch-hints');
  if (input.empty && !inferredCodes.includes('expected-semantic-import-empty')) {
    inferredCodes.push('expected-semantic-import-empty');
  }
  return uniqueStrings([...explicitCodes, ...inferredCodes]);
}

function semanticImportExplicitExpectedSatisfied(summary: unknown): boolean | undefined {
  const record = summaryRecord(summary);
  const candidates = [
    record?.semanticImportExpectedSatisfied,
    (record?.quality as { expectedSatisfied?: unknown } | undefined)?.expectedSatisfied,
    (record?.admission as { expectedSatisfied?: unknown } | undefined)?.expectedSatisfied
  ];
  for (const value of candidates) {
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

export function semanticLineageExpectedForBeforeSourceDiff(summary: unknown, beforeSymbols: number): boolean {
  if (beforeSymbols > 0) return true;
  const record = summaryRecord(summary);
  if (!record) return false;
  const quality = record.quality as { semanticLineageExpected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const admission = record.admission as { semanticLineageExpected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const lineage = record.semanticLineage as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const inference = record.semanticLineageInference as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  const lineageInference = record.lineageInference as { expected?: unknown; beforeSourceDiffExpected?: unknown } | undefined;
  return [
    record.semanticLineageExpected,
    record.semanticLineageInferenceExpected,
    record.beforeSourceDiffExpected,
    record.beforeSourceExpected,
    quality?.semanticLineageExpected,
    quality?.beforeSourceDiffExpected,
    admission?.semanticLineageExpected,
    admission?.beforeSourceDiffExpected,
    lineage?.expected,
    lineage?.beforeSourceDiffExpected,
    inference?.expected,
    inference?.beforeSourceDiffExpected,
    lineageInference?.expected,
    lineageInference?.beforeSourceDiffExpected
  ].some((value) => value === true);
}

export function summaryRecord(summary: unknown): Record<string, unknown> | undefined {
  return summary && typeof summary === 'object' && !Array.isArray(summary)
    ? summary as Record<string, unknown>
    : undefined;
}

export function semanticSelectionSummary(summary: unknown): {
  includeFiltered: number;
  unsupportedLanguage: number;
} {
  const selection = summary && typeof summary === 'object'
    ? (summary as { selection?: { includeFiltered?: unknown; unsupportedLanguage?: unknown } }).selection
    : undefined;
  return {
    includeFiltered: nonNegativeNumber(selection?.includeFiltered),
    unsupportedLanguage: nonNegativeNumber(selection?.unsupportedLanguage)
  };
}

export function semanticImportSourceProjectionSummary(summary: unknown): {
  total: number;
  preserved: number;
  stubs: number;
  ready: number;
  needsReview: number;
  blocked: number;
} {
  const sourceProjections = (summaryRecord(summary)?.sourceProjections ?? {}) as Record<string, unknown>;
  return {
    total: nonNegativeNumber(sourceProjections.total),
    preserved: nonNegativeNumber(sourceProjections.preserved),
    stubs: nonNegativeNumber(sourceProjections.stubs),
    ready: nonNegativeNumber(sourceProjections.ready),
    needsReview: nonNegativeNumber(sourceProjections.needsReview),
    blocked: nonNegativeNumber(sourceProjections.blocked)
  };
}

export function semanticImportNativeCompileSummary(summary: unknown): {
  total: number;
  emitted: number;
  preserved: number;
  targetStubs: number;
  ready: number;
  needsReview: number;
  blocked: number;
} {
  const nativeCompiles = (summaryRecord(summary)?.nativeCompiles ?? {}) as Record<string, unknown>;
  return {
    total: nonNegativeNumber(nativeCompiles.total),
    emitted: nonNegativeNumber(nativeCompiles.emitted),
    preserved: nonNegativeNumber(nativeCompiles.preserved),
    targetStubs: nonNegativeNumber(nativeCompiles.targetStubs),
    ready: nonNegativeNumber(nativeCompiles.ready),
    needsReview: nonNegativeNumber(nativeCompiles.needsReview),
    blocked: nonNegativeNumber(nativeCompiles.blocked)
  };
}

export function semanticImportSliceAdmissionSummary(summary: unknown): {
  total: number;
  admitted: number;
  prioritized: number;
  rejected: number;
} {
  const semanticSliceAdmissions = (summaryRecord(summary)?.semanticSliceAdmissions ?? {}) as Record<string, unknown>;
  return {
    total: nonNegativeNumber(semanticSliceAdmissions.total),
    admitted: nonNegativeNumber(semanticSliceAdmissions.admitted),
    prioritized: nonNegativeNumber(semanticSliceAdmissions.prioritized),
    rejected: nonNegativeNumber(semanticSliceAdmissions.rejected)
  };
}
