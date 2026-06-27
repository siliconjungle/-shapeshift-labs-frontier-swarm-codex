import {
  createSwarmBacklog,
  type FrontierSwarmBacklog,
  type FrontierSwarmTaskInput
} from '@shapeshift-labs/frontier-swarm';
import { slug, stableHash, uniqueStrings } from './common.js';
import type { FrontierCodexCollectResult } from './types-collection.js';
import type { FrontierCodexPlaywrightProofParentAdmissionRecord } from './proof-parent-admission.js';

export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_FILE = 'proof-parent-recheck-backlog.json';
export const FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE = 'recheck-parent-after-playwright-proof-admission';

export interface FrontierCodexProofParentRecheckTaskInput {
  readonly collection?: FrontierCodexCollectResult;
  readonly packageName?: string;
  readonly lane?: string;
  readonly compute?: string;
  readonly taskIdPrefix?: string;
}

export function createCodexProofParentRecheckTasks(
  input: FrontierCodexProofParentRecheckTaskInput
): FrontierSwarmTaskInput[] {
  return readyParentAdmissions(input.collection)
    .map((record) => proofParentRecheckRecordToTask(record, input));
}

export function createCodexProofParentRecheckBacklog(
  input: FrontierCodexProofParentRecheckTaskInput
): FrontierSwarmBacklog {
  const tasks = createCodexProofParentRecheckTasks(input);
  return createSwarmBacklog({
    id: `codex-proof-parent-recheck-backlog:${stableHash(tasks.map((task) => task.id))}`,
    title: 'Codex proof parent recheck backlog',
    package: input.packageName,
    tasks,
    metadata: {
      source: 'frontier-swarm-codex',
      routeNext: FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE,
      requestCount: tasks.length,
      generatedFrom: 'proof-parent-admission'
    }
  });
}

function proofParentRecheckRecordToTask(
  record: FrontierCodexPlaywrightProofParentAdmissionRecord,
  input: FrontierCodexProofParentRecheckTaskInput
): FrontierSwarmTaskInput {
  const sourceJobSlug = slug(record.sourceJobId ?? record.proofJobId);
  const hash = stableHash([
    record.id,
    record.sourceJobId,
    record.resolvedSourceMergePath,
    record.sourceBundleChangedPaths
  ]).replace(/^fnv1a32:/, '').slice(0, 10);
  return {
    id: `${input.taskIdPrefix ?? 'proof-parent-recheck-'}${sourceJobSlug}-${hash}`,
    title: `Recheck parent merge admission for ${record.sourceJobId ?? record.proofJobId}`,
    objective: 'Re-read the source parent merge bundle after admitted Playwright proof readmission and produce a fresh coordinator recheck result without applying changes.',
    kind: 'coordinator-parent-recheck',
    lane: input.lane ?? 'coordinator',
    ...(input.compute ? { compute: input.compute } : {}),
    ...(record.sourceTaskId ? { parentTaskId: record.sourceTaskId } : {}),
    priority: 86,
    sourceRefs: uniqueStrings(record.sourceBundleChangedPaths),
    targetRefs: uniqueStrings([
      record.resolvedSourceMergePath,
      record.sourceMergePath,
      record.artifactPath
    ].filter((entry): entry is string => !!entry)),
    allowedWrites: ['agent-runs/**'],
    capabilities: [
      'frontier-swarm.collect',
      'frontier-swarm.apply-check',
      'semantic-merge.parent-recheck'
    ],
    acceptance: [
      'Read metadata.proofParentAdmission and the source parent merge bundle before making a decision.',
      'Re-check the parent patch against current head; stale, missing, or conflicting patches must remain blocked or rerun work.',
      'Treat the admitted Playwright proof as evidence that the browser-proof route was satisfied, not as permission to apply.',
      'Write a fresh merge bundle or evidence record under agent-runs/** with the recheck outcome; do not modify source files or commit.'
    ],
    verification: [],
    tags: [
      'semantic-proof-parent-recheck',
      'html-css-browser-runtime-proof',
      FRONTIER_CODEX_PLAYWRIGHT_PROOF_PARENT_RECHECK_ROUTE,
      record.language
    ],
    metadata: {
      source: 'frontier-swarm-codex.proof-parent-recheck-tasks',
      proofParentAdmission: {
        id: record.id,
        status: record.status,
        action: record.action,
        proofJobId: record.proofJobId,
        proofReadmissionStatus: record.proofReadmissionStatus,
        ...(record.sourceJobId ? { sourceJobId: record.sourceJobId } : {}),
        ...(record.sourceTaskId ? { sourceTaskId: record.sourceTaskId } : {}),
        ...(record.sourceMergePath ? { sourceMergePath: record.sourceMergePath } : {}),
        ...(record.resolvedSourceMergePath ? { resolvedSourceMergePath: record.resolvedSourceMergePath } : {}),
        sourceBundleChangedPaths: [...record.sourceBundleChangedPaths],
        reasonCodes: [...record.reasonCodes]
      }
    }
  };
}

function readyParentAdmissions(
  collection: FrontierCodexCollectResult | undefined
): FrontierCodexPlaywrightProofParentAdmissionRecord[] {
  return [...(collection?.proofParentAdmission?.records ?? [])]
    .filter((record) => record.status === 'ready-for-parent-recheck')
    .sort((left, right) => left.id.localeCompare(right.id));
}
