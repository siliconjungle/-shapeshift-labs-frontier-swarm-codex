import assert from 'node:assert';
import { createSmokeContext } from './smoke/context.mjs';
import {
  createCodexSwarmPlan,
  fs,
  path,
  runCodexSwarm
} from './smoke/context.mjs';
import { testApplyAndScore } from './smoke/apply-score.mjs';
import { testCliAndPidManifest } from './smoke/cli-pids.mjs';
import { testCompactLogTruncation } from './smoke/compact-logs.mjs';
import { testHooksAndWorkspaces } from './smoke/hooks-and-workspaces.mjs';
import { testDependencyHealth } from './smoke/dependency-health.mjs';
import { testPlanningAndLinks } from './smoke/planning-and-links.mjs';
import { testResumeRun } from './smoke/resume.mjs';
import { testSemanticImportSelection } from './smoke/semantic-import-selection.mjs';
import { testSemanticImportBaseLineage } from './smoke/semantic-import-base-lineage.mjs';
import { testSemanticImportQuality } from './smoke/semantic-import-quality.mjs';
import { testSemanticLineageCollection } from './smoke/semantic-lineage-collection.mjs';
import { testSwarmRunCollection } from './smoke/swarm-run-collection.mjs';
import { testTournamentCli } from './smoke/tournament-cli.mjs';

const context = await createSmokeContext();

await testPlanningAndLinks(context);
await testResourceAwareScheduling(context);
await testCompactLogTruncation(context);
await testSemanticImportSelection(context);
await testSemanticImportBaseLineage(context);
const { mergeBundle } = await testSwarmRunCollection(context);
await testTournamentCli(context);
await testSemanticImportQuality(context, mergeBundle);
await testSemanticLineageCollection(context, mergeBundle);
await testApplyAndScore(context, mergeBundle);
await testHooksAndWorkspaces(context);
await testDependencyHealth(context);
await testResumeRun(context);
await testCliAndPidManifest(context);

async function testResourceAwareScheduling({ tmp }) {
  const plan = createCodexSwarmPlan({
    manifest: {
      id: 'evidence-resource-lanes',
      policy: { defaultConcurrency: 1 },
      lanes: [
        { id: 'static-check', capabilities: ['static-check'], allowedGlobs: ['checks/**'] },
        {
          id: 'browser',
          capabilities: ['browser.playwright'],
          allowedGlobs: ['browser/**'],
          resourceRequirements: {
            resources: { browser: 1 },
            browser: {
              required: true,
              maxConcurrency: 1,
              profileDirPrefix: 'agent-runs/browser-profiles',
              headless: true
            }
          }
        },
        { id: 'api-check', capabilities: ['api-check'], allowedGlobs: ['api/**'] },
        { id: 'fuzzer', capabilities: ['fuzzer'], allowedGlobs: ['fuzz/**'] }
      ]
    },
    tasks: {
      items: [
        ...Array.from({ length: 3 }, (_, index) => ({
          id: `static-${index}`,
          lane: 'static-check',
          priority: index + 1,
          ownedFiles: [`checks/static-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `browser-${index}`,
          lane: 'browser',
          priority: 10 + index,
          ownedFiles: [`browser/browser-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `api-${index}`,
          lane: 'api-check',
          priority: 20 + index,
          ownedFiles: [`api/api-${index}.txt`]
        })),
        ...Array.from({ length: 2 }, (_, index) => ({
          id: `fuzz-${index}`,
          lane: 'fuzzer',
          priority: 30 + index,
          ownedFiles: [`fuzz/fuzz-${index}.txt`]
        }))
      ]
    }
  });
  const running = { total: 0, staticCheck: 0, browser: 0, apiCheck: 0, fuzzer: 0 };
  const peak = { total: 0, staticCheck: 0, browser: 0, apiCheck: 0, fuzzer: 0 };
  const laneKey = (lane) => lane === 'static-check'
    ? 'staticCheck'
    : lane === 'api-check'
      ? 'apiCheck'
      : lane;
  const run = await runCodexSwarm(plan, {
    outDir: path.join(tmp, 'resource-scheduler-run'),
    cwd: tmp,
    maxConcurrency: 4,
    dependencyHealth: false,
    executor: async (input) => {
      const key = laneKey(input.job.lane);
      const canonicalCapability = input.job.lane;
      assert.ok(input.resourceAllocation.capabilities.includes(canonicalCapability));
      assert.ok(input.env.FRONTIER_SWARM_CAPABILITIES.split(',').includes(canonicalCapability));
      const allocation = JSON.parse(input.env.FRONTIER_SWARM_RESOURCE_ALLOCATION);
      assert.strictEqual(allocation.resources[canonicalCapability === 'browser' ? 'browser' : canonicalCapability], 1);
      running.total += 1;
      running[key] += 1;
      peak.total = Math.max(peak.total, running.total);
      peak[key] = Math.max(peak[key], running[key]);
      await new Promise((resolve) => setTimeout(resolve, 30));
      running.total -= 1;
      running[key] -= 1;
      await fs.writeFile(input.paths.lastMessagePath, `${input.job.id} done\n`);
      return { exitCode: 0, changedPaths: [], lastMessage: `${input.job.id} done` };
    }
  });
  assert.strictEqual(run.ok, true);
  assert.ok(peak.staticCheck >= 3, `expected static checks to run wide, saw ${peak.staticCheck}`);
  assert.strictEqual(peak.browser, 1);
  assert.strictEqual(peak.apiCheck, 1);
  assert.strictEqual(peak.fuzzer, 1);
  assert.ok(peak.total > peak.browser);
}
