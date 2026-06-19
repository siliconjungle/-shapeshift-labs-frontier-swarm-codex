# Autonomous Operator Workflow

This workflow is for a human coordinator running Frontier swarm jobs in any repository that has a swarm manifest, a task queue, and ownership rules. It assumes workers write merge bundles, patches, verification output, and evidence under a run directory.

The normal path is self-draining: `run` starts workers, then coordinator-agent drain collects their bundles, builds scoped queues, and applies only admitted patches under the repo lock and configured gates. Queue pressure is pending coordinator work, not landed code, until autonomous apply records `applied` or `committed`. Human blockers are rare explicit questions, not ordinary stale, queued, conflicted, or reviewable work.

## Scalable Coordinator Merge Flow

Use this flow when a run produces more merge candidates than one coordinator should inspect serially:

1. Workers produce merge bundles. A worker's durable output is its `merge.json`, optional `changes.patch`, verification summaries, and evidence directory. Workers do not mutate the coordinator checkout.
2. Collection builds a hierarchical merge queue from those bundles. Semantic regions are the narrowest scope when available, changed paths are the next scope, and `repo:*` is the fallback when a bundle has no narrower mutation surface. Lane or parent scopes provide promotion targets when local queues cannot settle the work.
3. Coordinator agents consume `coordinator-agent-drain-work-NN.json`. Each agent leases a queue scope by `leaseKey`, works the selected assignment for that scope, and records whether it applied locally, queued locally, promoted upward, requested a rerun, rejected evidence, recorded discovery, or emitted a true blocker.
4. Same-scope work serializes locally. Only one local leader should drain a semantic, path, lane, or repo scope at a time; other assignments in that scope remain queued behind the leader rather than turning into human work.
5. Cross-scope work promotes upward. When a bundle touches multiple scopes or loses a local conflict election, the queue should promote it to the nearest parent scope that can make the decision. Promotion is still coordinator work, not a terminal outcome.
6. Repository mutation happens under autonomous apply locks. Even when queue leases let many coordinator agents classify work in parallel, patch check, apply, rollback, and optional commit still run through the autonomous apply path and its repository mutation guard.
7. Only true human questions block. Stale patches, failed evidence, conflicts, queued work, promoted work, and unreviewed candidates should become `rerun`, `rejected`, `conflict-blocked`, `queued`, `escalated`, `checked`, `applied`, `committed`, `skipped`, or `failed` records. Ask a person only when the record names missing authority, ownership, policy, risk approval, or parent assignment.

This keeps the operator model repo-agnostic: queue scopes describe ownership and merge risk, coordinator agents drain those scopes, and the decision ledger records terminal outcomes.

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
  --focused-command '{"name":"scope=package:frontier-swarm test","command":"npm","args":["--prefix","packages/frontier-swarm","run","test"],"metadata":{"packageId":"frontier-swarm","packagePath":"packages/frontier-swarm","packageName":"@shapeshift-labs/frontier-swarm"}}' \
  --focused-command '{"name":"scope=package:frontier-swarm-codex test","command":"npm","args":["--prefix","packages/frontier-swarm-codex","run","test"],"metadata":{"packageId":"frontier-swarm-codex","packagePath":"packages/frontier-swarm-codex","packageName":"@shapeshift-labs/frontier-swarm-codex"}}'
```

`run` starts the workers, records event streams, writes job evidence, and then enables auto-drain by default. Auto-drain collects worker merge bundles, admits ready auto-mergeable bundles for coordinator apply, runs the autonomous apply loop, and writes `auto-drain/auto-drain.json` plus summaries in `swarm-results.json` and `coordinator-dashboard.json`.

`--focused-command` accepts either a shell command string or a JSON command descriptor with `name`, `command`, `args`, `cwd`, `required`, and `metadata`. Package-scoped descriptors should include `metadata.packageId`, `metadata.packagePath`, or `metadata.packageName`; auto-drain maps changed paths through `config/release-train.json`, selects the changed package's gate plus dependency package gates, skips unrelated package-scoped gates, and records the ordered gate proof in each autonomous decision.

When auto-drain has coordinator verification gates (`--focused-command`, or matching `--global-command`/`--global-glob`), it may promote scoped patch candidates from `coordinator-review` into the autonomous apply queue. Promotion requires an owned patch, no stale check failure, no ownership violations, no failed worker commands, and a patch that can be checked under the apply lock. This is coordinator queue admission, not worker verification or a landing signal: the original worker bundle remains a patch candidate, the collected queue copy records `metadata.coordinatorPatchCandidatePromotion`, and no checkout change is retained until autonomous apply re-checks the patch, applies it under the lock, and runs the required coordinator gates successfully. If a required coordinator gate fails, autonomous apply records `rejected` and rolls the patch back.

If the coordinator checkout is dirty when auto-drain starts, auto-drain still collects worker bundles and writes queue, admission, grouping, reviewer, dashboard, and operator-summary artifacts. It does not apply patches into the dirty checkout. The run records `autoDrain.ok: false`, `autoDrain.skippedReason: "dirty-worktree"`, and `autoDrain.dirtyPaths[]`; `operatorSummary.status` remains `info` when work is only queued for a clean apply window. Clean, commit, or intentionally stash those paths, then run `frontier-swarm-codex drain --run agent-runs/my-run` with the same focused/global gates when the coordinator is ready to apply. Queued or promoted candidates from the collect-only run remain pending until that clean drain writes an `applied` or `committed` decision.

If `auto-drain/rerun-manifest.json` has `summary.taskCount > 0`, feed it directly into the next worker wave:

```sh
frontier-swarm-codex run \
  --manifest path/to/agent-ownership.json \
  --rerun-manifest agent-runs/previous-run/auto-drain/rerun-manifest.json \
  --outDir agent-runs/rerun-current-head \
  --workspace copy \
  --semantic-import \
  --focused-command "npm test"
```

`--rerun-manifest` is a validated task-input alias for the generated rerun manifest. It preserves each task's `metadata.rerun`, source patch and bundle references, original queue item ids, source heads, target refs, and allowed writes so workers can rerun against the current checkout without manual queue surgery. It starts fresh leased workers and then follows the normal auto-drain path; it does not apply the stale patch refs, skip coordinator leases, or bypass focused/global gates. If the manifest is empty, no continuation wave is needed for reruns.

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

For landed-code confidence, read `autoDrain.summary.finalGateOk` and
`autoDrainArtifacts.summary.finalGateOk` before trusting `ok`. The detailed
`finalGateSummary` records the ordered coordinator gates for each autonomous
decision, including `failed` gates and required gates skipped after an earlier
required failure. A `rejected` decision is terminal queue evidence, not green
code: required-gate failures keep `finalGateOk: false`, list the failed and
skipped required gate names, and write `rollbackEvidence` showing the reverse
apply status, any cleanup commands, and whether the bundle's `changedPaths`
were clean afterward. Autonomous apply only records a required-gate failure as
`rejected` after that changed-path cleanliness proof passes; otherwise it records
`failed` for coordinator triage.

After a run, use `coordinator-dashboard.json.operatorSummary` for human-facing queue status. It is the display contract for the top-line status, headline, cards, and counts; use lower-level queue metadata only when drilling into diagnostics. Treat blocker UI as reserved for `operatorSummary.status === "blocked"`, the true-blockers card, or explicit `humanQuestions`.

`humanQuestions` is intentionally narrower than every blocked-looking artifact. A dashboard human question must come from the latest autonomous decision for that queue item, have `status: "human-blocked"`, and carry the structured worker contract as its `reason`: `human-question: owner=<role>; surface=<package/path>; missing-authority=<policy|fact|approval>; question=<single answerable question>; answer-code=<approve|reject|choose:<option-id>|provide:<fact-id>>`. Generic ownership notes, question-marked stale/rerun records, `conflict-blocked`, failed/rejected applies, coordinator review tasks, discovery evidence, and generated evidence stay in their queue buckets and must not populate `humanQuestions`.

Human answers feed back through `human-action-answers.jsonl` at the run root by default; `human-answers.jsonl` and `operator-answers.jsonl` are also recognized, API callers can pass `humanAnswerLogPath` in auto-drain options, and CLI users can pass `--auto-drain-human-answer-log`. Each JSONL answer should identify the question by `questionId`, `questionCode`, `decisionId`, `queueItemId`, `taskId`, or `jobId`, and may include `answer`, `route`, and `evidencePath`/`evidencePaths`. Auto-drain writes `auto-drain/human-answer-routing.json` when an answer log exists. Answered question ids/codes are removed from open `humanQuestions` and appear as routed answers in `humanQuestions.routed*`, `humanQuestions.answerLogPaths`, `humanQuestions.answerEvidencePaths`, and `queueMetadata.humanAnswers`; routed records also preserve the parsed question contract and answer text for continuation prompts or rerun manifests. The original autonomous decision ledger remains append-only. If a worker question is still a queue `block` assignment rather than an apply decision, a matching answer is routed as a continuation and removes that queue item from open true-blocker counts.

If auto-drain is disabled or you want to drain a previous run explicitly, use `autonomous-apply`:

```sh
frontier-swarm-codex autonomous-apply \
  --run agent-runs/my-run \
  --focused-command "npm test" \
  --global-command "npm run typecheck" \
  --global-glob "src/**"
```

`autonomous-apply` is also available as `drain`. It takes a repository-local lock, reads the `ready-to-apply` bundles, re-checks patches against the current head, applies each admitted patch, runs focused and matching global gates, and writes `autonomous-apply.json` plus `autonomous-queue-overlay.json`. Use `--dry-run` to check patches without changing the checkout. Use `--allow-dirty` only when the current dirty state is intentional and already understood.

## Commit Mode

Use commit mode when the repository policy allows the coordinator to create one small
commit per admitted bundle and the configured gates are sufficient proof for landing.
For the default `run` auto-drain path, pass `--auto-drain-commit`. For a later explicit
`frontier-swarm-codex autonomous-apply` or `frontier-swarm-codex drain`, pass
`--commit`.

Leave commit mode off for exploratory swarms, dirty coordinator windows, or repositories
where a human must batch, squash, amend, or inspect the final diff before committing.
Commit mode does not make a bundle more admissible: the bundle still needs clean
ownership, current-head patch checks, successful apply, and required gates.

The coordinator-created commit message must identify the source bundle and queue work.
The built-in subject is `Autonomous apply: <taskId-or-jobId>` and the body records the
decision kind, status, reason, job id, task id, queue item ids, lock scope, lock keys,
and bundle path. Treat the commit as a Git audit link, not as the queue database; the
`autonomous-merge-decisions.jsonl` line remains the source of truth for `queueItemIds`,
the decision reason, command output, and the new head recorded in `headAfter` and
`commit`.

When commit mode succeeds, the terminal decision is `committed` and the queue items in
that decision are satisfied. When `git add` or `git commit` fails, the terminal outcome
is not satisfied: autonomous apply records `failed`, resets staged paths after a commit
failure, attempts to reverse-apply the patch, and leaves the item for operator triage,
rerun, or repair depending on the recorded command tails.

## Consume Coordinator-Agent Drain Work

When auto-drain is enabled, workers hand off evidence and the coordinator consumes drain work from generated artifacts:

1. Start from `auto-drain/collection-NN/hierarchical-merge-queue.json` to see each bundle's queue action and scope.
2. Open `auto-drain/coordinator-agent-drain-work-NN.json` for the generic coordinator-agent contract. Use `leases[]` to serialize work for a queue scope, `assignments[]` to know the assigned action, `terminalDecisions[]` to close terminal queue items, and `promotedWork[]` to route useful non-terminal work upward.
3. Open `auto-drain/coordinator-agent-drain-NN.json` when using `frontier-swarm-codex` auto-drain. Its selected/deferred layer tells you which local queue leader is being attempted in that iteration.
4. Open `auto-drain/apply-NN/autonomous-merge-decisions.jsonl` for the terminal source outcome of selected patch work.

For scaled runs, assign coordinator agents by lease scope rather than by raw bundle count. Multiple agents can classify independent semantic/path scopes at the same time, but the same `leaseKey` should have one active local leader. If work outgrows a local scope, promote it upward and let the parent scope serialize the broader decision. Do not let two agents independently apply patches to the same checkout; apply remains centralized through autonomous apply and its lock records.

Treat `queue-local` and `promote` as unresolved coordinator work, not human questions. `queue-local` stays in the same scope until capacity or the local leader changes. `promote` becomes parent-queue work and remains non-terminal until that parent queue applies, queues, reruns, rejects, records, or blocks it. Treat `rerun`, `reject`, `record-only`, and true `block` as terminal queue decisions; stale/rerun cleanup should close the old bundle and create a fresh narrow task only when the objective is still valuable. Ask a human only for an explicit structured `human-question:` contract that names the missing authority, owner, surface, and policy/risk choice.

## Interpret Outcomes

Collection sorts worker output into buckets before apply:

- `ready-to-apply`: verified, ownership-clean bundles that can be considered for autonomous apply.
- `coordinator-review`: useful patches or findings that need coordinator porting, review, or promotion. This is queue pressure, not a blocker by itself.
- `failed-evidence`: failed workers, ownership violations, failed required commands, or evidence-poor output. Reject or rerun from the evidence unless it names an explicit missing-authority question.
- `stale-against-head`: patches that no longer apply to the current head.

Auto-drain may defer a ready bundle because of limits such as changed paths, changed regions, high-risk flags, or per-iteration caps. Deferred is not the same as rejected, blocked, or applied; it means the coordinator should review the admission record or run another drain with adjusted limits.

Autonomous apply decisions are the final source of truth for a bundle:

- `applied`: the patch applied and required gates passed. Review the final diff and continue with normal repository gates.
- `committed`: same as applied, but the drain also created a traceable commit because `--auto-drain-commit` or `--commit` was requested. The decision closes its queue items as satisfied.
- `checked`: dry-run mode proved the patch would apply under the lock; run a non-dry drain or apply manually.
- `rejected`: the patch was applied, a required gate failed, and the patch was rolled back. Inspect the decision commands and worker evidence before asking for a narrower fix.
- `rerun`: the bundle was stale against the current head or the head changed during checking. Rerun that task against the updated base.
- `conflict-blocked`: `git apply --check` failed. Port manually or rerun the worker with current source refs.
- `human-blocked`: the bundle needs a human decision because the recorded reason names missing authority, parent assignment, ownership, or policy/risk approval. A human coordinator must decide whether to port, split, or reject it.
- `skipped`: there was no source patch to apply, usually a discovery-only result.
- `failed`: apply infrastructure failed, such as git, lock, branch, rollback, or commit operations. Failed commit attempts attempt rollback and must not be counted as satisfied; leave them unresolved until a later `applied`, `committed`, `rejected`, `rerun`, `conflict-blocked`, or `human-blocked` decision replaces the failed state.

## Operator Checklist

Before calling the run done:

- Confirm `swarm-results.json` and `auto-drain/auto-drain.json` agree on the remaining ready, blocked, and terminal counts.
- Read every non-terminal or blocked decision in `autonomous-merge-decisions.jsonl`.
- Review the repository diff and changed paths, even when auto-drain reports success.
- Run the repository gates that matter for the touched surface.
- Rerun stale tasks or create follow-up tasks for rejected, conflict-blocked, or human-blocked bundles.
- Keep the evidence path in the handoff so another operator can replay the decision trail without reading raw worker logs first.
