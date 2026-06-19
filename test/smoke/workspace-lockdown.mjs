import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const commonSource = fs.readFileSync(path.join(root, 'src/common.ts'), 'utf8');
const changesSource = fs.readFileSync(path.join(root, 'src/codex-workspace-changes.ts'), 'utf8');
const runSource = fs.readFileSync(path.join(root, 'src/codex-run.ts'), 'utf8');
const cliArgsSource = fs.readFileSync(path.join(root, 'src/cli-args.ts'), 'utf8');
const cliHelpSource = fs.readFileSync(path.join(root, 'src/cli-help.ts'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(root, 'src/codex-workspace.ts'), 'utf8');
const workspaceTypesSource = fs.readFileSync(path.join(root, 'src/types-workspace.ts'), 'utf8');
const runTypesSource = fs.readFileSync(path.join(root, 'src/types-run.ts'), 'utf8');
const promptSource = fs.readFileSync(path.join(root, 'src/codex-prompt.ts'), 'utf8');

for (const token of [
  'export function isWorkspaceNoisePath',
  "'.git'",
  "'.cache'",
  "'build'",
  "suffix: '.tsbuildinfo'",
  'workspacePathMatches'
]) {
  assert.match(commonSource + changesSource, new RegExp(escapeRegExp(token)), `missing workspace noise token: ${token}`);
}

for (const token of [
  'ignoredChangedPathReasons',
  'getIgnoredWorkspaceChangedPathReason',
  'createIgnoredWorkspaceChangedPathReasons',
  'ignoredChangedPathReasonCounts',
  'restoreWorkspaceChangedPaths',
  'ownershipRestore',
  'preExecWriteFence',
  'applyWorkspacePreExecWriteFence',
  'restoreWorkspacePreExecWriteFence',
  'chmod-readonly',
  'same OS user',
  'strictRestoreNeedsSnapshot',
  'observedChangedPaths',
  'reportedChangedPaths',
  'writePolicy',
  'quarantinedChangedPaths',
  'restoredSourcePaths',
  'quarantinedChangedPathCount',
  'restoredSourcePathCount',
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
  'strict-allowed-writes',
  'git_metadata',
  'tsbuildinfo'
]) {
  assert.match(changesSource + runSource + workspaceSource + workspaceTypesSource + runTypesSource + cliArgsSource + cliHelpSource, new RegExp(escapeRegExp(token)), `missing workspace lockdown token: ${token}`);
}

for (const token of ['evidence handoff', 'target lane', 'target files', 'rationale', 'do not patch them']) {
  assert.match(promptSource, new RegExp(escapeRegExp(token)), `missing prompt handoff token: ${token}`);
}

assert.match(changesSource, /snapshotMarker\('ignored-dir', stat\)/);
assert.match(changesSource, /snapshotMarker\('ignored-file', stat\)/);
assert.match(changesSource, /getIgnoredWorkspaceChangedPathReason/);
assert.match(changesSource, /quarantineWorkspacePatchCandidatePaths/);
assert.match(changesSource, /mergeWorkspaceChangedPathCollections/);
assert.match(runSource, /restored-disallowed-changes/);
assert.match(runTypesSource, /export type FrontierCodexAllowedWriteEnforcement = 'audit' \| 'strict' \| 'off';/);
assert.match(
  cliArgsSource,
  /const workspaceMode = readWorkspaceMode\(args\.workspace\);\s*if \(workspaceMode === 'copy' \|\| workspaceMode === 'snapshot'\) return \{ mode: 'strict' \};\s*return undefined;/,
  'copy/snapshot must default to strict while current/git-worktree defer to the audit normalizer'
);
assert.match(
  workspaceSource,
  /function normalizeAllowedWritePolicy\([\s\S]*?return \{ mode: value\?\.mode === 'strict' \? 'strict' : 'audit' \};[\s\S]*?\}/,
  'current/git-worktree must normalize an omitted CLI policy to audit'
);

const rawChangedIndex = runSource.indexOf('const rawChangedPaths = collected.changedPaths;');
const ownershipChangedIndex = runSource.indexOf("const ownershipChangedPaths = workspacePlan.allowedWritePolicy.mode === 'strict'");
const ownershipIndex = runSource.indexOf('const ownership = checkSwarmOwnership(job, ownershipChangedPaths);');
const quarantineIndex = runSource.indexOf('const workspacePatchQuarantine = quarantineWorkspacePatchCandidatePaths');
const restoreIndex = runSource.indexOf('const ownershipRestore = workspacePlan.allowedWritePolicy.mode === \'strict\'');
const verificationIndex = runSource.indexOf('const verification = options.runVerification && !strictOwnershipBlocked ? await runVerification');
assert.ok(rawChangedIndex > -1, 'runner must keep raw changed paths before caller filters');
assert.ok(ownershipChangedIndex > rawChangedIndex, 'runner must derive ownership paths from raw changed paths');
assert.ok(ownershipIndex > ownershipChangedIndex, 'runner must evaluate ownership against policy-selected changed paths');
assert.ok(quarantineIndex > ownershipIndex, 'runner must quarantine after ownership checks');
assert.ok(restoreIndex > quarantineIndex, 'runner must restore strict ownership violations after quarantine');
assert.ok(verificationIndex > restoreIndex, 'runner must restore strict ownership violations before verification');
assert.match(runSource, /restoreWorkspaceChangedPaths\(\{[\s\S]*?baseline: fileSnapshot[\s\S]*?\}\)/);
assert.match(changesSource, /baseline\?: FrontierCodexWorkspaceFileSnapshot/);
assert.match(changesSource, /function snapshotContainsWorkspacePath/);
assert.match(cliHelpSource, /--write-fence audit\|strict\|off \(default strict for copy\/snapshot; audit for current\/git-worktree unless overridden\)/);
assert.match(changesSource, /function walkWorkspaceWriteFence/);
assert.match(changesSource, /function writeEntryCoversDirectory/);
assert.match(changesSource, /function parseWriteFenceEntry/);
assert.match(changesSource, /walkWorkspaceWriteFence\(input\.workspace, input\.workspace, writableRoots, records\)/);
assert.match(changesSource, /path\.win32\.isAbsolute\(raw\)/);
assert.match(changesSource, /function writeFenceStaticRoot/);
assert.match(changesSource, /staticPart\.lastIndexOf\('\/'\)/);
assert.match(runSource, /writeCodexPatchFile\(\{[\s\S]*?changedPaths: workspacePatchQuarantine\.patchCandidateChangedPaths[\s\S]*?\}\);/);
assert.match(runSource, /createCodexSemanticImportSidecar\(\{[\s\S]*?changedPaths: workspacePatchQuarantine\.patchCandidateChangedPaths[\s\S]*?\}\);/);
assert.match(runSource, /quarantined-disallowed-changes/);
assert.match(runSource, /preexec-write-fence/);
assert.match(workspaceTypesSource, /FrontierCodexWorkspaceWriteFenceSummary/);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
