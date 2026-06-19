import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRONTIER_SWARM_CODEX_DEPENDENCY_HEALTH_KIND,
  FRONTIER_SWARM_CODEX_DEPENDENCY_HEALTH_VERSION
} from './constants.js';
import { isObject, pathExists } from './common.js';
import type {
  FrontierCodexDependencyExpectation,
  FrontierCodexDependencyHealthIssue,
  FrontierCodexDependencyHealthOptions,
  FrontierCodexDependencyHealthReport,
  FrontierCodexResolvedDependency
} from './types-dependency-health.js';

const SWARM_PACKAGE = '@shapeshift-labs/frontier-swarm';
const LANG_PACKAGE = '@shapeshift-labs/frontier-lang';

export async function checkCodexDependencyHealth(
  options: FrontierCodexDependencyHealthOptions = {}
): Promise<FrontierCodexDependencyHealthReport> {
  const packageRoot = path.resolve(options.packageRoot ?? defaultPackageRoot());
  const root = path.resolve(options.root ?? process.cwd());
  const pkg = await readPackageJson(path.join(packageRoot, 'package.json'));
  const expectations = readExpectations(pkg, Boolean(options.semanticImport));
  const resolved: FrontierCodexResolvedDependency[] = [];
  for (const expectation of expectations) {
    resolved.push(await resolveExpectation(expectation, packageRoot, 'adapter'));
    if (root !== packageRoot) resolved.push(await resolveExpectation(expectation, root, 'caller'));
  }
  const issues = collectIssues(resolved, packageRoot, Boolean(options.failOnWarnings));
  return {
    kind: FRONTIER_SWARM_CODEX_DEPENDENCY_HEALTH_KIND,
    version: FRONTIER_SWARM_CODEX_DEPENDENCY_HEALTH_VERSION,
    ok: !issues.some((issue) => issue.severity === 'error'),
    generatedAt: Date.now(),
    packageRoot,
    root,
    semanticImport: Boolean(options.semanticImport),
    expectations,
    resolved,
    issues
  };
}

export async function writeCodexDependencyHealthReport(
  report: FrontierCodexDependencyHealthReport,
  outFile: string
): Promise<void> {
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(report, null, 2) + '\n');
}

function defaultPackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

function readExpectations(pkg: Record<string, unknown>, semanticImport: boolean): FrontierCodexDependencyExpectation[] {
  const dependencies = isObject(pkg.dependencies) ? pkg.dependencies : {};
  const optionalDependencies = isObject(pkg.optionalDependencies) ? pkg.optionalDependencies : {};
  return [{
    packageName: SWARM_PACKAGE,
    expected: stringValue(dependencies[SWARM_PACKAGE]),
    required: true,
    optional: false
  }, {
    packageName: LANG_PACKAGE,
    expected: stringValue(optionalDependencies[LANG_PACKAGE]),
    required: semanticImport,
    optional: true
  }];
}

async function resolveExpectation(
  expectation: FrontierCodexDependencyExpectation,
  baseDir: string,
  resolver: FrontierCodexResolvedDependency['resolver']
): Promise<FrontierCodexResolvedDependency> {
  const packageJsonPath = await resolvePackageJson(expectation.packageName, baseDir);
  if (!packageJsonPath) {
    return {
      ...expectation,
      resolver,
      status: expectation.required ? 'missing' : 'unchecked',
      reason: expectation.required ? 'package could not be resolved' : 'optional package not installed'
    };
  }
  const pkg = await readPackageJson(packageJsonPath);
  const version = stringValue(pkg.version);
  return {
    ...expectation,
    resolver,
    version,
    path: path.dirname(packageJsonPath),
    status: dependencyStatus(version, expectation.expected)
  };
}

async function resolvePackageJson(packageName: string, baseDir: string): Promise<string | undefined> {
  const direct = await findNodeModulesPackageJson(packageName, baseDir);
  if (direct) return direct;
  try {
    const requireFromBase = createRequire(path.join(baseDir, 'package.json'));
    return await findOwningPackageJson(requireFromBase.resolve(packageName), packageName);
  } catch {
    return undefined;
  }
}

async function findNodeModulesPackageJson(packageName: string, baseDir: string): Promise<string | undefined> {
  const parts = packageName.split('/');
  let current = path.resolve(baseDir);
  while (true) {
    const candidate = path.join(current, 'node_modules', ...parts, 'package.json');
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function findOwningPackageJson(entrypoint: string, packageName: string): Promise<string | undefined> {
  let current = path.dirname(entrypoint);
  while (true) {
    const candidate = path.join(current, 'package.json');
    if (await pathExists(candidate)) {
      const pkg = await readPackageJson(candidate);
      if (pkg.name === packageName) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function collectIssues(
  resolved: readonly FrontierCodexResolvedDependency[],
  packageRoot: string,
  failOnWarnings: boolean
): FrontierCodexDependencyHealthIssue[] {
  const issues: FrontierCodexDependencyHealthIssue[] = [];
  for (const entry of resolved) {
    if (entry.status === 'ok' || entry.status === 'newer' || entry.status === 'unchecked') continue;
    const nested = entry.path?.startsWith(path.join(packageRoot, 'node_modules') + path.sep) ?? false;
    const severity = failOnWarnings || (entry.resolver === 'adapter' && entry.required) ? 'error' : 'warning';
    const stale = entry.status === 'stale';
    issues.push({
      severity,
      code: stale && nested ? 'stale-nested-optional' : `${entry.status}-dependency`,
      message: issueMessage(entry, nested),
      packageName: entry.packageName,
      expected: entry.expected,
      actual: entry.version,
      path: entry.path
    });
  }
  return issues;
}

function issueMessage(entry: FrontierCodexResolvedDependency, nested: boolean): string {
  if (entry.status === 'missing') return `${entry.packageName} is required but could not be resolved by ${entry.resolver}`;
  const location = nested ? 'adapter-local nested dependency' : `${entry.resolver} dependency`;
  return `${location} ${entry.packageName}@${entry.version ?? 'unknown'} does not satisfy ${entry.expected ?? 'the expected version'}`;
}

function dependencyStatus(version: string | undefined, expected: string | undefined): FrontierCodexResolvedDependency['status'] {
  if (!version) return 'missing';
  if (!expected || expected.startsWith('workspace:') || expected.startsWith('file:') || expected === '*') return 'ok';
  const cleanExpected = expected.replace(/^[~^>=< ]+/, '');
  const compare = compareVersions(version, cleanExpected);
  if (expected.startsWith('^')) return satisfiesCaret(version, cleanExpected) ? 'ok' : compare > 0 ? 'newer' : 'stale';
  if (expected.startsWith('~')) return sameMajorMinor(version, cleanExpected) && compare >= 0 ? 'ok' : compare > 0 ? 'newer' : 'stale';
  if (expected.startsWith('>=')) return compare >= 0 ? 'ok' : 'stale';
  if (version === cleanExpected) return 'ok';
  return compare > 0 ? 'newer' : 'stale';
}

function satisfiesCaret(version: string, expected: string): boolean {
  const actual = versionParts(version);
  const minimum = versionParts(expected);
  if (compareVersions(version, expected) < 0) return false;
  if (minimum[0] > 0) return actual[0] === minimum[0];
  if (minimum[1] > 0) return actual[0] === 0 && actual[1] === minimum[1];
  return actual[0] === 0 && actual[1] === 0 && actual[2] === minimum[2];
}

function sameMajorMinor(version: string, expected: string): boolean {
  const actual = versionParts(version);
  const minimum = versionParts(expected);
  return actual[0] === minimum[0] && actual[1] === minimum[1];
}

function compareVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function versionParts(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
}

async function readPackageJson(file: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  return isObject(parsed) ? parsed : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
