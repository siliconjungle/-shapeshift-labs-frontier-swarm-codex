import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRONTIER_SWARM_CODEX_LINK_REPAIR_KIND,
  FRONTIER_SWARM_CODEX_LINK_REPAIR_VERSION
} from './constants.js';
import { isObject, uniqueStrings } from './common.js';
import type {
  FrontierCodexWorkspacePackageLinkEntry,
  FrontierCodexWorkspacePackageLinkRepairInput,
  FrontierCodexWorkspacePackageLinkRepairResult
} from './types.js';

export async function repairCodexWorkspacePackageLinks(input: FrontierCodexWorkspacePackageLinkRepairInput = {}): Promise<FrontierCodexWorkspacePackageLinkRepairResult> {
  const root = path.resolve(input.root ?? process.cwd());
  const scope = input.scope ?? '@shapeshift-labs';
  const write = input.write ?? false;
  const replace = input.replace ?? false;
  const packageRoots = (input.packageRoots?.length ? input.packageRoots : [path.join(root, 'packages'), path.dirname(root)])
    .map((entry) => path.resolve(root, entry));
  const excludes = new Set(input.excludePackages ?? []);
  const dependencies = input.packages?.length
    ? new Map(input.packages.map((name) => [name, undefined as string | undefined]))
    : await readWorkspaceScopedDependencies(root, scope);
  const localPackages = await discoverLocalWorkspacePackages(packageRoots, scope);
  const entries: FrontierCodexWorkspacePackageLinkEntry[] = [];

  for (const [packageName, dependencyRange] of Array.from(dependencies.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const linkPath = path.join(root, 'node_modules', ...packageName.split('/'));
    if (excludes.has(packageName)) {
      entries.push({ packageName, dependencyRange, linkPath, status: 'excluded', reason: 'package excluded from local repair' });
      continue;
    }
    const targetPath = localPackages.get(packageName);
    if (!targetPath) {
      entries.push({ packageName, dependencyRange, linkPath, status: 'missing-local-package', reason: 'no matching local package was found' });
      continue;
    }
    entries.push(await planOrRepairWorkspacePackageLink({
      packageName,
      dependencyRange,
      linkPath,
      targetPath,
      write,
      replace
    }));
  }

  const result: FrontierCodexWorkspacePackageLinkRepairResult = {
    kind: FRONTIER_SWARM_CODEX_LINK_REPAIR_KIND,
    version: FRONTIER_SWARM_CODEX_LINK_REPAIR_VERSION,
    generatedAt: Date.now(),
    root,
    scope,
    packageRoots,
    write,
    replace,
    entries,
    summary: {
      total: entries.length,
      planned: entries.filter((entry) => entry.status === 'planned').length,
      linked: entries.filter((entry) => entry.status === 'linked').length,
      replaced: entries.filter((entry) => entry.status === 'replaced').length,
      alreadyLinked: entries.filter((entry) => entry.status === 'already-linked').length,
      excluded: entries.filter((entry) => entry.status === 'excluded').length,
      missingLocalPackage: entries.filter((entry) => entry.status === 'missing-local-package').length,
      conflicts: entries.filter((entry) => entry.status === 'conflict').length
    },
    ...(input.outFile ? { outFile: path.resolve(root, input.outFile) } : {})
  };
  if (result.outFile) {
    await fs.mkdir(path.dirname(result.outFile), { recursive: true });
    await fs.writeFile(result.outFile, JSON.stringify(result, null, 2) + '\n');
  }
  return result;
}

async function readWorkspaceScopedDependencies(root: string, scope: string): Promise<Map<string, string | undefined>> {
  const packageJson = await readJsonObject(path.join(root, 'package.json'));
  const dependencies = new Map<string, string | undefined>();
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    const value = packageJson?.[section];
    if (!isObject(value)) continue;
    for (const [name, range] of Object.entries(value)) {
      if (name === scope || name.startsWith(scope + '/')) dependencies.set(name, typeof range === 'string' ? range : undefined);
    }
  }
  return dependencies;
}

async function discoverLocalWorkspacePackages(packageRoots: readonly string[], scope: string): Promise<Map<string, string>> {
  const packages = new Map<string, string>();
  for (const root of uniqueStrings(packageRoots)) {
    await addLocalWorkspacePackage(packages, root, scope);
    const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue;
      const child = path.join(root, entry.name);
      if (entry.name.startsWith('@')) {
        const scopedEntries = await fs.readdir(child, { withFileTypes: true }).catch(() => []);
        for (const scopedEntry of scopedEntries) {
          if (scopedEntry.isDirectory()) await addLocalWorkspacePackage(packages, path.join(child, scopedEntry.name), scope);
        }
      } else {
        await addLocalWorkspacePackage(packages, child, scope);
      }
    }
  }
  return packages;
}

async function addLocalWorkspacePackage(packages: Map<string, string>, packageDir: string, scope: string): Promise<void> {
  const packageJson = await readJsonObject(path.join(packageDir, 'package.json'));
  const name = typeof packageJson?.name === 'string' ? packageJson.name : undefined;
  if (!name || name !== scope && !name.startsWith(scope + '/')) return;
  if (!packages.has(name)) packages.set(name, path.resolve(packageDir));
}

async function readJsonObject(file: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8'));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function planOrRepairWorkspacePackageLink(input: {
  packageName: string;
  dependencyRange?: string;
  linkPath: string;
  targetPath: string;
  write: boolean;
  replace: boolean;
}): Promise<FrontierCodexWorkspacePackageLinkEntry> {
  const base = {
    packageName: input.packageName,
    dependencyRange: input.dependencyRange,
    linkPath: input.linkPath,
    targetPath: input.targetPath
  };
  const stat = await fs.lstat(input.linkPath).catch(() => undefined);
  const relativeTarget = path.relative(path.dirname(input.linkPath), input.targetPath) || '.';
  if (stat?.isSymbolicLink()) {
    const currentTarget = path.resolve(path.dirname(input.linkPath), await fs.readlink(input.linkPath));
    if (currentTarget === input.targetPath) return { ...base, status: 'already-linked' };
    if (!input.write) return { ...base, status: 'planned', reason: 'existing symlink points at a different package' };
    await fs.unlink(input.linkPath);
    await fs.symlink(relativeTarget, input.linkPath, 'dir');
    return { ...base, status: 'linked', reason: 'updated existing symlink' };
  }
  if (stat) {
    if (!input.replace) return { ...base, status: 'conflict', reason: 'existing node_modules entry is not a symlink' };
    if (!input.write) return { ...base, status: 'planned', reason: 'would replace existing node_modules entry' };
    await fs.rm(input.linkPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(input.linkPath), { recursive: true });
    await fs.symlink(relativeTarget, input.linkPath, 'dir');
    return { ...base, status: 'replaced', reason: 'replaced existing node_modules entry with a symlink' };
  }
  if (!input.write) return { ...base, status: 'planned', reason: 'missing symlink' };
  await fs.mkdir(path.dirname(input.linkPath), { recursive: true });
  await fs.symlink(relativeTarget, input.linkPath, 'dir');
  return { ...base, status: 'linked', reason: 'created symlink' };
}

async function resolvePidManifestPath(runPath: string): Promise<string> {
  const absolute = path.resolve(runPath);
  const stat = await fs.lstat(absolute).catch(() => undefined);
  if (stat?.isDirectory()) return path.join(absolute, 'pids.json');
  if (path.basename(absolute) === 'swarm-results.json') return path.join(path.dirname(absolute), 'pids.json');
  return absolute;
}
