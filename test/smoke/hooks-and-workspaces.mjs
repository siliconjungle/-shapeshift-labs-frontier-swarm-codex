import assert from 'node:assert';
import { createCodexSwarmPlan, fs, manifestInput, path, tasksInput } from './context.mjs';
import {
  testGeneratedWorkspaceRefresh,
  testHooks,
  testOrderedDependencies,
  testWorkspaceCopy
} from './hooks-workspaces-basic.mjs';
import {
  testChangedPathDiscovery,
  testReportedWorkspaceNoiseFiltering
} from './hooks-workspaces-changes.mjs';
import {
  testDeferredCodexFailure,
  testStrictAllowedWritePolicy
} from './hooks-workspaces-strict.mjs';

export async function testHooksAndWorkspaces({ plan, tmp }) {
  await testHooks(plan, tmp);
  await testOrderedDependencies(tmp);
  await testWorkspaceCopy(plan, tmp);
  await testGeneratedWorkspaceRefresh(plan, tmp);
  await testChangedPathDiscovery(plan, tmp);
  await testReportedWorkspaceNoiseFiltering(plan, tmp);
  await testStrictAllowedWritePolicy(plan, tmp);
  await testDeferredCodexFailure(plan, tmp);

  const writtenPlan = createCodexSwarmPlan({ manifest: manifestInput, tasks: tasksInput, plan: { limit: 1 } });
  await fs.writeFile(path.join(tmp, 'swarm-plan.json'), JSON.stringify(writtenPlan, null, 2) + '\n');
  assert.strictEqual(JSON.parse(await fs.readFile(path.join(tmp, 'swarm-plan.json'), 'utf8')).jobs.length, 1);
}
