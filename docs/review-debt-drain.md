# Review Debt Drain Policy

`coordinator-review` is a drain queue, not a parking lot. A worker result may enter the queue when it has produced a merge bundle, handoff, trace, or failure record that needs a coordinator decision. The coordinator's job is to collapse every entry into terminal decisions quickly enough that future runs can reason from queue overlays instead of rediscovering old review state.

This policy applies to `frontier-swarm-codex` collection buckets, reviewer lane plans, autonomous apply decisions, and any project queue that mirrors those artifacts.

## Drain Invariants

- Every reviewed item must leave a machine-readable decision: satisfied, rejected, stale-against-head, blocked, discovery-only, or rerun.
- `coordinator-review` should shrink during review. Stale, conflicting, failed, and evidence-poor worker outputs are coordinator decisions to reject, close as stale, record, or rerun; they are not reasons to accumulate human review debt.
- A reviewer note is not enough. Record the job id, queue item id, source bucket, changed paths, evidence path, command or gate used, decision reason, and any follow-up task id.
- Prefer terminal decisions over commentary. If a bundle can be accepted, rejected, skipped, or rerun from current evidence, do that instead of leaving it in `coordinator-review`.
- Do not let one unclear item pin unrelated work. Split follow-up tasks by ownership surface, changed path, or required oracle.
- Re-review against current head. A result that was useful yesterday can become stale work after another slice lands.

## Priority Order

1. Drain existing terminal overlays first. If `autonomous-queue-overlay.json`, `auto-drain.json`, or a collection already records applied, committed, checked, rejected, skipped, or rerun outcomes, mirror those outcomes into the project queue and remove the matching `coordinator-review` item.
2. Admit low-risk `ready-to-apply` bundles next. Re-run `git apply --check`, focused gates, and any matching global gates under the auto-drain lock. If the patch applies and gates pass, mark the item satisfied. If gates fail, reject it with failed evidence unless the failure exposes a precise new task.
3. Review `needs-human-port` bundles only when they contain a useful patch or source map that cannot safely be auto-applied. Port the smallest defensible hunk, run the same gates, and then mark the original worker result satisfied, rejected, or rerun. Do not keep the worker result open after a manual port decision.
4. Collapse stale and conflicting work before reading it deeply. If the patch is stale against head, touches superseded files, depends on an already rejected approach, conflicts with accepted or queued work, or cannot apply cleanly because accepted work moved the surface, mark it `stale-against-head`, reject it, or queue a narrower rerun. Queue a fresh shard only when the original objective is still valuable.
5. Collapse failed evidence and evidence-poor results. Missing patches, failed required commands, contradictory handoffs, unproven claims, or logs without enough context are not coordinator blockers. Mark them failed evidence or discovery-only, then spawn a narrower rerun only if there is a concrete hypothesis worth testing.
6. Escalate true human blockers last and rarely. A blocked result should name the human decision, owner, file or package surface, and exact question that the coordinator cannot answer locally.

## Terminal Decisions

Terminal decisions are the only acceptable end state for `coordinator-review` entries:

- `satisfied`: the patch was applied, committed, or deliberately checked for a dry-run workflow, and required gates are recorded.
- `rejected`: the candidate was tested enough to prove it should not land in its current form.
- `stale-against-head`: the result is based on old repository state and should not be reviewed as a current patch.
- `rerun`: the old result is closed and a new, narrower task owns the remaining objective.
- `discovery-only`: the result produced useful context but no patch candidate; attach the artifact and close the review item.
- `blocked`: a rare explicit human question remains after the coordinator has ruled out auto-drain, manual port, rejection, stale closure, discovery recording, and rerun.

Do not use "needs review" as a terminal state. It is an input condition, not an outcome.

## Blocked Versus Failed Or Stale

A result is genuinely blocked only when the coordinator cannot make a correct terminal decision without information or authority outside the worker system. Common human blockers are:

- ownership or package-boundary approval for paths outside the task's allowed writes,
- a product, API, security, release, or credential decision that is not encoded in the task,
- unavailable private data, secrets, fixtures, or access required to prove the change,
- conflicting accepted work where the package owner must choose one design,
- missing acceptance criteria that would change the expected behavior, not merely the verification command.

Do not call these cases blocked:

- The worker crashed, timed out, or exited nonzero. That is failed evidence.
- A required gate failed after applying the patch. That is failed evidence, usually a rejection.
- The patch is missing, malformed, or lacks changed paths. That is failed evidence or discovery-only.
- The patch no longer applies to current head. That is stale work.
- The patch conflicts with current accepted work or another queued candidate. That is queue pressure for the coordinator to reject, mark stale, promote, or rerun.
- The handoff claims success but omits commands, evidence files, changed paths, or acceptance mapping. That is evidence-poor failed evidence.
- The worker changed disallowed files. That is failed evidence unless the parent explicitly expands ownership.

Evidence-poor results may still contain useful clues, but they should become compact follow-up tasks, not long-lived review debt.

## Coordinator Checklist

For each `coordinator-review` item:

1. Locate `merge.json`, `changes.patch`, `last-message.md`, verification output, semantic sidecars, and evidence paths.
2. Assign the source bucket: `ready-to-apply`, `needs-human-port`, `failed-evidence`, or `stale-against-head`.
3. Re-check current-head applicability before reading large handoffs.
4. Run the smallest command set that proves or rejects the candidate.
5. Write a terminal queue overlay entry with reasons and follow-up task ids.
6. Delete or ignore duplicate review items that point at the same terminal decision.

The coordinator should optimize for shrinking unresolved review count while preserving evidence quality. The best review pass leaves fewer active questions, clearer rerun shards, and no ambiguous worker result waiting for someone else to classify it.
