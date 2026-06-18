# Autonomous Lock Model

`frontier-swarm-codex` currently protects autonomous bundle application with one repo-local lock. The lock is a physical file created with exclusive open semantics before any ready bundle is checked or applied by `applyCodexSwarmAutonomously`. By default the file lives at Git's repo-local path for `frontier-swarm/autonomous-apply.lock`; if that path cannot be resolved, the runner falls back to `autonomous-apply.lock` under the autonomous apply output directory.

The lock file records a token, process id, working directory, dry-run mode, acquisition time, and expiry time. A caller waits for the file until `lockTimeoutMs`; an expired or unreadable stale lock can be removed after `lockStaleMs`. Release removes the file only when the stored token matches the in-memory token, so a later owner is not accidentally unlocked by an older process.

This physical repo-local lock is intentionally coarse today. It serializes all autonomous apply decisions for the repository, including dry-run checks, patch application, verification gates, rollback, and optional commit creation. The implementation does not yet acquire independent file leases or semantic leases for concurrent application.

## Decision Lock Keys

Each autonomous merge decision still records lock key metadata for the bundle it handled. The metadata is derived from the merge bundle before the patch is checked:

- Semantic lock keys are used first when `changedRegions` is present. Each region becomes a `region:<region>` key, and the decision `lockScope` is `semantic`.
- Path lock keys are used when there are no semantic regions but `changedPaths` is present. Paths are normalized as workspace paths and recorded as `path:<file>`, with `lockScope` set to `path`.
- Repo lock keys are the fallback when the bundle has neither changed regions nor changed paths. The fallback key is `repo:*`, with `lockScope` set to `repo`.

The autonomous apply result summarizes the unique lock keys and counts decisions by `semantic`, `path`, and `repo` scope. This makes later review and queue overlays aware of the intended conflict surface even though the current physical lock remains repository-wide.

## Stale Head Checks

Stale head checks happen before and during autonomous apply:

- Collection marks a bundle `stale-against-head` when its patch no longer passes `git apply --check` against the current repository head, unless stale checking is disabled.
- Autonomous apply refuses bundles already marked stale and returns a `rerun` decision with the reason that the bundle is stale against the current repository head.
- Under the repo-local lock, autonomous apply records `HEAD` before `git apply --check`, checks the patch, then reads `HEAD` again. If the head changed while the patch was being checked, the decision becomes `rerun`.
- For non-dry-run applies, required verification gates run after patch application. Failed required gates roll the patch back, and commit failures also attempt reset and rollback.

These checks are separate from the lock file's own stale expiry. Lock expiry handles abandoned lock files; stale head checks handle patches that are no longer valid for the current repository state.

## Future Finer-Grained Leases

A future finer-grained lease implementation can use the existing lock key metadata to allow compatible bundles to run concurrently, but it should preserve the current safety properties:

- Keep the repo-local lock or an equivalent repository mutation guard for operations that are not safely parallel, especially Git index, branch, apply, rollback, and commit operations.
- Treat semantic keys as stronger ownership signals than path keys when both are available, and keep the `repo:*` fallback for unscoped or evidence-only bundles.
- Preserve decision records with `lockScope`, `lockKeys`, `lockPath` or lease location, and a per-owner token so merge admission and queue overlays remain auditable.
- Keep stale head checks at collection time and immediately before mutation. A finer-grained lease must not apply a patch just because its semantic or path lease was available.
- Preserve timeout, stale lease expiry, and token-checked release behavior so abandoned workers do not permanently block the queue and old workers cannot release newer owners.
- Continue to record conflict-blocked, human-blocked, rerun, checked, applied, committed, rejected, skipped, and failed decisions in the same decision log shape.

In short, the current implementation is a coarse repo-local lock with fine-grained metadata. Future leases should improve concurrency without weakening repository-head validation, ownership auditability, or conservative fallback behavior.
