import { createRunEventsFromSwarmResult, type FrontierSwarmJob, type FrontierSwarmJobResultInput, type FrontierSwarmMergeBundle } from '@shapeshift-labs/frontier-swarm';
import { appendCodexLiveRunGraphEvent, createCodexLiveJobResultEvents, resolveCodexLiveRunGraphEventsPath } from './run-graph-live.js';
import { appendCodexRunEvents, resolveCodexRunEventsPath } from './run-events.js';
import type { FrontierCodexSwarmRunOptions } from './index.js';

export async function appendCodexJobResultTimelineEvents(input: {
  options: FrontierCodexSwarmRunOptions;
  outDir: string;
  job: FrontierSwarmJob;
  result: FrontierSwarmJobResultInput;
  mergeBundle: FrontierSwarmMergeBundle;
}): Promise<void> {
  const liveRunGraphEventsPath = resolveCodexLiveRunGraphEventsPath({
    cwd: input.options.cwd,
    outDir: input.outDir,
    liveRunGraphEventsPath: input.options.liveRunGraphEventsPath
  });
  for (const event of createCodexLiveJobResultEvents({
    runId: input.options.eventStream?.runId,
    outDir: input.outDir,
    job: input.job,
    result: input.result,
    mergeBundle: input.mergeBundle,
    generatedAt: input.result.finishedAt
  })) {
    await appendCodexLiveRunGraphEvent(liveRunGraphEventsPath, event);
  }
  await appendCodexRunEvents(resolveCodexRunEventsPath({
    cwd: input.options.cwd,
    outDir: input.outDir,
    runEventsPath: input.options.runEventsPath
  }), createRunEventsFromSwarmResult(input.result, {
    runId: input.options.eventStream?.runId,
    actorId: 'frontier-swarm-codex-worker',
    time: new Date(input.result.finishedAt ?? Date.now()).toISOString(),
    job: input.job
  }));
}
