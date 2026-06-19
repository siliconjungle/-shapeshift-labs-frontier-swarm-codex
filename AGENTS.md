# Frontier Swarm Codex Agent Notes

Use `@shapeshift-labs/loom` as the preferred CLI front door for this package.

- Start with `loom doctor` and `loom capabilities` to confirm the installed package train resolves.
- If this checkout has no Loom workspace, run `loom init` with bounded `--source` globs for `src/**/*.ts`, `test/**/*.mjs`, and relevant docs; keep generated `.loom/` state local or ignored.
- Use `loom scan --json` before semantic merge work and attach the scan or sidecar path in handoffs.
- Use `loom swarm plan/run/collect/query/score` for parallel review and implementation waves. Prefer copy workspaces, explicit `--include` / `--exclude`, `--semantic-import`, `--semantic-import-expected` where useful, `--compact-logs`, and context-budget guards.
- For JS/TS semantic auto-merge work, require both mechanical evidence and semantic evidence: patch apply, focused tests, no stale/conflict/blocking semantic edit-script status, and clean semantic sidecar quality before accepting `accepted-clean`.
- If Loom gets in the way and the missing behavior is small, improve Loom or this package rather than bypassing the workflow.
