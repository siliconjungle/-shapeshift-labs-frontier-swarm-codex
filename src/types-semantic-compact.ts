import type {
  FrontierCodexSemanticEditAdmissionDecision,
  FrontierCodexSemanticEditScriptSummary
} from './types-semantic-edit.js';
import type { FrontierCodexSemanticEditProjectionSummary } from './types-semantic-edit-projection.js';

export interface FrontierCodexSemanticCompactSourceSummary {
  path: string;
  requestedPath?: string;
  language?: string;
  status: string;
  reason?: string;
  bytes?: number;
  baseSource?: FrontierCodexSemanticCompactSourceSnapshot;
  headSource?: FrontierCodexSemanticCompactSourceSnapshot;
  hashes: {
    before?: string;
    after?: string;
    universalAst?: string;
    nativeAst?: string;
    nativeSource?: string;
  };
  changedSymbols: number;
  changedRegions: number;
  readiness?: string;
  reasonCodes: string[];
}

export interface FrontierCodexSemanticCompactSourceSnapshot {
  path: string;
  source: string;
  bytes: number;
  foundBy: string;
  hash?: string;
}

export interface FrontierCodexSemanticCompactSummary {
  version: 1;
  present: boolean;
  expected: boolean;
  expectedSatisfied: boolean;
  expectedMissingReasonCodes: string[];
  selected: number;
  eligible: number;
  imported: number;
  errors: number;
  sourceMapMappings: number;
  symbols: number;
  ownershipRegions: number;
  patchHints: number;
  semanticFacts: number;
  dependencyRelations: number;
  universalAstLayers: number;
  proofSpecObligations: number;
  proofSpecFailedObligations: number;
  lineage: {
    events: number;
    moved: number;
    renamed: number;
    deleted: number;
    ambiguous: number;
    blocked: number;
    needsReview: number;
    eventKinds: string[];
    reasonCodes: string[];
  };
  semanticEdit: {
    status: FrontierCodexSemanticEditAdmissionDecision['status'];
    autoMergeCandidate: boolean;
    cleanEligible: boolean;
    admission: FrontierCodexSemanticEditAdmissionDecision;
    script: FrontierCodexSemanticEditScriptSummary;
    projection: FrontierCodexSemanticEditProjectionSummary;
  };
  warnings: string[];
  sourceCount: number;
  truncatedSourceCount: number;
  sources: FrontierCodexSemanticCompactSourceSummary[];
}
