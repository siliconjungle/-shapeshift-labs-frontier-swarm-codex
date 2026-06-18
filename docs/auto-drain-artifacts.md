# Auto-Drain Artifact Map

This map describes the artifacts a coordinator, dashboard, or review script should read after `frontier-swarm-codex` runs with `autoDrain` enabled. Paths are shown relative to the swarm run output directory.

## Read Order

1. Start with `swarm-results.json` for the top-level run result, worker run/proof payload, and embedded `autoDrain` and `autoDrainArtifacts` summaries.
2. Read `coordinator-dashboard.json` when a UI needs the dashboard-shaped snapshot with lane counts, merge readiness counts, `queueMetadata`, `queueHealth`, `humanQuestions`, `operatorSummary`, proof, event stream, PID manifest path, and the same auto-drain summaries.
3. Read `auto-drain/auto-drain.json` for the canonical auto-drain ledger, including every iteration, admission result, grouping result, apply result, lock summary, terminal jobs, blocked jobs, and aggregate counts.
4. Use the `autoDrainArtifacts` object from either `swarm-results.json`, `coordinator-dashboard.json`, or `auto-drain/auto-drain.json` as the compact path index for per-iteration artifacts.
5. Drill into `auto-drain/collection-NN/*`, `auto-drain/auto-drain-groups-NN.json`, and `auto-drain/apply-NN/*` only when a dashboard needs per-iteration details.

## Top-Level Run Artifacts

| Artifact | Scope | Primary consumers | Contents |
| --- | --- | --- | --- |
| `swarm-results.json` | Whole run | CI, coordinator handoff, dashboards that want one read | `{ ok, outDir, run, proof }` plus `autoDrain` and `autoDrainArtifacts` when auto-drain ran. |
| `coordinator-dashboard.json` | Whole run | Dashboards and status views | Dashboard-normalized run summary, `byLane`, `mergeReadiness`, root `queueHealth`, `humanQuestions`, `operatorSummary`, proof, event stream metadata, PID manifest path, `autoDrain`, `queueMetadata`, and `autoDrainArtifacts`. |
| `auto-drain/auto-drain.json` | Whole auto-drain pass | Coordinators, auditors, resume/debug tooling | Canonical auto-drain result with `iterations`, `lockKeys`, `lockScopeCounts`, terminal and blocked job ids, `summary`, and `artifacts`. |
| `auto-drain/merge-index.json` | Latest collection snapshot | Review dashboards | Convenience copy of the latest iteration's merge index. |
| `auto-drain/merge-admission.json` | Latest collection snapshot | Merge admission views | Convenience copy of the latest iteration's admission decision set. |
| `auto-drain/reviewer-lane-plan.json` | Latest collection snapshot | Review assignment dashboards | Convenience copy of the latest reviewer lane plan. |
| `auto-drain/patch-stack-plan.json` | Latest collection snapshot | Patch-stack and conflict views | Convenience copy of the latest patch stack plan. |

The top-level files under `auto-drain/` are summary or latest-snapshot reads. They are useful for dashboards that only need the current state after the run finishes. Use the numbered iteration directories when historical iteration state matters.

## Path Index

`autoDrainArtifacts` has kind `frontier.swarm-codex.auto-drain-artifacts` and is embedded in:

- `swarm-results.json` as `autoDrainArtifacts`
- `coordinator-dashboard.json` as `autoDrainArtifacts`
- `auto-drain/auto-drain.json` as `artifacts`

It is the preferred machine-readable index for dashboards because it groups artifact paths by purpose:

| Field | Points to | Dashboard use |
| --- | --- | --- |
| `autoDrainPath` | `auto-drain/auto-drain.json` | Link back to the canonical ledger. |
| `admission.paths` | Per-iteration `merge-admission.json` files | Show which jobs were admitted or deferred by each iteration. |
| `grouping.paths` | Per-iteration `collection.json`, `merge-index.json`, `queue-overlay.json`, and `auto-drain-groups-NN.json` files | Show the candidate pool, buckets, queue status, and compatible apply groups. |
| `mergeQueue.paths` | Per-iteration `hierarchical-merge-queue.json` files | Show scoped queue assignments, local apply pressure, queued overflow, promotions, stale reruns, invalid evidence rejections, discovery records, and true blockers. |
| `reviewer.paths` | Per-iteration `reviewer-lane-plan.json` files and decision logs | Show human-review queues and apply decisions. |
| `patchStack.paths` | Per-iteration `patch-stack-plan.json`, `autonomous-apply.json`, `autonomous-queue-overlay.json`, and patch files | Show patch stack ordering, conflicts, applied patches, and remaining work. |
| `iterations[]` | One compact row per auto-drain iteration | Render timelines without opening every detailed artifact first. |
| `summary` | Aggregate counts | Render top-line totals such as iteration count, apply count, admission count, reviewer plan count, patch stack plan count, decision count, and patch count. |

## Outcome Semantics For Dashboards

Auto-drain emits workflow states, queue actions, and apply decisions. Dashboards should keep these separate so merge conflicts and stale work do not look like true human blockers.

| Outcome | Whole-run summary fields | Per-iteration evidence | Dashboard treatment |
| --- | --- | --- | --- |
| Conflict-blocked apply | `auto-drain/auto-drain.json.summary.conflictBlockedCount`, `coordinator-dashboard.json.queueMetadata.queueHealth.conflictBlockedDecisionCount`, and `coordinator-dashboard.json.queueMetadata.actionCounts.conflictBlockedDecisionCount` | `auto-drain/apply-NN/autonomous-apply.json` `decisions[].status === "conflict-blocked"` and the matching `autonomous-merge-decisions.jsonl` records | Show as merge mechanics blocked by current head. Do not count it as a human question or true human blocker. The derived queue overlay maps it to `stale-against-head`, so the next action is rerun, rebase, or a focused conflict-resolution shard. |
| Stale or rerun work | `autoDrainArtifacts.grouping.staleAgainstHeadCount`, `autoDrainArtifacts.mergeQueue.rerunCount`, `auto-drain/auto-drain.json.summary.remainingReadyCount`, `coordinator-dashboard.json.queueMetadata.bucketCounts.staleAgainstHeadCount`, and `coordinator-dashboard.json.queueMetadata.queueHealth.staleOrRerunCount` | `auto-drain/collection-NN/stale-against-head/<job>/merge.json`, `auto-drain/collection-NN/hierarchical-merge-queue.json` assignments with `action === "rerun"`, `autoDrainArtifacts.iterations[].staleAgainstHeadCount`, `autoDrainArtifacts.iterations[].mergeQueueRerunCount`, and apply decisions with `status === "rerun"` | Show as stale against head or needing a fresh worker result. It is coordinator-drain work, not a human blocker by itself. |
| Human-blocked decision | `auto-drain/auto-drain.json.summary.humanBlockedCount`, `coordinator-dashboard.json.humanQuestions.count`, `coordinator-dashboard.json.humanQuestions.jobIds`, `coordinator-dashboard.json.humanQuestions.taskIds`, and `coordinator-dashboard.json.humanQuestions.reasons` | `auto-drain/apply-NN/autonomous-apply.json` `decisions[].status === "human-blocked"` and matching decision-log records | Show as a true human question only when the decision reason names the missing authority, parent assignment, ownership decision, or policy/risk decision. |
| Queue true blocker | `autoDrainArtifacts.mergeQueue.blockCount`, `coordinator-dashboard.json.queueMetadata.actionCounts.trueBlockerCount`, and `coordinator-dashboard.json.queueMetadata.queueHealth.trueBlockerCount` | `auto-drain/collection-NN/hierarchical-merge-queue.json` assignments with `action === "block"` and reasons including `true-blocker` | Show separately from conflict-blocked. This is a pre-apply queue/planner blocker based on an already blocked bundle state. |

`needs-human-port` is also a workflow bucket, not automatically a human blocker. Use `autoDrainArtifacts.grouping.needsHumanPortCount` and `auto-drain/collection-NN/needs-human-port/<job>/merge.json` to show work that may need manual porting or review, but only `human-blocked` decisions and queue `block` actions should feed blocker badges.

## Operator Summary Contract

For human-facing status views and cards, read `coordinator-dashboard.json.operatorSummary` or the mirrored `coordinator-dashboard.json.queueMetadata.operatorSummary`. The summary is the dashboard display contract: render its `status`, `headline`, `cards[]`, and `counts` directly instead of recomputing human-facing state from raw queue counters.

`operatorSummary.status` is one of `ok`, `info`, `warning`, `blocked`, or `unavailable`. Treat `blocked` as the only summary status that asks for human-facing blocker treatment. It is derived from true queue blockers and explicit `humanQuestions`; stale work, rerun work, conflict-blocked apply decisions, and `needs-human-port` buckets are not human blockers by themselves.

Stable card ids are `coordinator-queues`, `applied-decisions`, `stale-rerun`, `true-blockers`, and `coordinator-review-artifacts`. Each card carries its own `label`, `value`, `detail`, `status`, `action`, and `sourceFields`; dashboards should use `sourceFields` to link diagnostics without changing the card's human-facing meaning.

Use root `queueHealth` or `queueMetadata.queueHealth` when a UI needs drill-down counters, trend charts, or diagnostic filters. Use root `humanQuestions` or `queueMetadata.humanQuestions` only for explicit missing-authority questions that need a human answer. Do not convert `queueMetadata.bucketCounts.needsHumanPortCount`, `queueHealth.staleOrRerunCount`, `queueHealth.conflictBlockedDecisionCount`, or `autoDrainArtifacts.grouping.staleAgainstHeadCount` into blocker badges. Blocker UI should come from `operatorSummary.status`, the `true-blockers` card/count, and explicit `humanQuestions`.

## Per-Iteration Collection Artifacts

Each auto-drain iteration collects worker merge bundles into `auto-drain/collection-NN/`, where `NN` is a zero-padded iteration number.

| Artifact | Scope | Primary consumers | Contents |
| --- | --- | --- | --- |
| `auto-drain/collection-NN/collection.json` | One iteration | Detailed dashboards, review tools | Full collection result with buckets, merge index, admission, reviewer lane plan, patch stack plan, queue overlay, summary, and artifact paths. |
| `auto-drain/collection-NN/merge-index.json` | One iteration | Conflict and readiness views | Normalized merge bundle index with dispositions, changed paths, changed regions, conflicts, and summary counts. |
| `auto-drain/collection-NN/queue-overlay.json` | One iteration | Queue dashboards | Queue item status derived from collected merge bundles before autonomous apply. |
| `auto-drain/collection-NN/hierarchical-merge-queue.json` | One iteration | Operators and queue dashboards | Scoped root, lane, semantic-region, path, or custom queue assignments with `apply-local`, `queue-local`, `promote`, `rerun`, `reject`, `record-only`, and `block` counts. |
| `auto-drain/collection-NN/merge-admission.json` | One iteration | Admission views | Jobs admitted or deferred for that collection based on readiness, risk, path/region budgets, and conflict data. |
| `auto-drain/collection-NN/reviewer-lane-plan.json` | One iteration | Review assignment dashboards | Reviewer lanes/tasks for work that needs human inspection or porting. |
| `auto-drain/collection-NN/patch-stack-plan.json` | One iteration | Patch-stack views | Patch stack grouping, patch job counts, and conflict summaries. |
| `auto-drain/collection-NN/<bucket>/<job>/merge.json` | One job in one iteration | Reviewers and patch appliers | Normalized merge bundle copied into `ready-to-apply`, `needs-human-port`, `failed-evidence`, or `stale-against-head`. |
| `auto-drain/collection-NN/<bucket>/<job>/changes.patch` | One job in one iteration | Patch appliers and diff views | Patch copied beside the collected merge bundle when present. |

Collection artifacts are per-iteration snapshots. A coordinator should not assume that `collection-01/merge-admission.json` describes the final state after later iterations have applied patches.

## Grouping Artifacts

Each iteration writes `auto-drain/auto-drain-groups-NN.json`. This is the grouping artifact for the admitted candidates in that iteration.

It contains:

- `readyJobIds`, `admittedJobIds`, and `deferredJobIds`
- `groups[]` with compatible job groups, changed paths, changed regions, scope keys, and serialization requirements
- `jobs[]` with each admitted or deferred job placement
- `conflicts[]` for path, region, or unscoped conflicts
- `summary` counts for ready, admitted, deferred, group, serialized job, and conflict totals

Dashboards should use grouping artifacts to show which admitted jobs could have been applied together and which jobs were serialized or deferred. The grouping artifact is per-iteration; the aggregate grouping counts live in `autoDrainArtifacts.grouping` and `autoDrainArtifacts.summary`.

## Per-Iteration Apply Artifacts

When an iteration admits jobs, auto-drain writes an apply directory at `auto-drain/apply-NN/`.

| Artifact | Scope | Primary consumers | Contents |
| --- | --- | --- | --- |
| `auto-drain/apply-NN/autonomous-apply.json` | One apply attempt | Coordinators and audit views | Apply ledger with decisions, dry-run flag, lock path, lock keys, command results, queue overlay, and summary counts. |
| `auto-drain/apply-NN/autonomous-queue-overlay.json` | One apply attempt | Queue dashboards | Queue overlay after autonomous decisions. Applied, checked, committed, rejected, skipped, or blocked jobs are reflected as queue status. |
| `auto-drain/apply-NN/autonomous-merge-decisions.jsonl` | One apply attempt unless a custom decision log path is configured | Audit and replay tooling | Append-only decision records for each autonomous merge decision. |

Apply artifacts are per-iteration. Top-level summaries report aggregate decision and apply counts, but a UI should open `autonomous-apply.json` or the decision log to explain a specific job outcome.

## Consumer Guide

| Consumer | First artifact | Follow-up artifacts |
| --- | --- | --- |
| Run summary card | `swarm-results.json` or `coordinator-dashboard.json` | `auto-drain/auto-drain.json` for terminal/blocked details. |
| Auto-drain timeline | `autoDrainArtifacts.iterations[]` | Numbered `collection-NN`, `auto-drain-groups-NN.json`, and `apply-NN` paths for expanded rows. |
| Queue dashboard | `coordinator-dashboard.json` | `auto-drain/collection-NN/queue-overlay.json` before apply and `auto-drain/apply-NN/autonomous-queue-overlay.json` after apply. |
| Merge admission review | `auto-drain/merge-admission.json` for latest state | `auto-drain/collection-NN/merge-admission.json` for historical iteration state. |
| Reviewer assignment view | `auto-drain/reviewer-lane-plan.json` for latest state | `auto-drain/collection-NN/reviewer-lane-plan.json` and decision logs. |
| Patch-stack view | `auto-drain/patch-stack-plan.json` for latest state | `auto-drain/collection-NN/patch-stack-plan.json`, `auto-drain/apply-NN/autonomous-apply.json`, and copied `changes.patch` files. |
| Conflict/grouping view | `autoDrainArtifacts.grouping` | `auto-drain/auto-drain-groups-NN.json` and `auto-drain/collection-NN/merge-index.json`. |

## Summary Vs Iteration Rules

- Treat `swarm-results.json`, `coordinator-dashboard.json`, `auto-drain/auto-drain.json`, and `autoDrainArtifacts` as whole-run summaries.
- Treat `auto-drain/merge-admission.json`, `auto-drain/reviewer-lane-plan.json`, `auto-drain/patch-stack-plan.json`, and `auto-drain/merge-index.json` as latest auto-drain snapshots.
- Treat `auto-drain/collection-NN/*`, `auto-drain/auto-drain-groups-NN.json`, and `auto-drain/apply-NN/*` as per-iteration artifacts.
- Prefer `autoDrainArtifacts.iterations[]` for navigation because it records the exact paths and counts that existed for each iteration.
- Prefer per-iteration artifacts when explaining why a job was admitted, deferred, grouped, serialized, applied, rejected, or left for human review.
