import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmJob, FrontierSwarmJobResult, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import {
  FRONTIER_SWARM_CODEX_RESUME_OVERLAY_KIND,
  FRONTIER_SWARM_CODEX_RESUME_OVERLAY_VERSION
} from './constants.js';
import { isObject, pathExists, uniqueStrings } from './common.js';
import { runCodexSwarm } from './codex-run.js';
import type {
  FrontierCodexResumeJob,
  FrontierCodexResumeJobStatus,
  FrontierCodexResumeOptions,
  FrontierCodexResumeOverlay,
  FrontierCodexResumeRunOptions,
  FrontierCodexResumeRunResult
} from './types-resume.js';

export async function createCodexResumeOverlay(options: FrontierCodexResumeOptions): Promise<FrontierCodexResumeOverlay> {
  const runDir = await resolveRunDir(options.run);
  const sourcePlanPath = path.join(runDir, 'swarm-plan.json');
  const sourceResultsPath = await pathExists(path.join(runDir, 'swarm-results.json'))
    ? path.join(runDir, 'swarm-results.json')
    : undefined;
  const plan = await readJson<FrontierSwarmPlan>(sourcePlanPath);
  const results = await readPreviousResults(runDir, plan);
  const jobs = await Promise.all(plan.jobs.map((job) => inspectResumeJob(runDir, job, results.get(job.id), options)));
  return {
    kind: FRONTIER_SWARM_CODEX_RESUME_OVERLAY_KIND,
    version: FRONTIER_SWARM_CODEX_RESUME_OVERLAY_VERSION,
    generatedAt: Date.now(),
    sourceRunDir: runDir,
    sourcePlanPath,
    ...(sourceResultsPath ? { sourceResultsPath } : {}),
    resumeJobIds: jobs.filter((job) => job.shouldResume).map((job) => job.jobId),
    jobs,
    summary: summarizeResumeJobs(jobs)
  };
}

export async function resumeCodexSwarmRun(options: FrontierCodexResumeRunOptions): Promise<FrontierCodexResumeRunResult> {
  const overlay = await createCodexResumeOverlay(options);
  const plan = createResumePlan(await readJson<FrontierSwarmPlan>(overlay.sourcePlanPath), overlay);
  const outDir = path.resolve(options.cwd ?? process.cwd(), options.outDir);
  await fs.mkdir(outDir, { recursive: true });
  const resumeOverlayPath = path.resolve(options.cwd ?? process.cwd(), options.outFile ?? path.join(outDir, 'resume-overlay.json'));
  await fs.writeFile(resumeOverlayPath, JSON.stringify(overlay, null, 2) + '\n');
  const originalRender = options.renderJobPrompt;
  const result = await runCodexSwarm(plan, {
    ...options,
    outDir,
    renderJobPrompt: async (input) => {
      const base = originalRender ? await originalRender(input) : input.prompt;
      return renderResumePromptPrefix(overlay, input.job.id) + base;
    }
  });
  return { ...result, resumeOverlay: overlay, resumeOverlayPath };
}

export function createCodexResumePlan(plan: FrontierSwarmPlan, overlay: FrontierCodexResumeOverlay): FrontierSwarmPlan {
  return createResumePlan(plan, overlay);
}

export function renderCodexResumePromptPrefix(overlay: FrontierCodexResumeOverlay, jobId: string): string {
  return renderResumePromptPrefix(overlay, jobId);
}

async function inspectResumeJob(
  runDir: string,
  job: FrontierSwarmJob,
  result: FrontierSwarmJobResult | undefined,
  options: FrontierCodexResumeOptions
): Promise<FrontierCodexResumeJob> {
  const paths = await discoverResumeEvidence(runDir, job, result);
  const status = classifyResumeStatus(result, paths);
  return {
    jobId: job.id,
    taskId: job.taskId,
    lane: job.lane,
    status,
    shouldResume: shouldResumeStatus(status, options),
    reason: resumeReason(status),
    evidencePaths: paths.evidence,
    ...(paths.lastMessage ? { lastMessagePath: paths.lastMessage } : {}),
    ...(result ? { previousResultPath: path.join(runDir, 'swarm-results.json') } : {})
  };
}

async function discoverResumeEvidence(
  runDir: string,
  job: FrontierSwarmJob,
  result: FrontierSwarmJobResult | undefined
): Promise<{ evidence: string[]; lastMessage?: string }> {
  const jobDir = path.join(runDir, job.id);
  const candidates = [
    path.join(jobDir, 'last-message.md'),
    path.join(jobDir, 'evidence', 'evidence.json'),
    path.join(jobDir, 'evidence', 'merge.json'),
    path.join(jobDir, 'evidence', 'patch-intent.json'),
    path.join(jobDir, 'evidence', 'semantic-imports.json'),
    path.join(jobDir, 'evidence', 'log-summary.json'),
    ...(result?.evidencePaths ?? [])
  ];
  const existing: string[] = [];
  for (const candidate of uniqueStrings(candidates)) if (await pathExists(candidate)) existing.push(candidate);
  const lastMessage = existing.find((entry) => entry.endsWith('last-message.md'));
  return { evidence: existing, ...(lastMessage ? { lastMessage } : {}) };
}

async function readPreviousResults(runDir: string, plan: FrontierSwarmPlan): Promise<Map<string, FrontierSwarmJobResult>> {
  const out = new Map<string, FrontierSwarmJobResult>();
  const resultsFile = path.join(runDir, 'swarm-results.json');
  const resultsEnvelope = await readOptionalJson(resultsFile);
  const run = isObject(resultsEnvelope?.run) ? resultsEnvelope.run as { results?: FrontierSwarmJobResult[] } : undefined;
  for (const result of run?.results ?? []) if (result.jobId) out.set(result.jobId, result);
  for (const job of plan.jobs) {
    if (out.has(job.id)) continue;
    const bundle = await readOptionalJson(path.join(runDir, job.id, 'evidence', 'merge.json'));
    const result = isObject(bundle?.result) ? bundle.result as unknown as FrontierSwarmJobResult : undefined;
    if (result?.jobId) out.set(result.jobId, result);
  }
  return out;
}

function createResumePlan(plan: FrontierSwarmPlan, overlay: FrontierCodexResumeOverlay): FrontierSwarmPlan {
  const resumeIds = new Set(overlay.resumeJobIds);
  const jobs = plan.jobs.filter((job) => resumeIds.has(job.id));
  return {
    ...plan,
    runId: `${plan.runId}:resume:${overlay.generatedAt}`,
    createdAt: Date.now(),
    jobs,
    graph: filterGraph(plan.graph, resumeIds),
    summary: { ...plan.summary, jobCount: jobs.length }
  };
}

function filterGraph(graph: FrontierSwarmPlan['graph'], jobIds: Set<string>): FrontierSwarmPlan['graph'] {
  const nodes = graph.nodes.filter((node) => jobIds.has(node));
  const edges = graph.edges.filter((edge) => jobIds.has(edge.from) && jobIds.has(edge.to));
  return {
    ...graph,
    nodes,
    edges,
    roots: nodes.filter((node) => !edges.some((edge) => edge.to === node)),
    leaves: nodes.filter((node) => !edges.some((edge) => edge.from === node)),
    dependentsByJobId: filterGraphMap(graph.dependentsByJobId, jobIds),
    dependenciesByJobId: filterGraphMap(graph.dependenciesByJobId, jobIds)
  };
}

function filterGraphMap(input: Record<string, string[]>, jobIds: Set<string>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of jobIds) out[id] = (input[id] ?? []).filter((entry) => jobIds.has(entry));
  return out;
}

function renderResumePromptPrefix(overlay: FrontierCodexResumeOverlay, jobId: string): string {
  const job = overlay.jobs.find((entry) => entry.jobId === jobId);
  if (!job) return '';
  return [
    '# Resume Context',
    '',
    `This job is resuming from ${overlay.sourceRunDir}.`,
    `Previous status: ${job.status}. Reason: ${job.reason}.`,
    job.lastMessagePath ? `Previous last message: ${job.lastMessagePath}.` : undefined,
    job.evidencePaths.length ? `Previous evidence paths:\n${job.evidencePaths.map((entry) => `- ${entry}`).join('\n')}` : undefined,
    '',
    'Use the prior evidence to continue the same shard. Do not repeat already-proven investigation unless required by stale evidence.',
    '',
    '---',
    ''
  ].filter(Boolean).join('\n');
}

function classifyResumeStatus(
  result: FrontierSwarmJobResult | undefined,
  paths: { evidence: string[] }
): FrontierCodexResumeJobStatus {
  if (result?.status === 'completed') return 'completed';
  if (result?.status === 'failed') return 'failed';
  if (result?.status === 'blocked') return 'blocked';
  return paths.evidence.length > 0 ? 'partial' : 'missing';
}

function shouldResumeStatus(status: FrontierCodexResumeJobStatus, options: FrontierCodexResumeOptions): boolean {
  if (status === 'completed') return options.includeCompleted === true;
  if (status === 'failed') return options.includeFailed !== false;
  if (status === 'blocked') return options.includeBlocked !== false;
  return true;
}

function resumeReason(status: FrontierCodexResumeJobStatus): string {
  if (status === 'completed') return 'completed in previous run';
  if (status === 'failed') return 'previous worker failed and may need continuation or rerun';
  if (status === 'blocked') return 'previous worker reported a blocker';
  if (status === 'partial') return 'partial evidence exists without a completed result';
  return 'no prior result was found';
}

function summarizeResumeJobs(jobs: readonly FrontierCodexResumeJob[]): FrontierCodexResumeOverlay['summary'] {
  const summary = { total: jobs.length, completed: 0, failed: 0, blocked: 0, partial: 0, missing: 0, resume: 0 };
  for (const job of jobs) {
    summary[job.status] += 1;
    if (job.shouldResume) summary.resume += 1;
  }
  return summary;
}

async function resolveRunDir(run: string): Promise<string> {
  const resolved = path.resolve(run);
  const stat = await fs.stat(resolved);
  return stat.isDirectory() ? resolved : path.dirname(resolved);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

async function readOptionalJson(file: string): Promise<Record<string, unknown> | undefined> {
  if (!await pathExists(file)) return undefined;
  const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
  return isObject(parsed) ? parsed : undefined;
}
