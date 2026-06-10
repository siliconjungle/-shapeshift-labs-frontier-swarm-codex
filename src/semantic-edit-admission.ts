import type {
  FrontierCodexSemanticEditAdmissionDecision,
  FrontierCodexSemanticEditScriptSummary
} from './types-semantic-edit.js';
import { nonNegativeNumber, uniqueStrings } from './common.js';
import { emptySemanticEditScriptSummary, summarizeSemanticEditScript } from './semantic-edit-script.js';

type FacetValue = string | number | boolean;

const STATUS_ALIASES: Record<string, readonly string[]> = {
  'auto-apply-candidate': ['auto-apply-candidate', 'autoApplyCandidate'],
  'auto-merge-candidate': ['auto-merge-candidate', 'autoMergeCandidate'],
  'already-applied': ['already-applied', 'alreadyApplied'],
  candidate: ['candidate', 'candidates'],
  blocked: ['blocked'],
  conflict: ['conflict', 'conflicts'],
  conflicts: ['conflict', 'conflicts'],
  portable: ['portable'],
  stale: ['stale'],
  'needs-port': ['needs-port', 'needsPort'],
  needsport: ['needs-port', 'needsPort'],
  'needs-review': ['needs-review', 'review-required', 'reviewRequired']
};

export function semanticEditScriptFromUnknown(value: unknown): FrontierCodexSemanticEditScriptSummary {
  return summarizeSemanticEditScript(value) ?? emptySemanticEditScriptSummary();
}

export function semanticEditScriptHasStatus(summary: FrontierCodexSemanticEditScriptSummary | undefined, status: string): boolean {
  return semanticEditScriptStatusCount(summary, status) > 0;
}

export function semanticEditScriptHasAdmission(summary: FrontierCodexSemanticEditScriptSummary | undefined, status: string): boolean {
  return semanticEditScriptAdmissionCount(summary, status) > 0;
}

export function semanticEditScriptStatusCount(summary: FrontierCodexSemanticEditScriptSummary | undefined, status: string): number {
  if (!summary) return 0;
  const canonical = canonicalSemanticEditStatus(status);
  const direct = directSemanticEditCounter(summary, canonical);
  return Math.max(direct, sumAliases(summary.byStatus, canonical), sumAliases(summary.admission, canonical));
}

export function semanticEditScriptAdmissionCount(summary: FrontierCodexSemanticEditScriptSummary | undefined, status: string): number {
  if (!summary) return 0;
  const canonical = canonicalSemanticEditStatus(status);
  return Math.max(directSemanticEditCounter(summary, canonical), sumAliases(summary.admission, canonical));
}

export function semanticEditScriptTags(summary: FrontierCodexSemanticEditScriptSummary | undefined): string[] {
  if (!summary || summary.empty) return [];
  return uniqueStrings([
    'semantic-edit-script',
    ...(summary.conflicts > 0 ? ['semantic-edit-conflict'] : []),
    ...(summary.stale > 0 ? ['semantic-edit-stale'] : []),
    ...(summary.blocked > 0 ? ['semantic-edit-blocked'] : []),
    ...(summary.needsPort > 0 ? ['semantic-edit-needs-port'] : []),
    ...(summary.portable > 0 ? ['semantic-edit-portable'] : []),
    ...(summary.autoMergeCandidates > 0 ? ['semantic-edit-auto-merge-candidate'] : []),
    ...(summary.alreadyApplied > 0 ? ['semantic-edit-already-applied'] : [])
  ]);
}

export function semanticEditScriptFacets(summary: FrontierCodexSemanticEditScriptSummary | undefined): Record<string, FacetValue> {
  const entry = summary ?? emptySemanticEditScriptSummary();
  return {
    semanticEditScriptTotal: entry.total,
    semanticEditScriptOperations: entry.operations,
    semanticEditScriptAutoMergeCandidates: entry.autoMergeCandidates,
    semanticEditScriptPortable: entry.portable,
    semanticEditScriptAlreadyApplied: entry.alreadyApplied,
    semanticEditScriptNeedsPort: entry.needsPort,
    semanticEditScriptConflicts: entry.conflicts,
    semanticEditScriptStale: entry.stale,
    semanticEditScriptBlocked: entry.blocked,
    semanticEditScriptCandidates: entry.candidates,
    semanticEditScriptReviewRequired: entry.reviewRequired,
    semanticEditScriptAutoApplyCandidates: entry.autoApplyCandidates,
    semanticEditScriptStatuses: Object.keys(entry.byStatus).filter((key) => nonNegativeNumber(entry.byStatus[key]) > 0).join(','),
    semanticEditScriptAdmissions: Object.keys(entry.admission).filter((key) => nonNegativeNumber(entry.admission[key]) > 0).join(','),
    semanticEditScriptActions: entry.actions.join(','),
    semanticEditScriptReasonCodes: entry.reasonCodes.join(','),
    semanticEditScriptConflictKeys: entry.conflictKeys.join(',')
  };
}

export function classifySemanticEditScriptAdmission(
  summary: FrontierCodexSemanticEditScriptSummary | undefined
): FrontierCodexSemanticEditAdmissionDecision {
  const entry = summary ?? emptySemanticEditScriptSummary();
  if (entry.empty || entry.total === 0 && entry.operations === 0) {
    return {
      status: 'no-semantic-edit-script',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['no semantic edit script']
    };
  }
  if (entry.conflicts > 0) return blockedSemanticEditAdmission('conflict', `semantic edit script conflicts: ${entry.conflicts}`);
  if (entry.stale > 0) return blockedSemanticEditAdmission('stale', `semantic edit script stale anchors: ${entry.stale}`);
  if (entry.blocked > 0) return blockedSemanticEditAdmission('blocked', `semantic edit script blocked: ${entry.blocked}`);
  if (entry.reviewRequired > 0) return blockedSemanticEditAdmission('review-required', 'semantic edit script needs review');
  if (entry.needsPort > 0 || entry.candidates > 0) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['semantic edit script needs port']
    };
  }
  const hasPositiveAdmission = entry.autoMergeCandidates > 0 || semanticEditScriptHasAdmission(entry, 'auto-merge-candidate');
  const hasPortableAction = entry.portable > 0 || entry.autoApplyCandidates > 0 || entry.alreadyApplied > 0;
  if (hasPositiveAdmission && hasPortableAction) {
    return {
      status: 'auto-merge-candidate',
      autoMergeCandidate: true,
      cleanEligible: true,
      reasons: ['semantic edit script auto-merge candidate']
    };
  }
  if (entry.portable > 0) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['semantic edit script is portable but lacks auto-merge admission']
    };
  }
  return {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script has no auto-merge admission']
  };
}

export function canonicalSemanticEditStatus(status: string): string {
  const clean = status.trim();
  const lowered = clean.replace(/_/g, '-').toLowerCase();
  return STATUS_ALIASES[lowered] ? lowered : lowered.replace(/-/g, '');
}

function directSemanticEditCounter(summary: FrontierCodexSemanticEditScriptSummary, status: string): number {
  if (status === 'auto-merge-candidate' || status === 'automergecandidate') return summary.autoMergeCandidates;
  if (status === 'auto-apply-candidate' || status === 'autoapplycandidate') return summary.autoApplyCandidates;
  if (status === 'already-applied' || status === 'alreadyapplied') return summary.alreadyApplied;
  if (status === 'candidate') return summary.candidates;
  if (status === 'conflict' || status === 'conflicts') return summary.conflicts;
  if (status === 'needs-port' || status === 'needsport') return summary.needsPort;
  if (status === 'needs-review' || status === 'needsreview') return summary.reviewRequired;
  if (status === 'portable') return summary.portable;
  if (status === 'stale') return summary.stale;
  if (status === 'blocked') return summary.blocked;
  return 0;
}

function blockedSemanticEditAdmission(
  status: FrontierCodexSemanticEditAdmissionDecision['status'],
  reason: string
): FrontierCodexSemanticEditAdmissionDecision {
  return {
    status,
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: [reason]
  };
}

function sumAliases(record: Record<string, number>, status: string): number {
  const aliases = STATUS_ALIASES[status] ?? STATUS_ALIASES[status.replace(/-/g, '')] ?? [status];
  return aliases.reduce((sum, key) => sum + nonNegativeNumber(record[key]), 0);
}
