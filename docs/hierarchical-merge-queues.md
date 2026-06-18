# Hierarchical Merge Queue Operator Guide

A flat swarm makes one coordinator read every worker result, decide every conflict, and remember which rejected or stale patches have already been handled. A hierarchical merge queue keeps those decisions close to the smallest scope that can prove them: a lane, semantic region, path, or custom project scope can apply clean work locally, keep clean overflow in its own queue, and promote only the work that genuinely needs a broader decision.

This guide is for operators running `frontier-swarm-codex`, Loom-backed swarm workflows, or another runner that emits Frontier-compatible merge bundles. It does not assume a specific repository layout. Replace the example globs, commands, and lane names with the surfaces in your project.

## Coordinator-Agent Drain Versus Raw Runs

Raw worker execution only leases tasks, runs workers, and captures their output. A raw run is useful for diagnostics because it leaves the repository untouched after workers finish, but it also leaves every merge decision to the human operator. Use `--no-auto-drain` only for that diagnostic mode.

The default `run` path adds coordinator-agent drain after worker execution. The coordinator side does not ask workers to merge their own output and does not make decisions from prose alone. It collects `merge.json`, `changes.patch`, verification records, semantic sidecars, and handoff artifacts; builds a merge index; assigns each bundle to a local queue; and then applies only admitted work under the repo lock and any scope lease the queue requires. Manual `autonomous-apply` or `drain` uses the same drain machinery against an existing run or collection, but without launching a new worker wave.

Local queues keep decisions close to the surface that can prove them. A docs lane can drain a clean docs patch while a runtime lane drains a clean runtime patch, as long as their paths or semantic regions do not conflict. Promotion is the escape route, not the default: move work upward only when the child queue cannot safely decide because of cross-scope conflict, high risk, missing authority, or ownership impact.

Workers should not use evidence-only handoffs when a patch, action, or concrete follow-up is possible. Evidence-only output is appropriate for discovery, failed evidence, diagnostics, or a true blocker. A true blocker is a question with an owner and affected surface, not a vague "needs review" label.

## Queue Shape

`createSwarmHierarchicalMergeQueue()` starts from a merge index and optional merge-admission result. It assigns each bundle to the narrowest useful scope:

- `root`: the whole run or repository.
- `lane`: a manifest lane such as runtime, docs, tests, platform, or browser.
- `semantic-region`: a symbol, selector, ownership region, API surface, generated source map region, or Loom/Frontier Lang semantic region.
- `path`: a changed file or directory when no richer semantic region is available.
- `custom`: any project scope supplied by the runner, such as service, package, feature, shard, component, migration, or release train.

The important rule is that a child queue can make child-safe decisions without waiting for the root coordinator. If a docs lane has two clean, unrelated patches, the docs queue can apply one and keep the other queued locally. The root queue only sees work that is stale, invalid, blocked, risky, or conflicting outside the child scope.

## Decision Meanings

Hierarchical queue assignments collapse worker output into concrete operator actions:

| Action | Meaning | Operator response |
| --- | --- | --- |
| `apply-local` | The bundle is verified, auto-mergeable, admitted by the local budget, and has no known conflict in its scope. | Acquire the scope lease, re-check the patch against current head, apply it, run focused and matching global gates, and write an apply decision. |
| `queue-local` | The bundle is clean but not admitted in this iteration, usually because of a local budget, path cap, or apply group limit. | Leave it in the same child queue. It is not review debt and does not need root escalation. Drain it in a later iteration after current local work lands. |
| `promote` | The bundle is useful but cannot be safely decided inside the leaf scope, often because of conflicts, high risk, missing auto-merge permission, or cross-scope impact. | Move it to the nearest parent queue that can serialize the decision. Promote to lane before root when the conflict is lane-local. |
| `rerun` | The bundle is stale against the current head or was produced from an old base. | Close the old item as stale and run a fresh narrow worker against the current source. Do not spend coordinator review time on the old patch. |
| `reject` | Evidence is failed or invalid: failed required command, failed patch check, ownership violation, rejected disposition, malformed patch, or contradictory handoff. | Record the rejection with evidence and only create a new task if there is a narrower hypothesis to test. |
| `record-only` | The worker produced discovery, traces, source maps, or notes without a patch candidate. | Attach the artifact to the queue item and close it as discovery unless it creates a concrete follow-up task. Do not use this when the worker could have produced the patch or action. |
| `block` | A true human or policy decision is required. | Preserve the blocker with the exact owner, surface, question, and missing authority. Do not use this for ordinary stale, invalid, unreviewed, or evidence-poor work. |

These actions reduce the single coordinator bottleneck because most work stops at the scope that can prove it. Root review becomes an exception path instead of the default path.

## Coordinator-Agent Drain Work Contract

Coordinator-agent drain work is a machine-readable contract over a hierarchical merge queue. It is not a worker handoff and it is not a prose review checklist. A coordinator agent should be able to read the queue, acquire the relevant queue lease, perform the assigned action, and write a terminal decision or promoted work record without guessing what "needs review" means.

The generic `frontier.swarm.coordinator-agent-drain-work` artifact contains:

| Field | Meaning |
| --- | --- |
| `leases[]` | One lease candidate per queue scope. Each lease records the queue id, scope kind, lease scope/key, parent queue, changed paths/regions, queued job ids, and action buckets. |
| `assignments[]` | One assignment per merge queue item. It binds a job to a queue, lease, assigned action, decision, classification, evidence reasons, risk/readiness/disposition, changed paths/regions, and conflicts. |
| `terminalDecisions[]` | Assignments whose action already has a terminal coordinator-agent decision. These can be mirrored into queue overlays without another human review pass. |
| `promotedWork[]` | Non-terminal work that moved from a child queue to a parent queue because local proof was insufficient. |
| `byAction`, `byQueueId`, and `summary` | Compact indexes for dashboards and queue runners. |

The action-to-decision mapping is stable:

| Queue action | Drain decision | Classification | Meaning |
| --- | --- | --- | --- |
| `apply-local` | `applied` | `terminal` | The local queue owns a clean admitted item. The coordinator still re-checks and applies under the apply lock before source changes are retained. |
| `queue-local` | `queued` | `non-terminal` | Clean work stays in the same queue behind a local capacity or leader decision. |
| `promote` | `escalated` | `non-terminal` | Work moves to a parent queue; it is not blocked just because it left the child queue. |
| `rerun` | `rerun` | `terminal` | The existing bundle is stale and should be replaced by a fresh worker result. |
| `reject` | `rejected` | `terminal` | Evidence, ownership, patch shape, or required gates invalidated the bundle. |
| `record-only` | `recorded` | `terminal` | Discovery or diagnostics were captured without a source patch. |
| `block` | `blocked` | `terminal` | A true human or policy blocker exists. The reasons must name the missing authority, owner, surface, or question. |

`frontier-swarm-codex` also writes `auto-drain/coordinator-agent-drain-NN.json` during auto-drain. That artifact is a per-iteration selection layer for ready work. It records `selected` versus `deferred` assignments, local `leaseKey` values, promotion targets, serialization leaders, and selection reasons before `autonomous-apply` writes terminal apply decisions. Treat selected coordinator-agent assignments as drain candidates for the iteration, not as landed patches.

## Real Run Flow

1. Define lanes and ownership in the swarm manifest. Keep lanes narrow enough that a queue can make local decisions: one subsystem, service, feature area, test harness, or doc surface is easier to drain than a catch-all lane.
2. Build source context with the smallest useful workspace. For semantic workflows, run Loom before launching or collecting workers:

```sh
loom doctor
loom capabilities
loom init --source "src/**" --source "packages/*/src/**"
loom scan --json
```

Use bounded `--source` globs. Loom semantic evidence is scope evidence, not a correctness proof. The queue still needs patch checks and gates before landing code.

3. Launch workers with merge-bundle evidence and optional semantic import:

```sh
frontier-swarm-codex run \
  --manifest path/to/agent-ownership.json \
  --tasks path/to/work-queue.json \
  --outDir agent-runs/my-run \
  --workspace copy \
  --include AGENTS.md,package.json,src \
  --exclude node_modules,dist,agent-runs \
  --semantic-import \
  --focused-command "npm test"
```

Each worker should emit `merge.json`, `changes.patch` when it has a patch, verification output, and any semantic sidecars such as `semantic-imports.json`.

4. Collect the run. Collection derives a merge index, queue overlay, admission result, reviewer plan, patch stack plan, and hierarchical queue from immutable worker output:

```sh
frontier-swarm collect --run agent-runs/my-run
```

Read `hierarchical-merge-queue.json` before reading large handoffs. It tells you how many bundles are `apply-local`, `queue-local`, `promote`, `rerun`, `reject`, `record-only`, or `block`, and which scope owns each assignment.

Read `coordinator-agent-drain-NN.json` after the queue when auto-drain is enabled. It tells you which local queue leaders were selected for this iteration, which ready items stayed deferred, and which promoted assignments were serialized behind a leader.

5. Drain local queues. Auto-drain or `autonomous-apply` re-checks admitted bundles under a lock, applies only ready work, runs gates, and writes append-only decisions:

```sh
frontier-swarm autonomous-apply \
  --run agent-runs/my-run \
  --focused-command "npm test" \
  --global-command "npm run typecheck" \
  --global-glob "src/**"
```

The local queue can keep running while sibling queues drain their own clean work. A docs queue applying a documentation patch should not block a runtime queue applying a verified runtime patch unless they conflict through the merge index.

6. Promote only when local proof is insufficient. Promotion is a structured route upward: semantic-region to lane, lane to root, or path to nearest parent. The parent queue decides whether to serialize, split, rerun, reject, or ask for human approval.

7. Record terminal decisions. The decision ledger and queue overlay should explain every item. Unreviewed is not a terminal state. A clean item is applied or queued locally; stale work is rerun; invalid work is rejected; discovery is recorded; true blockers name the missing authority and the exact question that must be answered.

## Loom And Semantic Regions

Loom helps operators avoid path-level false conflicts. A file can contain unrelated semantic regions, such as two exported functions, two route handlers, two docs sections, or two generated selectors. When Loom or Frontier Lang sidecars identify those regions, the merge queue can place same-file work in separate semantic-region queues.

A practical loop is:

1. Use `loom scan --json` or focused `loom lang import <file> --language typescript --sidecar` to create semantic evidence for the files workers are likely to touch.
2. Launch `frontier-swarm-codex` with `--semantic-import` and bounded file/byte limits so workers attach sidecars to their merge bundles.
3. Inspect `semantic-imports.json` beside `merge.json` when a same-file conflict appears. If regions are independent, admit or queue the work in separate semantic-region scopes.
4. If the semantic evidence is missing or lossy, fall back to path or lane scope and rerun important shards with better source refs rather than blindly merging.

The semantic sidecar improves queue placement. It does not replace `git apply --check`, focused tests, global gates, or human ownership rules.

## Operator Heuristics

- Prefer `apply-local` for low-risk, verified, auto-mergeable work with focused evidence and a clean patch check.
- Prefer `queue-local` for clean work that is only waiting behind a local cap. Raising it to root creates unnecessary coordinator debt.
- Prefer `promote` for real cross-scope conflicts or risk. Promote to the smallest parent that can decide.
- Prefer `rerun` for stale patches before reading long handoffs.
- Prefer `reject` for failed evidence, failed required commands, invalid patches, ownership violations, and disallowed paths.
- Prefer `record-only` for research, source maps, diagnostics, or traces without a patch.
- Use `block` only when the coordinator lacks authority or required information outside the swarm system.

## Artifacts To Check

- `coordinator-dashboard.json`: whole-run counts and current queue health.
- `auto-drain/auto-drain.json`: iteration ledger with terminal and blocked jobs.
- `auto-drain/collection-NN/hierarchical-merge-queue.json`: per-iteration scoped queue assignments.
- `auto-drain/coordinator-agent-drain-NN.json`: per-iteration coordinator-agent selected/deferred assignments, lease keys, promotions, and serialization leaders.
- `auto-drain/collection-NN/merge-index.json`: changed paths, changed regions, conflicts, and readiness.
- `auto-drain/collection-NN/merge-admission.json`: admitted and deferred jobs.
- `auto-drain/apply-NN/autonomous-merge-decisions.jsonl`: append-only apply decisions.
- Worker `merge.json`, `changes.patch`, `last-message.md`, verification output, and `semantic-imports.json`.

The handoff should cite the queue action and evidence path, not just a prose status. That lets the next operator resume from machine-readable decisions instead of rebuilding the queue from raw logs.
