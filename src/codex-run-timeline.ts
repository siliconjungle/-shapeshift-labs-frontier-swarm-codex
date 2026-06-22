import { createRunEventsFromMergeBundle, createRunEventsFromSwarmResult, type FrontierSwarmJob, type FrontierSwarmJobResultInput, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { appendCodexRunEvents, resolveCodexRunEventsPath } from './run-events.js';
import type { FrontierCodexSwarmRunOptions } from './index.js';

export async function appendCodexJobResultTimelineEvents(input: {
  options: FrontierCodexSwarmRunOptions;
  outDir: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
}): Promise<void> {
  await appendCodexRunEvents(resolveCodexRunEventsPath({
    cwd: input.options.cwd,
    outDir: input.outDir,
    runEventsPath: input.options.runEventsPath
  }), [
    ...createRunEventsFromSwarmResult(input.result, {
      runId: input.options.eventStream?.runId,
      actorId: 'frontier-swarm-codex-worker',
      time: new Date(input.result.finishedAt ?? Date.now()).toISOString(),
      job: input.job
    }),
    ...createRunEventsFromMergeBundle(input.mergeBundle, {
      runId: input.options.eventStream?.runId,
      actorId: 'frontier-swarm-codex-collector',
      time: new Date(input.mergeBundle.generatedAt ?? input.result.finishedAt ?? Date.now()).toISOString()
    })
  ]);
}
