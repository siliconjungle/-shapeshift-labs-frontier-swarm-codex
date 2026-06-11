import { isObject, nonNegativeNumber, readStringArray, uniqueStrings } from './common.js';

export interface SemanticEditReplayQuery {
  semanticEditReplay?: string;
  semanticEditReplayStatus?: string;
  semanticEditReplayAdmission?: string;
  semanticEditKey?: string;
  semanticIdentityHash?: string;
  sourceIdentityHash?: string;
  editContentHash?: string;
}

export interface SemanticEditReplayQuerySummary {
  total: number;
  acceptedClean: number;
  alreadyApplied: number;
  conflicts: number;
  stale: number;
  blocked: number;
  needsPort: number;
  evidenceOnly: number;
  edits: number;
  appliedEdits: number;
  alreadyAppliedEdits: number;
  operationIds: string[];
  semanticKeys: string[];
  semanticIdentityHashes: string[];
  sourceIdentityHashes: string[];
  editContentHashes: string[];
  sourcePaths: string[];
  symbolNames: string[];
  currentHashes: string[];
  outputHashes: string[];
}

export function jobSemanticEditReplay(job: Record<string, unknown>): unknown {
  const quality = isObject(job.semanticImportQuality) ? job.semanticImportQuality : {};
  const semanticImport = isObject(job.semanticImport) ? job.semanticImport : {};
  const compact = isObject(job.semanticCompactSummary) ? job.semanticCompactSummary : {};
  const semanticEdit = isObject(compact.semanticEdit) ? compact.semanticEdit : {};
  return quality.semanticEditReplay ?? semanticEdit.replay ?? semanticImport.semanticEditReplays ?? semanticImport.semanticEditReplay;
}

export function evidenceSemanticEditReplay(entry: Record<string, unknown>): unknown {
  const facets = isObject(entry.facets) ? entry.facets : {};
  return {
    total: facets.semanticEditReplayTotal,
    acceptedClean: facets.semanticEditReplayAcceptedClean,
    alreadyApplied: facets.semanticEditReplayAlreadyApplied,
    conflicts: facets.semanticEditReplayConflicts,
    stale: facets.semanticEditReplayStale,
    blocked: facets.semanticEditReplayBlocked,
    needsPort: facets.semanticEditReplayNeedsPort,
    evidenceOnly: facets.semanticEditReplayEvidenceOnly,
    editCount: facets.semanticEditReplayEdits,
    appliedEditCount: facets.semanticEditReplayAppliedEdits,
    alreadyAppliedEditCount: facets.semanticEditReplayAlreadyAppliedEdits,
    statusCounts: csvRecord(facets.semanticEditReplayStatuses),
    admission: csvRecord(facets.semanticEditReplayAdmissions),
    actions: csvArray(facets.semanticEditReplayActions),
    operationIds: csvArray(facets.semanticEditReplayOperationIds),
    semanticKeys: csvArray(facets.semanticEditReplaySemanticKeys),
    semanticIdentityHashes: csvArray(facets.semanticEditReplaySemanticIdentityHashes),
    sourceIdentityHashes: csvArray(facets.semanticEditReplaySourceIdentityHashes),
    editContentHashes: csvArray(facets.semanticEditReplayEditContentHashes),
    sourcePaths: csvArray(facets.semanticEditReplaySourcePaths),
    symbolNames: csvArray(facets.semanticEditReplaySymbolNames),
    currentHashes: csvArray(facets.semanticEditReplayCurrentHashes),
    outputHashes: csvArray(facets.semanticEditReplayOutputHashes),
    reasonCodes: csvArray(facets.semanticEditReplayReasonCodes)
  };
}

export function matchesSemanticEditReplay(value: unknown, input: SemanticEditReplayQuery, haystack: string): boolean {
  const replay = isObject(value) ? value : {};
  if (input.semanticEditReplay !== undefined && !hasReplayEvidence(replay)) return false;
  if (input.semanticEditReplayStatus !== undefined && !hasReplayEvidence(replay)) return false;
  if (input.semanticEditReplayAdmission !== undefined && !hasReplayEvidence(replay)) return false;
  return replayStatusMatches(replay, input.semanticEditReplayStatus ?? input.semanticEditReplay, haystack)
    && replayAdmissionMatches(replay, input.semanticEditReplayAdmission, haystack)
    && replayArrayMatches(replay, 'semanticKeys', input.semanticEditKey, haystack)
    && replayArrayMatches(replay, 'semanticIdentityHashes', input.semanticIdentityHash, haystack)
    && replayArrayMatches(replay, 'sourceIdentityHashes', input.sourceIdentityHash, haystack)
    && replayArrayMatches(replay, 'editContentHashes', input.editContentHash, haystack);
}

export function semanticEditReplaySummary(jobs: Record<string, unknown>[]): SemanticEditReplayQuerySummary {
  return jobs.reduce<SemanticEditReplayQuerySummary>((out, job) => {
    const replay = isObject(jobSemanticEditReplay(job)) ? jobSemanticEditReplay(job) as Record<string, unknown> : {};
    out.total += nonNegativeNumber(replay.total);
    out.acceptedClean += nonNegativeNumber(replay.acceptedClean);
    out.alreadyApplied += nonNegativeNumber(replay.alreadyApplied);
    out.conflicts += nonNegativeNumber(replay.conflicts);
    out.stale += nonNegativeNumber(replay.stale);
    out.blocked += nonNegativeNumber(replay.blocked);
    out.needsPort += nonNegativeNumber(replay.needsPort);
    out.evidenceOnly += nonNegativeNumber(replay.evidenceOnly);
    out.edits += nonNegativeNumber(replay.editCount);
    out.appliedEdits += nonNegativeNumber(replay.appliedEditCount);
    out.alreadyAppliedEdits += nonNegativeNumber(replay.alreadyAppliedEditCount);
    for (const key of identityKeys) out[key] = uniqueStrings([...out[key], ...readStringArray(replay[key])]);
    return out;
  }, emptyReplayQuerySummary());
}

const identityKeys = [
  'operationIds',
  'semanticKeys',
  'semanticIdentityHashes',
  'sourceIdentityHashes',
  'editContentHashes',
  'sourcePaths',
  'symbolNames',
  'currentHashes',
  'outputHashes'
] as const;

function emptyReplayQuerySummary(): SemanticEditReplayQuerySummary {
  return {
    total: 0, acceptedClean: 0, alreadyApplied: 0, conflicts: 0, stale: 0, blocked: 0, needsPort: 0, evidenceOnly: 0,
    edits: 0, appliedEdits: 0, alreadyAppliedEdits: 0,
    operationIds: [], semanticKeys: [], semanticIdentityHashes: [], sourceIdentityHashes: [], editContentHashes: [],
    sourcePaths: [], symbolNames: [], currentHashes: [], outputHashes: []
  };
}

function replayStatusMatches(replay: Record<string, unknown>, wanted: string | undefined, haystack: string): boolean {
  if (wanted === undefined) return true;
  const key = wanted.toLowerCase();
  const counts = isObject(replay.statusCounts) ? replay.statusCounts : {};
  const count = nonNegativeNumber(counts[key]);
  if (count > 0 || String(replay.status ?? '').toLowerCase() === key) return true;
  const fields: Record<string, string> = {
    'accepted-clean': 'acceptedClean',
    'already-applied': 'alreadyApplied',
    conflict: 'conflicts',
    stale: 'stale',
    blocked: 'blocked',
    'needs-port': 'needsPort',
    'evidence-only': 'evidenceOnly'
  };
  return nonNegativeNumber(replay[fields[key] ?? key]) > 0 || hasReplayEvidence(replay) && replayTextMatch(haystack, wanted);
}

function replayAdmissionMatches(replay: Record<string, unknown>, wanted: string | undefined, haystack: string): boolean {
  if (wanted === undefined) return true;
  const admission = isObject(replay.admission) ? replay.admission : {};
  return nonNegativeNumber(admission[wanted]) > 0 ||
    readStringArray(replay.actions).some((entry) => replayTextMatch(entry.toLowerCase(), wanted)) ||
    hasReplayEvidence(replay) && replayTextMatch(haystack, wanted);
}

function replayArrayMatches(replay: Record<string, unknown>, key: string, wanted: string | undefined, haystack: string): boolean {
  if (wanted === undefined) return true;
  return readStringArray(replay[key]).some((entry) => replayTextMatch(entry.toLowerCase(), wanted)) ||
    hasReplayEvidence(replay) && replayTextMatch(haystack, wanted);
}

function hasReplayEvidence(replay: Record<string, unknown>): boolean {
  return nonNegativeNumber(replay.total) > 0 ||
    nonNegativeNumber(replay.acceptedClean) > 0 ||
    nonNegativeNumber(replay.alreadyApplied) > 0 ||
    nonNegativeNumber(replay.conflicts) > 0 ||
    readStringArray(replay.semanticKeys).length > 0 ||
    readStringArray(replay.operationIds).length > 0;
}

function csvRecord(value: unknown): Record<string, number> {
  return String(value ?? '').split(',').filter(Boolean).reduce<Record<string, number>>((out, key) => {
    out[key] = 1;
    return out;
  }, {});
}

function csvArray(value: unknown): string[] {
  return String(value ?? '').split(',').filter(Boolean);
}

function replayTextMatch(haystack: string, value: string): boolean {
  return haystack.includes(value.toLowerCase()) || haystack.includes(value.toLowerCase().replace(/-/g, ''));
}
