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
  assert.strictEqual(overlay.summary.partial, 1);
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
}
