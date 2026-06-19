import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(packageDir, '..', '..');
const packageJsonPath = path.join(packageDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const packageName = packageJson.name;
const stack = new Set((process.env.FRONTIER_PACKAGE_BUILD_STACK || '').split(path.delimiter).filter(Boolean));
const nextStack = new Set(stack);
nextStack.add(packageName);
unlinkSelfPackage(packageName);

const localDependencies = readLocalDependencies(packageJson)
  .map((name) => ({ name, targetDir: localPackageDir(name) }))
  .filter((dependency) => dependency.targetDir && dependency.targetDir !== packageDir);

for (const dependency of localDependencies) {
  linkLocalPackage(dependency.name, dependency.targetDir);
  if (!stack.has(dependency.name) && !isPackageBuildCurrent(dependency.targetDir)) {
    execFileSync('npm', ['--prefix', dependency.targetDir, 'run', 'build'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        FRONTIER_PACKAGE_BUILD_STACK: Array.from(nextStack).join(path.delimiter)
      }
    });
  }
}

const localDependencyDirs = localDependencies.map((dependency) => dependency.targetDir);

if (process.argv.includes('--typecheck')) {
  const releaseDistLocks = await acquirePackageDistLocks([packageDir, ...localDependencyDirs]);
  try {
    assertLocalDependencyBuildsCurrent(localDependencyDirs);
    runTsc(['-p', path.join(packageDir, 'tsconfig.json'), '--noEmit']);
    runTsc(['-p', path.join(packageDir, 'test', 'tsconfig.json'), '--noEmit']);
  } finally {
    releaseDistLocks();
  }
  process.exit(0);
}

const releaseDistLocks = await acquirePackageDistLocks([packageDir, ...localDependencyDirs]);
try {
  assertLocalDependencyBuildsCurrent(localDependencyDirs);
  fs.rmSync(path.join(packageDir, 'dist'), { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  runTsc(['-b', path.join(packageDir, 'tsconfig.json'), '--force']);
  fs.chmodSync(path.join(packageDir, 'dist', 'cli.js'), 0o755);
} finally {
  releaseDistLocks();
}

function readLocalDependencies(pkg) {
  const names = new Set();
  for (const section of ['dependencies', 'peerDependencies', 'devDependencies']) {
    const deps = pkg[section];
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (name.startsWith('@shapeshift-labs/frontier')) names.add(name);
    }
  }
  return Array.from(names).sort();
}

function localPackageDir(name) {
  const shortName = name.startsWith('@shapeshift-labs/') ? name.slice('@shapeshift-labs/'.length) : name;
  const target = path.join(rootDir, 'packages', shortName);
  return fs.existsSync(path.join(target, 'package.json')) ? target : null;
}

function linkLocalPackage(name, targetDir) {
  const parts = name.split('/');
  const scopeDir = path.join(packageDir, 'node_modules', ...parts.slice(0, -1));
  const linkPath = path.join(packageDir, 'node_modules', ...parts);
  const target = path.relative(path.dirname(linkPath), targetDir);
  fs.mkdirSync(scopeDir, { recursive: true });
  try {
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink()) return;
    if (fs.readlinkSync(linkPath) === target) return;
    fs.unlinkSync(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    fs.symlinkSync(target, linkPath, 'dir');
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stat = fs.lstatSync(linkPath);
    if (!stat.isSymbolicLink() || fs.readlinkSync(linkPath) !== target) throw error;
  }
}

function unlinkSelfPackage(name) {
  const parts = name.split('/');
  const linkPath = path.join(packageDir, 'node_modules', ...parts);
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) fs.unlinkSync(linkPath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function assertLocalDependencyBuildsCurrent(targetDirs) {
  for (const targetDir of targetDirs) {
    if (isPackageBuildCurrent(targetDir)) continue;
    const label = path.relative(rootDir, targetDir) || targetDir;
    throw new Error(`Local dependency ${label} dist is not current after acquiring package dist locks; rerun the package gate so typecheck/build reads stable declarations.`);
  }
}

function isPackageBuildCurrent(targetDir) {
  const distEntry = path.join(targetDir, 'dist', 'index.js');
  const distTypes = path.join(targetDir, 'dist', 'index.d.ts');
  if (!fs.existsSync(distEntry)) return false;
  if (!fs.existsSync(distTypes)) return false;
  const distMtime = fs.statSync(distEntry).mtimeMs;
  for (const file of ['package.json', 'tsconfig.json', 'build.mjs']) {
    const full = path.join(targetDir, file);
    if (fs.existsSync(full) && fs.statSync(full).mtimeMs > distMtime) return false;
  }
  const srcDir = path.join(targetDir, 'src');
  if (fs.existsSync(srcDir) && newestMtime(srcDir) > distMtime) return false;
  return true;
}

async function acquirePackageDistLocks(targetDirs) {
  const releases = [];
  const uniqueTargetDirs = Array.from(new Set(targetDirs.map((targetDir) => path.resolve(targetDir)))).sort();
  try {
    for (const targetDir of uniqueTargetDirs) releases.push(await acquirePackageDistLock(targetDir));
  } catch (error) {
    for (const release of releases.reverse()) release();
    throw error;
  }
  return () => {
    for (const release of releases.reverse()) release();
  };
}

async function acquirePackageDistLock(targetDir) {
  const cacheDir = path.join(targetDir, 'node_modules', '.cache');
  const lockDir = path.join(cacheDir, 'frontier-package-dist.lock');
  const ownerPath = path.join(lockDir, 'owner.json');
  const timeoutMs = readPositiveIntegerEnv('FRONTIER_PACKAGE_DIST_LOCK_TIMEOUT_MS', 120000);
  const deadline = Date.now() + timeoutMs;
  fs.mkdirSync(cacheDir, { recursive: true });

  while (true) {
    const token = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      fs.mkdirSync(lockDir);
      fs.writeFileSync(ownerPath, JSON.stringify({
        pid: process.pid,
        token,
        packageDir: targetDir,
        argv: process.argv,
        createdAtMs: Date.now()
      }, null, 2) + '\n');
      return () => releasePackageDistLock(lockDir, ownerPath, token);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (removeStalePackageDistLock(lockDir, ownerPath)) continue;
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for package dist lock at ${lockDir}; another local package gate may still be rebuilding dist.`);
      }
      await sleep(50);
    }
  }
}

function releasePackageDistLock(lockDir, ownerPath, token) {
  try {
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    if (owner.token !== token) return;
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fs.rmSync(lockDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}

function removeStalePackageDistLock(lockDir, ownerPath) {
  const staleMs = readPositiveIntegerEnv('FRONTIER_PACKAGE_DIST_LOCK_STALE_MS', 600000);
  let owner;
  try {
    owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  } catch {
    owner = undefined;
  }
  if (owner && Number.isInteger(owner.pid) && owner.pid > 0) {
    if (isPidAlive(owner.pid)) return false;
    fs.rmSync(lockDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    return true;
  }
  let lockMtime = 0;
  try {
    lockMtime = fs.statSync(lockDir).mtimeMs;
  } catch {
    return false;
  }
  const createdAtMs = Number.isFinite(owner?.createdAtMs) ? owner.createdAtMs : lockMtime;
  if (Date.now() - createdAtMs <= staleMs) return false;
  fs.rmSync(lockDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  return true;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function readPositiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(full));
    else newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

function resolveTsc() {
  const command = process.platform === 'win32' ? 'tsc.cmd' : 'tsc';
  const candidates = [
    path.join(packageDir, 'node_modules', '.bin', command),
    path.join(rootDir, 'node_modules', '.bin', command)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return command;
}

function resolveTscScript() {
  const candidates = [
    path.join(packageDir, 'node_modules', 'typescript', 'bin', 'tsc'),
    path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc')
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function runTsc(args) {
  const tscScript = resolveTscScript();
  if (tscScript) execFileSync(process.execPath, [tscScript, ...args], { stdio: 'inherit' });
  else execFileSync(resolveTsc(), args, { stdio: 'inherit' });
}
