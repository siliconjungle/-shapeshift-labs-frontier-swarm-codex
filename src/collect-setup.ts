import type { FrontierCodexCollectBucket, FrontierCodexCollectedBundle } from './index.js';

export const COLLECTED_OUTPUT_SEGMENTS = [
  'collected',
  'patch-scores',
  'ready-to-apply',
  'research-complete',
  'needs-human-port',
  'rerun-work',
  'failed-evidence',
  'stale-against-head',
  'generated-by-collector'
];

export function createEmptyCollectBuckets(): Record<FrontierCodexCollectBucket, FrontierCodexCollectedBundle[]> {
  return {
    'ready-to-apply': [],
    'research-complete': [],
    'needs-human-port': [],
    'rerun-work': [],
    'failed-evidence': [],
    'stale-against-head': []
  };
}
