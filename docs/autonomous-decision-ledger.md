# Autonomous Decision Ledger

`frontier-swarm-codex autonomous-apply` writes an append-only decision ledger named
`autonomous-merge-decisions.jsonl` under the autonomous apply output directory unless
`decisionLogPath` is set. Each line is one JSON object recording the coordinator's
decision for one collected merge bundle. Consumers should treat the file as an event
stream: append new decisions, group by `jobId` or `queueItemIds`, and use the latest
decision when deriving queue state. Do not edit previous lines to clear review debt.

## JSONL Record Contract

Each decision record has `kind:
frontier.swarm-codex.autonomous-merge-decision` and `version: 1`.

Required identity and queue fields:

- `id`: unique decision id.
- `runId` and `planId`: optional source run metadata copied from the merge bundle.
- `jobId`: worker job that produced the bundle.
- `taskId`: optional task id.
- `queueItemIds`: queue items satisfied, rejected, rerun, skipped, or blocked by the
  decision.

Required outcome fields:

- `status`: one autonomous decision status.
- `reason`: compact human-readable explanation.
- `bundlePath`: collected `merge.json` path.
- `patchPath`: patch path when a source patch exists.
- `changedPaths` and `changedRegions`: source ownership surface used for admission,
  locking, and queue overlays.

Required concurrency and timing fields:

- `lockScope`: `semantic`, `path`, or `repo`.
- `lockKeys`: `region:<file#region>` keys when semantic regions exist,
  `path:<file>` keys when only paths exist, or `repo:*` for unscoped bundles.
- `startedAt` and `finishedAt`: epoch milliseconds.
- `dryRun`: true when the coordinator only checked the patch.

Diagnostic fields:

- `headBefore` and `headAfter`: git heads observed around the apply attempt.
- `lockPath` and `lockToken`: local lock evidence for the apply attempt.
- `commands`: command arrays with exit status and stdout/stderr tails.
- `error`: optional machine-readable failure detail.

The same apply run also writes `autonomous-apply.json` and
`autonomous-queue-overlay.json`. The JSONL ledger is the durable decision source; the
overlay is a derived coordinator view.

## Decision Statuses

Coordinator-review debt should collapse into one of these terminal decision outcomes:

- `applied`: the patch was applied to the coordinator worktree and required gates
  passed. This satisfies the queue item.
- `rejected`: the patch was attempted, a required gate failed, and rollback completed.
  This satisfies the queue item as rejected evidence; it is not a human blocker.
- `rerun`: the bundle was stale against the current repository head, or the head
  changed while the lock was held. The right next action is to regenerate or rerun the
  worker against current head.
- `skipped`: the bundle had no source patch to apply, usually discovery-only evidence.
  This satisfies the queue item without changing source.
- `conflict-blocked`: `git apply --check` failed against current head. This is a merge
  conflict or stale patch shape, not a true human blocker by itself. Prefer rerun,
  rebase, or a focused conflict-resolution shard before escalating.
- `human-blocked`: automation is not authorized to decide. Use this for ownership
  violations, bundles that are not marked auto-mergeable, missing parent assignment, or
  policy/risk conditions that require an explicit human decision.

`committed` is stored by the implementation when `--commit` is enabled; for review-debt
accounting it is an applied variant because the patch has passed gates and landed in a
commit. `checked` is a dry-run result that keeps the item `ready-to-apply`; it is not a
terminal non-dry-run outcome. `failed` is an operational failure in the runner or git
workflow, such as failing to read HEAD or failing rollback. Triage it as failed
evidence, then convert the queue item to `rerun`, `rejected`, `conflict-blocked`, or
`human-blocked` once the coordinator has enough information.

## Coordinator Workflow States Versus Human Blockers

Queue and collection states are coordinator workflow states. Examples include
`ready-to-apply`, `needs-human-port`, `stale-against-head`, `failed-evidence`,
`discovery-only`, `blocked`, and `satisfied`. They describe where a bundle is in the
automation pipeline; they are not automatically requests for human judgment.

Use workflow states to drive automated next actions:

- `ready-to-apply`: acquire the autonomous apply lock, re-check the patch, and apply or
  record a concrete terminal decision.
- `stale-against-head` or `rerun`: rerun the worker or produce a fresh merge bundle.
- `failed-evidence` or `failed`: inspect the command tails and decide whether the
  durable outcome is `rejected`, `rerun`, `conflict-blocked`, or `human-blocked`.
- `discovery-only` or no changed paths: record `skipped` unless the discovery created a
  new follow-up task.
- `blocked`: preserve the specific blocker status. `conflict-blocked` means merge
  mechanics blocked automation; `human-blocked` means authority or policy blocked it.

Do not use `human-blocked` as a synonym for "the coordinator has not reviewed this yet."
Unreviewed coordinator debt must collapse into `applied`, `rejected`, `rerun`,
`skipped`, `conflict-blocked`, or `human-blocked` with a reason that names the actual
condition. That keeps dashboards honest: most review debt can be drained by coordinator
automation, while true human blockers remain rare and explicit.
