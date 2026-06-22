import path from 'node:path';
import { createSwarmGateRecord } from '@shapeshift-labs/frontier-swarm';
import { recordTestGateExecution, summarizeTestGateExecutions } from '@shapeshift-labs/frontier-test';
import { writeJsonAtomic } from './common.js';
import {
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_EXECUTIONS_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_SUMMARY_FILE,
  FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND,
  type PilotGateArtifacts,
  type PilotRepo
} from './distributed-pilot-types.js';

export async function writePilotGateArtifacts(
  repo: PilotRepo,
  generatedAt: string
): Promise<PilotGateArtifacts> {
  const startedAt = Date.parse(generatedAt);
  const gateExecutionsPath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_EXECUTIONS_FILE);
  const gateSummaryPath = path.join(repo.runDir, FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_GATE_SUMMARY_FILE);
  const gateExecution = recordTestGateExecution({
    id: 'distributed-pilot-smoke',
    kind: 'smoke',
    status: 'passed',
    required: true,
    startedAt,
    finishedAt: startedAt + 1,
    command: ['node', 'test/smoke/distributed-pilot.mjs'],
    cwd: repo.repoRoot,
    exitCode: 0,
    artifacts: [gateSummaryPath],
    package: '@shapeshift-labs/frontier-swarm-codex',
    message: 'distributed pilot smoke evidence generated',
    metadata: { source: FRONTIER_SWARM_CODEX_DISTRIBUTED_PILOT_KIND }
  });
  const gateSummary = summarizeTestGateExecutions({
    executions: [gateExecution],
    packageScope: ['@shapeshift-labs/frontier-swarm-codex'],
    artifacts: [gateExecutionsPath, gateSummaryPath]
  });
  const swarmGate = createSwarmGateRecord({
    id: 'distributed-pilot-smoke',
    type: 'smoke',
    status: 'passed',
    required: true,
    command: 'node test/smoke/distributed-pilot.mjs',
    path: gateSummaryPath,
    jobId: 'distributed-pilot-job',
    taskId: 'distributed-pilot-task',
    startedAt,
    finishedAt: startedAt + 1,
    metadata: { testGateExecutionId: gateExecution.id }
  });
  await writeJsonAtomic(gateExecutionsPath, { executions: [gateExecution], swarmGates: [swarmGate] });
  await writeJsonAtomic(gateSummaryPath, gateSummary);
  return { gateExecutionsPath, gateSummaryPath, gateExecution, gateSummary: gateSummary as unknown as PilotGateArtifacts['gateSummary'] };
}
