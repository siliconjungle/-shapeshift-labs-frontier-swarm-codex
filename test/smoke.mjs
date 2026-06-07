import { createSmokeContext } from './smoke/context.mjs';
import { testApplyAndScore } from './smoke/apply-score.mjs';
import { testCliAndPidManifest } from './smoke/cli-pids.mjs';
import { testCompactLogTruncation } from './smoke/compact-logs.mjs';
import { testHooksAndWorkspaces } from './smoke/hooks-and-workspaces.mjs';
import { testDependencyHealth } from './smoke/dependency-health.mjs';
import { testPlanningAndLinks } from './smoke/planning-and-links.mjs';
import { testResumeRun } from './smoke/resume.mjs';
import { testSemanticImportSelection } from './smoke/semantic-import-selection.mjs';
import { testSemanticImportQuality } from './smoke/semantic-import-quality.mjs';
import { testSwarmRunCollection } from './smoke/swarm-run-collection.mjs';

const context = await createSmokeContext();

await testPlanningAndLinks(context);
await testCompactLogTruncation(context);
await testSemanticImportSelection(context);
const { mergeBundle } = await testSwarmRunCollection(context);
await testSemanticImportQuality(context, mergeBundle);
await testApplyAndScore(context, mergeBundle);
await testHooksAndWorkspaces(context);
await testDependencyHealth(context);
await testResumeRun(context);
await testCliAndPidManifest(context);
