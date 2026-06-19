import assert from 'node:assert';
import {
  checkCodexDependencyHealth,
  fs,
  path,
  writeCodexDependencyHealthReport
} from './context.mjs';

export async function testDependencyHealth({ tmp }) {
  const healthy = await checkCodexDependencyHealth({ semanticImport: true });
  assert.strictEqual(healthy.ok, true);
  assert.ok(healthy.resolved.some((entry) => entry.packageName === '@shapeshift-labs/frontier-lang' && entry.status === 'ok'));

  const fakeRoot = path.join(tmp, 'fake-adapter');
  await writePackage(path.join(fakeRoot, 'package.json'), {
    name: '@shapeshift-labs/frontier-swarm-codex',
    dependencies: { '@shapeshift-labs/frontier-swarm': '^0.5.12' },
    optionalDependencies: { '@shapeshift-labs/frontier-lang': '0.4.47' }
  });
  await writePackage(path.join(fakeRoot, 'node_modules/@shapeshift-labs/frontier-swarm/package.json'), {
    name: '@shapeshift-labs/frontier-swarm',
    version: '0.5.12',
    main: 'index.js'
  });
  await writePackage(path.join(fakeRoot, 'node_modules/@shapeshift-labs/frontier-lang/package.json'), {
    name: '@shapeshift-labs/frontier-lang',
    version: '0.4.46',
    main: 'index.js'
  });

  const stale = await checkCodexDependencyHealth({ packageRoot: fakeRoot, root: fakeRoot, semanticImport: true });
  assert.strictEqual(stale.ok, false);
  assert.ok(stale.issues.some((issue) => issue.code === 'stale-nested-optional'));
  const outFile = path.join(tmp, 'dependency-health.json');
  await writeCodexDependencyHealthReport(stale, outFile);
  assert.ok(JSON.parse(await fs.readFile(outFile, 'utf8')).issues.length > 0);
}

async function writePackage(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
  await fs.writeFile(path.join(path.dirname(file), 'index.js'), 'export {};\n');
}
