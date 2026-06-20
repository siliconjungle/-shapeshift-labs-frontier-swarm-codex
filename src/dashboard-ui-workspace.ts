import fs from 'node:fs/promises';
import path from 'node:path';
import { isObject, uniqueStrings } from './common.js';
import {
  DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT,
  DASHBOARD_WORKSPACE_PROOF_MAX_BYTES
} from './dashboard-ui-constants.js';
import type { DashboardArtifactContext, DashboardWorkspaceOwnershipEvidence } from './dashboard-ui-types.js';
import { isGeneratedChangedPath } from './dashboard-ui-quality.js';
import {
  numberRecordValue,
  numberValue,
  stringArrayValue,
  stringValue
} from './dashboard-ui-values.js';
import type {
  FrontierCodexDashboardIgnoredChangedPathReason
} from './types-dashboard.js';
import type { FrontierCodexWorkspaceProof } from './types-workspace.js';

export async function dashboardWorkspaceOwnershipEvidence(
  bundle: Record<string, unknown>,
  metadata: Record<string, unknown>,
  context: DashboardArtifactContext
): Promise<DashboardWorkspaceOwnershipEvidence> {
  const fallback = dashboardWorkspaceOwnershipEvidenceFromMetadata(metadata);
  const embedded = dashboardWorkspaceOwnershipEvidenceFromProof(metadata.workspaceProof);
  if (embedded) return mergeDashboardWorkspaceOwnershipEvidence(fallback, embedded);
  const proofPath = dashboardWorkspaceProofPath(bundle, metadata, context);
  if (!proofPath) return fallback;
  const proof = await readDashboardWorkspaceProof(proofPath);
  const fromProof = dashboardWorkspaceOwnershipEvidenceFromProof(proof);
  return fromProof ? mergeDashboardWorkspaceOwnershipEvidence(fallback, fromProof) : fallback;
}

export function dashboardArtifactRoots(cwd: string, ...values: Array<string | undefined>): string[] {
  return uniqueStrings([cwd, ...values.filter((value): value is string => typeof value === 'string' && value.length > 0)]
    .map((value) => path.resolve(cwd, value)));
}

export function ignoredChangedPathReasonArrayValue(value: unknown): FrontierCodexDashboardIgnoredChangedPathReason[] {
  if (!Array.isArray(value)) return [];
  const out: FrontierCodexDashboardIgnoredChangedPathReason[] = [];
  for (const entry of value) {
    if (!isObject(entry)) continue;
    const pathValue = stringValue(entry.path);
    const reasonCode = stringValue(entry.reasonCode);
    if (pathValue && reasonCode) out.push({ path: pathValue, reasonCode });
  }
  return out;
}

export function isIgnoredChangedPath(file: string, ignoredPaths: readonly string[]): boolean {
  const normalized = file.replace(/\\/g, '/');
  if (isGeneratedChangedPath(normalized)) return true;
  return ignoredPaths.some((entry) => {
    const ignored = entry.replace(/\\/g, '/');
    return normalized === ignored || normalized.endsWith('/' + ignored) || ignored.endsWith('/' + normalized);
  });
}

function dashboardWorkspaceOwnershipEvidenceFromMetadata(metadata: Record<string, unknown>): DashboardWorkspaceOwnershipEvidence {
  return {
    ignoredChangedPaths: [],
    ignoredChangedPathCount: 0,
    ignoredChangedPathReasonCounts: {},
    ignoredChangedPathSamples: [],
    ignoredChangedPathReasonSamples: [],
    observedChangedPathCount: stringArrayValue(metadata.observedChangedPaths).length,
    reportedChangedPathCount: stringArrayValue(metadata.reportedChangedPaths).length
  };
}

function dashboardWorkspaceOwnershipEvidenceFromProof(value: unknown): DashboardWorkspaceOwnershipEvidence | undefined {
  if (!isObject(value)) return undefined;
  const summary = isObject(value.summary) ? value.summary : {};
  const ignoredChangedPathReasons = ignoredChangedPathReasonArrayValue(value.ignoredChangedPathReasons);
  const ignoredChangedPaths = uniqueStrings([
    ...stringArrayValue(value.ignoredChangedPaths),
    ...ignoredChangedPathReasons.map((entry) => entry.path)
  ]);
  return {
    ignoredChangedPaths,
    ignoredChangedPathCount: numberValue(summary.ignoredChangedPathCount, ignoredChangedPaths.length),
    ignoredChangedPathReasonCounts: numberRecordValue(summary.ignoredChangedPathReasonCounts, countIgnoredChangedPathReasons(ignoredChangedPathReasons)),
    ignoredChangedPathSamples: ignoredChangedPaths.slice(0, DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT),
    ignoredChangedPathReasonSamples: ignoredChangedPathReasons.slice(0, DASHBOARD_IGNORED_CHANGED_PATH_SAMPLE_LIMIT),
    observedChangedPathCount: numberValue(summary.observedChangedPathCount, stringArrayValue(value.observedChangedPaths).length),
    reportedChangedPathCount: numberValue(summary.reportedChangedPathCount, stringArrayValue(value.reportedChangedPaths).length)
  };
}

function mergeDashboardWorkspaceOwnershipEvidence(
  fallback: DashboardWorkspaceOwnershipEvidence,
  value: DashboardWorkspaceOwnershipEvidence
): DashboardWorkspaceOwnershipEvidence {
  return {
    ignoredChangedPathCount: value.ignoredChangedPathCount,
    ignoredChangedPathReasonCounts: value.ignoredChangedPathReasonCounts,
    ignoredChangedPaths: value.ignoredChangedPaths,
    ignoredChangedPathSamples: value.ignoredChangedPathSamples,
    ignoredChangedPathReasonSamples: value.ignoredChangedPathReasonSamples,
    observedChangedPathCount: value.observedChangedPathCount || fallback.observedChangedPathCount,
    reportedChangedPathCount: value.reportedChangedPathCount || fallback.reportedChangedPathCount
  };
}

function dashboardWorkspaceProofPath(bundle: Record<string, unknown>, metadata: Record<string, unknown>, context: DashboardArtifactContext): string | undefined {
  const candidates = uniqueStrings([
    ...stringArrayValue(bundle.evidencePaths),
    ...(typeof metadata.workspaceProofPath === 'string' ? [metadata.workspaceProofPath] : [])
  ]).filter((entry) => path.basename(entry) === 'workspace-proof.json');
  for (const candidate of candidates) {
    for (const resolved of resolveDashboardArtifactPath(candidate, context.artifactBases)) {
      if (isDashboardArtifactPathSafe(resolved, context.artifactRoots)) return resolved;
    }
  }
  return undefined;
}

function resolveDashboardArtifactPath(value: string, bases: readonly string[]): string[] {
  if (path.isAbsolute(value)) return [path.normalize(value)];
  return uniqueStrings(bases.map((base) => path.resolve(base, value)));
}

function isDashboardArtifactPathSafe(file: string, roots: readonly string[]): boolean {
  for (const root of roots) {
    const relative = path.relative(root, file);
    if (relative === '' || relative && !relative.startsWith('..') && !path.isAbsolute(relative)) return true;
  }
  return false;
}

async function readDashboardWorkspaceProof(file: string): Promise<FrontierCodexWorkspaceProof | undefined> {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile() || stat.size > DASHBOARD_WORKSPACE_PROOF_MAX_BYTES) return undefined;
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    return isObject(parsed) ? parsed as unknown as FrontierCodexWorkspaceProof : undefined;
  } catch {
    return undefined;
  }
}

function countIgnoredChangedPathReasons(reasons: readonly FrontierCodexDashboardIgnoredChangedPathReason[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const reason of reasons) counts[reason.reasonCode] = (counts[reason.reasonCode] ?? 0) + 1;
  return counts;
}
