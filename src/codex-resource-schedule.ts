import type { FrontierSwarmJob, FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import {
  createCodexEvidenceResourceHints,
  type FrontierCodexEvidenceCapability
} from './codex-evidence-capabilities.js';
import type { FrontierCodexResourceSchedulingOptions } from './index.js';

export type CodexResourceScheduleLimits = {
  maxLaneConcurrency?: Record<string, number>;
  resourceQuotas?: Record<string, number>;
};

type NormalizedCodexResourceSchedulingOptions = {
  enabled: boolean;
  browserConcurrency?: number;
  staticCheckConcurrency?: number;
  apiCheckConcurrency?: number;
  fuzzerConcurrency?: number;
  laneConcurrency: Record<string, number>;
  capabilityConcurrency: Record<string, number>;
  resourceQuotas: Record<string, number>;
};

export function createCodexResourceScheduledPlan(
  plan: FrontierSwarmPlan,
  concurrency: number,
  input: boolean | FrontierCodexResourceSchedulingOptions | undefined
): { plan: FrontierSwarmPlan; limits: CodexResourceScheduleLimits } {
  const options = normalizeResourceSchedulingOptions(input);
  if (!options.enabled) return { plan, limits: {} };
  const jobs = plan.jobs.map(createCodexResourceScheduledJob);
  const limits = createCodexResourceScheduleLimits(plan, jobs, concurrency, options);
  return { plan: { ...plan, jobs }, limits };
}

function createCodexResourceScheduledJob(job: FrontierSwarmJob): FrontierSwarmJob {
  const hints = createCodexEvidenceResourceHints(job);
  if (
    hints.capabilities.length === job.capabilities.length &&
    hints.capabilities.every((capability, index) => capability === job.capabilities[index]) &&
    resourcesEqual(hints.resources, job.resourceRequirements?.resources ?? {})
  ) {
    return job;
  }
  return {
    ...job,
    capabilities: hints.capabilities,
    resourceRequirements: {
      ...(job.resourceRequirements ?? { capabilities: [], resources: {} }),
      capabilities: hints.capabilities,
      resources: hints.resources
    }
  };
}

function createCodexResourceScheduleLimits(
  plan: FrontierSwarmPlan,
  jobs: readonly FrontierSwarmJob[],
  concurrency: number,
  options: NormalizedCodexResourceSchedulingOptions
): CodexResourceScheduleLimits {
  const maxLaneConcurrency: Record<string, number> = {};
  const resourceQuotas: Record<string, number> = {};
  for (const job of jobs) {
    const hints = createCodexEvidenceResourceHints(job);
    if (hints.profiles.length > 0) {
      maxLaneConcurrency[job.lane] = Math.max(maxLaneConcurrency[job.lane] ?? 0, concurrency);
    }
    for (const [resource, amount] of Object.entries(hints.resources)) {
      if (plan.limits.resourceQuotas[resource] !== undefined && options.resourceQuotas[resource] === undefined) continue;
      const quota = codexResourceQuota(resource, amount, hints.profiles, job, concurrency, options);
      if (quota !== undefined) resourceQuotas[resource] = Math.max(resourceQuotas[resource] ?? 0, quota);
    }
  }
  for (const [lane, limit] of Object.entries(options.laneConcurrency)) {
    maxLaneConcurrency[lane] = limit;
  }
  for (const [resource, quota] of Object.entries(options.resourceQuotas)) {
    resourceQuotas[resource] = quota;
  }
  return {
    ...(Object.keys(maxLaneConcurrency).length ? { maxLaneConcurrency } : {}),
    ...(Object.keys(resourceQuotas).length ? { resourceQuotas } : {})
  };
}

function normalizeResourceSchedulingOptions(
  input: boolean | FrontierCodexResourceSchedulingOptions | undefined
): NormalizedCodexResourceSchedulingOptions {
  if (input === false) {
    return {
      enabled: false,
      laneConcurrency: {},
      capabilityConcurrency: {},
      resourceQuotas: {}
    };
  }
  const options = input === true || input === undefined ? {} : input;
  return {
    enabled: options.enabled ?? true,
    browserConcurrency: positiveInteger(options.browserConcurrency),
    staticCheckConcurrency: positiveInteger(options.staticCheckConcurrency),
    apiCheckConcurrency: positiveInteger(options.apiCheckConcurrency),
    fuzzerConcurrency: positiveInteger(options.fuzzerConcurrency),
    laneConcurrency: normalizeIntegerRecord(options.laneConcurrency ?? {}),
    capabilityConcurrency: normalizeIntegerRecord(options.capabilityConcurrency ?? {}, normalizeResourceToken),
    resourceQuotas: normalizeIntegerRecord(options.resourceQuotas ?? {})
  };
}

function codexResourceQuota(
  resource: string,
  amount: number,
  profiles: readonly FrontierCodexEvidenceCapability[],
  job: FrontierSwarmJob,
  concurrency: number,
  options: NormalizedCodexResourceSchedulingOptions
): number | undefined {
  const profile = profileForResource(resource, profiles);
  const perJobAmount = Math.max(1, Math.ceil(amount));
  if (!profile) return Math.max(perJobAmount, concurrency);
  const configured = options.capabilityConcurrency[profile];
  if (configured !== undefined) return Math.max(perJobAmount, configured);
  if (profile === 'browser') {
    return Math.max(perJobAmount, options.browserConcurrency ?? job.resourceRequirements?.browser?.maxConcurrency ?? 1);
  }
  if (profile === 'static-check') return Math.max(perJobAmount, options.staticCheckConcurrency ?? concurrency);
  if (profile === 'api-check') return Math.max(perJobAmount, options.apiCheckConcurrency ?? 1);
  return Math.max(perJobAmount, options.fuzzerConcurrency ?? 1);
}

function profileForResource(
  resource: string,
  profiles: readonly FrontierCodexEvidenceCapability[]
): FrontierCodexEvidenceCapability | undefined {
  const normalized = normalizeResourceToken(resource);
  if (normalized === 'browser' || normalized === 'browser-port') return profiles.includes('browser') ? 'browser' : undefined;
  if (normalized === 'static-check') return profiles.includes('static-check') ? 'static-check' : undefined;
  if (normalized === 'api-check') return profiles.includes('api-check') ? 'api-check' : undefined;
  if (normalized === 'fuzzer' || normalized === 'fuzz') return profiles.includes('fuzzer') ? 'fuzzer' : undefined;
  return undefined;
}

function normalizeIntegerRecord(input: Record<string, number>, normalizeKey?: (key: string) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = normalizeKey ? normalizeKey(rawKey) : rawKey;
    const value = positiveInteger(rawValue);
    if (key && value !== undefined) out[key] = value;
  }
  return out;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.max(1, Math.floor(value));
}

function normalizeResourceToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function resourcesEqual(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}
