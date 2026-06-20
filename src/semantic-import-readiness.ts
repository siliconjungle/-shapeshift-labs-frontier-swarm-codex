import type { FrontierCodexSemanticImportRecord } from './index.js';
import { readStringArray, uniqueStrings } from './common.js';
import type { SemanticImportSelection } from './semantic-import-select.js';

export function semanticImportReadinessKeys(record: FrontierCodexSemanticImportRecord): string[] {
  const keys: string[] = [];
  const candidate = record.mergeCandidate as { readiness?: unknown } | undefined;
  addRawReadinessKey(keys, candidate?.readiness);
  if (record.status === 'skipped') {
    if (record.reason === 'frontier-lang-unavailable') {
      keys.push('tooling-unavailable', 'semantic-sidecar-unavailable', 'universal-ast-unavailable', 'proof-spec-unavailable');
    } else {
      keys.push('semantic-import-skipped');
      addPrefixedReadinessKey(keys, 'semantic-import-skipped', record.reason);
    }
    return uniqueStrings(keys);
  }
  if (record.status === 'error') return uniqueStrings([...keys, 'semantic-import-error']);
  if (record.status !== 'imported') return uniqueStrings(keys);

  addSemanticSidecarReadiness(keys, record.semanticSidecar);
  addUniversalAstReadiness(keys, record.universalAstLayers);
  addProofSpecReadiness(keys, record.proofSpec);
  addSourceProjectionReadiness(keys, record.sourceProjection);
  addNativeCompileReadiness(keys, record.nativeCompile);
  return uniqueStrings(keys);
}

export function summarizeExpectedSemanticImport(
  records: FrontierCodexSemanticImportRecord[],
  selection: SemanticImportSelection | undefined,
  expected: boolean,
  totals: { imported: number; symbols: number; ownershipRegions: number; patchHints: number; evidence: number }
): { expected: boolean; satisfied: boolean; missingReasonCodes: string[] } {
  const selected = selection?.selected.length ?? records.length;
  const explicitCodes = records.flatMap((record) => {
    const sidecar = record.semanticSidecar as { semanticImportExpectedMissingReasonCodes?: unknown } | undefined;
    return readStringArray(sidecar?.semanticImportExpectedMissingReasonCodes);
  });
  const explicitUnsatisfied = records.some((record) => {
    const sidecar = record.semanticSidecar as { semanticImportExpectedSatisfied?: unknown } | undefined;
    return sidecar?.semanticImportExpectedSatisfied === false;
  });
  const frontierLangUnavailable = records.some((record) => record.reason === 'frontier-lang-unavailable');
  const inferredCodes: string[] = [];
  if (expected && selected === 0) inferredCodes.push('expected-semantic-import-missing');
  if (expected && selected > 0 && totals.imported === 0) {
    inferredCodes.push('missing-imports');
    if (frontierLangUnavailable) inferredCodes.push('frontier-lang-unavailable');
  }
  if (expected && totals.imported > 0 && totals.symbols === 0) {
    inferredCodes.push('expected-semantic-import-empty', 'empty-semantic-index');
  }
  if (expected && totals.imported > 0 && totals.ownershipRegions === 0) inferredCodes.push('missing-ownership-regions');
  if (expected && totals.imported > 0 && totals.patchHints === 0) inferredCodes.push('missing-patch-hints');
  if (expected && totals.imported > 0 && totals.evidence === 0) inferredCodes.push('empty-evidence');
  const includeRecordMissingCodes = expected && totals.imported > 0 && (
    totals.symbols === 0 ||
    totals.ownershipRegions === 0 ||
    totals.patchHints === 0
  );
  const missingReasonCodes = uniqueStrings([
    ...explicitCodes,
    ...inferredCodes,
    ...(includeRecordMissingCodes ? records.flatMap(semanticSidecarExpectedMissingReasonCodes) : [])
  ]);
  const satisfied = !expected || (
    totals.imported > 0 &&
    totals.symbols > 0 &&
    totals.ownershipRegions > 0 &&
    totals.patchHints > 0 &&
    totals.evidence > 0 &&
    missingReasonCodes.length === 0 &&
    !explicitUnsatisfied
  );
  return { expected, satisfied, missingReasonCodes };
}

function addSemanticSidecarReadiness(keys: string[], value: unknown): void {
  const sidecar = objectRecord(value);
  if (!sidecar) {
    keys.push('semantic-sidecar-unavailable');
    return;
  }
  addPrefixedReadinessKey(keys, 'semantic-sidecar', sidecar.readiness);
  const symbols = nonNegativeValue(sidecar.symbols);
  const ownershipRegions = nonNegativeValue(sidecar.ownershipRegions);
  const patchHints = nonNegativeValue(sidecar.patchHints);
  if (sidecar.emptySemanticIndex === true || symbols === 0) {
    keys.push('semantic-sidecar-empty');
  } else if (ownershipRegions > 0 && patchHints > 0) {
    keys.push('semantic-sidecar-ready');
  } else {
    keys.push('semantic-sidecar-partial');
  }
}

function addUniversalAstReadiness(keys: string[], value: unknown): void {
  const layers = objectRecord(value);
  if (!layers) {
    keys.push('universal-ast-unavailable');
    return;
  }
  keys.push(semanticUniversalAstLayerCount(layers) > 0 && layers.empty !== true
    ? 'universal-ast-ready'
    : 'universal-ast-empty');
}

function addProofSpecReadiness(keys: string[], value: unknown): void {
  const proofSpec = objectRecord(value);
  if (!proofSpec) {
    keys.push('proof-spec-unavailable');
    return;
  }
  keys.push(semanticProofSpecCount(proofSpec) > 0 ? 'proof-spec-present' : 'proof-spec-empty');
  if (nonNegativeValue(proofSpec.failed) > 0) keys.push('proof-spec-failed');
  if (nonNegativeValue(proofSpec.stale) > 0) keys.push('proof-spec-stale');
  if (nonNegativeValue(proofSpec.open) > 0) keys.push('proof-spec-open');
  if (nonNegativeValue(proofSpec.assumed) > 0) keys.push('proof-spec-assumed');
}

function addSourceProjectionReadiness(keys: string[], value: unknown): void {
  const projection = objectRecord(value);
  if (!projection) {
    keys.push('source-projection-unavailable');
    return;
  }
  if (!addPrefixedReadinessKey(keys, 'source-projection', projection.readiness)) keys.push('source-projection-unknown');
  if (projection.mode === 'preserved-source') keys.push('source-projection-preserved');
  if (projection.mode === 'native-source-stubs') keys.push('source-projection-stubbed');
}

function addNativeCompileReadiness(keys: string[], value: unknown): void {
  const nativeCompile = objectRecord(value);
  if (!nativeCompile) {
    keys.push('native-compile-unavailable');
    return;
  }
  if (!addPrefixedReadinessKey(keys, 'native-compile', nativeCompile.readiness)) keys.push('native-compile-unknown');
  if (nativeCompile.ok === true) keys.push('native-compile-emitted');
  if (nativeCompile.ok === false) keys.push('native-compile-failed');
  if (nativeCompile.outputMode === 'preserved-source') keys.push('native-compile-preserved');
  if (nativeCompile.outputMode === 'target-stubs') keys.push('native-compile-target-stubs');
}

function addRawReadinessKey(keys: string[], value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const key = String(value).trim();
  if (!key) return false;
  keys.push(key);
  return true;
}

function addPrefixedReadinessKey(keys: string[], prefix: string, value: unknown): boolean {
  const segment = readinessSegment(value);
  if (!segment) return false;
  keys.push(`${prefix}-${segment}`);
  return true;
}

function readinessSegment(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalized || undefined;
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonNegativeValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function semanticUniversalAstLayerCount(value: Record<string, unknown>): number {
  const names = Array.isArray(value.names) ? value.names.length : 0;
  const ids = Array.isArray(value.ids) ? value.ids.length : 0;
  const byName = objectRecord(value.byName);
  const byNameTotal = byName ? Object.values(byName).reduce<number>((sum, count) => sum + nonNegativeValue(count), 0) : 0;
  return Math.max(nonNegativeValue(value.total), names, ids, byNameTotal);
}

function semanticProofSpecCount(value: Record<string, unknown>): number {
  const byStatus = objectRecord(value.byStatus);
  const statusTotal = byStatus ? Object.values(byStatus).reduce<number>((sum, count) => sum + nonNegativeValue(count), 0) : 0;
  return Math.max(
    nonNegativeValue(value.total),
    nonNegativeValue(value.contracts) +
      nonNegativeValue(value.refinements) +
      nonNegativeValue(value.invariants) +
      nonNegativeValue(value.termination) +
      nonNegativeValue(value.temporal) +
      nonNegativeValue(value.obligations) +
      nonNegativeValue(value.artifacts) +
      nonNegativeValue(value.assumptions),
    statusTotal
  );
}

function semanticSidecarExpectedMissingReasonCodes(record: FrontierCodexSemanticImportRecord): string[] {
  if (record.status !== 'imported') return [];
  const sidecar = objectRecord(record.semanticSidecar);
  if (!sidecar) return ['semantic-sidecar-unavailable'];
  const symbols = nonNegativeValue(sidecar.symbols);
  if (sidecar.emptySemanticIndex === true || symbols === 0) return ['semantic-sidecar-empty'];
  const codes: string[] = [];
  if (nonNegativeValue(sidecar.ownershipRegions) === 0) codes.push('semantic-sidecar-missing-ownership-regions');
  if (nonNegativeValue(sidecar.patchHints) === 0) codes.push('semantic-sidecar-missing-patch-hints');
  return codes.length ? ['semantic-sidecar-partial', ...codes] : [];
}
