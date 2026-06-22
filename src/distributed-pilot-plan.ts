import fs from 'node:fs/promises';
import path from 'node:path';
import type { FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import { runProcess } from './common.js';
import { createCodexSwarmPlan } from './plan.js';
import type { FrontierCodexDistributedPilotOptions, PilotRepo } from './distributed-pilot-types.js';

export function createPilotPlan(runId: string): FrontierSwarmPlan {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'distributed-run-pilot',
      compute: [
        { id: 'fast', kind: 'codex', model: 'gpt-5.4-mini', reasoningEffort: 'medium', metadata: { modelTier: 'cheap' } },
        { id: 'deep', kind: 'codex', model: 'gpt-5.5', reasoningEffort: 'high', metadata: { modelTier: 'deep' } }
      ],
      lanes: [
        { id: 'distributed-runtime', allowedGlobs: ['packages/frontier-swarm-codex/**'] }
      ],
      policy: { defaultCompute: 'fast', defaultConcurrency: 1 }
    },
    tasks: {
      items: [{
        id: 'distributed-pilot-task',
        lane: 'distributed-runtime',
        surfaceKind: 'runtime',
        workKind: 'implementation',
        ownedFiles: ['packages/frontier-swarm-codex/src/distributed-pilot.ts'],
        acceptanceChecks: [
          { description: 'two repos exchange frontier-run events' },
          { description: 'queue, lease, gate, telemetry, and dashboard artifacts exist' }
        ]
      }]
    }
  });
  return { ...plan, runId };
}

export async function createPilotRepos(input: {
  cwd: string;
  outDir: string;
  runId: string;
  options: FrontierCodexDistributedPilotOptions;
}): Promise<[PilotRepo, PilotRepo]> {
  const requested = input.options.repos?.length ? [...input.options.repos] : [];
  const repoCount = Math.max(2, Math.floor(input.options.repoCount ?? requested.length ?? 2));
  const roots = Array.from({ length: repoCount }, (_, index) => path.resolve(
    input.cwd,
    requested[index] ?? path.join(input.outDir, `repo-${String.fromCharCode(97 + index)}`)
  ));
  const repos: PilotRepo[] = [];
  for (let index = 0; index < roots.length; index += 1) {
    const repoRoot = roots[index];
    await fs.mkdir(repoRoot, { recursive: true });
    await fs.writeFile(path.join(repoRoot, 'README.md'), `# Distributed pilot ${index + 1}\n\nRun: ${input.runId}\n`);
    if (input.options.initializeGit !== false) await ensureGitRepo(repoRoot);
    const runDir = path.join(repoRoot, '.frontier-run', input.runId.replace(/[^a-zA-Z0-9._-]+/g, '-'));
    await fs.mkdir(runDir, { recursive: true });
    repos.push({
      id: `repo-${String.fromCharCode(97 + index)}`,
      actorId: `pilot:${String.fromCharCode(97 + index)}`,
      repoRoot,
      runDir,
      runEventsPath: path.join(runDir, 'run-events.jsonl'),
      runDashboardPath: path.join(runDir, 'run-dashboard.json')
    });
  }
  return [repos[0], repos[1]];
}

export function slugTime(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'run';
}

async function ensureGitRepo(repoRoot: string): Promise<void> {
  await runProcess('git', ['init'], { cwd: repoRoot });
  await runProcess('git', ['config', 'user.email', 'frontier-distributed-pilot@example.invalid'], { cwd: repoRoot });
  await runProcess('git', ['config', 'user.name', 'Frontier Distributed Pilot'], { cwd: repoRoot });
  await runProcess('git', ['add', 'README.md'], { cwd: repoRoot });
  await runProcess('git', ['commit', '-m', 'Seed distributed pilot repo'], { cwd: repoRoot, allowFailure: true });
}
