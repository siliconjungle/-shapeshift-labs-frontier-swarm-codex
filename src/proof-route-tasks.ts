import {
  createSwarmBacklog,
  type FrontierSwarmBacklog,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import { isObject, readStringArray, slug, stableHash, uniqueStrings, uniqueWorkspacePaths } from './common.js';
import type { FrontierCodexCollectResult, FrontierCodexCollectedBundle } from './types-collection.js';

export const FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE = 'produce-playwright-assertion-runtime-proof-bundle';
export const FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE = 'html-css-browser-runtime-proof-not-available';

export interface FrontierCodexProofRouteRequest {
  readonly id: string;
  readonly routeNext: string;
  readonly code?: string;
  readonly summary?: string;
  readonly sourceJobId?: string;
  readonly sourceTaskId?: string;
  readonly bucket?: string;
  readonly mergePath?: string;
  readonly outputDir?: string;
  readonly changedPaths: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly targetRefs: readonly string[];
  readonly suggestedInput: Readonly<Record<string, unknown>>;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface FrontierCodexProofRouteRequestInput {
  readonly collection?: FrontierCodexCollectResult;
  readonly roots?: readonly unknown[];
}

export interface FrontierCodexProofRouteTaskInput extends FrontierCodexProofRouteRequestInput {
  readonly packageName?: string;
  readonly lane?: string;
  readonly compute?: string;
  readonly taskIdPrefix?: string;
  readonly browserHeadless?: boolean;
  readonly browserPortPool?: readonly string[];
  readonly browserProfileDirPrefix?: string;
}

export function createCodexProofRouteRequests(input: FrontierCodexProofRouteRequestInput): FrontierCodexProofRouteRequest[] {
  const requests = new Map<string, FrontierCodexProofRouteRequest>();
  for (const entry of collectionEntries(input.collection)) {
    scanProofRouteValue(entry.bundle, collectionContext(entry), requests, new Set(), 0);
  }
  for (const root of input.roots ?? []) {
    scanProofRouteValue(root, {}, requests, new Set(), 0);
  }
  return Array.from(requests.values()).sort((left, right) => left.id.localeCompare(right.id));
}

export function createCodexProofRouteTasks(input: FrontierCodexProofRouteTaskInput): FrontierSwarmTaskInput[] {
  return createCodexProofRouteRequests(input).map((request) => proofRouteRequestToTask(request, input));
}

export function createCodexProofRouteBacklog(input: FrontierCodexProofRouteTaskInput): FrontierSwarmBacklog {
  const tasks = createCodexProofRouteTasks(input);
  return createSwarmBacklog({
    id: `codex-proof-route-backlog:${stableHash(tasks.map((task) => task.id))}`,
    title: 'Codex proof route backlog',
    package: input.packageName,
    tasks,
    metadata: {
      source: 'frontier-swarm-codex',
      routeNext: FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
      requestCount: tasks.length,
      generatedFrom: input.collection ? 'collection' : 'roots'
    }
  });
}

function proofRouteRequestToTask(
  request: FrontierCodexProofRouteRequest,
  input: FrontierCodexProofRouteTaskInput
): FrontierSwarmTaskInput {
  const hash = stableHash([request.id, request.changedPaths, request.summary]).replace(/^fnv1a32:/, '').slice(0, 10);
  const sourceJobSlug = slug(request.sourceJobId ?? request.sourceTaskId ?? request.code ?? 'browser-runtime-proof');
  const id = `${input.taskIdPrefix ?? 'proof-route-'}${sourceJobSlug}-${hash}`;
  const sourceRefs = uniqueStrings([...request.sourceRefs, ...request.targetRefs]);
  return {
    id,
    title: `Produce HTML/CSS browser proof for ${request.sourceJobId ?? request.code ?? 'semantic merge candidate'}`,
    objective: 'Produce a source-bound Playwright browser runtime proof bundle for the HTML/CSS semantic merge missing-evidence route.',
    kind: 'browser-runtime-proof',
    lane: input.lane ?? 'browser',
    ...(input.compute ? { compute: input.compute } : {}),
    ...(request.sourceTaskId ? { parentTaskId: request.sourceTaskId } : {}),
    priority: 80,
    sourceRefs,
    targetRefs: request.targetRefs,
    allowedWrites: ['agent-runs/**'],
    capabilities: [
      'browser.playwright',
      'frontier-playwright.assertions',
      'dom.assertions',
      'css.computed-style'
    ],
    resourceRequirements: {
      capabilities: ['browser.playwright'],
      resources: { browser: 1 },
      browser: {
        required: true,
        maxConcurrency: 1,
        ...(input.browserPortPool?.length ? { portPool: [...input.browserPortPool] } : {}),
        ...(input.browserProfileDirPrefix ? { profileDirPrefix: input.browserProfileDirPrefix } : {}),
        headless: input.browserHeadless ?? true
      }
    },
    acceptance: [
      'Use @shapeshift-labs/frontier-playwright runFrontierPlaywrightAssertionRuntimeProof or runFrontierPlaywrightSourceRuntimeProof.',
      'Write playwright-runtime-proof.json with createFrontierPlaywrightRuntimeProofArtifact and stringifyFrontierPlaywrightRuntimeProofArtifact, and include that file path in the merge bundle evidencePaths.',
      'Bind proof input to exact base/worker/head/output source text or hashes when those sources are available.',
      'Write source-bound proofBuilderInput and assertion/runtime evidence under the job evidence directory.',
      'Keep semanticEquivalenceClaim, browserEquivalenceClaim, runtimeEquivalenceClaim, and autoMergeClaim false until the language validator admits the proof.',
      'If assertions fail or source binding is incomplete, emit failed/non-admissible runtime evidence instead of an admissible proof.'
    ],
    verification: [],
    tags: [
      'semantic-proof-route',
      'html-css-browser-runtime-proof',
      'playwright-assertion-runtime-proof',
      request.routeNext,
      ...(request.code ? [request.code] : [])
    ],
    metadata: {
      source: 'frontier-swarm-codex.proof-route-tasks',
      proofRoute: {
        id: request.id,
        routeNext: request.routeNext,
        ...(request.code ? { code: request.code } : {}),
        ...(request.summary ? { summary: request.summary } : {}),
        suggestedInput: request.suggestedInput,
        changedPaths: request.changedPaths,
        sourceRefs: request.sourceRefs,
        targetRefs: request.targetRefs
      },
      proofProducer: {
        package: '@shapeshift-labs/frontier-playwright',
        functions: ['runFrontierPlaywrightAssertionRuntimeProof', 'runFrontierPlaywrightSourceRuntimeProof']
      },
      proofConsumers: {
        html: ['createHtmlRuntimeProof', 'createHtmlRuntimeBoundaryProof'],
        css: ['createCssCascadeRuntimeProof']
      },
      sourceBundle: {
        ...(request.sourceJobId ? { jobId: request.sourceJobId } : {}),
        ...(request.sourceTaskId ? { taskId: request.sourceTaskId } : {}),
        ...(request.bucket ? { bucket: request.bucket } : {}),
        ...(request.mergePath ? { mergePath: request.mergePath } : {}),
        ...(request.outputDir ? { outputDir: request.outputDir } : {})
      }
    }
  };
}

function scanProofRouteValue(
  value: unknown,
  context: Partial<FrontierCodexProofRouteRequest>,
  out: Map<string, FrontierCodexProofRouteRequest>,
  seen: Set<unknown>,
  depth: number
): void {
  if (depth > 10 || value === null || value === undefined) return;
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) scanProofRouteValue(entry, context, out, seen, depth + 1);
    return;
  }
  if (!isObject(value)) return;
  const request = proofRouteRequestFromRecord(value, context);
  if (request) out.set(request.id, request);
  for (const entry of Object.values(value)) {
    if (entry && typeof entry === 'object') scanProofRouteValue(entry, context, out, seen, depth + 1);
  }
}

function proofRouteRequestFromRecord(
  record: Record<string, unknown>,
  context: Partial<FrontierCodexProofRouteRequest>
): FrontierCodexProofRouteRequest | undefined {
  const routeNext = firstString(record, ['routeNext', 'nextRoute', 'proofRoute', 'action']);
  const code = firstString(record, ['code', 'reasonCode', 'id']);
  if (!isPlaywrightAssertionProofRoute(routeNext, code)) return undefined;
  const summary = firstString(record, ['summary', 'message', 'description', 'reason']);
  const suggestedInput = isObject(record.suggestedInput) ? { ...record.suggestedInput } : {};
  const changedPaths = uniqueWorkspacePaths([
    ...readPaths(record),
    ...(context.changedPaths ?? [])
  ]);
  const htmlCssRefs = changedPaths.filter((entry) => /\.(?:html|css)$/i.test(entry));
  const sourceRefs = uniqueWorkspacePaths([
    ...readStringArray(record.sourceRefs),
    ...(htmlCssRefs.length ? htmlCssRefs : changedPaths),
    ...(context.sourceRefs ?? [])
  ]);
  const targetRefs = uniqueWorkspacePaths([
    ...readStringArray(record.targetRefs),
    ...changedPaths,
    ...(context.targetRefs ?? [])
  ]);
  const requestSeed = [
    routeNext ?? FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
    code,
    summary,
    context.sourceJobId,
    context.sourceTaskId,
    changedPaths,
    suggestedInput
  ];
  const id = `codex-proof-route:${stableHash(requestSeed)}`;
  return {
    id,
    routeNext: routeNext ?? FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE,
    ...(code ? { code } : {}),
    ...(summary ? { summary } : {}),
    ...(context.sourceJobId ? { sourceJobId: context.sourceJobId } : {}),
    ...(context.sourceTaskId ? { sourceTaskId: context.sourceTaskId } : {}),
    ...(context.bucket ? { bucket: context.bucket } : {}),
    ...(context.mergePath ? { mergePath: context.mergePath } : {}),
    ...(context.outputDir ? { outputDir: context.outputDir } : {}),
    changedPaths,
    sourceRefs,
    targetRefs,
    suggestedInput,
    metadata: {
      detector: 'frontier-swarm-codex.proof-route-tasks',
      matchedBy: routeMatches(routeNext) ? 'routeNext' : 'code'
    }
  };
}

function isPlaywrightAssertionProofRoute(routeNext: string | undefined, code: string | undefined): boolean {
  return routeMatches(routeNext) || code === FRONTIER_CODEX_HTML_CSS_BROWSER_RUNTIME_PROOF_CODE;
}

function routeMatches(value: string | undefined): boolean {
  return normalizeToken(value) === normalizeToken(FRONTIER_CODEX_PLAYWRIGHT_ASSERTION_PROOF_ROUTE);
}

function collectionEntries(collection: FrontierCodexCollectResult | undefined): FrontierCodexCollectedBundle[] {
  if (!collection) return [];
  return Object.values(collection.buckets ?? {}).flat();
}

function collectionContext(entry: FrontierCodexCollectedBundle): Partial<FrontierCodexProofRouteRequest> {
  const changedPaths = uniqueWorkspacePaths(entry.bundle.changedPaths ?? []);
  const htmlCssPaths = changedPaths.filter((sourcePath) => /\.(?:html|css)$/i.test(sourcePath));
  return {
    sourceJobId: entry.bundle.jobId ?? entry.jobId,
    sourceTaskId: entry.bundle.taskId,
    bucket: entry.bucket,
    mergePath: entry.mergePath,
    outputDir: entry.outputDir,
    changedPaths,
    sourceRefs: htmlCssPaths.length ? htmlCssPaths : changedPaths,
    targetRefs: uniqueWorkspacePaths([
      ...changedPaths,
      ...(entry.bundle.evidencePaths ?? [])
    ])
  };
}

function readPaths(record: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...readStringArray(record.changedPaths),
    ...readStringArray(record.sourcePaths),
    ...readStringArray(record.paths),
    ...scalarString(record.changedPath),
    ...scalarString(record.sourcePath),
    ...scalarString(record.path)
  ]);
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function scalarString(value: unknown): string[] {
  return typeof value === 'string' && value.trim() ? [value.trim()] : [];
}

function normalizeToken(value: string | undefined): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
