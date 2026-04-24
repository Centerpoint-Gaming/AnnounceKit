# 0005 — Orchestrator phase contract

**Status:** accepted — 2026-04-24

## Context

Today `extensions/chrome/src/popup/App.tsx` is the de facto orchestrator: ~70 lines of `useCallback` / `useEffect` glue that sequence `getPageContext → checkCache → fetchStoreMetadata → extractPalette → assembleProfile → saveGameProfile`. The logic is neither portable (tied to React lifecycle), nor testable (no way to invoke without mounting the popup), nor progressively observable (a single spinner covers three different operations).

The plan was to extract this into a `packages/core/src/orchestrator/` contract. The questions to settle before building it were: how many phases, what state does the orchestrator own, what does a partial success look like, how do callers observe progress.

## Decision

### Three phases, each a separate idempotent method

```ts
interface Orchestrator {
  minimal(input: OrchestratorInput): Promise<Result<Context, OrchestratorError>>;
  partial(input: OrchestratorInput): Promise<Result<Context, OrchestratorError>>;
  complete(input: OrchestratorInput): Promise<Result<Context, OrchestratorError>>;
}
```

Semantics:

- **`minimal`** — cache hits plus page detection. No network. Fastest. Always safe to call first.
- **`partial`** — `minimal` plus fresh store metadata plus palette. Hits the network, may take ~1–3s.
- **`complete`** — `partial` plus visual signature. Potentially expensive (vision model call).

Each method is callable independently. The caller decides the progression (usually: `minimal` on popup open → `partial` once rendered → `complete` when the user asks for a thumbnail).

### Orchestrator holds no state

The orchestrator is a thin coordinator. It owns no caches, no timers, no request IDs, no progress counters between calls. State that needs to persist across phases lives in the `Context` object returned by each phase and passed to the next (or re-fetched from cache).

`createOrchestrator(deps)` returns a fresh instance. Creating per-use vs. per-session doesn't matter — either is safe.

### No retries

Transient failures (network error, timeout, rate-limit) return `err({ reason, ... })` from the failing contract. The orchestrator does not retry. The caller decides whether to re-invoke the failing phase, with what backoff, and whether to fall back to a degraded UI.

### Progress observation via callback

Each phase accepts an optional `onProgress` parameter:

```ts
interface OrchestratorInput {
  appId: string;
  onProgress?: (event: ProgressEvent) => void;
}

type ProgressEvent =
  | { kind: 'contract-started'; contract: ContractName }
  | { kind: 'contract-complete'; contract: ContractName; durationMs: number }
  | { kind: 'contract-failed'; contract: ContractName; reason: string };
```

No event-emitter dependency. No RxJS. Plain callback, tagged-union events. Portable to any environment that has a function type.

### Context shape carries partial results

```ts
interface Context {
  appId: string;
  completeness: 'minimal' | 'partial' | 'complete';
  pageContext: PageContext | null;
  storeMetadata: StoreMetadata | null;
  palette: Palette | null;
  visualSignature: VisualSignature | null;
  brandAssets: BrandAsset[];
  failures: Partial<Record<ContractName, { reason: string; message: string }>>;
}
```

A phase that partially succeeds returns `ok(context)` with the failed contract's output as `null` and an entry in `failures`. A phase that fails catastrophically (no usable context at all) returns `err(...)`. The caller can always render what's present.

### Visual signature stub policy

Until `extractVisualSignature` is implemented, the orchestrator's `complete` phase wires a stub that returns a **hand-crafted fixture** (committed to `packages/core/tests/fixtures/`), not `ok({})`. This ensures the orchestrator's integration tests exercise the real data shape and that swapping in the real implementation doesn't ship-break.

## Consequences

- `App.tsx` reduces to `const orch = useMemo(() => createOrchestrator({...}), []); orch.complete({ appId, onProgress: ... })`. The popup becomes a consumer, not a coordinator.
- The orchestrator is unit-testable via injected fakes for every downstream contract. Tests don't need a React renderer or a browser.
- Three phases is a ceiling, not a floor. Resist the temptation to add `justThePalette()` or `justTheMetadata()` — callers can invoke downstream contracts directly if they need a single piece.
- The stateless-no-retries rule pushes complexity outward to the caller. That's the right place for it: retry policy depends on the UX context, and the orchestrator doesn't know the UX context.
