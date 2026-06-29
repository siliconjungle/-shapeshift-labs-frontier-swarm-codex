# @shapeshift-labs/frontier-swarm-codex

Node Codex CLI runner adapter for Frontier swarm plans.

`frontier-swarm-codex` executes `@shapeshift-labs/frontier-swarm` plans with the Codex CLI. It owns Node process spawning, prompt rendering, worktree/snapshot workspace setup, command shaping, JSONL output capture, last-message capture, optional verification commands, changed-path ownership checks, and swarm result/proof artifacts.

The default swarm compute profile records `gpt-5.5` with `model_reasoning_effort="xhigh"` for planning. The Codex CLI invocation defaults to the local Codex config instead of forwarding planned model flags, because model availability and accepted flag values vary by Codex binary and account. Pass `--model ...`, `--model-policy plan`, or `modelPolicy: 'plan'` when a runner should force the planned profile. Runners can bound model spawning with `--available-model`, `--unavailable-model`, and `--fallback-model`; unsupported requested models fail before spawn unless the fallback is also allowed, and each job writes `evidence/model-availability.json` with the decision status and reason. The pure `frontier-swarm` package stays runtime-neutral.

## Worktree Retention

Copied and snapshot workspaces are disposable after their run has been collected and useful evidence has been written under `agent-runs`. Use `cleanup-worktrees` to audit or prune them:

```sh
frontier-swarm-codex cleanup-worktrees \
  --root agent-worktrees/frontier-swarm-codex \
  --evidence-root agent-runs/frontier-swarm-codex \
  --min-age-hours 24
```

Cleanup is dry-run by default. It skips workspaces with live PIDs and, unless `--allow-uncollected` is passed, skips runs without `collected/collection.json`. Destructive cleanup requires `--delete`, so patches, handoffs, semantic sidecars, dashboards, merge indexes, and retained traces stay in the evidence directory before scratch workspaces are removed.

## Evidence Indexing

Durable swarm evidence should be queryable without keeping every copied workspace. Use `index-artifacts` to write a portable JSON/JSONL manifest plus a best-effort local SQLite index when `node:sqlite` is available:

```sh
frontier-swarm-codex index-artifacts \
  --root agent-runs/frontier-swarm-codex \
  --outDir agent-runs/frontier-swarm-codex-index
```

For large roots, prefer summary mode so the command writes `artifacts.jsonl`, `artifacts-summary.json`, and SQLite without also serializing every entry into one large pretty JSON file:

```sh
frontier-swarm-codex index-artifacts \
  --root agent-runs/frontier-swarm-codex \
  --outDir agent-runs/frontier-swarm-codex-index \
  --no-json \
  --summary-only
```

For large text artifacts, `compact-artifacts` or `index-artifacts --compress` writes `.gz` siblings and records both original and compressed paths when available. This includes JSON, JSONL, logs, patches, Markdown handoffs, semantic sidecars, collected query bundles, dashboards, and traces above the configured threshold. Originals are retained by default; retained `.gz` siblings are folded into the original artifact entry on later indexing instead of becoming duplicate logical artifacts. Removing originals requires `--replace-originals` after the compressed copy has been written. The intended long-term storage model is JSONL for portable metadata, optional SQLite for run/job/artifact lookup, and compressed blob storage for large traces and semantic evidence.

Use `query-artifacts` to inspect the SQLite index without hand-writing SQL:

```sh
frontier-swarm-codex query-artifacts \
  --sqlite agent-runs/frontier-swarm-codex-index/artifacts.sqlite \
  --kind semantic-imports \
  --order bytes-desc \
  --limit 20
```


## Related Packages

The published Frontier package family is generated from one shared package catalog so READMEs stay in sync across packages:

- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier): Core JSON diff/apply, compact patch tuples, JSON Pointer, equality, clone, validation, Unicode helpers, and tiny dependency-free runtime budget/scheduler primitives.
- [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query): Shared query-key, selector path, condition, entity identity, and table-shape primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): Patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): Stateful planned diff engine, adaptive profiles, schema plans, and engine-level history helpers.
- [`@shapeshift-labs/frontier-state`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state): Patch-routed app-state subscriptions, owned commits, maintained views, and path mapping.
- [`@shapeshift-labs/frontier-dataflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dataflow): Serializable incremental dataflow and materialized-view graphs for Frontier apps, including selectors, dependency DAGs, filters, joins, aggregations, stale paths, recompute budgets, output patches, provenance records, and proof of why derived views changed.
- [`@shapeshift-labs/frontier-state-cache`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache): Normalized query-result cache with entity/query watchers, persistence, change logs, optimistic layers, scheduled persistence, and mutation bridge.
- [`@shapeshift-labs/frontier-state-cache-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-idb): IndexedDB persistence adapter for Frontier state-cache snapshots and durable change logs.
- [`@shapeshift-labs/frontier-state-cache-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-file): Structured file persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-state-cache-sql`](https://www.npmjs.com/package/@shapeshift-labs/frontier-state-cache-sql): SQL persistence adapter for Frontier state-cache snapshots and change logs.
- [`@shapeshift-labs/frontier-schema`](https://www.npmjs.com/package/@shapeshift-labs/frontier-schema): JSON Schema validation, Frontier profile generation, CloudEvent envelopes, and query/table schema helpers.
- [`@shapeshift-labs/frontier-migrations`](https://www.npmjs.com/package/@shapeshift-labs/frontier-migrations): Boundary-first data migrations, import normalization, plugin/API version mapping, versioned envelopes, graph diagnostics, patch path rewrites, dry-run reports, and current-shape rehydration.
- [`@shapeshift-labs/frontier-event-log`](https://www.npmjs.com/package/@shapeshift-labs/frontier-event-log): Bounded event logs, replay cursors, consumer acknowledgements, keyed compaction, checkpoints, and Frontier patch event records.
- [`@shapeshift-labs/frontier-run`](https://www.npmjs.com/package/@shapeshift-labs/frontier-run): Append-only distributed run graphs, causal event DAGs, evidence nodes, lanes, leases, refs, segments, dashboard projections, and admission decision records for Frontier agent work.
- [`@shapeshift-labs/frontier-lease`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lease): Runtime-neutral semantic, file, package, and repository lease claims with fencing tokens, expiry, conflict checks, apply validation, and replayable evidence for Frontier collaboration.
- [`@shapeshift-labs/frontier-inspect`](https://www.npmjs.com/package/@shapeshift-labs/frontier-inspect): Cross-package inspection/evidence bundles, registry graph snapshots, feature/resource impact reports, timeline/event normalization, redaction, JSONL import/export, and AI-readable app feature maps.
- [`@shapeshift-labs/frontier-runtime-proof`](https://www.npmjs.com/package/@shapeshift-labs/frontier-runtime-proof): Runtime-neutral proof capsules, source-bound runtime telemetry, and admission evidence helpers for Frontier merge and review workflows.
- [`@shapeshift-labs/frontier-scheduler`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scheduler): Deterministic work scheduling, lanes, cancellation, backpressure, frame policies, replay snapshots, and work graphs.
- [`@shapeshift-labs/frontier-logging`](https://www.npmjs.com/package/@shapeshift-labs/frontier-logging): Opt-in structured logging, browser telemetry, scheduled sinks, file sinks, exporters, benchmark traces, and Frontier patch/update summaries.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): Explicit mutation and selector plans compiled to Frontier patches or CRDT operations.
- [`@shapeshift-labs/frontier-effects`](https://www.npmjs.com/package/@shapeshift-labs/frontier-effects): Serializable effect descriptors and resource graphs for Frontier apps, including fetch, storage, timers, navigation, workers, clipboard, broadcast, WebSocket, stream, policy metadata, runtime records, redaction, JSONL, proof helpers, and registry graph output.
- [`@shapeshift-labs/frontier-auth`](https://www.npmjs.com/package/@shapeshift-labs/frontier-auth): Frontier-native auth contracts for providers, sessions, profile completeness, route and resource gates, account-linking policy, token issue/verify plans, runtime grants, audit events, registry graphs, lint resources, and auth evidence without owning app secrets, crypto, storage, or provider SDKs.
- [`@shapeshift-labs/frontier-policy`](https://www.npmjs.com/package/@shapeshift-labs/frontier-policy): Serializable policy and capability decisions for Frontier apps, effects, views, sync, routes, traces, and AI tools.
- [`@shapeshift-labs/frontier-flags`](https://www.npmjs.com/package/@shapeshift-labs/frontier-flags): Patchable policy-aware feature flag state for Frontier apps, including targeting, deterministic rollouts, experiment variants, kill switches, exposure records, audit logs, and replay evidence.
- [`@shapeshift-labs/frontier-tools`](https://www.npmjs.com/package/@shapeshift-labs/frontier-tools): Serializable app action/tool manifests for AI-operable Frontier apps, including availability, validation, dry-run plans, patch previews, effect/tool constraints, execution records, rollback links, and registry graph output.
- [`@shapeshift-labs/frontier-sandbox`](https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox): Runtime-agnostic sandbox contracts for Frontier patch-producing actions, including manifests, declared reads/writes/capabilities, host-validated patch/effect/event/log results, dynamic source modules, source event replay, and structural runtime adapters.
- [`@shapeshift-labs/frontier-sandbox-quickjs`](https://www.npmjs.com/package/@shapeshift-labs/frontier-sandbox-quickjs): QuickJS/WebAssembly runtime adapter for Frontier sandbox actions, including invocation/runtime isolation modes, deadline and memory limits, dynamic source execution, and patch/effect result normalization.
- [`@shapeshift-labs/frontier-workflow`](https://www.npmjs.com/package/@shapeshift-labs/frontier-workflow): Serializable durable workflow/process manifests for Frontier apps, including steps, waits, approvals, timers, retries, expected patches, compensation, records, timelines, and registry graph output.
- [`@shapeshift-labs/frontier-worker`](https://www.npmjs.com/package/@shapeshift-labs/frontier-worker): Serializable worker and edge task descriptors for Frontier apps, including queues, idempotency keys, retry and timeout policy, declared reads/writes/effects, snapshots, patch outputs, produced assets, execution records, logs, trace links, proof hashes, dedupe indexes, and registry graph output.
- [`@shapeshift-labs/frontier-queue`](https://www.npmjs.com/package/@shapeshift-labs/frontier-queue): Serializable durable queue state, leases, retries, dedupe keys, patch-carrying jobs, dead-letter records, replay evidence, and queue inspection for Frontier apps.
- [`@shapeshift-labs/frontier-swarm`](https://www.npmjs.com/package/@shapeshift-labs/frontier-swarm): Hierarchical swarm plans, lanes, compute profiles, ownership policy, semantic ownership regions, task queues, event streams, run records, merge bundles, merge indexes, queue overlays, merge admission, coordinator dashboards, changed-path checks, and proof artifacts for Frontier agent work.
- [`@shapeshift-labs/frontier-swarm-git`](https://www.npmjs.com/package/@shapeshift-labs/frontier-swarm-git): Node Git, workspace, patch, changed-path, write-fence, package-link repair, patch check, HEAD read, blob hash, and apply-ledger adapter for Frontier swarm runners.
- [`@shapeshift-labs/frontier-loom-ui`](https://www.npmjs.com/package/@shapeshift-labs/frontier-loom-ui): Read-only Loom and Frontier operator dashboard for workspace-lifetime progress, active agents, queue state, evidence/admission status, run events, run-log sync projections, semantic leases, gate executions, git apply/workspace evidence, and coordinator steering intent files.
- [`@shapeshift-labs/frontier-lang-kernel`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-kernel): Runtime-neutral semantic source graph, type/lattice/extern declarations, patch bundles, replay, hashing, evidence records, and merge-admission kernel for Frontier Lang.
- [`@shapeshift-labs/frontier-lang-parser`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-parser): Dependency-light Frontier Lang parser for modules, entities, state, actions, effects, types, externs, targets, and lattice declarations.
- [`@shapeshift-labs/frontier-lang-checker`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-checker): Checker and diagnostics for Frontier Lang semantic documents, including type symbols, effects, regions, lattice laws, CRDT metadata, and patch evidence.
- [`@shapeshift-labs/frontier-lang-typescript`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-typescript): TypeScript projection adapter for Frontier Lang semantic documents, including type/entity/state/action/extern declarations and CRDT lattice descriptors.
- [`@shapeshift-labs/frontier-lang-javascript`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-javascript): JavaScript projection adapter for Frontier Lang semantic documents, including ESM action stubs and schema/lattice descriptors.
- [`@shapeshift-labs/frontier-lang-jsx`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-jsx): Runtime-neutral JSX semantic merge evidence for Frontier Lang, including element identity, prop records, keyed children, spread props, source spans, and fail-closed renderer/runtime proof gaps.
- [`@shapeshift-labs/frontier-lang-svg`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-svg): Runtime-neutral SVG semantic merge evidence for Frontier Lang, including element identity, local id definitions, url/href reference graphs, source spans, and fail-closed paint/runtime proof gaps.
- [`@shapeshift-labs/frontier-lang-package`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-package): Runtime-neutral package manifest semantic merge evidence for Frontier Lang, including dependency, script, export/import, bin, workspace, package-manager, source-span, and fail-closed install/runtime proof gaps.
- [`@shapeshift-labs/frontier-lang-html`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-html): HTML semantic merge evidence and projection adapter for Frontier Lang semantic documents, including element tree identity, attributes, text/comment spans, source maps, and fail-closed browser/runtime proof gaps.
- [`@shapeshift-labs/frontier-lang-css`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-css): CSS semantic merge evidence and projection adapter for Frontier Lang semantic documents, including selector specificity, declaration/cascade keys, custom properties, `@property` and `@page` descriptor evidence, CSS Modules/ICSS export and composition evidence, source maps, and fail-closed browser cascade/render proof gaps.
- [`@shapeshift-labs/frontier-lang-rust`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-rust): Rust projection adapter for Frontier Lang semantic documents, including structs, aliases, and action stubs.
- [`@shapeshift-labs/frontier-lang-python`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-python): Python projection adapter for Frontier Lang semantic documents, including dataclasses, typed patch records, and action stubs.
- [`@shapeshift-labs/frontier-lang-c`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-c): C header projection adapter for Frontier Lang semantic documents, including structs and action prototypes.
- [`@shapeshift-labs/frontier-lang-compiler`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-compiler): Compiler facade for Frontier Lang source documents, including parse, check, hash, diagnostics, universal AST envelopes, proof/paradigm semantic summaries, projection to TypeScript, JavaScript, JSX, TSX, SVG, HTML, CSS, package manifests, Rust, Python, and C, and native source-import adapters for semantic merge evidence.
- [`@shapeshift-labs/frontier-lang-swift`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-swift): Swift source-language importer package for Frontier Lang semantic documents, including package-level metadata, SwiftSyntax adapter helpers, native import results, and semantic sidecar generation for SwiftSyntax/SwiftParser-shaped syntax trees.
- [`@shapeshift-labs/frontier-lang-kotlin`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-kotlin): Kotlin PSI source-language importer package for Frontier Lang semantic documents, including package-level metadata, Kotlin PSI adapter helpers, native import results, and semantic sidecar generation for Kotlin PSI/KtFile-shaped syntax trees.
- [`@shapeshift-labs/frontier-lang-java`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-java): Java source-language importer package for Frontier Lang semantic documents, including package-level metadata, Java AST adapter helpers, native import results, and semantic sidecar generation for javac/JDT/JavaParser-shaped ASTs.
- [`@shapeshift-labs/frontier-lang-go`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-go): Go source-language importer package for Frontier Lang semantic documents, including package-level metadata, Go AST adapter helpers, native import results, and semantic sidecar generation for go/ast File or Package trees.
- [`@shapeshift-labs/frontier-lang-csharp`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-csharp): C# Roslyn source-language importer package for Frontier Lang semantic documents, including package-level metadata, Roslyn adapter helpers, native import results, and semantic sidecar generation for SyntaxTree/SyntaxNode-shaped ASTs.
- [`@shapeshift-labs/frontier-lang-clang`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-clang): Clang AST source-language importer package for Frontier Lang semantic documents, including package-level metadata, Clang AST JSON adapter helpers, native import results, and semantic sidecar generation for C/C++ translation units.
- [`@shapeshift-labs/frontier-lang-cli`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-cli): Command line interface for parsing, checking, hashing, emitting, native source import/projection, semantic slicing, and corpus roundtrip evidence for Frontier Lang projects.
- [`@shapeshift-labs/frontier-lang`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang): Umbrella package for Frontier Lang kernel, parser, checker, compiler facade, universal AST helpers, projection adapters, HTML/CSS semantic merge evidence adapters, and source-language importer adapters.
- [`@shapeshift-labs/frontier-kv`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv): Serializable in-memory key/value state for Frontier apps, including TTL, versioned compare-and-set, batched patch mutations, scans, watchers, snapshots, JSONL event evidence, and replay verification.
- [`@shapeshift-labs/frontier-kv-locks`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-locks): Lease-style lock records on top of Frontier KV, including acquire, renew, release, fencing tokens, expiration, owner evidence, and replayable lock events.
- [`@shapeshift-labs/frontier-kv-rate-limit`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-rate-limit): Patch-native rate limit buckets for Frontier KV, including fixed windows, sliding windows, token buckets, deterministic refill, consume evidence, and reset records.
- [`@shapeshift-labs/frontier-kv-file`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-file): Node file persistence adapter for Frontier KV snapshots and append-only JSONL event logs, including atomic writes, compaction, replay loading, and adapter evidence.
- [`@shapeshift-labs/frontier-kv-idb`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-idb): IndexedDB persistence adapter for Frontier KV snapshots and event logs, with structural IDB interfaces, upgrade planning, compact event storage, and replay loading.
- [`@shapeshift-labs/frontier-kv-redis`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-redis): Redis-compatible command planning and structural client adapter for Frontier KV operations, including key mapping, TTL commands, optimistic CAS scripts, and replay evidence without bundling Redis drivers.
- [`@shapeshift-labs/frontier-kv-server`](https://www.npmjs.com/package/@shapeshift-labs/frontier-kv-server): Small Node HTTP server adapter for Frontier KV, including request planning, JSON endpoints for get/set/delete/scan/batch, optional rate-limit hooks, and replayable response evidence.
- [`@shapeshift-labs/frontier-assets`](https://www.npmjs.com/package/@shapeshift-labs/frontier-assets): Serializable asset and content provenance graphs for Frontier apps, including source files, generated variants, thumbnails, LOD chunks, shader/material dependencies, transforms, hashes, owners, runtime consumers, review plans, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-blueprint`](https://www.npmjs.com/package/@shapeshift-labs/frontier-blueprint): Serializable Blueprint/Prefab flyweight templates for Frontier apps, including parameterized instantiation, deterministic ID/path remapping, compact overrides, variants, effective-state materialization, scene/state patch emission, dependency metadata, and registry graph output.
- [`@shapeshift-labs/frontier-triggers`](https://www.npmjs.com/package/@shapeshift-labs/frontier-triggers): Capability-gated event trigger registry, scoped event envelopes, listener/reaction rules, structured rejection, deterministic event-to-action scheduling, replay/provenance records, and registry graph output.
- [`@shapeshift-labs/frontier-virtual`](https://www.npmjs.com/package/@shapeshift-labs/frontier-virtual): DOM-neutral virtualization, layout providers, range materialization, grids, spatial/frustum indexes, patch invalidation, camera anchors, and serializable layout state.
- [`@shapeshift-labs/frontier-table`](https://www.npmjs.com/package/@shapeshift-labs/frontier-table): Renderer-neutral data grid and table primitives for Frontier apps, including stable row identity, sorting, filtering, selection, virtual ranges, patch-driven edits, cache/dataflow descriptors, and CRDT-compatible row and cell operation frames.
- [`@shapeshift-labs/frontier-scene`](https://www.npmjs.com/package/@shapeshift-labs/frontier-scene): Patch-native 2D/3D scene graph, transform propagation, bounds queries, virtual/culling adapters, spatial invalidation, and camera/frustum materialization.
- [`@shapeshift-labs/frontier-pathfinding`](https://www.npmjs.com/package/@shapeshift-labs/frontier-pathfinding): Patch-native grid pathfinding, typed-array A*/Dijkstra search, flow fields, connected components, line-of-sight smoothing, dirty-cell invalidation, and scheduler-friendly path jobs.
- [`@shapeshift-labs/frontier-lod`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lod): Patch-native level-of-detail and significance selection for rendering and computation workloads, compact typed hot paths, multi-observer selection, budget degradation, materialization frames, and scheduler work plans.
- [`@shapeshift-labs/frontier-route`](https://www.npmjs.com/package/@shapeshift-labs/frontier-route): DOM-neutral app/game route resources, route and scene manifests, match/resolve/transition planning, dependency metadata, sessions, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-trace`](https://www.npmjs.com/package/@shapeshift-labs/frontier-trace): Serializable traces, spans, events, causal links, W3C trace context helpers, timeline/resource/path queries, critical-path analysis, registry graph output, JSONL/proof helpers, Chrome trace export, and redaction for app-wide feature observability.
- [`@shapeshift-labs/frontier-manifest`](https://www.npmjs.com/package/@shapeshift-labs/frontier-manifest): Build/static feature manifests for owners, routes, actions, states, migrations, tests, source files, assets, resources, tasks, dependency metadata, registry graph output, feature maps, JSONL export, and impact queries.
- [`@shapeshift-labs/frontier-view`](https://www.npmjs.com/package/@shapeshift-labs/frontier-view): Renderer-neutral view manifests, type defaults, validation frames, action bindings, visual channels, virtual/LOD hints, and data-to-representation mapping for Frontier apps.
- [`@shapeshift-labs/frontier-icons`](https://www.npmjs.com/package/@shapeshift-labs/frontier-icons): Renderer-neutral icon records, icon sets, lookup aliases, SVG frames, string rendering, and registry evidence for Frontier apps.
- [`@shapeshift-labs/frontier-design`](https://www.npmjs.com/package/@shapeshift-labs/frontier-design): Renderer-neutral design-system tokens, semantic roles, recipes, target style frames, CSS variable output, and registry graph evidence for Frontier apps.
- [`@shapeshift-labs/frontier-canvas`](https://www.npmjs.com/package/@shapeshift-labs/frontier-canvas): Renderer-neutral infinite canvas surfaces for Frontier apps, including camera and viewport math, pan/zoom plans, grid materialization, snapping, hit testing, selection handles, extensible tool dispatch, frame records, registry graph output, and impact/proof helpers.
- [`@shapeshift-labs/frontier-canvas-tools`](https://www.npmjs.com/package/@shapeshift-labs/frontier-canvas-tools): Renderer-neutral editor tools, state machines, transform handles, permissions, async records, and AI action bridges for Frontier canvas surfaces.
- [`@shapeshift-labs/frontier-dnd`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dnd): Renderer-neutral drag-and-drop sessions, sensor descriptors, collision ranking, drop planning, reorder patches, state partitioning, and registry evidence for Frontier apps.
- [`@shapeshift-labs/frontier-dom`](https://www.npmjs.com/package/@shapeshift-labs/frontier-dom): Patch-native DOM and host renderer bindings, manifest hydration, JSX runtime/compiler helpers, SSR, devtools, and logging bridges.
- [`@shapeshift-labs/frontier-playwright`](https://www.npmjs.com/package/@shapeshift-labs/frontier-playwright): Playwright/headless automation probes for Frontier state, DOM, devtools, marks, and timeline queries.
- [`@shapeshift-labs/frontier-test`](https://www.npmjs.com/package/@shapeshift-labs/frontier-test): Serializable test/spec evidence manifests for Frontier apps, including fixtures, commands, expected patches/effects/routes/policies, coverage declarations, run plans, run records, report adapters, replay proofs, fuzzers, benchmarks, registry graph output, and impact queries.
- [`@shapeshift-labs/frontier-fixtures`](https://www.npmjs.com/package/@shapeshift-labs/frontier-fixtures): Deterministic fixture and scenario generation for Frontier apps, including schema-valid sample state, related entity collections, actor personas, route states, replay-verified patch streams, event records, JSONL bundles, and evidence summaries.
- [`@shapeshift-labs/frontier-component-preview`](https://www.npmjs.com/package/@shapeshift-labs/frontier-component-preview): Frontier-native component preview books, generated preview manifests, stateful variants, Vite virtual modules, standalone browser preview shells, inspector bridges, and preview harness evidence for Frontier apps.
- [`@shapeshift-labs/frontier-documentation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-documentation): Frontier-native documentation manifests, generated documentation books, package/API/source discovery, Vite virtual modules, standalone browser docs shells, inspector bridges, search indexes, and documentation harness evidence for Frontier apps and packages.
- [`@shapeshift-labs/frontier-ast-walk`](https://www.npmjs.com/package/@shapeshift-labs/frontier-ast-walk): Dependency-light source graph, import/export/declaration/call analysis, Frontier package-use discovery, and business-logic placement findings for Frontier tools, apps, docs, fuzzers, benchmarks, and agent evidence.
- [`@shapeshift-labs/frontier-history`](https://www.npmjs.com/package/@shapeshift-labs/frontier-history): Serializable temporal explanation and causality records for Frontier apps, including field-change explanations, action/workflow/policy/effect/trace/test provenance, audit windows, undo planning, registry/provenance graph output, JSONL replay bundles, and proof hashes.
- [`@shapeshift-labs/frontier-application`](https://www.npmjs.com/package/@shapeshift-labs/frontier-application): Serializable whole-application graph and impact queries for Frontier apps, including features, owners, packages, routes, views, actions, mutations, state paths, effects, workers, assets, tests, traces, policies, workflows, migrations, benchmarks, registry graph output, feature maps, JSONL bundles, and proof hashes.
- [`@shapeshift-labs/frontier-linter`](https://www.npmjs.com/package/@shapeshift-labs/frontier-linter): Serializable Frontier lint rules, diagnostics, fixes, reports, and fast rule execution for package catalogs, registry graphs, application maps, manifests, traces, policies, workflows, workers, assets, tests, benchmarks, and source snippets.
- [`@shapeshift-labs/frontier-framework`](https://www.npmjs.com/package/@shapeshift-labs/frontier-framework): High-level app framework package for Frontier applications, including configuration, CLI scaffolding, Vite builds, monorepo layout, TSX route builds, split frontend/backend deploy artifacts, backend-neutral Fetch handler and sync transport contracts, runtime data-source migrations, devtools, harness gates, agent MCP/tool manifests, CI evidence gates, workflow manifests, SARIF/linter output, replay scripts, and evidence manifest output.
- [`@shapeshift-labs/frontier-crdt`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt): Native CRDT documents, update tooling, awareness, branches, conflict introspection, version frames, and undo.
- [`@shapeshift-labs/frontier-crdt-sync`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-sync): CRDT sync endpoints, repo/storage/provider contracts, scheduled sync work, document URLs, local networks, model checking, forensics, and text binding contracts.
- [`@shapeshift-labs/frontier-crdt-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-crdt-websocket): WebSocket client/server transports for Frontier CRDT sync providers.
- [`@shapeshift-labs/frontier-react`](https://www.npmjs.com/package/@shapeshift-labs/frontier-react): React external-store hooks and adapters for Frontier state, cache, and CRDT surfaces.
- [`@shapeshift-labs/frontier-richtext`](https://www.npmjs.com/package/@shapeshift-labs/frontier-richtext): Rich text Delta normalization/application, marks, embeds, ranges, and cursor/selection transforms for local editor integrations.
- [`@shapeshift-labs/frontier-realtime`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime): Shared realtime command, tick, snapshot, prediction, reconciliation, interpolation, rollback, message, and delta primitives.
- [`@shapeshift-labs/frontier-realtime-server`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-server): Authoritative realtime room, tick, command validation, rate-limit, session, and snapshot-history runtime.
- [`@shapeshift-labs/frontier-realtime-websocket`](https://www.npmjs.com/package/@shapeshift-labs/frontier-realtime-websocket): WebSocket client, wire, and Node room-server transport for Frontier realtime.
- [`@shapeshift-labs/frontier-game`](https://www.npmjs.com/package/@shapeshift-labs/frontier-game): Game-facing entity, component, player, room, ownership, spatial interest, rollback, physics, and replication helpers above realtime.
- [`@shapeshift-labs/loom`](https://www.npmjs.com/package/@shapeshift-labs/loom): Repo-level semantic collaboration CLI for .loom workspaces, including init, scan, status, graph snapshots, projection plans, Frontier Lang delegation, Frontier Swarm delegation, run-log sync command delegation, and Frontier Framework delegation.

Package source repositories:

- [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- [`siliconjungle/-shapeshift-labs-frontier-query`](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)
- [`siliconjungle/-shapeshift-labs-frontier-codec`](https://github.com/siliconjungle/-shapeshift-labs-frontier-codec)
- [`siliconjungle/-shapeshift-labs-frontier-engine`](https://github.com/siliconjungle/-shapeshift-labs-frontier-engine)
- [`siliconjungle/-shapeshift-labs-frontier-state`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state)
- [`siliconjungle/-shapeshift-labs-frontier-dataflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dataflow)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-idb)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-file)
- [`siliconjungle/-shapeshift-labs-frontier-state-cache-sql`](https://github.com/siliconjungle/-shapeshift-labs-frontier-state-cache-sql)
- [`siliconjungle/-shapeshift-labs-frontier-schema`](https://github.com/siliconjungle/-shapeshift-labs-frontier-schema)
- [`siliconjungle/-shapeshift-labs-frontier-migrations`](https://github.com/siliconjungle/-shapeshift-labs-frontier-migrations)
- [`siliconjungle/-shapeshift-labs-frontier-event-log`](https://github.com/siliconjungle/-shapeshift-labs-frontier-event-log)
- [`siliconjungle/-shapeshift-labs-frontier-run`](https://github.com/siliconjungle/-shapeshift-labs-frontier-run)
- [`siliconjungle/-shapeshift-labs-frontier-lease`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lease)
- [`siliconjungle/-shapeshift-labs-frontier-inspect`](https://github.com/siliconjungle/-shapeshift-labs-frontier-inspect)
- [`siliconjungle/-shapeshift-labs-frontier-runtime-proof`](https://github.com/siliconjungle/-shapeshift-labs-frontier-runtime-proof)
- [`siliconjungle/-shapeshift-labs-frontier-scheduler`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scheduler)
- [`siliconjungle/-shapeshift-labs-frontier-logging`](https://github.com/siliconjungle/-shapeshift-labs-frontier-logging)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)
- [`siliconjungle/-shapeshift-labs-frontier-effects`](https://github.com/siliconjungle/-shapeshift-labs-frontier-effects)
- [`siliconjungle/-shapeshift-labs-frontier-auth`](https://github.com/siliconjungle/-shapeshift-labs-frontier-auth)
- [`siliconjungle/-shapeshift-labs-frontier-policy`](https://github.com/siliconjungle/-shapeshift-labs-frontier-policy)
- [`siliconjungle/-shapeshift-labs-frontier-flags`](https://github.com/siliconjungle/-shapeshift-labs-frontier-flags)
- [`siliconjungle/-shapeshift-labs-frontier-tools`](https://github.com/siliconjungle/-shapeshift-labs-frontier-tools)
- [`siliconjungle/-shapeshift-labs-frontier-sandbox`](https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox)
- [`siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs`](https://github.com/siliconjungle/-shapeshift-labs-frontier-sandbox-quickjs)
- [`siliconjungle/-shapeshift-labs-frontier-workflow`](https://github.com/siliconjungle/-shapeshift-labs-frontier-workflow)
- [`siliconjungle/-shapeshift-labs-frontier-worker`](https://github.com/siliconjungle/-shapeshift-labs-frontier-worker)
- [`siliconjungle/-shapeshift-labs-frontier-queue`](https://github.com/siliconjungle/-shapeshift-labs-frontier-queue)
- [`siliconjungle/-shapeshift-labs-frontier-swarm`](https://github.com/siliconjungle/-shapeshift-labs-frontier-swarm)
- [`siliconjungle/-shapeshift-labs-frontier-swarm-git`](https://github.com/siliconjungle/-shapeshift-labs-frontier-swarm-git)
- [`siliconjungle/-shapeshift-labs-frontier-swarm-codex`](https://github.com/siliconjungle/-shapeshift-labs-frontier-swarm-codex)
- [`siliconjungle/frontier-loom-ui`](https://github.com/siliconjungle/frontier-loom-ui)
- [`siliconjungle/-shapeshift-labs-frontier-lang-kernel`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-kernel)
- [`siliconjungle/-shapeshift-labs-frontier-lang-parser`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-parser)
- [`siliconjungle/-shapeshift-labs-frontier-lang-checker`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-checker)
- [`siliconjungle/-shapeshift-labs-frontier-lang-typescript`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-typescript)
- [`siliconjungle/-shapeshift-labs-frontier-lang-javascript`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-javascript)
- [`siliconjungle/-shapeshift-labs-frontier-lang-jsx`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-jsx)
- [`siliconjungle/-shapeshift-labs-frontier-lang-svg`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-svg)
- [`siliconjungle/-shapeshift-labs-frontier-lang-package`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-package)
- [`siliconjungle/-shapeshift-labs-frontier-lang-html`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-html)
- [`siliconjungle/-shapeshift-labs-frontier-lang-css`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-css)
- [`siliconjungle/-shapeshift-labs-frontier-lang-rust`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-rust)
- [`siliconjungle/-shapeshift-labs-frontier-lang-python`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-python)
- [`siliconjungle/-shapeshift-labs-frontier-lang-c`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-c)
- [`siliconjungle/-shapeshift-labs-frontier-lang-compiler`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-compiler)
- [`siliconjungle/-shapeshift-labs-frontier-lang-swift`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-swift)
- [`siliconjungle/-shapeshift-labs-frontier-lang-kotlin`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-kotlin)
- [`siliconjungle/-shapeshift-labs-frontier-lang-java`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-java)
- [`siliconjungle/-shapeshift-labs-frontier-lang-go`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-go)
- [`siliconjungle/-shapeshift-labs-frontier-lang-csharp`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-csharp)
- [`siliconjungle/-shapeshift-labs-frontier-lang-clang`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-clang)
- [`siliconjungle/-shapeshift-labs-frontier-lang-cli`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-cli)
- [`siliconjungle/-shapeshift-labs-frontier-lang`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang)
- [`siliconjungle/-shapeshift-labs-frontier-kv`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv)
- [`siliconjungle/-shapeshift-labs-frontier-kv-locks`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-locks)
- [`siliconjungle/-shapeshift-labs-frontier-kv-rate-limit`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-rate-limit)
- [`siliconjungle/-shapeshift-labs-frontier-kv-file`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-file)
- [`siliconjungle/-shapeshift-labs-frontier-kv-idb`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-idb)
- [`siliconjungle/-shapeshift-labs-frontier-kv-redis`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-redis)
- [`siliconjungle/-shapeshift-labs-frontier-kv-server`](https://github.com/siliconjungle/-shapeshift-labs-frontier-kv-server)
- [`siliconjungle/-shapeshift-labs-frontier-assets`](https://github.com/siliconjungle/-shapeshift-labs-frontier-assets)
- [`siliconjungle/-shapeshift-labs-frontier-blueprint`](https://github.com/siliconjungle/-shapeshift-labs-frontier-blueprint)
- [`siliconjungle/-shapeshift-labs-frontier-triggers`](https://github.com/siliconjungle/-shapeshift-labs-frontier-triggers)
- [`siliconjungle/-shapeshift-labs-frontier-virtual`](https://github.com/siliconjungle/-shapeshift-labs-frontier-virtual)
- [`siliconjungle/-shapeshift-labs-frontier-table`](https://github.com/siliconjungle/-shapeshift-labs-frontier-table)
- [`siliconjungle/-shapeshift-labs-frontier-scene`](https://github.com/siliconjungle/-shapeshift-labs-frontier-scene)
- [`siliconjungle/-shapeshift-labs-frontier-pathfinding`](https://github.com/siliconjungle/-shapeshift-labs-frontier-pathfinding)
- [`siliconjungle/-shapeshift-labs-frontier-lod`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lod)
- [`siliconjungle/-shapeshift-labs-frontier-route`](https://github.com/siliconjungle/-shapeshift-labs-frontier-route)
- [`siliconjungle/-shapeshift-labs-frontier-trace`](https://github.com/siliconjungle/-shapeshift-labs-frontier-trace)
- [`siliconjungle/-shapeshift-labs-frontier-manifest`](https://github.com/siliconjungle/-shapeshift-labs-frontier-manifest)
- [`siliconjungle/-shapeshift-labs-frontier-view`](https://github.com/siliconjungle/-shapeshift-labs-frontier-view)
- [`siliconjungle/-shapeshift-labs-frontier-icons`](https://github.com/siliconjungle/-shapeshift-labs-frontier-icons)
- [`siliconjungle/-shapeshift-labs-frontier-design`](https://github.com/siliconjungle/-shapeshift-labs-frontier-design)
- [`siliconjungle/-shapeshift-labs-frontier-canvas`](https://github.com/siliconjungle/-shapeshift-labs-frontier-canvas)
- [`siliconjungle/-shapeshift-labs-frontier-canvas-tools`](https://github.com/siliconjungle/-shapeshift-labs-frontier-canvas-tools)
- [`siliconjungle/-shapeshift-labs-frontier-dnd`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dnd)
- [`siliconjungle/-shapeshift-labs-frontier-dom`](https://github.com/siliconjungle/-shapeshift-labs-frontier-dom)
- [`siliconjungle/-shapeshift-labs-frontier-playwright`](https://github.com/siliconjungle/-shapeshift-labs-frontier-playwright)
- [`siliconjungle/-shapeshift-labs-frontier-test`](https://github.com/siliconjungle/-shapeshift-labs-frontier-test)
- [`siliconjungle/-shapeshift-labs-frontier-fixtures`](https://github.com/siliconjungle/-shapeshift-labs-frontier-fixtures)
- [`siliconjungle/-shapeshift-labs-frontier-component-preview`](https://github.com/siliconjungle/-shapeshift-labs-frontier-component-preview)
- [`siliconjungle/-shapeshift-labs-frontier-documentation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-documentation)
- [`siliconjungle/-shapeshift-labs-frontier-ast-walk`](https://github.com/siliconjungle/-shapeshift-labs-frontier-ast-walk)
- [`siliconjungle/-shapeshift-labs-frontier-history`](https://github.com/siliconjungle/-shapeshift-labs-frontier-history)
- [`siliconjungle/-shapeshift-labs-frontier-application`](https://github.com/siliconjungle/-shapeshift-labs-frontier-application)
- [`siliconjungle/-shapeshift-labs-frontier-linter`](https://github.com/siliconjungle/-shapeshift-labs-frontier-linter)
- [`siliconjungle/-shapeshift-labs-frontier-framework`](https://github.com/siliconjungle/-shapeshift-labs-frontier-framework)
- [`siliconjungle/-shapeshift-labs-frontier-crdt`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-sync`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-sync)
- [`siliconjungle/-shapeshift-labs-frontier-crdt-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-crdt-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-react`](https://github.com/siliconjungle/-shapeshift-labs-frontier-react)
- [`siliconjungle/-shapeshift-labs-frontier-richtext`](https://github.com/siliconjungle/-shapeshift-labs-frontier-richtext)
- [`siliconjungle/-shapeshift-labs-frontier-realtime`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-server`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-server)
- [`siliconjungle/-shapeshift-labs-frontier-realtime-websocket`](https://github.com/siliconjungle/-shapeshift-labs-frontier-realtime-websocket)
- [`siliconjungle/-shapeshift-labs-frontier-game`](https://github.com/siliconjungle/-shapeshift-labs-frontier-game)
- [`siliconjungle/-shapeshift-labs-loom`](https://github.com/siliconjungle/-shapeshift-labs-loom)

## Install

```sh
npm install @shapeshift-labs/frontier-swarm-codex
```

## CLI

```sh
loom swarm-codex plan \
  --manifest inkwell/agent-ownership.json \
  --tasks inkwell/parity-work-queue.json \
  --outDir agent-runs/codex-swarm/plan

loom swarm-codex run \
  --manifest inkwell/agent-ownership.json \
  --tasks inkwell/parity-work-queue.json \
  --backlog inkwell/swarm-backlog.json \
  --routing-policy inkwell/model-routing-policy.json \
  --routing-mode fill \
  --max-concurrency 4 \
  --workspace copy \
  --include AGENTS.md,package.json,inkwell \
  --exclude node_modules,dist,agent-runs \
  --link-path packages \
  --link-node-modules true \
  --semantic-import \
  --semantic-import-expected \
  --sandbox workspace-write

loom swarm-codex stop --run agent-runs/codex-swarm/run-1

loom swarm-codex collect \
  --run agent-runs/codex-swarm/run-1 \
  --outDir agent-runs/codex-swarm/run-1/collected \
  --coordinator-decision agent-runs/codex-swarm/lane-coordinators/runtime/coordinator-decisions.json \
  --branch-prefix codex/swarm-slice

loom swarm-codex continue \
  --collection agent-runs/codex-swarm/run-1/collected \
  --backlog inkwell/swarm-backlog.json \
  --routing-policy inkwell/model-routing-policy.json \
  --manifest inkwell/agent-ownership.json \
  --tasks inkwell/parity-work-queue.json \
  --outDir agent-runs/codex-swarm/run-1/continuation \
  --coordinator-decision agent-runs/codex-swarm/lane-coordinators/runtime/coordinator-decisions.json \
  --routing-mode fill
```

The preferred repo front door is `loom swarm` or `loom swarm-codex` when a Loom workspace is present. Current Loom delegate help exposes the same local workflow commands (`plan`, `run`, `collect`, `query-artifacts`, `score`, `apply`, `continue`) plus model availability flags, semantic import flags, and the front-door `--semantic-import-expected` policy check. The package-local `frontier-swarm-codex` binary, and the historical `frontier-swarm` binary installed by this package, are aliases for direct Codex execution and local debugging. Use those aliases for package-local smoke checks, explicit model availability filtering (`--available-model`, `--unavailable-model`, `--fallback-model`), semantic sidecar generation, and collect/query/apply evidence workflows when Loom is not the active operator surface. `run` now enters the self-draining loop by default: after workers finish, it collects bundles, plans scoped coordinator review jobs, consumes coordinator decisions, applies accepted `ready-to-apply/` bundles under a merge lease, recollects, and continues until no runnable work remains or a true human question blocks progress. Pass `--no-auto-drain` for raw worker execution, or `drain --run <dir>` to drain an existing run. Runs and continuations preserve runner-supplied pricing metadata from `usage`, `tokenUsage`, `cost`, `modelCost`, or `pricing` fields; decision ledgers supplied with `--decision-ledger` or `--coordinator-decision` carry accepted, rejected, superseded, or not-applicable coordinator review decisions across collect and continuation. The runner writes dashboard-observable artifacts such as `coordinator-dashboard.json`, `pids.json`, `resource-allocation.json`, `merge.json`, `changes.patch`, `semantic-imports.json`, `merge-index.json`, `queue-overlay.json`, `lifetime-history-ledger.json`, `apply-ledger.json`, `drain-loop.json`, and artifact indexes; use Loom for front-door policy validation when a flag exists there but is not part of this package CLI.

Lane coordinators should treat collection as the decision boundary. A lane coordinator reviews `needs-coordinator-review/` bundles, their `last-message.md`, `changes.patch`, `merge.json`, human-question artifacts, and `semantic-imports.json`, then writes `coordinator-decisions.json` or `coordinator-decisions.jsonl` near the lane run or collection evidence. Each decision should name a `jobId`, `taskId`, `bundleId`, or queue item id, include `coordinatorId`, `lane`, package scope when useful, one of `accepted`, `rejected`, `superseded`, `rerun`, or `not-applicable`, and a short reason. `collect` and `continue` discover those files under the run or collection root, or consume an explicit `--decision-ledger`/`--coordinator-decision` path, then emit `coordinator-decision-rollup.json` plus an audit when decisions match bundles. Matching is deterministic across `jobId`, `taskId`, `bundleId`, and queue item ids; more specific and higher-quality matches win over broader matches, and `decidedAt` breaks otherwise equal ties. Human questions remain separate: open, well-formed blocker questions stay in coordinator review until a `human-action-answers.jsonl` answer is supplied to `continue`, while routine review debt should become a lane coordinator decision instead of a human question. Semantic import sidecars are admission evidence for ownership, stale/conflict, and replay review; they should inform the ledger decision but do not replace patch apply checks or focused tests.

## Coordinator-Agent Runner Loop

Use the runner loop to let scoped coordinators own lanes or packages without turning one root coordinator into a manual bottleneck:

1. `run` leases queue work from the compiled schedule. Each worker receives a queue lease, writes immutable evidence, and emits `merge.json`, `changes.patch`, `semantic-imports.json`, and handoff artifacts under its job directory.
2. `collect` rereads the run directory, builds `queue-overlay.json` and `merge-index.json`, then places bundles into ready, coordinator-review, failed, or stale buckets. A lane or package coordinator performs scoped review against that bucket and writes a decision ledger with accepted, rejected, superseded, or not-applicable rows.
3. `continue` rereads the collection, backlog, routing policy, human-answer files, and decision ledger before writing the next backlog and policy. Accepted or rerun work is promoted upward from lane review to package or root queues through overlay/backlog records rather than by editing one central queue by hand.
4. `apply` is the mutation boundary. In the self-draining `run`/`drain` path this happens automatically for accepted `ready-to-apply/` bundles, using a coordinator id and merge-lease ledger. Manual non-dry-run apply should pass `--coordinator-id <id>` with `--merge-lease-ledger <file>` so the central lease fences root mutation after scoped review, reread, patch checks, and focused tests.

Coordinator review is queue and ledger work. Human questions are reserved for true blockers that repository context, tests, evidence, and safe reversible assumptions cannot resolve. Stale-before-merge, failed patch/apply checks, failed required commands, and ordinary approval requests stay in buckets, handoffs, decision ledgers, or rerun tasks instead of becoming Questions for You.

### Ten-Agent Drain Loop

A self-draining Codex run treats the root coordinator as a leasable role. Ten workers can finish at once, but none of them owns the root. Each worker writes its bundle and evidence. Lane or package coordinators lease their review scopes, collapse local review debt into coordinator decisions, promote accepted or rerun candidates upward, and release their leases. The drain loop then leases the root apply scope, rereads the latest collection and decision ledgers, applies only ready bundles under `--coordinator-id` plus `--merge-lease-ledger`, verifies them, recollects so already-applied patches become resolved output, and completes or releases the lease.

The end state should be small and explicit. Applied bundles sit in `apply-ledger.json` with completed merge-lease records. Promoted bundles appear as queue-promotion backlog entries. Rejected, superseded, and not-applicable bundles are resolved review debt. Rerun bundles point at follow-up task ids. Conflict-blocked bundles stay in review with conflict keys, stale-before-merge evidence, or failed patch checks. Human-question bundles remain open only when their `human-question.json` describes material uncertainty that evidence and safe assumptions cannot resolve.

`drain-loop.json` is the runner serialization contract for that loop. It uses `kind: "frontier.swarm-codex.drain-loop"`, `version: 1`, `steps[]`, `collections[]`, `applies[]`, `continuations[]`, and a summary with collection, apply, coordinator-decision, stale, failed, and open-human-question counts. Tests and dashboards can reduce it to `kind: "frontier.swarm-codex.drain-terminal-oracle"` with the same stable `terminalStates` keys as the runtime-neutral package: `applied`, `rerun`, `superseded`, `rejected`, `conflict-blocked`, and `human-question`.

## API

```ts
import {
  continueCodexSwarmLoop,
  createCodexSwarmPlan,
  runCodexSwarm
} from '@shapeshift-labs/frontier-swarm-codex';

const plan = createCodexSwarmPlan({
  manifest,
  tasks,
  backlog,
  backlogPlan: {
    recursive: true,
    childArtifactPath: 'agent-runs/codex-swarm/backlog-children.json'
  },
  routingPolicy,
  routingMode: 'fill'
});

await runCodexSwarm(plan, {
  outDir: 'agent-runs/codex-swarm/run-1',
  maxConcurrency: 4,
  modelPolicy: 'config-default',
  workspace: {
    mode: 'copy',
    root: '../agent-workspaces',
    includes: ['AGENTS.md', 'package.json', 'snes'],
    excludes: ['node_modules', 'dist', 'agent-runs', 'snes/test/roms'],
    linkPaths: ['packages'],
    linkNodeModules: true,
    replace: true
  }
});

const continuation = await continueCodexSwarmLoop({
  collection: 'agent-runs/codex-swarm/run-1/collected',
  backlogPath: 'inkwell/swarm-backlog.json',
  routingPolicyPath: 'inkwell/model-routing-policy.json',
  manifestPath: 'inkwell/agent-ownership.json',
  tasksPath: 'inkwell/parity-work-queue.json',
  outDir: 'agent-runs/codex-swarm/run-1/continuation',
  routingMode: 'fill'
});
```

App-specific adapters should keep orchestration inside this package and use hooks for local policy. `prepareJobWorkspace` can link generated package artifacts or shared fixtures, `renderJobPrompt` can append product-specific migration rules, `changedPathFilter` can hide runner-owned symlinks from ownership checks, and `onJobStarted`/`onJobFinished`/`onSwarmFinished` can mirror lifecycle records into project-specific JSONL streams.

Use `modelPolicy: 'config-default'` for portable swarms that should respect each machine's Codex config. Use `modelPolicy: 'plan'` only when the installed Codex CLI and account are known to accept the planned model IDs. `approval: 'full-auto'` and `--approval-policy full-auto` are normalized to the current `--ask-for-approval never` spelling.

Pass `--backlog <file>` when a run should start from a durable backlog instead of a flat task queue. The adapter calls `createSwarmBacklogTaskPlan`: runnable entries become jobs, and higher-level epics/groups/feature entries become `backlog-decompose` jobs that write a child backlog artifact. A coordinator can merge that child artifact back with `mergeSwarmBacklogs` and reuse the resulting JSON in a later session or Loom invocation. `--recursive-backlog=false`, `--max-backlog-depth <n>`, `--decompose-lane <lane>`, and `--child-artifact-path <path>` control the first decomposition wave.

Pass `--routing-policy <file>` plus `--routing-mode fill|override|observe` to apply repository or global model-tier policy before Codex jobs are created. The policy can be built from RSI/tournament feedback with `createSwarmModelRoutingPolicy`; in `fill` mode it only fills tasks with no explicit compute, in `override` mode it can replace existing task compute, and in `observe` mode it records the decision without changing the job.

Pass `--semantic-import` or `semanticImport: true` to write a `semantic-imports.json` sidecar for changed source files. The sidecar uses the optional `@shapeshift-labs/frontier-lang` dependency to import supported native sources into Frontier Lang universal ASTs, summarize source maps/losses/semantic indexes, and attach semantic merge-candidate metadata to each worker merge bundle. Use `--semantic-import-include`, `--semantic-import-exclude`, `--semantic-import-max-files`, and `--semantic-import-max-bytes` to keep the import pass scoped. Selected files are stat-checked before the optional importer is loaded; oversized files are recorded as `skipped` with reason `too-large`, and the summary includes `maxBytes` plus `skippedByReason` diagnostics. If a coordinator needs the Loom-level `--semantic-import-expected` guard, run through `loom swarm`/`loom swarm-codex`; the package-local CLI records generated sidecars and semantic admission metadata but does not enforce that front-door expectation flag itself.

## Minimal Repro Workspaces

Large monorepos do not need one full git worktree per worker. The adapter supports four workspace modes:

- `current`: run in the current checkout or lane worktree path.
- `git-worktree`: create a detached git worktree for full-repo isolation.
- `copy`: create a minimal copied workspace from declared includes, task `files`, `sourceRefs`, `targetRefs`, and task `snapshotIncludes`.
- `snapshot`: same minimal-copy mechanics with snapshot-oriented naming for legacy SNES-style task manifests.

For `copy` and `snapshot`, the runner excludes heavy paths by default (`.git`, `node_modules`, `dist`, coverage, agent-runs, and build outputs) and passes `--skip-git-repo-check` to Codex. It snapshots the copied workspace before and after execution so changed-path ownership checks still work without git metadata. Runner-owned artifacts are recorded in `workspace-proof.json` and filtered out of ownership checks, which keeps parent dirty files and copied workspace logs from falsely failing useful workers. Each job also writes `changes.patch` when a patch can be derived and `merge.json` with the touched owned files, evidence paths, verification results, queue item IDs, risk, and merge disposition. Use `linkPaths` for heavy shared directories such as `packages`, corpora, fixtures, generated assets, or research checkouts that should not be duplicated. Task JSON may also declare `snapshotIncludes`, `snapshotExcludes`, `snapshotArtifactIncludes`, `snapshotLinkPaths`, `requiredIncludes`, and `optionalIncludes`.

## Scalable Scheduling

`runCodexSwarm` uses `@shapeshift-labs/frontier-swarm` schedules and leases internally. Jobs become runnable only when their dependency DAG is satisfied, lane/compute/contention limits have capacity, and a lease can be issued for the local Codex worker. Browser lanes can declare capabilities, port pools, profile directory prefixes, and lower lane concurrency in the upstream swarm manifest. The adapter turns those declarations into a per-job resource allocation, writes `resource-allocation.json`, includes the allocation in the worker prompt and event stream, creates browser profile directories, and passes env vars such as `PORT`, `FRONTIER_SWARM_BROWSER_PORT`, and `FRONTIER_SWARM_BROWSER_PROFILE_DIR` into the Codex process. This keeps the public runner simple while making the execution model compatible with much larger queues and external lease-backed workers.

Task JSON may declare `dependsOn`, `concurrencyKey`, `budget`, and `review`; the adapter carries those fields into the compiled plan and prompt.

Each run writes event streams under `streams/`, a `coordinator-dashboard.json` snapshot, `pids.json`, workspace proofs, patch files, merge bundles, and job results with merge-readiness classification. `discoverCodexHandoffArtifacts` scans job directories for `last-message.md`, debug handoffs, replay logs, watchpoints, traces, diagnostics, logs, evidence JSON, patches, and panel artifacts. Recognized panel artifacts include `panel-response.json`, `panel-round.json`, `judge-vote.json`, `fusion-analysis.json`, `panel-consensus.json`, and `panel-escalations.json`; `runCodexJob` adds those paths to result evidence and `metadata.codexHandoffArtifacts` so coordinator dashboards can link directly to replay/debug/panel artifacts. `frontier-swarm stop --run <run-dir>` reads the pid manifest and terminates live worker processes without manually hunting process state.

### Queue And Review Layers

The runner treats queues as derived evidence instead of asking workers to mutate one central board. Worker queues are the runnable jobs in the compiled schedule plus the per-job lease records written into each run; lane queues are the collected buckets and `queue-overlay.json` entries for a lane; package queues are coordinator decisions and rollups grouped by package scope; and the root queue is the continuation backlog plus root review-debt collapse summary that the coordinator uses for the next wave. The root queue is a review and routing authority, not an apply-time lock.

Semantic-region leases are review/admission evidence. Tasks can declare `ownershipRegions`, `ownedRegions`, and `changedRegions`; merge bundles carry changed regions; merge indexes group by region and semantic conflict keys; and coordinator merge lease ledgers carry changed paths, lane/package scope, base revision, status, and fencing tokens. These records help coordinators serialize overlapping semantic regions, detect stale-before-merge cases, and explain why a bundle needs re-review. They do not claim global root-queue apply locking; package-local `apply` still depends on `git apply --check`, ready-bucket admission, dirty-worktree refusal unless explicitly allowed, and `apply-ledger.json`.

Stale-before-merge is coordinator workflow, not a human blocker. Collection checks whether a patch still applies to coordinator head and routes stale bundles to `stale-against-head/`; merge lease acquisition/completion marks base-revision mismatches as `stale-before-merge` and `review-required`; continuation turns those rows into supersede or rerun work. A coordinator should re-review, supersede, or rerun stale evidence and record the decision in the ledger instead of asking Questions for You.

Human questions are a blocker contract, not a routine review channel. The generated worker prompt tells agents to keep working when a safe reversible assumption is available, and to emit `human-question.json` only when repository context, tests, evidence, and safe assumptions cannot resolve the decision. Stale-against-head bundles, failed patch/apply checks, failed required commands, and ordinary approval requests are coordinator workflow states; they may be evidence on a bundle, but they must not create open Questions for You items. Collected question artifacts must include `code`, `title`, `question`, `context`, `uncertainty`, `requestedAnswer`, and at least two concrete `options`; `collect` ignores vague or routine coordinator-review prompts instead of routing them as open human work. `continue` consumes `human-action-answers.jsonl`, attaches matching answers to backlog/tasks, records resolved question codes in model-routing feedback and policy metadata, and filters those resolved codes on later continuations so the same question does not reappear as open work.

`loom swarm-codex collect --run <run-dir>` derives status from immutable worker overlays instead of asking workers to edit a central queue. It scans `merge.json` files and writes:

- `ready-to-apply/` for auto-mergeable verified slices,
- `needs-coordinator-review/` for patch candidates and discovery-only results that the coordinator needs to review or collapse into a decision,
- `failed-evidence/` for failed workers, blockers, ownership violations, or failed required commands,
- `stale-against-head/` for patch bundles that no longer apply.

Older collections may still contain the legacy `needs-human-port/` or `needs-coordinator-port/` directories; apply, score, continue, and dashboard readers treat those as aliases of `needs-coordinator-review/`. New collections should use coordinator review terminology. It also writes `merge-index.json`, `queue-overlay.json`, and `lifetime-history-ledger.json` so coordinator dashboards can show stale patches, conflicts, derived queue status, ready merge pressure, and graphable lifetime history nodes without scraping every worker directory. The lifetime ledger is a versioned `frontier.swarm.lifetime-history-ledger` JSON object with normalized `nodes`, `edges`, lookup maps such as `byJobId` and `byStatus`, and summary counters for applied, rerun, superseded, rejected, human-question, and conflict-blocked outcomes. The optional `--branch-prefix` adds suggested tiny patch branch names to each collected bundle so accepted slices can become one small branch/commit per surface, evidence path, and queue status overlay.

Collect preserves panel artifacts next to merge bundles, so a Fusion-style run can retain participant responses, fuser analysis, consensus decisions, and escalations even after disposable copy workspaces are cleaned up. `index-artifacts` classifies those files with stable kinds such as `panel-response`, `fusion-analysis`, and `panel-consensus`, which makes panel evidence queryable from SQLite alongside semantic imports, patches, traces, and logs.

`loom swarm-codex continue --collection <collection-dir>` is the closed-loop handoff for long-running swarms. It scans the collected run for worker-produced child backlog files such as `backlog-children.json`, merges them with the persisted backlog, converts collected merge bundles into model-routing feedback, writes `backlog.next.json`, `model-routing-policy.next.json`, `continuation.json`, and, when `--manifest` is supplied, `next-plan.json`. Pass `--write` only when the updated backlog and routing policy should replace the files named by `--backlog` and `--routing-policy`; otherwise the command writes into `--outDir`. `next-wave` is an alias for the same command.

This is the durable path for recursive decomposition and model-tier adaptation: workers can emit child tasks from an epic/group decomposition job, collection captures their evidence and outcomes, and the next wave starts from the merged backlog plus routing policy. The policy update is evidence-derived; it uses merge disposition, verification commands, evidence quality, lane/work kind, package/repo scope, and the planned compute/model to bias future `fill|override|observe` routing decisions.

Continuation feedback also preserves model usage and cost metadata when collected bundles, jobs, tasks, or compute profiles include it. The adapter recognizes common `usage`, `tokenUsage`, `cost`, `modelCost`, and `pricing` fields, records input/output/total tokens, and marks `priceKnown: false` when tokens are known but pricing is not. Pricing remains runner-supplied metadata rather than a hardcoded table, so local policy can update costs without changing the package.

`loom swarm-codex apply --collection <collection-dir>` reviews the `ready-to-apply/` bucket and writes `apply-ledger.json`. It defaults to `--dry-run`, which runs `git apply --check` without mutating the checkout. With `--bucket all`, bundles are considered in collection order: `ready-to-apply`, `needs-coordinator-review`, legacy coordinator-review aliases, `failed-evidence`, then `stale-against-head`. `--bucket needs-human-port` and `--bucket needs-coordinator-port` remain accepted as deprecated aliases for older scripts. Only ready auto-mergeable patch bundles are checked or applied. Stale, non-ready, evidence-only, already-applied, and preexisting target-branch bundles are recorded as skipped entries with explicit reasons. Non-dry-run apply refuses a dirty worktree unless `--allow-dirty` is passed, and can optionally create small branches with `--branch-prefix` and commits with `--commit`. Pass `--coordinator-id <id>` with `--merge-lease-ledger <file>` to acquire a root queue merge lease before mutation, reject candidates whose reviewed base is behind the ledger head, and record lease id, fencing token, status, and reasons in `apply-ledger.json`.

The self-draining loop also writes `apply-proof-chain/apply-proof-chain.json` after each apply pass. That artifact links the accepted coordinator decision, merge lease, patch-check command, worker test output from the merge bundle, apply-ledger entry, and post-apply recollection bucket for the applied job. `continue` receives the proof-chain path and summary in routing-policy metadata so later waves can collapse applied output, schedule reruns for stale or conflict-blocked rows, and keep routine review debt out of human-question queues.

`createCodexApplyProofChain` links the apply boundary into one serializable proof artifact. The chain has kind `frontier.swarm-codex.apply-proof-chain`, version `1`, and always emits the same ordered stages: `coordinator-decision`, `merge-lease`, `patch-check`, `apply-ledger`, `test-output`, and `post-apply-recollection`. Each stage has a stable id, status, reasons, optional artifact path/id, and compact summary. The chain summary records the terminal state (`applied`, `dry-run-checked`, `rerun`, `superseded`, `rejected`, `not-applicable`, `conflict-blocked`, `human-question`, `failed`, or `pending`) so dashboards do not need to infer coordinator intent from disconnected files. `writeCodexApplyProofChain` writes the same JSON shape to `apply-proof-chain.json` for evidence bundles.

`loom swarm-codex score --collection <collection-dir>` applies each collected bundle in a throwaway workspace and writes `patch-score.json`. Use `--focused-command` for the gate that proves the slice and `--global-command` with `--global-glob` for shared-code smoke/type/build gates. Scores are classified as `accepted-clean`, `accepted-needs-port`, `conflict`, `test-fail`, `stale`, or `evidence-only`, so the coordinator can review the best patch candidates before manually reading every bundle.

## Independent Review Assertions

- The documented queue hierarchy uses existing run, collection, overlay, backlog, coordinator decision, and merge lease artifacts; it does not introduce a new public import path or CLI command.
- The CLI and README keep coordinator review separate from Questions for You: routine review, stale-before-merge, failed apply checks, and failed required commands belong in buckets, evidence, handoffs, decision ledgers, and apply proof chains.
- The apply documentation intentionally stops short of claiming root-queue fencing or global apply locking. Operators still need patch checks, focused tests, and coordinator ledger review before applying accepted bundles.

## Surface

- `createCodexSwarmPlan`
- `coerceCodexSwarmManifestInput`
- `coerceCodexSwarmTasksInput`
- `createCodexWorkspacePlan`
- `createSwarmWorkspaceManifest`, `createSwarmWorkspaceProof`
- `prepareCodexWorkspace`
- `runCodexSwarm`
- `runCodexJob`
- `discoverCodexHandoffArtifacts`
- `createCodexResourceAllocation`
- `buildCodexArgs`
- `normalizeCodexModelFlag`, `normalizeCodexApprovalPolicy`
- `initFileSwarmEventStream`, `appendFileSwarmEvent`, `writeSwarmCoordinatorSnapshot`
- `appendCodexPidManifest`, `readCodexPidManifest`, `stopCodexSwarmRun`
- `collectCodexSwarmRun`
- `continueCodexSwarmLoop`
- `applyCodexSwarmCollection`
- `createCodexApplyProofChain`, `writeCodexApplyProofChain`
- `scoreCodexSwarmPatches`
- `renderCodexPrompt`
- `spawnCodexExecutor`
- `FRONTIER_SWARM_CODEX_SEMANTIC_IMPORT_KIND`

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

The benchmark writes `benchmarks/results/frontier-swarm-codex-package-bench-latest.json` when run from the monorepo. These are Frontier-only package measurements for input coercion, Codex argument construction, model/approval compatibility normalization, workspace manifest creation, and prompt rendering.

## Source Repository

This package is published from [siliconjungle/-shapeshift-labs-frontier-swarm-codex](https://github.com/siliconjungle/-shapeshift-labs-frontier-swarm-codex).
