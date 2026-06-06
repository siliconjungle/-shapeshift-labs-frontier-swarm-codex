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
};



export type FrontierLangSemanticImportApi = {
  ok: true;
  importNativeSource(input: Record<string, unknown>): any;
  createSemanticMergeCandidateFromImport(input: Record<string, unknown>): any;
  createSemanticImportSidecar?(importResult: unknown, options?: Record<string, unknown>): any;
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
    maxFiles
  };
}



export function matchesSemanticImportGlob(file: string, glob: string): boolean {
  if (matchesGlob(file, glob)) return true;
  const zeroDepthGlob = glob.replace(/\/\*\*\//g, '/');
  return zeroDepthGlob !== glob && matchesGlob(file, zeroDepthGlob);
}



export function semanticImportCandidatePaths(job: FrontierSwarmJob, changedPaths: readonly string[]): string[] {
  const concreteRefs = job.task.sourceRefs.concat(job.task.targetRefs).filter((file) => {
    const normalized = normalizeWorkspacePath(file);
    return normalized
      && !normalized.includes('*')
      && path.extname(normalized).length > 0;
  });
  return uniqueWorkspacePaths([...changedPaths, ...concreteRefs]);
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
      createSemanticMergeCandidateFromImport: api.createSemanticMergeCandidateFromImport,
      ...(typeof api.createSemanticImportSidecar === 'function' ? { createSemanticImportSidecar: api.createSemanticImportSidecar } : {}),
      ...(typeof api.projectNativeImportToSource === 'function' ? { projectNativeImportToSource: api.projectNativeImportToSource } : {}),
      ...(typeof api.compileNativeSource === 'function' ? { compileNativeSource: api.compileNativeSource } : {}),
      ...(typeof api.hashUniversalAstEnvelope === 'function' ? { hashUniversalAstEnvelope: api.hashUniversalAstEnvelope } : {})
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
