import assert from 'node:assert';
import { continueCodexSwarmLoop, execFileP, fs, path } from './context.mjs';

export async function testContinuationTaskSource({ tmp }, collectionDir) {
  const closedCollectionDir = path.join(tmp, 'task-source-closed-collection');
  await fs.mkdir(closedCollectionDir, { recursive: true });
  const collection = await readJson(path.join(collectionDir, 'collection.json'));
  collection.outDir = collection.runDir = closedCollectionDir;
  for (const decision of collection.queueOutcomeModel.decisions) {
    Object.assign(decision, { decision: 'checked', category: 'terminal', outcome: 'checked', terminal: true, closesSubject: true, coordinatorReview: false, reviewDebt: false });
  }
  await fs.writeFile(path.join(closedCollectionDir, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');

  const tasks = { items: [
    { id: 'runtime-action', lane: 'runtime', targetRefs: ['src/runtime/action.ts'] },
    { id: 'runtime-extra', lane: 'runtime', targetRefs: ['src/runtime/extra.ts'] }
  ] };
  const continuation = await continueCodexSwarmLoop({
    collection: closedCollectionDir,
    outDir: path.join(tmp, 'task-source-continuation'),
    tasks
  });
  assert.strictEqual(path.basename(continuation.nextTasksPath), 'tasks.next.json');
  const nextTasks = await readJson(continuation.nextTasksPath);
  assert.deepStrictEqual(nextTasks.items.map((task) => task.id), ['runtime-extra']);

  const cli = new URL('../../dist/cli.js', import.meta.url).pathname;
  const tasksPath = path.join(tmp, 'task-source-write.json');
  await fs.writeFile(tasksPath, JSON.stringify(tasks, null, 2) + '\n');
  const cliResult = await execFileP(process.execPath, [
    cli,
    'continue',
    '--collection',
    closedCollectionDir,
    '--tasks',
    tasksPath,
    '--outDir',
    path.join(tmp, 'task-source-write-continuation'),
    '--write'
  ], { cwd: tmp });
  const parsed = JSON.parse(cliResult.stdout);
  assert.strictEqual(parsed.nextTasksPath, tasksPath);
  const writtenTasks = await readJson(tasksPath);
  assert.deepStrictEqual(writtenTasks.items.map((task) => task.id), ['runtime-extra']);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
