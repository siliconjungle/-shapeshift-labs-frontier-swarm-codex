export type FrontierCodexDependencyStatus = 'ok' | 'missing' | 'stale' | 'newer' | 'unchecked';

export type FrontierCodexDependencyIssueSeverity = 'error' | 'warning' | 'info';

export interface FrontierCodexDependencyExpectation {
  packageName: string;
  expected?: string;
  required: boolean;
  optional: boolean;
}

export interface FrontierCodexResolvedDependency {
  packageName: string;
  expected?: string;
  version?: string;
  path?: string;
  resolver: 'adapter' | 'caller';
  status: FrontierCodexDependencyStatus;
  required: boolean;
  optional: boolean;
  reason?: string;
}

export interface FrontierCodexDependencyHealthIssue {
  severity: FrontierCodexDependencyIssueSeverity;
  code: string;
  message: string;
  packageName?: string;
  expected?: string;
  actual?: string;
  path?: string;
}

export interface FrontierCodexDependencyHealthReport {
  kind: 'frontier.swarm-codex.dependency-health';
  version: 1;
  ok: boolean;
  generatedAt: number;
  packageRoot: string;
  root: string;
  semanticImport: boolean;
  expectations: FrontierCodexDependencyExpectation[];
  resolved: FrontierCodexResolvedDependency[];
  issues: FrontierCodexDependencyHealthIssue[];
}

export interface FrontierCodexDependencyHealthOptions {
  root?: string;
  packageRoot?: string;
  semanticImport?: boolean;
  outFile?: string;
  failOnWarnings?: boolean;
}
