import assert from 'node:assert';
import {
  createCodexResumeOverlay,
  fs,
  path,
  resumeCodexSwarmRun
} from './context.mjs';

export async function testResumeRun({ plan, tmp }) {
  const priorRun = path.join(tmp, 'prior-run');
  const job = plan.jobs[0];
  const lastMessage = path.join(priorRun, job.id, 'last-message.md');
  await fs.mkdir(path.dirname(lastMessage), { recursive: true });
  await fs.writeFile(path.join(priorRun, 'swarm-plan.json'), JSON.stringify(plan, null, 2) + '\n');
  await fs.writeFile(lastMessage, 'partial evidence from stopped worker\n');

  const overlay = await createCodexResumeOverlay({ run: priorRun });
  assert.strictEqual(overlay.jobs[0].status, 'rerun-needed');
  assert.strictEqual(overlay.summary.rerunNeeded, 1);
  assert.strictEqual(overlay.summary.resume, 1);
  assert.deepStrictEqual(overlay.resumeJobIds, [job.id]);
  assert.ok(overlay.jobs[0].lastMessagePath.endsWith('last-message.md'));

  let sawResumePrompt = false;
  const result = await resumeCodexSwarmRun({
    run: priorRun,
    outDir: path.join(tmp, 'resume-run'),
    cwd: tmp,
    dryRun: false,
    executor: async (input) => {
      sawResumePrompt = input.prompt.includes('Resume Context') && input.prompt.includes(lastMessage);
      await fs.writeFile(input.paths.lastMessagePath, 'resumed\n');
      return { exitCode: 0, changedPaths: [], lastMessage: 'resumed' };
    }
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(sawResumePrompt, true);
  assert.strictEqual(result.resumeOverlay.summary.resume, 1);
  assert.ok(result.resumeOverlayPath.endsWith('resume-overlay.json'));

  await testResumePartialEvidenceClassification({ plan, tmp });
}

async function testResumePartialEvidenceClassification({ plan, tmp }) {
  const priorRun = path.join(tmp, 'prior-run-classified');
  const states = ['completed', 'failed', 'blocked', 'evidence-only', 'rerun-needed'];
  const jobs = states.map((state) => cloneJob(plan.jobs[0], state));
  const classifiedPlan = {
    ...plan,
    jobs,
    graph: emptyJobGraph(jobs),
    summary: { ...plan.summary, jobCount: jobs.length }
  };
  await fs.mkdir(priorRun, { recursive: true });
  await fs.writeFile(path.join(priorRun, 'swarm-plan.json'), JSON.stringify(classifiedPlan, null, 2) + '\n');

  await writeJobEvidence(priorRun, jobs[0], 'merge.json', {
    kind: 'frontier.swarm.merge-bundle',
    version: 1,
    jobId: jobs[0].id,
    status: 'completed',
    mergeReadiness: 'verified-patch',
    disposition: 'auto-mergeable',
    changedPaths: ['src/runtime/action.ts'],
    ownershipViolations: [],
    commandsFailed: [],
    evidencePaths: []
  });
  await writeJobEvidence(priorRun, jobs[1], 'evidence.json', {
    kind: 'frontier.swarm-codex.job-evidence',
    version: 1,
    jobId: jobs[1].id,
    status: 'failed',
    mergeReadiness: 'rejected',
    disposition: 'rejected',
    changedPaths: [],
    ownershipViolations: [],
    commands: { passed: [], failed: [{ name: 'smoke', command: ['npm', 'test'], status: 1 }] },
    evidencePaths: []
  });
  await fs.mkdir(path.join(priorRun, jobs[2].id), { recursive: true });
  await fs.writeFile(path.join(priorRun, jobs[2].id, 'last-message.md'), 'Blocked on missing fixture; cannot proceed.\n');
  await writeJobEvidence(priorRun, jobs[3], 'patch-intent.json', {
    kind: 'frontier.swarm-codex.patch-intent',
    version: 1,
    jobId: jobs[3].id,
    mergeReadiness: 'patch-candidate',
    disposition: 'needs-port',
    safeToPortManually: true,
    changedPaths: ['src/runtime/action.ts'],
    verification: [],
    evidencePaths: []
  });
  await writeJobEvidence(priorRun, jobs[4], 'log-summary.json', {
    eventsPath: 'events.jsonl',
    stderrPath: 'stderr.log',
    eventBytes: 128,
    stderrBytes: 0,
    eventBytesWritten: 128,
    stderrBytesWritten: 0,
    eventBytesTruncated: 0,
    stderrBytesTruncated: 0
  });

  const overlay = await createCodexResumeOverlay({ run: priorRun });
  const byId = Object.fromEntries(overlay.jobs.map((entry) => [entry.jobId, entry]));
  assert.strictEqual(byId[jobs[0].id].status, 'completed');
  assert.strictEqual(byId[jobs[1].id].status, 'failed');
  assert.strictEqual(byId[jobs[2].id].status, 'blocked');
  assert.strictEqual(byId[jobs[3].id].status, 'evidence-only');
  assert.strictEqual(byId[jobs[4].id].status, 'rerun-needed');
  assert.strictEqual(overlay.summary.completed, 1);
  assert.strictEqual(overlay.summary.failed, 1);
  assert.strictEqual(overlay.summary.blocked, 1);
  assert.strictEqual(overlay.summary.evidenceOnly, 1);
  assert.strictEqual(overlay.summary.rerunNeeded, 1);
  assert.deepStrictEqual(overlay.resumeJobIds.sort(), [jobs[1].id, jobs[2].id, jobs[4].id].sort());
}

function cloneJob(job, state) {
  return {
    ...job,
    id: `${job.id}-${state}`,
    taskId: `${job.taskId}-${state}`,
    title: `${job.title} ${state}`,
    task: { ...job.task, id: `${job.task.id}-${state}`, title: `${job.task.title} ${state}` }
  };
}

function emptyJobGraph(jobs) {
  const nodes = jobs.map((job) => job.id);
  return {
    nodes,
    edges: [],
    roots: nodes,
    leaves: nodes,
    dependentsByJobId: Object.fromEntries(nodes.map((node) => [node, []])),
    dependenciesByJobId: Object.fromEntries(nodes.map((node) => [node, []])),
    issues: []
  };
}

async function writeJobEvidence(runDir, job, name, value) {
  const evidenceDir = path.join(runDir, job.id, 'evidence');
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + '\n');
}
