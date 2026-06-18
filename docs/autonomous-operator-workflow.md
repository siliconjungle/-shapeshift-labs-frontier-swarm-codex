# Autonomous Operator Workflow

This workflow is for a human coordinator running Frontier swarm jobs in any repository that has a swarm manifest, a task queue, and ownership rules. It assumes workers write merge bundles, patches, verification output, and evidence under a run directory.

## Start a Run

Pick an output directory that names the run, then launch with the smallest workspace that still contains the files workers need:

```sh
frontier-swarm-codex run \
  --manifest path/to/agent-ownership.json \
  --tasks path/to/work-queue.json \
  --outDir agent-runs/my-run \
  --workspace copy \
  --include AGENTS.md,package.json,src \
  --exclude node_modules,dist,agent-runs \
  --max-concurrency 4 \
  --semantic-import \
  --focused-command "npm test"
```

`run` starts the workers, records event streams, writes job evidence, and then enables auto-drain by default. Auto-drain collects worker merge bundles, admits ready auto-mergeable patches, runs the autonomous apply loop, and writes `auto-drain/auto-drain.json` plus summaries in `swarm-results.json` and `coordinator-dashboard.json`.

If the coordinator checkout is dirty when auto-drain starts, auto-drain still collects worker bundles and writes queue, admission, grouping, reviewer, dashboard, and operator-summary artifacts. It does not apply patches into the dirty checkout. The run records `autoDrain.ok: false`, `autoDrain.skippedReason: "dirty-worktree"`, and `autoDrain.dirtyPaths[]`; `operatorSummary.status` remains `info` when work is only queued for a clean apply window. Clean, commit, or intentionally stash those paths, then run `frontier-swarm-codex drain --run agent-runs/my-run` with the same focused/global gates when the coordinator is ready to apply.

Use `--no-auto-drain` only when you want a raw diagnostic run, for example to inspect worker output without any coordinator apply attempt:

```sh
frontier-swarm-codex run \
  --manifest path/to/agent-ownership.json \
  --tasks path/to/work-queue.json \
  --outDir agent-runs/debug-run \
  --workspace copy \
  --no-auto-drain
```

## Watch the Run

The run directory is the operator console. Check these files while the run is active or immediately after it finishes:

- `streams/*.jsonl`: worker and coordinator events.
- `coordinator-dashboard.json`: current queue, worker, and drain summary.
- `pids.json`: worker process ids for `frontier-swarm-codex stop --run <run-dir>`.
- `swarm-results.json`: final run proof and auto-drain summary.
- `auto-drain/auto-drain.json`: each collection/admission/apply iteration.
- `auto-drain/apply-*/autonomous-merge-decisions.jsonl`: append-only decisions from autonomous apply.
- Worker directories: `last-message.md`, `merge.json`, `changes.patch`, verification output, and evidence artifacts.

After a run, use `coordinator-dashboard.json.operatorSummary` for human-facing queue status. It is the display contract for the top-line status, headline, cards, and counts; use lower-level queue metadata only when drilling into diagnostics.

If auto-drain is disabled or you want to drain a previous run explicitly, use `autonomous-apply`:

```sh
frontier-swarm-codex autonomous-apply \
  --run agent-runs/my-run \
  --focused-command "npm test" \
  --global-command "npm run typecheck" \
  --global-glob "src/**"
```

`autonomous-apply` is also available as `drain`. It takes a repository-local lock, reads the `ready-to-apply` bundles, re-checks patches against the current head, applies each admitted patch, runs focused and matching global gates, and writes `autonomous-apply.json` plus `autonomous-queue-overlay.json`. Use `--dry-run` to check patches without changing the checkout. Use `--allow-dirty` only when the current dirty state is intentional and already understood.

## Interpret Outcomes

Collection sorts worker output into buckets before apply:

- `ready-to-apply`: verified, ownership-clean bundles that can be considered for autonomous apply.
- `needs-human-port`: useful patches or findings that need a human to port or review.
- `failed-evidence`: failed workers, blockers, ownership violations, or failed required commands.
- `stale-against-head`: patches that no longer apply to the current head.

Auto-drain may defer a ready bundle because of limits such as changed paths, changed regions, high-risk flags, or per-iteration caps. Deferred is not the same as rejected; it means the coordinator should review the admission record or run another drain with adjusted limits.

Autonomous apply decisions are the final source of truth for a bundle:

- `applied`: the patch applied and required gates passed. Review the final diff and continue with normal repository gates.
- `committed`: same as applied, but the drain also created a commit because `--commit` was requested.
- `checked`: dry-run mode proved the patch would apply under the lock; run a non-dry drain or apply manually.
- `rejected`: the patch was applied, a required gate failed, and the patch was rolled back. Inspect the decision commands and worker evidence before asking for a narrower fix.
- `rerun`: the bundle was stale against the current head or the head changed during checking. Rerun that task against the updated base.
- `conflict-blocked`: `git apply --check` failed. Port manually or rerun the worker with current source refs.
- `human-blocked`: the bundle was not marked auto-mergeable or violated ownership. A human coordinator must decide whether to port, split, or reject it.
- `skipped`: there was no source patch to apply, usually a discovery-only result.
- `failed`: apply infrastructure failed, such as git, lock, branch, rollback, or commit operations. Inspect the recorded command output before retrying.

## Operator Checklist

Before calling the run done:

- Confirm `swarm-results.json` and `auto-drain/auto-drain.json` agree on the remaining ready, blocked, and terminal counts.
- Read every non-terminal or blocked decision in `autonomous-merge-decisions.jsonl`.
- Review the repository diff and changed paths, even when auto-drain reports success.
- Run the repository gates that matter for the touched surface.
- Rerun stale tasks or create follow-up tasks for rejected, conflict-blocked, or human-blocked bundles.
- Keep the evidence path in the handoff so another operator can replay the decision trail without reading raw worker logs first.
