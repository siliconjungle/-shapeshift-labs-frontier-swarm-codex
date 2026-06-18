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

## Relationship To Coordinator-Agent Drain

Coordinator-agent drain artifacts describe queue work before or around apply. The
autonomous decision ledger records the terminal result of an apply attempt. Keep those
layers separate:

- `frontier.swarm.coordinator-agent-drain-work` is the generic queue contract. It
  contains scope leases, queue assignments, terminal queue decisions, and promoted work.
- `frontier.swarm-codex.coordinator-agent-drain` is the Codex auto-drain iteration
  contract. It records ready assignments that were `selected` or `deferred` for that
  iteration, plus lease keys, promotion targets, serialization leaders, and selection
  reasons.
- `frontier.swarm-codex.autonomous-merge-decision` is the append-only apply decision
  event. It is the source of truth for whether a selected patch was checked, applied,
  committed, rejected, rerun, conflict-blocked, failed, skipped, or human-blocked.

A selected coordinator-agent assignment is not a landed patch. It only means the job
became the local drain leader for the iteration. Match it to a JSONL decision by
`jobId` or `queueItemIds` before showing a terminal outcome. A deferred assignment,
`queued` drain decision, or `escalated` promoted work item is still coordinator queue
work; it is not a human blocker unless a later decision explicitly becomes
`human-blocked` or the queue assignment is a true `block`.

Generic coordinator-agent terminal decisions can close queue items without a patch
apply when the queue action is `rerun`, `reject`, `record-only`, or `block`. In Codex
auto-drain, patch application still uses this ledger for apply attempts. That means a
dashboard may need both sources: the coordinator-agent drain artifact explains why an
item was selected, deferred, or promoted; the JSONL ledger explains what happened when
the coordinator tried to apply it.

## Decision Statuses

Read a decision `status` as both the observed outcome and the next coordinator action.
Every status except `human-blocked` is an automation instruction. Only
`human-blocked` means the coordinator is waiting on an explicit external decision.

| Status | Meaning | Coordinator action |
| --- | --- | --- |
| `checked` | Dry-run mode proved the patch still applies under the autonomous apply lock. | Keep the item `ready-to-apply`; run a non-dry autonomous apply pass or an equivalent coordinator apply. |
| `applied` | The patch was applied to the coordinator worktree and required gates passed. | Mark the queue item satisfied and continue with normal repository review or package gates. |
| `committed` | Same as `applied`, with a commit created because `--commit` was enabled. | Mark the queue item satisfied, record the commit, and continue with post-commit gates. |
| `rejected` | The patch was attempted, a required gate failed, and rollback completed. | Treat the item as rejected evidence; create a narrower follow-up only if the evidence is still useful. |
| `rerun` | The bundle was stale against the current repository head, or the head changed while the lock was held. | Rerun the worker or regenerate the merge bundle against current head. |
| `skipped` | The bundle had no source patch to apply, usually discovery-only evidence. | Mark the queue item satisfied without changing source; create a follow-up task only if the discovery warrants one. |
| `conflict-blocked` | `git apply --check` failed against current head. This is a mechanical merge conflict or stale patch shape, not a human blocker by itself. | Rerun, rebase, or launch a focused conflict-resolution shard before considering escalation. |
| `failed` | The runner or git workflow failed operationally, such as failing to read HEAD, apply a patch, create a commit, or roll back cleanly. | Inspect command tails, fix the transient/tooling problem or rerun, then replace the queue state with `rerun`, `rejected`, `conflict-blocked`, or `human-blocked` when the cause is known. |
| `human-blocked` | Automation is not authorized to decide. Use this for ownership violations, bundles that are not marked auto-mergeable, missing parent assignment, or policy/risk conditions that require a human decision. | Pause automation for that queue item and ask the exact human question needed to unblock it. |

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
  mechanics blocked the current patch and should trigger rerun, rebase, or focused
  conflict-resolution; `human-blocked` means authority or policy blocked automation.

Do not use `human-blocked` as a synonym for "the coordinator has not reviewed this yet."
Unreviewed coordinator debt must collapse into a concrete ledger status with a reason
that names the actual condition: `checked` for dry-run readiness, `applied` or
`committed` for landed patches, `rejected` for gate failures with rollback, `rerun` for
stale bundles, `skipped` for evidence-only bundles, `conflict-blocked` for mechanical
patch conflicts, `failed` for operational failures that still need automated triage, or
`human-blocked` for explicit external authority or policy questions. That keeps
dashboards honest: most review debt can be drained by coordinator automation, while
true human blockers remain rare and explicit.
