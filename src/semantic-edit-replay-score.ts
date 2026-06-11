import type { FrontierCodexSemanticEditReplaySummary } from './types-semantic-edit-replay.js';

export function semanticEditReplayScore(replay: FrontierCodexSemanticEditReplaySummary): {
  cleanEligible: boolean;
  scoreAdjustment: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let scoreAdjustment = 0;
  if (replay.conflicts > 0) {
    reasons.push(`semantic edit replay conflicts: ${replay.conflicts}`);
    scoreAdjustment -= 20;
  }
  if (replay.stale > 0) {
    reasons.push(`semantic edit replay stale: ${replay.stale}`);
    scoreAdjustment -= 15;
  }
  if (replay.blocked > 0) {
    reasons.push(`semantic edit replay blocked: ${replay.blocked}`);
    scoreAdjustment -= 20;
  }
  if (replay.needsPort > 0) {
    reasons.push(`semantic edit replay needs port: ${replay.needsPort}`);
    scoreAdjustment -= 5;
  }
  const cleanEligible = replay.total > 0 &&
    replay.acceptedClean + replay.alreadyApplied > 0 &&
    replay.conflicts + replay.stale + replay.blocked + replay.needsPort === 0;
  if (cleanEligible) scoreAdjustment += 5;
  return { cleanEligible, scoreAdjustment, reasons };
}
