import path from 'node:path';
import type { FrontierSwarmPlan } from '@shapeshift-labs/frontier-swarm';
import { checkCodexDependencyHealth, writeCodexDependencyHealthReport } from './dependency-health.js';
import { semanticImportEnabled } from './semantic-import-quality.js';
import type {
  FrontierCodexDependencyHealthOptions,
  FrontierCodexDependencyHealthReport,
  FrontierCodexSwarmRunOptions
} from './index.js';

export async function runCodexDependencyHealthPreflight(
  plan: FrontierSwarmPlan,
  options: FrontierCodexSwarmRunOptions,
  outDir: string
): Promise<FrontierCodexDependencyHealthReport | undefined> {
  if (options.dependencyHealth === false) return undefined;
  const semanticImport = options.semanticImportExpected ?? semanticImportEnabled(options.semanticImport);
  const healthOptions = normalizeDependencyHealthOptions(options.dependencyHealth, options.cwd, semanticImport);
  const report = await checkCodexDependencyHealth(healthOptions);
  const outFile = healthOptions.outFile
    ? path.resolve(options.cwd ?? process.cwd(), healthOptions.outFile)
    : path.join(outDir, 'dependency-health.json');
  await writeCodexDependencyHealthReport(report, outFile);
  if (!report.ok) {
    throw new Error(`frontier-swarm dependency health failed before run ${plan.runId}; see ${outFile}`);
  }
  return report;
}

function normalizeDependencyHealthOptions(
  input: boolean | FrontierCodexDependencyHealthOptions | undefined,
  root: string | undefined,
  semanticImport: boolean
): FrontierCodexDependencyHealthOptions {
  const options = input && typeof input === 'object' ? input : {};
  return {
    ...options,
    root: options.root ?? root,
    semanticImport: options.semanticImport ?? semanticImport
  };
}
