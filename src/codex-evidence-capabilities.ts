import type { FrontierSwarmJob } from '@shapeshift-labs/frontier-swarm';
import { uniqueStrings } from './common.js';

export type FrontierCodexEvidenceCapability = 'browser' | 'static-check' | 'api-check' | 'fuzzer';

export interface FrontierCodexEvidenceResourceHints {
  capabilities: string[];
  resources: Record<string, number>;
  profiles: FrontierCodexEvidenceCapability[];
}

const CODEX_EVIDENCE_CAPABILITIES: readonly FrontierCodexEvidenceCapability[] = ['browser', 'static-check', 'api-check', 'fuzzer'];

const CODEX_EVIDENCE_RESOURCE_BY_CAPABILITY: Record<FrontierCodexEvidenceCapability, string> = {
  browser: 'browser',
  'static-check': 'static-check',
  'api-check': 'api-check',
  fuzzer: 'fuzzer'
};

export function createCodexEvidenceResourceHints(job: FrontierSwarmJob): FrontierCodexEvidenceResourceHints {
  const requirements = job.resourceRequirements;
  const resources = { ...(requirements?.resources ?? {}) };
  const explicitCapabilities = uniqueStrings([...(job.capabilities ?? []), ...(requirements?.capabilities ?? [])]);
  const probes = uniqueStrings([...explicitCapabilities, job.lane, ...Object.keys(resources)]);
  const profiles: FrontierCodexEvidenceCapability[] = [];
  for (const capability of CODEX_EVIDENCE_CAPABILITIES) {
    if (
      (capability === 'browser' && requirements?.browser?.required) ||
      probes.some((value) => matchesEvidenceCapability(value, capability))
    ) {
      profiles.push(capability);
    }
  }
  for (const profile of profiles) {
    const resource = CODEX_EVIDENCE_RESOURCE_BY_CAPABILITY[profile];
    if (resources[resource] === undefined) resources[resource] = 1;
  }
  return {
    capabilities: uniqueStrings([...explicitCapabilities, ...profiles]),
    resources,
    profiles
  };
}

function matchesEvidenceCapability(value: string, capability: FrontierCodexEvidenceCapability): boolean {
  const normalized = normalizeCapabilityToken(value);
  if (!normalized) return false;
  if (capability === 'browser') {
    return normalized === 'browser' ||
      normalized.startsWith('browser-') ||
      normalized.includes('-browser-') ||
      normalized === 'playwright' ||
      normalized.startsWith('playwright-');
  }
  if (capability === 'static-check') {
    return normalized === 'static-check' ||
      normalized.startsWith('static-check-') ||
      normalized === 'static' ||
      normalized === 'typecheck' ||
      normalized === 'type-check' ||
      normalized === 'lint' ||
      normalized.endsWith('-lint');
  }
  if (capability === 'api-check') {
    return normalized === 'api-check' ||
      normalized.startsWith('api-check-') ||
      normalized === 'api' ||
      normalized.startsWith('api-');
  }
  return normalized === 'fuzzer' ||
    normalized.startsWith('fuzzer-') ||
    normalized === 'fuzz' ||
    normalized.startsWith('fuzz-') ||
    normalized.includes('-fuzzer-') ||
    normalized.includes('-fuzz-');
}

function normalizeCapabilityToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
