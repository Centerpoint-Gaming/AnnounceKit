# 0001 — Error-handling policy

**Status:** accepted — 2026-04-24

## Context

The audit of the context pipeline found three different error-handling styles across `packages/core`:

1. **Result<T, E>** — `fetchStoreMetadata`, `extractPaletteFromImageData` (matches CLAUDE.md's stated convention).
2. **Null-returning parsers with silent try/catch** — `steam-page.ts` helpers like `parseCommunityConfig`, `parsePartnerEventStore`.
3. **Silent degradation** — `ContextCache` swallows every storage error and returns `null` / `[]`.

CLAUDE.md at the time said "Result, not throw. Never return `null | T` as a failure signal." Taken literally, styles 2 and 3 were violations. In practice, each style is defensible in its own scope. What was indefensible was declaring one blessed style and shipping three.

## Decision

Three blessed styles, each with a defined scope. Mixing scopes is a review-blocking smell.

1. **`Result<T, E>` — default, required at contract boundaries.**
   Every exported contract in `packages/core` that can fail returns `Result<T, E>` where `E` carries a narrow union of enumerated `reason` strings plus an optional `message`. Never throw for expected failures. Never return `null | T` as a failure signal. This applies to any function crossing a module boundary or performing network/IO.

2. **Null-returning parsers — internal helpers only.**
   Parsers that extract a value from maybe-malformed input (e.g. `parseCommunityConfig(raw)`) may return `null` / `[]` when the input doesn't match the expected shape. The null means "input wasn't in the expected shape" — it is *absence*, not *failure*. These are internal helpers, not exported contracts. Callers treat the null as absence and decide what to do about it.

3. **Silent degradation — cache layer only.**
   The `ContextCache` interface swallows storage errors and returns cache-miss shapes (`null`, `[]`, `{ removed: 0 }`). This is an explicit design goal: UI must never show "your cache is broken" — a broken cache looks identical to a cold cache, and the caller re-fetches. Every method in `ContextCache` catches and logs (future — see ADR 0004). Error propagation from the cache is not allowed.

## Consequences

- CLAUDE.md's "Contract conventions" section carries a short "Error-handling scopes" summary pointing here.
- Future contracts default to style 1 unless they're one of the two specific exceptions above.
- The cache's silent-degradation style is load-bearing — don't "fix" it by retrofitting Results without reconsidering this ADR.
- Parsers that *do* have structured failure modes beyond "shape mismatch" (e.g. network errors, version conflicts) are not parsers in this sense — they are contracts, and use Result.
