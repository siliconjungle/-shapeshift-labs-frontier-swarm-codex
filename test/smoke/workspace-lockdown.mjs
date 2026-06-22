import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const commonSource = fs.readFileSync(path.join(root, 'src/common.ts'), 'utf8');
const changesSource = fs.readFileSync(path.join(root, 'src/codex-workspace-changes.ts'), 'utf8');
const runSource = fs.readFileSync(path.join(root, 'src/codex-run.ts'), 'utf8');
const runMetadataSource = fs.readFileSync(path.join(root, 'src/codex-run-metadata.ts'), 'utf8');
const cliArgsSource = fs.readFileSync(path.join(root, 'src/cli-args.ts'), 'utf8');
const cliHelpSource = fs.readFileSync(path.join(root, 'src/cli-help.ts'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(root, 'src/codex-workspace.ts'), 'utf8');
const workspaceProofSource = fs.readFileSync(path.join(root, 'src/collect-workspace-proof.ts'), 'utf8');
const workspaceTypesSource = fs.readFileSync(path.join(root, 'src/types-workspace.ts'), 'utf8');
const collectionTypesSource = fs.readFileSync(path.join(root, 'src/types-collection.ts'), 'utf8');
const runTypesSource = fs.readFileSync(path.join(root, 'src/types-run.ts'), 'utf8');
const promptSource = fs.readFileSync(path.join(root, 'src/codex-prompt.ts'), 'utf8');
const applySource = fs.readFileSync(path.join(root, 'src/apply.ts'), 'utf8');
const removedImplementationFiles = [
  'src/codex-workspace-change-paths.ts',
  'src/codex-workspace-restore.ts',
  'src/codex-workspace-write-fence.ts'
];
const workspaceChangeSources = changesSource;

for (const file of removedImplementationFiles) {
  assert.equal(fs.existsSync(path.join(root, file)), false, `Codex must not retain local workspace implementation file: ${file}`);
}

for (const token of [
  '@shapeshift-labs/frontier-swarm-git',
  'prepareSwarmGitWorkspace',
  'createSwarmGitWorkspacePlan',
  'createSwarmGitWorkspaceProof',
  'collectSwarmGitChangedPaths',
  'restoreSwarmGitChangedPaths',
  'applySwarmGitPreExecWriteFence',
  'restoreSwarmGitPreExecWriteFence',
  'writeSwarmGitPatchFile',
  'runSwarmGitVerification',
  'noIndexSwarmGitWorkspacePatch',
  'applySwarmGitMergeCollection',
  'FRONTIER_SWARM_GIT_WORKSPACE_PROOF_KIND',
  'FRONTIER_SWARM_GIT_APPLY_LEDGER_KIND',
  'ignoredChangedPathReasons',
  'restoreWorkspaceChangedPaths',
  'ownershipRestore',
  'preExecWriteFence',
  'strictRestoreNeedsSnapshot',
  'observedChangedPaths',
  'reportedChangedPaths',
  'writePolicy',
  'quarantinedChangedPaths',
  'verificationSkipReasons',
  'verificationSkippedCommands',
  'verificationSkippedCommandCount',
  'allowedWritePolicy',
  'FrontierCodexAllowedWritePolicyContract',
  'default strict for copy/snapshot; audit for current/git-worktree unless overridden',
  'observesHostWorkspaceChanges',
  'filtersWorkspaceNoiseBeforeOwnership',
  'quarantinesDisallowedChanges',
  'restoresDisallowedSourcePaths',
  'appliesPreExecFence',
  'allowedWritePolicyArg',
  'strict-allowed-writes'
]) {
  assert.match(workspaceChangeSources + applySource + runSource + runMetadataSource + workspaceSource + workspaceProofSource + workspaceTypesSource + collectionTypesSource + runTypesSource + cliArgsSource + cliHelpSource, new RegExp(escapeRegExp(token)), `missing workspace lockdown token: ${token}`);
}

for (const token of ['evidence handoff', 'target lane', 'target files', 'rationale', 'do not patch them']) {
  assert.match(promptSource, new RegExp(escapeRegExp(token)), `missing prompt handoff token: ${token}`);
}

assert.match(workspaceChangeSources, /quarantineSwarmGitPatchCandidatePaths/);
assert.match(workspaceChangeSources, /mergeSwarmGitChangedPathCollections/);
assert.match(workspaceSource, /function codexWorkspaceOptions/);
assert.match(workspaceSource, /root = workspace\.root \?\? path\.join\('agent-worktrees', 'frontier-swarm-codex'\)/);
assert.doesNotMatch(changesSource + workspaceSource + applySource, /git', \['diff'|git', \['apply'/);
assert.match(runSource, /restored-disallowed-changes/);
assert.match(runTypesSource, /export type FrontierCodexAllowedWriteEnforcement = 'audit' \| 'strict' \| 'off';/);
assert.match(
  cliArgsSource,
  /const workspaceMode = readWorkspaceMode\(args\.workspace\);\s*if \(workspaceMode === 'copy' \|\| workspaceMode === 'snapshot'\) return \{ mode: 'strict' \};\s*return undefined;/,
  'copy/snapshot must default to strict while current/git-worktree defer to the audit normalizer'
);

const rawChangedIndex = runSource.indexOf('const rawChangedPaths = collected.changedPaths;');
const ownershipChangedIndex = runSource.indexOf("const ownershipChangedPaths = workspacePlan.allowedWritePolicy.mode === 'strict'");
const ownershipIndex = runSource.indexOf('const ownership = checkSwarmOwnership(job, ownershipChangedPaths);');
const quarantineIndex = runSource.indexOf('const workspacePatchQuarantine = quarantineWorkspacePatchCandidatePaths');
const restoreIndex = runSource.indexOf('const ownershipRestore = workspacePlan.allowedWritePolicy.mode === \'strict\'');
const verificationIndex = runSource.indexOf('const verificationEvidence = options.runVerification && !strictOwnershipBlocked');
assert.ok(rawChangedIndex > -1, 'runner must keep raw changed paths before caller filters');
assert.ok(ownershipChangedIndex > rawChangedIndex, 'runner must derive ownership paths from raw changed paths');
assert.ok(ownershipIndex > ownershipChangedIndex, 'runner must evaluate ownership against policy-selected changed paths');
assert.ok(quarantineIndex > ownershipIndex, 'runner must quarantine after ownership checks');
assert.ok(restoreIndex > quarantineIndex, 'runner must restore strict ownership violations after quarantine');
assert.ok(verificationIndex > restoreIndex, 'runner must restore strict ownership violations before verification');
assert.match(runSource, /restoreWorkspaceChangedPaths\(\{[\s\S]*?baseline: fileSnapshot[\s\S]*?\}\)/);
assert.match(cliHelpSource, /--write-fence audit\|strict\|off \(default strict for copy\/snapshot; audit for current\/git-worktree unless overridden\)/);
assert.match(runSource, /writeCodexPatchFile\(\{[\s\S]*?changedPaths: workspacePatchQuarantine\.patchCandidateChangedPaths[\s\S]*?\}\);/);
assert.match(runSource, /createCodexSemanticImportSidecar\(\{[\s\S]*?changedPaths: workspacePatchQuarantine\.patchCandidateChangedPaths[\s\S]*?\}\);/);
assert.match(runSource, /quarantined-disallowed-changes/);
assert.match(runSource, /preexec-write-fence/);
assert.match(workspaceTypesSource, /FrontierCodexWorkspaceWriteFenceSummary/);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
