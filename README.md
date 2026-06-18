# @shapeshift-labs/frontier-swarm-codex

Node Codex CLI runner adapter for Frontier swarm plans.

`frontier-swarm-codex` executes `@shapeshift-labs/frontier-swarm` plans with the Codex CLI. It owns Node process spawning, prompt rendering, worktree/snapshot workspace setup, command shaping, JSONL output capture, last-message capture, optional verification commands, changed-path ownership checks, and swarm result/proof artifacts.

The default swarm compute profile records `gpt-5.5` with `model_reasoning_effort="xhigh"` for planning. The Codex CLI invocation defaults to the local Codex config instead of forwarding planned model flags, because model availability and accepted flag values vary by Codex binary and account. Pass `--model ...`, `--model-policy plan`, or `modelPolicy: 'plan'` when a runner should force the planned profile. Forwarded model IDs are validated against the package catalog (`gpt-5.5`, `gpt-5.4-mini`, `o4-mini`, and `gpt-4.1-mini`); unsupported explicit or planned model IDs fail before a worker is spawned. The pure `frontier-swarm` package stays runtime-neutral.

By default, a swarm run is self-draining. After workers finish, coordinator-agent drain collects their merge bundles, builds scoped queues, and applies only admitted patches under the repo lock and configured gates. The scalable merge path is: workers produce bundles, coordinator agents lease semantic/path/repo queue scopes, same-scope work serializes locally, cross-scope work promotes upward, and repository mutation happens only through autonomous apply decisions. Dashboard queue counts are pending coordinator work, not landed code, until autonomous apply records an `applied` or `committed` decision. Human blockers are the narrow exception: `operatorSummary.status === "blocked"`, a true-blocker card, or explicit `humanQuestions`.

## Operator Docs

- [Hierarchical merge queues](docs/hierarchical-merge-queues.md): local scoped apply, queue-local overflow, upward promotion, stale reruns, invalid evidence rejection, discovery recording, Loom semantic scopes, and rare true blocker states.
- [Autonomous operator workflow](docs/autonomous-operator-workflow.md): run the default self-draining path, scale coordinator-agent drain work by queue scope, handle dirty collect-only runs, drain from a clean apply window, and interpret autonomous apply outcomes.
- [Review debt drain policy](docs/review-debt-drain.md): convert coordinator-review items into terminal decisions instead of open-ended review buckets.
- [Auto-drain artifact map](docs/auto-drain-artifacts.md): find the machine-readable files behind operator summary cards, queue pressure, promoted patch candidates, apply decisions, and explicit human questions.
- [Autonomous decision ledger](docs/autonomous-decision-ledger.md): match coordinator-agent drain assignments to append-only apply decisions and distinguish terminal outcomes from queued or promoted coordinator work.
- [Autonomous lock model](docs/autonomous-lock-model.md): understand the current repo-local mutation lock, recorded semantic/path/repo lock keys, stale-head checks, and the requirements for future finer-grained leases.


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
- [`@shapeshift-labs/frontier-inspect`](https://www.npmjs.com/package/@shapeshift-labs/frontier-inspect): Cross-package inspection/evidence bundles, registry graph snapshots, feature/resource impact reports, timeline/event normalization, redaction, JSONL import/export, and AI-readable app feature maps.
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
- [`@shapeshift-labs/frontier-lang-kernel`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-kernel): Runtime-neutral semantic source graph, type/lattice/extern declarations, patch bundles, replay, hashing, evidence records, and merge-admission kernel for Frontier Lang.
- [`@shapeshift-labs/frontier-lang-parser`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-parser): Dependency-light Frontier Lang parser for modules, entities, state, actions, effects, types, externs, targets, and lattice declarations.
- [`@shapeshift-labs/frontier-lang-checker`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-checker): Checker and diagnostics for Frontier Lang semantic documents, including type symbols, effects, regions, lattice laws, CRDT metadata, and patch evidence.
- [`@shapeshift-labs/frontier-lang-typescript`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-typescript): TypeScript projection adapter for Frontier Lang semantic documents, including type/entity/state/action/extern declarations and CRDT lattice descriptors.
- [`@shapeshift-labs/frontier-lang-javascript`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-javascript): JavaScript projection adapter for Frontier Lang semantic documents, including ESM action stubs and schema/lattice descriptors.
- [`@shapeshift-labs/frontier-lang-rust`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-rust): Rust projection adapter for Frontier Lang semantic documents, including structs, aliases, and action stubs.
- [`@shapeshift-labs/frontier-lang-python`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-python): Python projection adapter for Frontier Lang semantic documents, including dataclasses, typed patch records, and action stubs.
- [`@shapeshift-labs/frontier-lang-c`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-c): C header projection adapter for Frontier Lang semantic documents, including structs and action prototypes.
- [`@shapeshift-labs/frontier-lang-compiler`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-compiler): Compiler facade for Frontier Lang source documents, including parse, check, hash, diagnostics, universal AST envelopes, proof/paradigm semantic summaries, projection to TypeScript, JavaScript, Rust, Python, and C, and native source-import adapters for semantic merge evidence.
- [`@shapeshift-labs/frontier-lang-swift`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-swift): Swift source-language importer package for Frontier Lang semantic documents, including package-level metadata, SwiftSyntax adapter helpers, native import results, and semantic sidecar generation for SwiftSyntax/SwiftParser-shaped syntax trees.
- [`@shapeshift-labs/frontier-lang-kotlin`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-kotlin): Kotlin PSI source-language importer package for Frontier Lang semantic documents, including package-level metadata, Kotlin PSI adapter helpers, native import results, and semantic sidecar generation for Kotlin PSI/KtFile-shaped syntax trees.
- [`@shapeshift-labs/frontier-lang-java`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-java): Java source-language importer package for Frontier Lang semantic documents, including package-level metadata, Java AST adapter helpers, native import results, and semantic sidecar generation for javac/JDT/JavaParser-shaped ASTs.
- [`@shapeshift-labs/frontier-lang-go`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-go): Go source-language importer package for Frontier Lang semantic documents, including package-level metadata, Go AST adapter helpers, native import results, and semantic sidecar generation for go/ast File or Package trees.
- [`@shapeshift-labs/frontier-lang-csharp`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-csharp): C# Roslyn source-language importer package for Frontier Lang semantic documents, including package-level metadata, Roslyn adapter helpers, native import results, and semantic sidecar generation for SyntaxTree/SyntaxNode-shaped ASTs.
- [`@shapeshift-labs/frontier-lang-clang`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-clang): Clang AST source-language importer package for Frontier Lang semantic documents, including package-level metadata, Clang AST JSON adapter helpers, native import results, and semantic sidecar generation for C/C++ translation units.
- [`@shapeshift-labs/frontier-lang-cli`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang-cli): Command line interface for parsing, checking, hashing, and emitting Frontier Lang projects.
- [`@shapeshift-labs/frontier-lang`](https://www.npmjs.com/package/@shapeshift-labs/frontier-lang): Umbrella package for Frontier Lang kernel, parser, checker, compiler facade, universal AST helpers, projection adapters, and source-language importer adapters.
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
- [`siliconjungle/-shapeshift-labs-frontier-inspect`](https://github.com/siliconjungle/-shapeshift-labs-frontier-inspect)
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
- [`siliconjungle/-shapeshift-labs-frontier-swarm-codex`](https://github.com/siliconjungle/-shapeshift-labs-frontier-swarm-codex)
- [`siliconjungle/-shapeshift-labs-frontier-lang-kernel`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-kernel)
- [`siliconjungle/-shapeshift-labs-frontier-lang-parser`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-parser)
- [`siliconjungle/-shapeshift-labs-frontier-lang-checker`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-checker)
- [`siliconjungle/-shapeshift-labs-frontier-lang-typescript`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-typescript)
- [`siliconjungle/-shapeshift-labs-frontier-lang-javascript`](https://github.com/siliconjungle/-shapeshift-labs-frontier-lang-javascript)
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

## Install

```sh
npm install @shapeshift-labs/frontier-swarm-codex
```

## Local Development

`@shapeshift-labs/frontier-swarm-codex` keeps `@shapeshift-labs/frontier-swarm` as an exact semver dependency so package metadata remains publishable. Local package tests run `npm run test:local-deps` before build and typecheck; that guard checks the declared version against the adjacent `packages/frontier-swarm` package and fails when a package-local install would resolve to a registry copy. The full smoke test repeats the guard after `build.mjs` has relinked local Frontier dependencies and requires resolution to land on the adjacent `packages/frontier-swarm` candidate. Do not replace the dependency with `workspace:`, `file:`, or `link:` unless the release tooling is updated to rewrite those specifiers before publish.

## CLI

```sh
frontier-swarm-codex plan \
  --manifest inkwell/agent-ownership.json \
  --tasks inkwell/parity-work-queue.json \
  --outDir agent-runs/codex-swarm/plan

frontier-swarm-codex run \
  --manifest inkwell/agent-ownership.json \
  --tasks inkwell/parity-work-queue.json \
  --max-concurrency 4 \
  --workspace copy \
  --include AGENTS.md,package.json,inkwell \
  --exclude node_modules,dist,agent-runs \
  --link-path packages \
  --link-node-modules true \
  --semantic-import \
  --sandbox workspace-write

frontier-swarm stop --run agent-runs/codex-swarm/run-1

frontier-swarm collect \
  --run agent-runs/codex-swarm/run-1 \
  --outDir agent-runs/codex-swarm/run-1/collected \
  --branch-prefix codex/swarm-slice
```

## API

```ts
import {
  createCodexSwarmPlan,
  runCodexSwarm
} from '@shapeshift-labs/frontier-swarm-codex';

const plan = createCodexSwarmPlan({ manifest, tasks });

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
```

App-specific adapters should keep orchestration inside this package and use hooks for local policy. `prepareJobWorkspace` can link generated package artifacts or shared fixtures, `renderJobPrompt` can append product-specific migration rules, `changedPathFilter` can hide runner-owned symlinks from ownership checks, and `onJobStarted`/`onJobFinished`/`onSwarmFinished` can mirror lifecycle records into project-specific JSONL streams.

Use `modelPolicy: 'config-default'` for portable swarms that should respect each machine's Codex config. Use `modelPolicy: 'plan'` only when the installed Codex CLI and account are known to accept the planned model IDs in the supported catalog: `gpt-5.5`, `gpt-5.4-mini`, `o4-mini`, and `gpt-4.1-mini`. Unsupported explicit or plan-forwarded models fail during argument construction instead of entering worker args. `approval: 'full-auto'` and `--approval-policy full-auto` are normalized to the current `--ask-for-approval never` spelling.

Pass `--semantic-import` or `semanticImport: true` to write a `semantic-imports.json` sidecar for changed source files. The sidecar uses the optional `@shapeshift-labs/frontier-lang` dependency to import supported native sources into Frontier Lang universal ASTs, summarize source maps/losses/semantic indexes, and attach semantic merge-candidate metadata to each worker merge bundle. Use `--semantic-import-include`, `--semantic-import-exclude`, `--semantic-import-max-files`, and `--semantic-import-max-bytes` to keep the import pass scoped.

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

Raw worker execution and coordinator-agent drain are separate phases. The worker phase leases jobs from the local queue, runs Codex in the assigned workspace, and writes immutable output such as `merge.json`, `changes.patch`, `last-message.md`, verification records, semantic sidecars, and evidence artifacts. A worker should produce a patch, action, or concrete follow-up when the task makes that possible; evidence-only handoffs are for discovery, diagnostics, or true blockers, not a substitute for an obvious edit.

Worker stdout and stderr are streamed directly to `codex-events.jsonl` and `codex-stderr.log` with backpressure. The parent extracts token metrics incrementally from JSONL events and keeps only the latest bounded summary in memory, so log-heavy multi-worker runs do not need to reread or retain raw Codex event files before writing dashboards and merge bundles.

Worker prompts include a Human Question Contract. Workers should ask a person only after repo context, tests, task JSON, ownership rules, and coordinator policy cannot decide the issue. Stale patches, failed applies, routine review, queue classification, and answerable implementation details should become patches, reruns, rejects, record-only/discovery evidence, or concrete follow-up, not questions. A true question must be one structured line: `human-question: owner=<role>; surface=<package/path>; missing-authority=<policy/fact/approval>; question=<single answerable question>; answer-code=<approve|reject|choose:<option-id>|provide:<fact-id>>`. The `answer-code` names the accepted answer shape so the coordinator can unblock the queue with a stable code.

The default `runCodexSwarm` follow-up is coordinator-agent drain, so normal runs try to drain themselves after workers finish. Drain collects worker bundles, builds the merge index and hierarchical queue, assigns queue decisions such as `apply-local`, `queue-local`, `promote`, `rerun`, `reject`, `record-only`, and `block`, then applies only admitted work under the repo lock and configured gates. Local queues keep clean work near the lane, path, semantic region, or custom scope that can prove it; promotion moves work upward only when a parent queue needs to serialize a conflict, risk, or ownership decision.

Each run writes event streams under `streams/`, a `coordinator-dashboard.json` snapshot, `pids.json`, workspace proofs, patch files, merge bundles, and job results with merge-readiness classification. Auto-drain writes `auto-drain/auto-drain.json` and mirrors the drain summary into `swarm-results.json` and `coordinator-dashboard.json`. If the coordinator checkout is dirty, auto-drain stays collect-only: it records `autoDrain.skippedReason: "dirty-worktree"`, queue/dashboard/operator-summary artifacts, and pending ready work, then waits for a clean checkout and an explicit `frontier-swarm-codex drain --run <run-dir>` with the same gates.

Read unresolved queue counts as coordinator pressure, not landed work. Stale, conflicting, failed, invalid, evidence-poor, unreviewed, queued, or promoted work still needs a drain decision: rerun, reject, queue locally, record, close, apply, or commit. A true human blocker is rare and should name the owner, affected surface, and exact missing authority or question the coordinator cannot answer locally.

Human answers can be written as JSONL records in `human-action-answers.jsonl` at the run root, or passed explicitly with `--auto-drain-human-answer-log`. Answer records match by `decisionId`, `questionId`, `questionCode`, `queueItemId`, `taskId`, or `jobId`. Auto-drain writes `auto-drain/human-answer-routing.json`, marks consumed answers, removes answered explicit decisions from open `humanQuestions`, and routes answered queue blockers as continuations so they no longer appear as open true blockers.

When focused or matching global gates are configured, auto-drain may promote scoped patch candidates from `needs-human-port` into the coordinator apply queue. Treat `promotedPatchCandidateCount` as coordinator-gated queue pressure, not landed work or worker verification, until the matching autonomous apply decision is `applied` or `committed`.

Dashboard consumers should treat `operatorSummary` as the human-facing queue status. Render `coordinator-dashboard.json.operatorSummary` or `queueMetadata.operatorSummary` for the top-line status, headline, cards, and display counts. Keep `queueHealth`, `queueMetadata.actionCounts`, and `queueMetadata.bucketCounts` as drill-down diagnostics; do not derive separate blocker badges from `needs-human-port`, `stale-against-head`, rerun pressure, or conflict-blocked counters. Blocker UI should come from `operatorSummary.status`, the `true-blockers` card/count, and explicit `humanQuestions`.

Use `--no-auto-drain` only for raw diagnostic runs that should not attempt coordinator apply; in that mode `queueMetadata.available` is false instead of asking dashboards to infer queue semantics from flat review buckets. `discoverCodexHandoffArtifacts` scans job directories for `last-message.md`, debug handoffs, replay logs, watchpoints, traces, diagnostics, logs, evidence JSON, and patches; `runCodexJob` adds those paths to result evidence and `metadata.codexHandoffArtifacts` so coordinator dashboards can link directly to replay/debug artifacts. `frontier-swarm stop --run <run-dir>` reads the pid manifest and terminates live worker processes without manually hunting process state.

`frontier-swarm collect --run <run-dir>` derives status from immutable worker overlays instead of asking workers to edit a central queue. It scans `merge.json` files and writes:

- `ready-to-apply/` for auto-mergeable verified slices,
- `needs-human-port/` for patch candidates and discovery-only results,
- `failed-evidence/` for failed workers, evidence-poor outputs, ownership violations, or failed required commands,
- `stale-against-head/` for patch bundles that no longer apply.

It also writes `merge-index.json`, `hierarchical-merge-queue.json`, and `queue-overlay.json` so coordinator dashboards can show queue pressure such as stale patches, conflicts, local-apply demand, local queue capacity, promotions, reruns, rejects, and record-only work separately from rare true blockers that need an explicit human answer. `collection.json.summary` and `collection.json.artifacts.counts` carry the same merge-queue action counts for consumers that read only the collection artifact. The optional `--branch-prefix` adds suggested tiny patch branch names to each collected bundle so accepted slices can become one small branch/commit per surface, evidence path, and queue status overlay.

Collected bundles also carry `metadata.frontierSwarmCodex.collection.head` when the repository head can be read. Autonomous apply treats that head as the source head for the collected patch and revalidates it under the repo lock before mutation.

Pass `--promote-patch-candidates` to `collect` only when coordinator verification gates are available. Promotion is limited to owned, applying `patch-candidate` bundles with no ownership violations or failed commands, and requires either `--focused-command` / `--promotion-focused-command` or a matching `--global-command` plus `--global-glob` / `--promotion-global-glob`. Promoted bundles move from `needs-human-port/` to `ready-to-apply/` with `metadata.coordinatorPatchCandidatePromotion`, and `promotedPatchCandidateCount` records the queue pressure created for the coordinator.

`frontier-swarm apply --collection <collection-dir>` reviews the `ready-to-apply/` bucket and writes `apply-ledger.json`. It defaults to `--dry-run`, which runs `git apply --check` without mutating the checkout. Non-dry-run apply refuses a dirty worktree unless `--allow-dirty` is passed, and can optionally create small branches with `--branch-prefix` and commits with `--commit`.

`frontier-swarm autonomous-apply --collection <collection-dir>` (alias: `drain`) is the explicit coordinator self-merge path for an existing collection or run. It uses the same queue/admission decisions as default coordinator-agent auto-drain, but it does not launch workers or read raw worker output directly. It admits only `ready-to-apply/` bundles, takes a repo-local Git lock, re-reads the current head, compares it with the collected source head when available, re-checks the patch, applies it, runs `--focused-command` and matching `--global-command` gates, and rolls the patch back when a required gate fails. If the head changed since collection, autonomous apply records `rerun` when the patch still checks cleanly or `conflict-blocked` when `git apply --check` fails; it does not apply stale collected work. Each bundle writes an append-only `autonomous-merge-decisions.jsonl` record plus `autonomous-queue-overlay.json`; applied, committed, skipped, and rejected decisions become terminal queue overlay entries so coordinator-review debt can drain instead of piling up. It applies by default and refuses dirty worktrees unless `--allow-dirty` is passed.

When `autonomous-apply` or `drain` is given `--run`, it first collects that run. With focused gates, or global gates whose `--global-glob` matches changed paths, patch-candidate promotion is enabled by default; use `--promote-patch-candidates=false` or `--no-promote-patch-candidates` to keep candidates in `needs-human-port/`. The same explicit `--promote-patch-candidates` flag is accepted for operator scripts that want promotion intent visible in the command line.

Use `--auto-drain-commit` on `frontier-swarm-codex run` only when the coordinator is authorized to leave the repository with one commit per admitted bundle after the patch applies and required gates pass. Use `--commit` for the same contract on an explicit `frontier-swarm-codex autonomous-apply` or `drain` pass. Leave commit mode off when a human will batch, squash, amend, or inspect the final diff before committing. Commit mode does not change queue admission; it only changes the successful terminal outcome from `applied` to `committed`.

Autonomous commit messages must identify the source bundle and queue work so any repository can trace the Git commit back to the swarm evidence. The built-in subject is `Autonomous apply: <taskId-or-jobId>` and the body records the autonomous decision kind, status, reason, job id, task id, queue item ids, lock scope, lock keys, and bundle path. The decision ledger, not the commit message, is the queue source of truth: a `committed` decision closes its `queueItemIds`, records the new head in `headAfter` and `commit`, and includes the required gate proof in `verification`. `autonomous-apply.json`, `auto-drain.json`, and `autoDrainArtifacts.summary` roll this up as committed, gated, and verification-gate counts for dashboard and self-merge audit consumers. If `git add` or `git commit` fails, autonomous apply records `failed`, resets staged paths after a commit failure, attempts to reverse-apply the patch, and does not close the queue item as satisfied.

`frontier-swarm score --collection <collection-dir>` applies each collected bundle in a throwaway workspace and writes `patch-score.json`. Use `--focused-command` for the gate that proves the slice and `--global-command` with `--global-glob` for shared-code smoke/type/build gates. Scores are classified as `accepted-clean`, `accepted-needs-port`, `conflict`, `test-fail`, `stale`, or `evidence-only`, so the coordinator can review the best patch candidates before manually reading every bundle.

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
- `applyCodexSwarmCollection`
- `autonomousApplyCodexSwarmRun`
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
