import path from 'node:path';
import { matchesGlob, type FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import type { FrontierCodexSemanticImportOptions } from './index.js';
import { normalizeWorkspacePath, pathHasIgnoredSegment, uniqueWorkspacePaths } from './common.js';



export type SemanticImportSelectedPath = { path: string; language: string };


export type SemanticImportSelection = {
  selected: SemanticImportSelectedPath[];
  candidateCount: number;
  eligibleCount: number;
  omittedCount: number;
  ignoredCount: number;
  includeFilteredCount: number;
  excludeFilteredCount: number;
  unsupportedLanguageCount: number;
  maxFiles: number;
  fallbackCount: number;
  fallbackReason?: string;
};



export type FrontierLangSemanticImportApi = {
  ok: true;
  importNativeSource(input: Record<string, unknown>): any;
  diffNativeSources?(input: Record<string, unknown>): any;
  createSemanticEditScript?(input: Record<string, unknown>): any;
  projectSemanticEditScriptToSource?(input: Record<string, unknown>): any;
  replaySemanticEditProjection?(input: Record<string, unknown>): any;
  inferSemanticLineageEvents?(input?: Record<string, unknown>, options?: Record<string, unknown>): any;
  createSemanticMergeCandidateFromImport(input: Record<string, unknown>): any;
  classifySemanticMergeCandidate?(input: unknown, options?: Record<string, unknown>): any;
  createJsTsSafeMergeApplyRecord?(input: Record<string, unknown>, options?: Record<string, unknown>): any;
  createSemanticImportSidecar?(importResult: unknown, options?: Record<string, unknown>): any;
  createSemanticSlice?(importResult: unknown, options?: Record<string, unknown>): any;
  createSemanticSliceAdmissionRecord?(slice: unknown, options?: Record<string, unknown>): any;
  testSemanticSlice?(slice: unknown, options?: Record<string, unknown>): any;
  projectNativeImportToSource?(importResult: unknown, options?: Record<string, unknown>): any;
  compileNativeSource?(importResult: unknown, options?: Record<string, unknown>): any;
  hashUniversalAstEnvelope?(input: unknown): string;
} | {
  ok: false;
  error: string;
};



export function normalizeSemanticImportOptions(input: boolean | FrontierCodexSemanticImportOptions | undefined): Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> & FrontierCodexSemanticImportOptions | undefined {
  if (input === false || input === undefined) return undefined;
  const options = input === true ? {} : input;
  if (options.enabled === false) return undefined;
  return {
    ...options,
    enabled: true,
    maxFiles: Math.max(0, Math.floor(options.maxFiles ?? 24)),
    maxBytes: Math.max(0, Math.floor(options.maxBytes ?? 512 * 1024))
  };
}



export function selectSemanticImportPaths(
  changedPaths: readonly string[],
  options: Required<Pick<FrontierCodexSemanticImportOptions, 'maxFiles' | 'maxBytes'>> & FrontierCodexSemanticImportOptions
): SemanticImportSelection {
  const eligible: SemanticImportSelectedPath[] = [];
  let candidateCount = 0;
  let ignoredCount = 0;
  let includeFilteredCount = 0;
  let excludeFilteredCount = 0;
  let unsupportedLanguageCount = 0;
  for (const file of uniqueWorkspacePaths(changedPaths)) {
    candidateCount += 1;
    if (pathHasIgnoredSegment(file, ['node_modules', 'dist', 'coverage', 'agent-runs', '.frontier-framework'])) {
      ignoredCount += 1;
      continue;
    }
    if (options.include?.length && !options.include.some((glob) => matchesSemanticImportGlob(file, glob))) {
      includeFilteredCount += 1;
      continue;
    }
    if (options.exclude?.some((glob) => matchesSemanticImportGlob(file, glob))) {
      excludeFilteredCount += 1;
      continue;
    }
    const language = inferSemanticImportLanguage(file, options.languages);
    if (!language) {
      unsupportedLanguageCount += 1;
      continue;
    }
    eligible.push({ path: file, language });
  }
  const maxFiles = Math.max(0, options.maxFiles);
  return {
    selected: eligible.slice(0, maxFiles),
    candidateCount,
    eligibleCount: eligible.length,
    omittedCount: Math.max(0, eligible.length - maxFiles),
    ignoredCount,
    includeFilteredCount,
    excludeFilteredCount,
    unsupportedLanguageCount,
    maxFiles,
    fallbackCount: 0
  };
}



export function matchesSemanticImportGlob(file: string, glob: string): boolean {
  const normalizedFile = normalizeWorkspacePath(file);
  const normalizedGlob = normalizeSemanticImportGlob(glob);
  if (!normalizedFile || !normalizedGlob) return false;
  return semanticImportGlobVariants(normalizedGlob).some((candidate) => {
    if (matchesGlob(normalizedFile, candidate)) return true;
    return semanticGlobRegExp(candidate).test(normalizedFile);
  });
}



export function semanticImportCandidatePaths(job: FrontierSwarmJob, changedPaths: readonly string[], workspace?: string): string[] {
  const concreteRefs = [
    ...job.task.sourceRefs,
    ...job.task.targetRefs,
    ...job.task.allowedWrites,
    ...job.allowedWrites
  ].filter((file) => {
    const normalized = normalizeWorkspacePath(file);
    return normalized && path.extname(normalized).length > 0;
  });
  return uniqueWorkspacePaths([...normalizeSemanticImportCandidatePaths(changedPaths, workspace), ...concreteRefs]);
}



export function normalizeSemanticImportCandidatePaths(paths: readonly string[], workspace?: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const file of paths) {
    const normalized = normalizeSemanticImportCandidatePath(file, workspace);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}



export function normalizeSemanticImportCandidatePath(file: string, workspace?: string): string | undefined {
  const value = String(file ?? '').trim();
  const normalized = normalizeWorkspacePath(value);
  if (normalized) return normalized;
  if (!workspace || !path.isAbsolute(value)) return undefined;
  return normalizeWorkspacePath(path.relative(workspace, value).replace(/\\/g, '/'));
}



export function semanticImportPathVariants(file: string): string[] {
  const normalized = normalizeWorkspacePath(file);
  if (!normalized) return [];
  const variants = [normalized];
  const parts = normalized.split('/').filter(Boolean);
  for (let index = 1; index < parts.length - 1; index += 1) {
    const suffix = parts.slice(index).join('/');
    if (suffix.includes('/')) variants.push(suffix);
  }
  return Array.from(new Set(variants));
}



export function inferSemanticImportLanguage(file: string, overrides?: Readonly<Record<string, string>>): string | undefined {
  const ext = path.extname(file).toLowerCase();
  return overrides?.[file] ?? overrides?.[ext] ?? ({
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.rs': 'rust',
    '.py': 'python',
    '.c': 'c',
    '.h': 'c',
    '.cc': 'cpp',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.hh': 'cpp',
    '.go': 'go',
    '.java': 'java',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.swift': 'swift',
    '.cs': 'csharp',
    '.wasm': 'wasm',
    '.wat': 'wasm',
    '.php': 'php',
    '.rb': 'ruby',
    '.rake': 'ruby'
  } as Record<string, string | undefined>)[ext];
}



function normalizeSemanticImportGlob(glob: string): string | undefined {
  const clean = String(glob ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!clean || clean.includes('\0') || path.isAbsolute(clean) || clean.startsWith('..')) return undefined;
  return path.normalize(clean).replace(/\\/g, '/');
}



function semanticImportGlobVariants(glob: string): string[] {
  const variants = [glob];
  const parts = glob.split('/').filter(Boolean);
  const firstWildcard = parts.findIndex((part) => part.includes('*') || part.includes('?'));
  const prefixLimit = firstWildcard < 0 ? parts.length - 1 : firstWildcard;
  for (let index = 1; index < prefixLimit; index += 1) {
    const suffix = parts.slice(index).join('/');
    if (suffix && suffix.includes('/')) variants.push(suffix);
  }
  return Array.from(new Set(variants));
}



function semanticGlobRegExp(glob: string): RegExp {
  let pattern = '^';
  for (let index = 0; index < glob.length; index += 1) {
    if (glob.startsWith('**/', index)) {
      pattern += '(?:[^/]+/)*';
      index += 2;
      continue;
    }
    if (glob.startsWith('/**', index) && index + 3 === glob.length) {
      pattern += '(?:/.*)?';
      index += 2;
      continue;
    }
    if (glob.startsWith('**', index)) {
      pattern += '.*';
      index += 1;
      continue;
    }
    const char = glob[index];
    if (char === '*') pattern += '[^/]*';
    else if (char === '?') pattern += '[^/]';
    else pattern += escapeRegExp(char);
  }
  return new RegExp(pattern + '$');
}



function escapeRegExp(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}



export async function loadFrontierLangForSemanticImport(): Promise<FrontierLangSemanticImportApi> {
  try {
    const packageName = '@shapeshift-labs/frontier-lang';
    const api = await import(packageName) as any;
    if (typeof api.importNativeSource !== 'function' || typeof api.createSemanticMergeCandidateFromImport !== 'function') {
      return { ok: false, error: 'frontier-lang missing importNativeSource/createSemanticMergeCandidateFromImport exports' };
    }
    return {
      ok: true,
      importNativeSource: api.importNativeSource,
      ...(typeof api.diffNativeSources === 'function' ? { diffNativeSources: api.diffNativeSources } : {}),
      ...(typeof api.createSemanticEditScript === 'function' ? { createSemanticEditScript: api.createSemanticEditScript } : {}),
      ...(typeof api.projectSemanticEditScriptToSource === 'function' ? { projectSemanticEditScriptToSource: api.projectSemanticEditScriptToSource } : {}),
      ...(typeof api.replaySemanticEditProjection === 'function' ? { replaySemanticEditProjection: api.replaySemanticEditProjection } : {}),
      ...(typeof api.inferSemanticLineageEvents === 'function' ? { inferSemanticLineageEvents: api.inferSemanticLineageEvents } : {}),
      createSemanticMergeCandidateFromImport: api.createSemanticMergeCandidateFromImport,
      ...(typeof api.classifySemanticMergeCandidate === 'function' ? { classifySemanticMergeCandidate: api.classifySemanticMergeCandidate } : {}),
      ...(typeof api.createJsTsSafeMergeApplyRecord === 'function' ? { createJsTsSafeMergeApplyRecord: api.createJsTsSafeMergeApplyRecord } : {}),
      ...(typeof api.createSemanticImportSidecar === 'function' ? { createSemanticImportSidecar: api.createSemanticImportSidecar } : {}),
      ...(typeof api.createSemanticSlice === 'function' ? { createSemanticSlice: api.createSemanticSlice } : {}),
      ...(typeof api.createSemanticSliceAdmissionRecord === 'function' ? { createSemanticSliceAdmissionRecord: api.createSemanticSliceAdmissionRecord } : {}),
      ...(typeof api.testSemanticSlice === 'function' ? { testSemanticSlice: api.testSemanticSlice } : {}),
      ...(typeof api.projectNativeImportToSource === 'function' ? { projectNativeImportToSource: api.projectNativeImportToSource } : {}),
      ...(typeof api.compileNativeSource === 'function' ? { compileNativeSource: api.compileNativeSource } : {}),
      ...(typeof api.hashUniversalAstEnvelope === 'function' ? { hashUniversalAstEnvelope: api.hashUniversalAstEnvelope } : {})
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
