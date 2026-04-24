# 0002 — Dependency injection doctrine

**Status:** accepted — 2026-04-24

## Context

The audit found that no existing contract in `packages/core` used dependency injection. Concrete implementations:

- `fetchStoreMetadata` called ambient `globalThis.fetch`; tests used `vi.spyOn(globalThis, 'fetch')`.
- `ChromeStorageCache` was constructed inside a module-level `getContextCache()` singleton.
- `MemoryCache` was a `new`-able class with no deps.
- The service-worker palette wrapper touched `fetch`, `createImageBitmap`, and `OffscreenCanvas` as ambient globals.

The proposed build plan for new contracts (`BinaryStore`, `BrandAssetsStore`, `Orchestrator`, `extractVisualSignature`) all assumed a `create*(deps)` factory pattern. The tension: if new contracts use DI and existing ones don't, the codebase fractures into two permanent styles. The real question was not "should new contracts use DI" but "do we retrofit the existing three, or carve out a permanent exception?"

## Decision

**Option A — every core contract uses factory-style DI.** No ambient globals inside contract code. No module-level singletons. Existing contracts retrofit to match.

### Concrete applications

- **`fetchStoreMetadata(appId, { fetch, timeout, signal })`** — `fetch` defaults to `globalThis.fetch` for ergonomics but is injectable. Tests pass a fake `fetch` instead of spying on the global. Non-browser environments (Node, Cloudflare Worker) pass their own.
- **`createContextCache({ storage })`** — replaces the `getContextCache()` singleton. `storage` is a `StorageAdapter` (small KV interface: `get` / `set` / `delete` / `list(prefix)`). The extension constructs one adapter over `chrome.storage.local`; tests use an in-memory `Map` adapter. No module-level state in core.
- **`createMemoryCache()`** — thin shim that wires `createContextCache` to an in-memory `StorageAdapter`. Matches the factory convention even though it has no real deps, so the signature doesn't change when the day comes that it does.
- **New contracts** (`createBinaryStore(deps)`, `createBrandAssetsStore(deps)`, `createOrchestrator(deps)`, `createVisualSignatureExtractor(deps)`) follow the same shape from day one.

### Adapter layer

`extensions/chrome/src/adapters/` is the DI seam where medium-specific code implements the core-declared interfaces. The first adapter is `chrome-storage-adapter.ts` over `chrome.storage.local`. Future adapters: `offscreen-canvas-adapter`, `fetch-adapter` (with timeout wrappers), etc.

## Consequences

- One DI pattern across the repo, not two. Contributors don't have to remember which contracts are "ambient" and which take deps.
- Medium wrappers become unit-testable — the chrome mock helper falls out of the adapter interface.
- Tests stop needing `vi.spyOn(globalThis, ...)`. Dependency passes are explicit.
- The audit's "singleton in `getContextCache()` is the main DI debt" is resolved in the same migration as this ADR.
- New contracts start with `createX(deps)` — no exceptions. Reviewers should reject a new contract with ambient globals.
- The retrofit was scoped at ~1 day in the architectural review. It was the only real debt from adopting this doctrine — future cost is zero.
