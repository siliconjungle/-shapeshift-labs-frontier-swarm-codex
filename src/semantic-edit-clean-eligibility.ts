import type { FrontierCodexSemanticEditScriptSummary } from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';

export function isCleanSemanticEditProjection(
  projection: FrontierCodexSemanticEditProjectionSummary | undefined
): boolean {
  if (!projection || projection.total === 0) return false;
  return projection.projected > 0 &&
    projection.blocked === 0 &&
    projection.skippedOperations === 0 &&
    projection.autoMergeCandidates > 0 &&
    projection.projectedSourceMismatchesWorker === 0 &&
    projection.projectedSourceMatchUnknown === 0 &&
    projection.projectedSourceMatchesWorker >= projection.projected;
}

export function isCleanSemanticEditOperationScript(
  script: FrontierCodexSemanticEditScriptSummary | undefined
): boolean {
  if (!script || script.operations <= 0) return false;
  return script.autoMergeCandidates >= script.operations &&
    script.portable >= script.operations &&
    script.conflicts === 0 &&
    script.stale === 0 &&
    script.blocked === 0 &&
    script.needsPort === 0 &&
    script.candidates === 0 &&
    (script.admission['auto-merge-candidate'] ?? 0) > 0;
}
