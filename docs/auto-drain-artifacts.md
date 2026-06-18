# Auto-Drain Artifact Map

This map describes the artifacts a coordinator, dashboard, or review script should read after `frontier-swarm-codex` runs with `autoDrain` enabled. Paths are shown relative to the swarm run output directory.

## Read Order

1. Start with `swarm-results.json` for the top-level run result, worker run/proof payload, and embedded `autoDrain` and `autoDrainArtifacts` summaries.
2. Read `coordinator-dashboard.json` when a UI needs the dashboard-shaped snapshot with lane counts, merge readiness counts, `costSummary`, `queueMetadata`, `queueHealth`, `humanQuestions`, `operatorSummary`, proof, event stream, PID manifest path, and the same auto-drain summaries.
3. Read `auto-drain/auto-drain.json` for the canonical auto-drain ledger, including every iteration, admission result, grouping result, apply result, lock summary, terminal jobs, blocked jobs, and aggregate counts.
4. Use the `autoDrainArtifacts` object from either `swarm-results.json`, `coordinator-dashboard.json`, or `auto-drain/auto-drain.json` as the compact path index for per-iteration artifacts.
5. Read `auto-drain/coordinator-agent-drain-work-NN.json` when a dashboard or coordinator agent needs the generic coordinator-agent work contract for one iteration: leases, queue assignments, terminal queue decisions, and promoted work.
6. Read `auto-drain/coordinator-agent-drain-NN.json` when a dashboard needs the Codex selected/deferred layer for one iteration: selected drain leaders, deferred local work, scope leases, promotion targets, and serialization leaders.
7. Read `auto-drain/rerun-manifest.json` when conflict-blocked, stale, or rerun debt needs a focused follow-up swarm.
8. Drill into `auto-drain/collection-NN/*`, `auto-drain/auto-drain-groups-NN.json`, and `auto-drain/apply-NN/*` only when a dashboard needs per-iteration details.

## Top-Level Run Artifacts

| Artifact | Scope | Primary consumers | Contents |
| --- | --- | --- | --- |
| `swarm-results.json` | Whole run | CI, coordinator handoff, dashboards that want one read | `{ ok, outDir, run, proof }` plus `autoDrain` and `autoDrainArtifacts` when auto-drain ran. |
| `coordinator-dashboard.json` | Whole run | Dashboards and status views | Dashboard-normalized run summary, `byLane`, `mergeReadiness`, `costSummary`, root `queueHealth`, `humanQuestions`, `operatorSummary`, proof, event stream metadata, PID manifest path, `autoDrain`, `queueMetadata`, and `autoDrainArtifacts`. |
| `auto-drain/auto-drain.json` | Whole auto-drain pass | Coordinators, auditors, resume/debug tooling | Canonical auto-drain result with `iterations`, `lockKeys`, `lockScopeCounts`, terminal and blocked job ids, `summary`, and `artifacts`. |
| `auto-drain/merge-index.json` | Latest collection snapshot | Review dashboards | Convenience copy of the latest iteration's merge index. |
| `auto-drain/merge-admission.json` | Latest collection snapshot | Merge admission views | Convenience copy of the latest iteration's admission decision set. |
| `auto-drain/reviewer-lane-plan.json` | Latest collection snapshot | Review assignment dashboards | Convenience copy of the latest reviewer lane plan. |
| `auto-drain/patch-stack-plan.json` | Latest collection snapshot | Patch-stack and conflict views | Convenience copy of the latest patch stack plan. |
| `auto-drain/rerun-manifest.json` | Whole auto-drain pass | Follow-up swarm coordinators | Task-shaped `items[]` for unresolved conflict-blocked, decision-rerun, queue-rerun, or stale-against-head work. Each item carries original task/job ids, source patch paths, bundle paths, target refs, reasons, `currentHead`, and `sourceHead` when known. Item objectives name known source heads alongside the current head. Evidence-only work is omitted. |

The top-level files under `auto-drain/` are summary or latest-snapshot reads. They are useful for dashboards that only need the current state after the run finishes. Use the numbered iteration directories when historical iteration state matters.

When the coordinator checkout is dirty, auto-drain is collect-only. It still writes `swarm-results.json`, `coordinator-dashboard.json`, `auto-drain/auto-drain.json`, `auto-drain/rerun-manifest.json`, collection artifacts, merge admission, grouping, reviewer, patch-stack, queue metadata, and operator-summary artifacts. It intentionally skips `auto-drain/apply-NN/*` and reports `autoDrain.ok: false`, `autoDrain.skippedReason: "dirty-worktree"`, `autoDrain.dirtyPaths[]`, `autoDrain.summary.applyCount: 0`, and any remaining ready count. Dashboards should show this as queued coordinator work waiting for a clean apply window, not as missing data or a worker failure. Ready or promoted counts in this state are pending queue counts; they are not landed changes because there are no apply decisions.

## Cost Summary

`coordinator-dashboard.json.costSummary` has kind `frontier.swarm-codex.dashboard-cost-summary` and summarizes token/cost metadata recorded on worker results. It reports total input, cached input, uncached input, output, and total tokens; estimated USD cost; per-model totals in `byModel[]`; and `unknownPricing[]` rows for jobs that reported token usage but used a model outside the static exact-model pricing catalog. Unknown models are not treated as zero-cost work.

The pricing catalog is intentionally separate from the Codex CLI supported-model catalog. Supported model IDs can be valid to forward to Codex while still producing `unknown-model-pricing` until their exact per-token price metadata is added to `FRONTIER_SWARM_CODEX_MODEL_PRICING`. Worker prompts include the known per-unit input, cached-input, output, and unit-token rates in their resource allocation section so humans and dashboard consumers can audit the estimate basis.

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
| `coordinatorAgent.paths` | Per-iteration `coordinator-agent-drain-NN.json` files | Show the Codex selected/deferred layer: selected or deferred local queue assignments, lease keys, queue actions, promotions, and serialization leaders. |
| `coordinatorAgentDrainWork.paths` | Per-iteration `coordinator-agent-drain-work-NN.json` files | Show the generic coordinator-agent work contract: scope leases, queue assignments, terminal queue decisions, promoted work, and action/queue indexes. |
| `reviewer.paths` | Per-iteration `reviewer-lane-plan.json` files and decision logs | Show human-review queues and apply decisions. |
| `patchStack.paths` | Per-iteration `patch-stack-plan.json`, `autonomous-apply.json`, `autonomous-queue-overlay.json`, and patch files | Show patch stack ordering, conflicts, apply ledgers, patch files, and remaining work. |
| `rerunManifest.paths` | `auto-drain/rerun-manifest.json` | Seed the next focused rerun or conflict-resolution swarm directly from task-shaped `items[]`; use `metadata.rerun.currentHead`, `metadata.rerun.sourceHead`, and `metadata.rerun.sourceHeads` to detect stale follow-up items. |
| `iterations[]` | One compact row per auto-drain iteration | Render timelines without opening every detailed artifact first. |
| `summary` | Aggregate counts | Render top-line totals such as iteration count, apply count, admission count, reviewer plan count, patch stack plan count, decision count, patch count, rerun manifest count, and rerun task count. |

`autoDrainArtifacts.coordinatorAgentDrainWork` summarizes all generic drain-work artifacts. Its `assignmentCount`, `terminalCount`, `nonTerminalCount`, `promotedWorkCount`, and decision counts describe coordinator-agent queue work before source mutation. `autoDrainArtifacts.coordinatorAgent` summarizes the Codex selected/deferred layer for auto-drain iterations. Its `assignmentCount`, `selectedCount`, `deferredCount`, `promoteCount`, and `queueLocalCount` are queue-work counts. They do not mean patches landed. A selected assignment means that the coordinator-agent drain selected the local queue leader for this iteration; the matching `autonomous-apply.json` or `autonomous-merge-decisions.jsonl` still owns the terminal outcome.

`autoDrainArtifacts.mergeQueue.promotedPatchCandidateCount`, `autoDrainArtifacts.summary.promotedPatchCandidateCount`, and `coordinator-dashboard.json.queueMetadata.bucketCounts.promotedPatchCandidateCount` count patch candidates that were promoted by auto-drain because coordinator gates were configured. These are not worker-verified bundles and should not be shown as landed work; inspect `metadata.coordinatorPatchCandidatePromotion` on the collected `merge.json` to see the original `needs-port` classification. Promotion writes a `ready-to-apply` collection copy before apply, so treat the count as coordinator-gated queue pressure until the matching apply decision is `applied` or `committed`; a required coordinator gate failure records `rejected` and rolls the patch back.

## Outcome Semantics For Dashboards

Auto-drain emits workflow states, queue actions, and apply decisions. Dashboards should keep these separate so merge conflicts and stale work do not look like true human blockers.

| Outcome | Whole-run summary fields | Per-iteration evidence | Dashboard treatment |
| --- | --- | --- | --- |
| Conflict-blocked apply | `auto-drain/auto-drain.json.summary.conflictBlockedCount`, `coordinator-dashboard.json.queueMetadata.queueHealth.conflictBlockedDecisionCount`, `coordinator-dashboard.json.queueMetadata.queueHealth.currentHeadConflictCount`, `coordinator-dashboard.json.queueMetadata.actionCounts.conflictBlockedDecisionCount`, `coordinator-dashboard.json.queueMetadata.actionCounts.currentHeadConflictCount`, and `autoDrainArtifacts.rerunManifest.conflictBlockedCount` | `auto-drain/apply-NN/autonomous-apply.json` `decisions[].status === "conflict-blocked"`, the matching `autonomous-merge-decisions.jsonl` records, and `auto-drain/rerun-manifest.json` items with `metadata.rerun.sourceKinds[] === "conflict-blocked"` plus `metadata.rerun.sourceHead` from the decision head | Show as merge mechanics blocked by current head. Do not count it as a human question or true human blocker. The derived queue overlay maps it to `stale-against-head`, so the next action is rerun, rebase, or a focused conflict-resolution shard; operator copy should name this as coordinator retry work, not a human blocker. |
| Stale or rerun work | `autoDrainArtifacts.grouping.staleAgainstHeadCount`, `autoDrainArtifacts.mergeQueue.rerunCount`, `autoDrainArtifacts.rerunManifest.taskCount`, `auto-drain/auto-drain.json.summary.remainingReadyCount`, `coordinator-dashboard.json.queueMetadata.bucketCounts.staleAgainstHeadCount`, and `coordinator-dashboard.json.queueMetadata.queueHealth.staleOrRerunCount` | `auto-drain/collection-NN/stale-against-head/<job>/merge.json`, `auto-drain/collection-NN/hierarchical-merge-queue.json` assignments with `action === "rerun"`, `autoDrainArtifacts.iterations[].staleAgainstHeadCount`, `autoDrainArtifacts.iterations[].mergeQueueRerunCount`, apply decisions with `status === "rerun"`, and `auto-drain/rerun-manifest.json` task items with `metadata.rerun.sourceHead`/`sourceHeads` | Show as stale against head or needing a fresh worker result. It is coordinator-drain work, not a human blocker by itself. Use the rerun manifest as the next swarm seed instead of reconstructing queue tasks manually. |
| Human-blocked decision | `auto-drain/auto-drain.json.summary.humanBlockedCount`, `coordinator-dashboard.json.humanQuestions.count`, `coordinator-dashboard.json.humanQuestions.jobIds`, `coordinator-dashboard.json.humanQuestions.taskIds`, and `coordinator-dashboard.json.humanQuestions.reasons` | `auto-drain/apply-NN/autonomous-apply.json` `decisions[].status === "human-blocked"` and matching decision-log records | Show as a true human question only when the decision reason names the missing authority, parent assignment, ownership decision, or policy/risk decision. |
| Queue true blocker | `autoDrainArtifacts.mergeQueue.blockCount`, `coordinator-dashboard.json.queueMetadata.actionCounts.trueBlockerCount`, and `coordinator-dashboard.json.queueMetadata.queueHealth.trueBlockerCount` | `auto-drain/collection-NN/hierarchical-merge-queue.json` assignments with `action === "block"` and reasons including `true-blocker` | Show separately from conflict-blocked. This is a pre-apply queue/planner blocker based on an already blocked bundle state. |

`needs-human-port` is also a workflow bucket, not automatically a human blocker. Use `autoDrainArtifacts.grouping.needsHumanPortCount` and `auto-drain/collection-NN/needs-human-port/<job>/merge.json` to show work that may need manual porting or review, but only `human-blocked` decisions and queue `block` actions should feed blocker badges.

## Coordinator-Agent Drain Contract

Each auto-drain iteration writes `auto-drain/coordinator-agent-drain-work-NN.json` with kind `frontier.swarm.coordinator-agent-drain-work` and version `1`. This is the generic per-iteration contract that lets autonomous coordinator agents drain local queues without relying on prose handoffs. The same iteration also writes `auto-drain/coordinator-agent-drain-NN.json` with kind `frontier.swarm-codex.coordinator-agent-drain` and version `1`; that Codex artifact records the selected/deferred subset that auto-drain will attempt in this iteration.

The artifact is scoped to ready work only. It derives a narrowed hierarchical merge queue from the iteration's ready job ids, merge admission, and collection. It then records which ready jobs were selected for this iteration and which ready jobs were deferred behind a local queue leader or admission cap.

The top-level fields are:

| Field | Meaning |
| --- | --- |
| `collectionDir` | Collection directory that provided the merge bundles and queue evidence. |
| `mergeQueueId` and `admissionId` | Source queue and scoped admission records used to create the drain assignment set. |
| `readyJobIds` | Ready jobs considered by coordinator-agent drain before selection. |
| `admittedJobIds` | Selected local queue leaders for this iteration. These are candidates for grouping and apply, not landed work. |
| `deferredJobIds` | Ready jobs left in the coordinator queue for a later iteration. |
| `assignments[]` | One coordinator-agent assignment per ready queue item whose queue action is `apply-local`, `queue-local`, or `promote`. |
| `summary` | Counts for assignments, selected/deferred work, `apply-local`, `queue-local`, promoted work, selected promotions, deferred promotions, and distinct scopes. |

Each `assignments[]` entry records the local queue contract:

| Field | Meaning |
| --- | --- |
| `queueAction` | Source hierarchical queue action: `apply-local`, `queue-local`, or `promote`. |
| `decision` and `selected` | Iteration selection result: `selected`/`true` means this job is the current local drain leader; `deferred`/`false` means it stays queued. |
| `scopeId`, `parentScopeIds`, `leaseKey`, and `promoteToScopeId` | Queue scope and lease information the coordinator uses to serialize local drain work or route promoted work upward. |
| `changedPaths`, `changedRegions`, and `conflictingJobIds` | Conflict surface copied from the merge queue. |
| `serializesAfterJobIds` and `leaderJobIds` | Deterministic local serialization relationship. Deferred assignments should wait for their listed leaders before being selected. |
| `reasons` and `selectionReason` | Machine-readable reasons for selection, deferral, queue locality, promotion, or serialization. |

The generic `frontier.swarm.coordinator-agent-drain-work` contract maps every hierarchical queue action to a durable coordinator-agent decision and exposes `leases`, `assignments`, `terminalDecisions`, and `promotedWork`. The Codex artifact is narrower: it records auto-drain's per-iteration selected/deferred work before autonomous apply writes terminal decisions, and links back to the generic work artifact with `workArtifactId` and `workArtifactPath`.

### Worker Bundle To Apply Ledger Handoff

Coordinator agents should consume drain work in layers:

1. Treat worker `merge.json`, `changes.patch`, verification output, and handoff files as evidence. They describe what the worker produced; they do not decide whether the coordinator should land, reject, rerun, or escalate it.
2. Read the iteration's `hierarchical-merge-queue.json` to understand the scoped queue action for each bundle. This is where stale work becomes `rerun`, invalid evidence becomes `reject`, discovery becomes `record-only`, true blockers become `block`, clean overflow becomes `queue-local`, and useful cross-scope work becomes `promote`.
3. Read `coordinator-agent-drain-work-NN.json` as the generic work contract. A coordinator agent should acquire the matching `leases[]` entry, process its `assignments[]`, mirror `terminalDecisions[]` into queue overlays, and move `promotedWork[]` to the parent queue without relabeling it as a human blocker.
4. Read `coordinator-agent-drain-NN.json` when using the Codex runner. This selected/deferred layer tells the agent which local queue leaders auto-drain will attempt in the current iteration and which clean items remain queued locally.
5. Read `apply-NN/autonomous-apply.json` or `apply-NN/autonomous-merge-decisions.jsonl` for the terminal source outcome. Match selected assignments to apply decisions by `jobId` or `queueItemIds`; selected means "attempted this iteration", not "landed".

For cleanup, prefer machine decisions over another prose review pass. Terminal generic drain decisions close queue items for `rerun`, `reject`, `record-only`, and `block`; `apply-local` still needs the apply ledger to prove whether the patch was checked, applied, committed, rejected, rerun, conflict-blocked, failed, skipped, or human-blocked. Non-terminal `queued` and `escalated` items remain coordinator work: queued items stay in the same scope, and promoted items move to the smallest parent queue that can decide. A human question exists only when a `block` action or `human-blocked` apply decision names the missing authority, owner, surface, or policy decision.

## Operator Summary Contract

For human-facing status views and cards, read `coordinator-dashboard.json.operatorSummary` or the mirrored `coordinator-dashboard.json.queueMetadata.operatorSummary`. The summary is the dashboard display contract: render its `status`, `headline`, `cards[]`, and `counts` directly instead of recomputing human-facing state from raw queue counters.

`operatorSummary.status` is one of `ok`, `info`, `warning`, `blocked`, or `unavailable`. Treat `blocked` as the only summary status that asks for human-facing blocker treatment. It is derived from true queue blockers and explicit `humanQuestions`; stale work, rerun work, conflict-blocked apply decisions, and `needs-human-port` buckets are not human blockers by themselves. A warning for `currentHeadConflictCount` should tell operators to rerun, rebase, or launch focused conflict-resolution work from the listed queue ids and patch paths.

`queueMetadata.actionCounts` separates historical coordinator work from latest queue debt. `applyLocalCount`, `queueLocalCount`, and `promoteCount` remain counts of coordinator-agent queue work, while rerun, reject, record-only, and block counts prefer the latest collection with terminal autonomous decisions and explicit human-blocked decisions removed. Queue item id, task id, and job id aliases are collapsed as one queue subject when later decisions share any alias, so committed reruns do not keep stale pressure alive only because a later collection used a different queue item id. `currentHeadConflictCount` mirrors `conflictBlockedDecisionCount` for dashboards that need a plain current-head debt label. `deferredCoordinatorCount` and `deferredPromoteCount` come from the latest Codex coordinator-agent drain layer, so a deferred promoted queue item remains visible even when stale or conflict decisions for the same queue key were later collapsed. This keeps old rerun, stale, conflict, reject, or block debt from staying visible after a newer decision closes the queue item while preserving live deferred queue debt. `autoDrainArtifacts.mergeQueue`, `autoDrainArtifacts.grouping`, and `autoDrainArtifacts.summary` remain historical aggregate counters for audit timelines.

Fresh terminal `applied` or `committed` decisions close earlier stale, rerun, or conflict-blocked queue subjects when they share queue item, task, or job keys. In that state the `stale-rerun` card and current-head conflict counters should collapse to zero, while latest deferred coordinator or deferred promotion counts can still keep `operatorSummary.status` at `warning`. That warning is live coordinator-drain debt, not reopened stale history.

Stable card ids are `coordinator-queues`, `applied-decisions`, `coordination-debt`, `stale-rerun`, `true-blockers`, and `coordinator-review-artifacts`. Each card carries its own `label`, `value`, `detail`, `status`, `action`, and `sourceFields`; dashboards should use `sourceFields` to link diagnostics without changing the card's human-facing meaning.

The `cards[]` field contract is:

| Card field | Meaning |
| --- | --- |
| `id` | Stable machine id for ordering, layout preferences, links, and tests. Use `label` for display text. |
| `label` | Short human-facing card title. |
| `value` | Numeric display count for the card. Render the provided value instead of recomputing it from raw counters. |
| `detail` | Supporting human-facing text that explains the displayed count. |
| `status` | Card display severity: `ok`, `info`, `warning`, `blocked`, or `unavailable`. A warning `stale-rerun` card means coordinator refresh or conflict-resolution pressure, not a human blocker. |
| `action` | Human-facing next step for the card. Treat it as display copy unless `operatorSummary.status` is `blocked`, the `true-blockers` card is blocked, or `humanQuestions` lists explicit questions. Conflict retry and coordination-debt actions are coordinator work instructions, not human questions. |
| `sourceFields` | Raw field paths used to build the card. Use them for diagnostic links or drill-down filters, not to relabel stale/rerun, conflict-blocked, or `needs-human-port` work as human blockers. |

Use root `queueHealth` or `queueMetadata.queueHealth` when a UI needs drill-down counters, trend charts, or diagnostic filters. Use `queueHealth.currentHeadConflictCount`, `queueHealth.deferredCoordinatorCount`, and `queueHealth.deferredPromoteCount` for coordinator-drain debt views. Use root `humanQuestions` or `queueMetadata.humanQuestions` only for explicit missing-authority questions that need a human answer. Do not convert `queueMetadata.bucketCounts.needsHumanPortCount`, `queueHealth.staleOrRerunCount`, `queueHealth.conflictBlockedDecisionCount`, `queueHealth.currentHeadConflictCount`, `queueHealth.deferredCoordinatorCount`, or `autoDrainArtifacts.grouping.staleAgainstHeadCount` into blocker badges. Blocker UI should come from `operatorSummary.status`, the `true-blockers` card/count, and explicit `humanQuestions`.

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

### Patch-only outputs

If a worker writes `evidence/changes.patch` but no `merge.json`, collection synthesizes a merge bundle instead of dropping the job. The copied collection entry has `patchOnly: true`, `summary.patchOnlyCount` and `artifacts.counts.patchOnlyCount` include it, and the synthesized `merge.json` records `metadata.patchOnlyCollection.reason === "changes.patch existed without merge.json"`.

Patch-only bundles are conservative. A patch that applies is a `patch-candidate` and normally lands in `needs-human-port` as coordinator-review work; when auto-drain patch-candidate promotion is enabled with required coordinator gates and the worker evidence proves changed paths stayed inside allowed writes, it can be promoted into `ready-to-apply`. A patch that does not pass `git apply --check` is collected under `stale-against-head` and the hierarchical merge queue marks it as `rerun`. Failed or ownership-violating patch-only evidence is collected as `failed-evidence` and the queue marks it as `reject`.

## Grouping Artifacts

Each iteration writes `auto-drain/auto-drain-groups-NN.json`. This is the grouping artifact for the admitted candidates in that iteration.

It contains:

- `readyJobIds`, `admittedJobIds`, and `deferredJobIds`
- `groups[]` with compatible job groups, changed paths, changed regions, scope keys, and serialization requirements
- `jobs[]` with each admitted or deferred job placement and its embedded `coordinatorAgent` assignment when available
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

In dirty collect-only runs, no `apply-NN` directory is written. The matching `autoDrainArtifacts.iterations[]` row has no `applyPath`, `autonomousQueueOverlayPath`, or `decisionLogPath`, and `decisionCount` is `0`.

## Consumer Guide

| Consumer | First artifact | Follow-up artifacts |
| --- | --- | --- |
| Run summary card | `swarm-results.json` or `coordinator-dashboard.json` | `auto-drain/auto-drain.json` for terminal/blocked details. |
| Auto-drain timeline | `autoDrainArtifacts.iterations[]` | Numbered `collection-NN`, `auto-drain-groups-NN.json`, and `apply-NN` paths for expanded rows. |
| Queue dashboard | `coordinator-dashboard.json` | `auto-drain/collection-NN/queue-overlay.json` before apply and `auto-drain/apply-NN/autonomous-queue-overlay.json` after apply. |
| Coordinator-agent work view | `autoDrainArtifacts.coordinatorAgentDrainWork` | `auto-drain/coordinator-agent-drain-work-NN.json`, then `auto-drain/coordinator-agent-drain-NN.json`, `auto-drain/auto-drain-groups-NN.json`, and `auto-drain/apply-NN/autonomous-apply.json` for selection, grouping, and terminal outcomes. |
| Rerun swarm seed | `autoDrainArtifacts.rerunManifest.paths[0]` | Pass `auto-drain/rerun-manifest.json` to the next task loader. Its top-level `items[]` are task-shaped and include source patch refs, bundle refs, target refs, reasons, original task ids, original job ids, queue ids, `currentHead`, and per-item `sourceHead`/`sourceHeads`. |
| Merge admission review | `auto-drain/merge-admission.json` for latest state | `auto-drain/collection-NN/merge-admission.json` for historical iteration state. |
| Reviewer assignment view | `auto-drain/reviewer-lane-plan.json` for latest state | `auto-drain/collection-NN/reviewer-lane-plan.json` and decision logs. |
| Patch-stack view | `auto-drain/patch-stack-plan.json` for latest state | `auto-drain/collection-NN/patch-stack-plan.json`, `auto-drain/apply-NN/autonomous-apply.json`, and copied `changes.patch` files. |
| Conflict/grouping view | `autoDrainArtifacts.grouping` | `auto-drain/auto-drain-groups-NN.json` and `auto-drain/collection-NN/merge-index.json`. |

## Summary Vs Iteration Rules

- Treat `swarm-results.json`, `coordinator-dashboard.json`, `auto-drain/auto-drain.json`, and `autoDrainArtifacts` as whole-run summaries.
- Treat `auto-drain/merge-admission.json`, `auto-drain/reviewer-lane-plan.json`, `auto-drain/patch-stack-plan.json`, `auto-drain/merge-index.json`, and `auto-drain/rerun-manifest.json` as latest or whole-pass auto-drain snapshots.
- Treat `auto-drain/collection-NN/*`, `auto-drain/coordinator-agent-drain-work-NN.json`, `auto-drain/coordinator-agent-drain-NN.json`, `auto-drain/auto-drain-groups-NN.json`, and `auto-drain/apply-NN/*` as per-iteration artifacts.
- Prefer `autoDrainArtifacts.iterations[]` for navigation because it records the exact paths and counts that existed for each iteration.
- Prefer `auto-drain/rerun-manifest.json` over prose handoffs when scheduling follow-up work for unresolved conflict-blocked, stale, or rerun queue debt.
- Prefer per-iteration artifacts when explaining why a job was admitted, deferred, grouped, serialized, applied, rejected, or left for human review.
