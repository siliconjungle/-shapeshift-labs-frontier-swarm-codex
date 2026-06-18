# Autonomous Lock Model

`frontier-swarm-codex` currently protects autonomous bundle application with one repo-local lock. The lock is a physical file created with exclusive open semantics before any ready bundle is checked or applied by `applyCodexSwarmAutonomously`. By default the file lives at Git's repo-local path for `frontier-swarm/autonomous-apply.lock`; if that path cannot be resolved, the runner falls back to `autonomous-apply.lock` under the autonomous apply output directory.

The lock file records a token, process id, working directory, dry-run mode, acquisition time, and expiry time. A caller waits for the file until `lockTimeoutMs`; an expired or unreadable stale lock can be removed after `lockStaleMs`. Release removes the file only when the stored token matches the in-memory token, so a later owner is not accidentally unlocked by an older process.

This physical repo-local lock is intentionally coarse today. It serializes all autonomous apply decisions for the repository, including dry-run checks, patch application, verification gates, rollback, and optional commit creation. The implementation does not yet acquire independent file leases or semantic leases for concurrent application.

## Queue Leases Versus Mutation Locks

Coordinator-agent queue leases and autonomous apply locks protect different resources:

- Queue leases protect decision ownership for a scope. A lease key can represent a
  semantic region, path, lane, parent queue, or repository fallback scope. It lets one
  coordinator agent become the local leader while other agents drain independent scopes.
- Mutation locks protect the repository checkout. Patch checking, patch application,
  rollback, Git index updates, branch movement, and optional commit creation must not
  race in the same checkout.

The scalable path is therefore parallel classification with serialized mutation.
Coordinator agents can lease different queue scopes, decide whether work should apply
locally, queue locally, promote, rerun, reject, record only, or block, and write those
artifacts independently. Once a patch is selected for repository mutation, it must pass
through autonomous apply and record a ledger decision under the mutation lock.

Same-scope work should serialize behind the local queue leader. Cross-scope work should
promote to the nearest parent scope that can safely decide it. Neither state is a
human blocker by itself; only explicit `block` or `human-blocked` records that name a
missing authority, owner, surface, or policy/risk decision should stop automation for a
person.

## Decision Lock Keys

Each autonomous merge decision still records lock key metadata for the bundle it handled. The metadata is derived from the merge bundle before the patch is checked:

- Semantic lock keys are used first when `changedRegions` is present. Each region becomes a `region:<region>` key, and the decision `lockScope` is `semantic`.
- Path lock keys are used when there are no semantic regions but `changedPaths` is present. Paths are normalized as workspace paths and recorded as `path:<file>`, with `lockScope` set to `path`.
- Repo lock keys are the fallback when the bundle has neither changed regions nor changed paths. The fallback key is `repo:*`, with `lockScope` set to `repo`.

The autonomous apply result summarizes the unique lock keys and counts decisions by `semantic`, `path`, and `repo` scope. This makes later review and queue overlays aware of the intended conflict surface even though the current physical lock remains repository-wide.

## Stale Head Checks

Stale head checks happen before and during autonomous apply:

- Collection marks a bundle `stale-against-head` when its patch no longer passes `git apply --check` against the current repository head, unless stale checking is disabled.
- Collection records the head it checked as `metadata.frontierSwarmCodex.collection.head` on each collected bundle when Git can provide one.
- Autonomous apply refuses bundles already marked stale and returns a `rerun` decision with the reason that the bundle is stale against the current repository head.
- Under the repo-local lock, autonomous apply records the current `HEAD` before `git apply --check`. If the collected head exists and differs from the locked current head, the decision becomes `rerun` when the patch still checks cleanly, or `conflict-blocked` when `git apply --check` fails. The decision records the collected head in `headBefore` and the locked current head in `headAfter`.
- If the collected head matches, autonomous apply checks the patch, then reads `HEAD` again. If the head changed while the patch was being checked, the decision becomes `rerun`.
- For non-dry-run applies, required verification gates run after patch application. Failed required gates roll the patch back, and commit failures also attempt reset and rollback.

These checks are separate from the lock file's own stale expiry. Lock expiry handles abandoned lock files; stale head checks handle patches that are no longer valid for the current repository state.

## Commit Phase Under The Lock

Commit mode keeps the same repo-local lock through patch application, required gates,
`git add`, `git commit`, and rollback. Use `--auto-drain-commit` for the default
`run` auto-drain path and `--commit` for an explicit `autonomous-apply` or `drain`
pass. Both modes create one commit per admitted bundle only after the patch and gates
have already succeeded.

The commit message must keep the bundle and queue work traceable. The built-in subject
is `Autonomous apply: <taskId-or-jobId>` and the body records the job id, queue item
ids, lock scope, lock keys, and bundle path. The decision record remains the
authoritative queue contract. A successful commit records `committed`, closes the
decision's `queueItemIds`, and leaves the new commit head in `headAfter` and `commit`.

If `git add` fails, autonomous apply attempts to reverse-apply the patch before
returning `failed`. If `git commit` fails, it first resets the bundle's changed paths,
then attempts to reverse-apply the patch. A successful rollback leaves no satisfied
queue item; a rollback failure leaves a `failed` decision whose command tails are the
operator repair evidence. Future finer-grained leases must preserve this commit and
rollback serialization because Git index, worktree, and branch mutation are not safely
parallel.

## Future Finer-Grained Leases

A future finer-grained lease implementation can use the existing lock key metadata to allow compatible bundles to run concurrently, but it should preserve the current safety properties:

- Keep the repo-local lock or an equivalent repository mutation guard for operations that are not safely parallel, especially Git index, branch, apply, rollback, and commit operations.
- Treat semantic keys as stronger ownership signals than path keys when both are available, and keep the `repo:*` fallback for unscoped or evidence-only bundles.
- Preserve decision records with `lockScope`, `lockKeys`, `lockPath` or lease location, and a per-owner token so merge admission and queue overlays remain auditable.
- Keep stale head checks at collection time and immediately before mutation. A finer-grained lease must re-read the repository head after acquiring the relevant queue or repo lease and must not apply a patch just because its semantic or path lease was available.
- Preserve timeout, stale lease expiry, and token-checked release behavior so abandoned workers do not permanently block the queue and old workers cannot release newer owners.
- Continue to record conflict-blocked, human-blocked, rerun, checked, applied, committed, rejected, skipped, and failed decisions in the same decision log shape.

In short, the current implementation is a coarse repo-local lock with fine-grained metadata. Future leases should improve concurrency without weakening repository-head validation, ownership auditability, or conservative fallback behavior.
