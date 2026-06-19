import type { FrontierCodexProofSpecSummary, FrontierCodexSemanticImportRecord } from './index.js';
import { isObject, nonNegativeNumber, numberRecord, uniqueStrings } from './common.js';

export function semanticImportProofSpecSummary(summary: unknown): FrontierCodexProofSpecSummary {
  const input = isObject(summary) && isObject(summary.proofSpec) ? summary.proofSpec : undefined;
  return input ? normalizeProofSpecSummary(input) : emptyProofSpecSummary();
}

export function summarizeSemanticImportProofSpec(records: FrontierCodexSemanticImportRecord[]): FrontierCodexProofSpecSummary {
  const summary = emptyProofSpecSummary();
  for (const record of records) {
    mergeProofSpecSummary(summary, record.proofSpec);
  }
  summary.total = Math.max(summary.total, inferredProofSpecTotal(summary));
  summary.empty = summary.total === 0;
  return summary;
}


export function summarizeProofSpec(proof?: any, semanticSidecar?: any): FrontierCodexProofSpecSummary {
  const sidecarProof = semanticSidecar?.proofSpec ?? semanticSidecar?.summary?.proofSpec;
  if (sidecarProof && typeof sidecarProof === 'object' && hasProofSpecSummaryShape(sidecarProof)) {
    return normalizeProofSpecSummary(sidecarProof);
  }
  const raw = proof && typeof proof === 'object' ? proof : {};
  const contracts: any[] = Array.isArray(raw.contracts) ? raw.contracts : [];
  const refinements: any[] = Array.isArray(raw.refinements) ? raw.refinements : [];
  const invariants: any[] = Array.isArray(raw.invariants) ? raw.invariants : [];
  const termination: any[] = Array.isArray(raw.termination) ? raw.termination : [];
  const temporal: any[] = Array.isArray(raw.temporal) ? raw.temporal : [];
  const obligations: any[] = Array.isArray(raw.obligations) ? raw.obligations : [];
  const artifacts: any[] = Array.isArray(raw.artifacts) ? raw.artifacts : [];
  const assumptions: any[] = Array.isArray(raw.assumptions) ? raw.assumptions : [];
  const evidence: any[] = Array.isArray(raw.evidence) ? raw.evidence : [];
  const allContracts = [...contracts, ...refinements, ...invariants, ...termination, ...temporal];
  const byStatus: Record<string, number> = {};
  const byContractKind: Record<string, number> = {};
  const byArtifactKind: Record<string, number> = {};
  for (const obligation of obligations) {
    const status = String(obligation?.status ?? 'unknown');
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }
  for (const contract of allContracts) {
    const kind = String(contract?.kind ?? 'unknown');
    byContractKind[kind] = (byContractKind[kind] ?? 0) + 1;
  }
  for (const artifact of artifacts) {
    const kind = String(artifact?.kind ?? 'unknown');
    byArtifactKind[kind] = (byArtifactKind[kind] ?? 0) + 1;
  }
  const total = allContracts.length + obligations.length + artifacts.length + assumptions.length;
  return {
    total,
    ids: uniqueStrings([
      raw.id,
      ...allContracts.map((record) => record?.id),
      ...obligations.map((record) => record?.id),
      ...artifacts.map((record) => record?.id),
      ...assumptions.map((record) => record?.id),
      ...evidence.map((record) => record?.id)
    ].filter(Boolean).map(String)),
    contracts: contracts.length,
    refinements: refinements.length,
    invariants: invariants.length,
    termination: termination.length,
    temporal: temporal.length,
    obligations: obligations.length,
    artifacts: artifacts.length,
    assumptions: assumptions.length,
    evidence: evidence.length,
    discharged: byStatus.discharged ?? 0,
    failed: byStatus.failed ?? 0,
    open: byStatus.open ?? 0,
    unknown: byStatus.unknown ?? 0,
    stale: byStatus.stale ?? 0,
    assumed: byStatus.assumed ?? 0,
    contractKinds: uniqueStrings(Object.keys(byContractKind)),
    artifactKinds: uniqueStrings(Object.keys(byArtifactKind)),
    byStatus,
    byContractKind,
    byArtifactKind,
    empty: total === 0
  };
}


function hasProofSpecSummaryShape(value: Record<string, unknown>): boolean {
  return typeof value.total === 'number' ||
    typeof value.obligations === 'number' ||
    typeof value.contracts === 'number' ||
    typeof value.failed === 'number';
}


export function normalizeProofSpecSummary(value: Record<string, unknown>): FrontierCodexProofSpecSummary {
  const summary = emptyProofSpecSummary();
  mergeProofSpecSummary(summary, value);
  summary.total = Math.max(summary.total, inferredProofSpecTotal(summary));
  summary.empty = summary.total === 0;
  return summary;
}


function emptyProofSpecSummary(): FrontierCodexProofSpecSummary {
  return {
    total: 0,
    ids: [],
    contracts: 0,
    refinements: 0,
    invariants: 0,
    termination: 0,
    temporal: 0,
    obligations: 0,
    artifacts: 0,
    assumptions: 0,
    evidence: 0,
    discharged: 0,
    failed: 0,
    open: 0,
    unknown: 0,
    stale: 0,
    assumed: 0,
    contractKinds: [],
    artifactKinds: [],
    byStatus: {},
    byContractKind: {},
    byArtifactKind: {},
    empty: true
  };
}


function mergeProofSpecSummary(target: FrontierCodexProofSpecSummary, input: any): void {
  if (!input || typeof input !== 'object') return;
  for (const key of ['total', 'contracts', 'refinements', 'invariants', 'termination', 'temporal', 'obligations', 'artifacts', 'assumptions', 'evidence', 'discharged', 'failed', 'open', 'unknown', 'stale', 'assumed'] as const) {
    target[key] += nonNegativeNumber(input[key]);
  }
  target.ids = uniqueStrings([...target.ids, ...proofStringList(input.ids)]);
  target.contractKinds = uniqueStrings([...target.contractKinds, ...proofStringList(input.contractKinds)]);
  target.artifactKinds = uniqueStrings([...target.artifactKinds, ...proofStringList(input.artifactKinds)]);
  for (const [status, count] of Object.entries(numberRecord(input.byStatus))) {
    target.byStatus[status] = (target.byStatus[status] ?? 0) + count;
  }
  for (const [kind, count] of Object.entries(numberRecord(input.byContractKind))) {
    target.byContractKind[kind] = (target.byContractKind[kind] ?? 0) + count;
  }
  for (const [kind, count] of Object.entries(numberRecord(input.byArtifactKind))) {
    target.byArtifactKind[kind] = (target.byArtifactKind[kind] ?? 0) + count;
  }
}


function inferredProofSpecTotal(summary: FrontierCodexProofSpecSummary): number {
  const structuralTotal =
    summary.contracts +
    summary.refinements +
    summary.invariants +
    summary.termination +
    summary.temporal +
    summary.obligations +
    summary.artifacts +
    summary.assumptions;
  const statusTotal = Object.values(summary.byStatus).reduce((sum, count) => sum + nonNegativeNumber(count), 0);
  const contractKindTotal = Object.values(summary.byContractKind).reduce((sum, count) => sum + nonNegativeNumber(count), 0);
  const artifactKindTotal = Object.values(summary.byArtifactKind).reduce((sum, count) => sum + nonNegativeNumber(count), 0);
  return Math.max(structuralTotal, statusTotal, contractKindTotal + artifactKindTotal);
}


export function proofStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry)).filter(Boolean);
}
