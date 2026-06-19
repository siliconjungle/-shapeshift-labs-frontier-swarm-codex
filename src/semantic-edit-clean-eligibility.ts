import type { FrontierCodexSemanticEditScriptSummary } from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';
import {
  semanticEditScriptAdmissionCount,
  semanticEditScriptAutoMergeOperationCoverage,
  semanticEditScriptCleanOperationCoverage,
  semanticEditScriptReviewRequiredCount
} from './semantic-edit-admission.js';

export function isCleanSemanticEditProjection(
  projection: FrontierCodexSemanticEditProjectionSummary | undefined
): boolean {
  if (!projection || projection.total === 0) return false;
  return projection.projected > 0 &&
    projection.projected >= projection.total &&
    projection.blocked === 0 &&
    projection.skippedOperations === 0 &&
    (projection.autoMergeCandidates > 0 || projectionAdmissionCount(projection, 'auto-merge-candidate') > 0) &&
    projection.projectedSourceMismatchesWorker === 0 &&
    projection.projectedSourceMatchUnknown === 0 &&
    projection.projectedSourceMatchesWorker >= projection.projected;
}

export function isCleanSemanticEditOperationScript(
  script: FrontierCodexSemanticEditScriptSummary | undefined
): boolean {
  if (!script || script.operations <= 0) return false;
  return semanticEditScriptAutoMergeOperationCoverage(script) >= script.operations &&
    semanticEditScriptCleanOperationCoverage(script) >= script.operations &&
    script.conflicts === 0 &&
    script.stale === 0 &&
    script.blocked === 0 &&
    script.needsPort === 0 &&
    script.candidates === 0 &&
    semanticEditScriptReviewRequiredCount(script) === 0 &&
    semanticEditScriptAdmissionCount(script, 'auto-merge-candidate') > 0;
}

function projectionAdmissionCount(projection: FrontierCodexSemanticEditProjectionSummary, status: string): number {
  const aliases = new Set([normalizedStatusKey(status), compactStatusKey(status)]);
  let count = 0;
  for (const [key, value] of Object.entries(projection.admission)) {
    if (aliases.has(normalizedStatusKey(key)) || aliases.has(compactStatusKey(key))) count += Number.isFinite(value) && value > 0 ? value : 0;
  }
  return count;
}

function normalizedStatusKey(status: string): string {
  return status.trim().replace(/_/g, '-').toLowerCase();
}

function compactStatusKey(status: string): string {
  return normalizedStatusKey(status).replace(/-/g, '');
}
