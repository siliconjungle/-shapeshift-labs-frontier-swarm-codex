import type { FrontierCodexCollectResult } from './index.js';


export function collectResultForCli(result: FrontierCodexCollectResult, full: boolean): unknown {
  if (full) return result;
  return {
    ok: result.ok,
    runDir: result.runDir,
    outDir: result.outDir,
    summary: result.summary,
    semanticImport: result.semanticImport,
    semanticEditAdmission: result.semanticEditAdmission,
    semanticEditScriptAdmission: result.semanticEditScriptAdmission,
    artifactStore: result.artifactStore?.summary,
    outputs: {
      collection: `${result.outDir}/collection.json`,
      compactDashboard: `${result.outDir}/compact-dashboard.json`,
      coordinatorQuery: `${result.outDir}/coordinator-query.json`,
      evidenceIndex: `${result.outDir}/evidence-index.json`,
      artifactStore: result.artifactStore?.storeDir
    }
  };
}
