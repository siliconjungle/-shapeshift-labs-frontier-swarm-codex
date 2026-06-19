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
  covered: ['covered', 'container-covered', 'containerCovered', 'container-covered-by-child-edits', 'containerCoveredByChildEdits'],
  'evidence-only': ['evidence-only', 'evidenceOnly', 'review-only', 'reviewOnly'],
  portable: ['portable'],
  stale: ['stale'],
  'needs-port': ['needs-port', 'needsPort'],
  needsport: ['needs-port', 'needsPort'],
  'needs-review': ['needs-review', 'needsReview', 'review-required', 'reviewRequired', 'ambiguous', 'ambiguous-edit', 'ambiguousEdit'],
  ambiguous: ['ambiguous', 'ambiguous-edit', 'ambiguousEdit']
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

export function semanticEditScriptReviewRequiredCount(summary: FrontierCodexSemanticEditScriptSummary | undefined): number {
  if (!summary) return 0;
  const reviewStatus = Math.max(sumAliases(summary.byStatus, 'needs-review'), sumAliases(summary.admission, 'needs-review'));
  const reviewRequired = Math.max(nonNegativeNumber(summary.reviewRequired), reviewStatus);
  const evidenceOnly = semanticEditScriptAdmissionCount(summary, 'evidence-only');
  if (reviewStatus === 0 && evidenceOnly > 0 && reviewRequired <= evidenceOnly) return 0;
  return reviewRequired;
}

export function semanticEditScriptCleanOperationCoverage(summary: FrontierCodexSemanticEditScriptSummary | undefined): number {
  if (!summary) return 0;
  const portable = semanticEditScriptStatusCount(summary, 'portable');
  const autoApply = semanticEditScriptStatusCount(summary, 'auto-apply-candidate');
  const alreadyApplied = semanticEditScriptStatusCount(summary, 'already-applied');
  const covered = semanticEditScriptStatusCount(summary, 'covered');
  return Math.max(portable, autoApply) + alreadyApplied + covered;
}

export function semanticEditScriptAutoMergeOperationCoverage(summary: FrontierCodexSemanticEditScriptSummary | undefined): number {
  if (!summary) return 0;
  const autoMerge = semanticEditScriptStatusCount(summary, 'auto-merge-candidate');
  const alreadyApplied = semanticEditScriptStatusCount(summary, 'already-applied');
  const covered = semanticEditScriptStatusCount(summary, 'covered');
  return autoMerge + alreadyApplied + covered;
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
    semanticEditScriptConflictKeys: entry.conflictKeys.join(','),
    semanticEditScriptSemanticKeys: entry.semanticKeys.join(','),
    semanticEditScriptSemanticIdentityHashes: entry.semanticIdentityHashes.join(','),
    semanticEditScriptSourceIdentityHashes: entry.sourceIdentityHashes.join(','),
    semanticEditScriptOperationContentHashes: entry.operationContentHashes.join(',')
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
  if (semanticEditScriptReviewRequiredCount(entry) > 0) {
    return blockedSemanticEditAdmission('review-required', 'semantic edit script needs review');
  }
  if (entry.needsPort > 0 || entry.candidates > 0) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['semantic edit script needs port']
    };
  }
  const hasExplicitAutoMergeAdmission = entry.autoMergeCandidates > 0 || semanticEditScriptHasAdmission(entry, 'auto-merge-candidate');
  const cleanOperationCoverage = semanticEditScriptCleanOperationCoverage(entry);
  const autoMergeOperationCoverage = semanticEditScriptAutoMergeOperationCoverage(entry);
  const hasFullCleanOperationCoverage = entry.operations > 0 &&
    cleanOperationCoverage >= entry.operations &&
    autoMergeOperationCoverage >= entry.operations;
  const hasCleanPortableAction = semanticEditScriptStatusCount(entry, 'portable') > 0 ||
    semanticEditScriptStatusCount(entry, 'auto-apply-candidate') > 0 ||
    semanticEditScriptStatusCount(entry, 'covered') > 0;
  const hasPortableAction = hasCleanPortableAction || semanticEditScriptStatusCount(entry, 'already-applied') > 0;
  if (hasExplicitAutoMergeAdmission && hasFullCleanOperationCoverage) {
    return {
      status: 'auto-merge-candidate',
      autoMergeCandidate: true,
      cleanEligible: true,
      reasons: ['semantic edit script auto-merge candidate']
    };
  }
  if (hasExplicitAutoMergeAdmission) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: [hasPortableAction
        ? 'semantic edit script auto-merge admission lacks full clean operation coverage after ownership, projection, and replay gates'
        : 'semantic edit script auto-merge admission lacks portable or already-applied operation']
    };
  }
  if (hasCleanPortableAction) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['semantic edit script portable edit lacks explicit auto-merge admission after ownership, projection, and replay gates']
    };
  }
  if (entry.alreadyApplied > 0) {
    return {
      status: 'needs-port',
      autoMergeCandidate: false,
      cleanEligible: false,
      reasons: ['semantic edit script already applied but lacks explicit auto-merge admission after ownership, projection, and replay gates']
    };
  }
  return {
    status: 'needs-port',
    autoMergeCandidate: false,
    cleanEligible: false,
    reasons: ['semantic edit script has no auto-merge admission after ownership, projection, and replay gates']
  };
}

export function canonicalSemanticEditStatus(status: string): string {
  const clean = status.trim();
  const lowered = clean.replace(/_/g, '-').toLowerCase();
  if (STATUS_ALIASES[lowered]) return lowered;
  for (const [canonical, aliases] of Object.entries(STATUS_ALIASES)) {
    if (aliases.some((alias) => alias.replace(/_/g, '-').toLowerCase() === lowered)) return canonical;
  }
  return lowered.replace(/-/g, '');
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
  const aliases = normalizedAliasSet(status);
  let sum = 0;
  for (const [key, value] of Object.entries(record)) {
    if (aliases.has(normalizedStatusKey(key)) || aliases.has(compactStatusKey(key))) sum += nonNegativeNumber(value);
  }
  return sum;
}

function normalizedAliasSet(status: string): Set<string> {
  const canonical = canonicalSemanticEditStatus(status);
  const aliases = STATUS_ALIASES[canonical] ?? STATUS_ALIASES[canonical.replace(/-/g, '')] ?? [status, canonical];
  return new Set([status, canonical, ...aliases].flatMap((entry) => [normalizedStatusKey(entry), compactStatusKey(entry)]));
}

function normalizedStatusKey(status: string): string {
  return status.trim().replace(/_/g, '-').toLowerCase();
}

function compactStatusKey(status: string): string {
  return normalizedStatusKey(status).replace(/-/g, '');
}
