# 0004 — No telemetry for MVP

**Status:** accepted — 2026-04-24

## Context

The proposed package structure included `packages/core/src/shared/logging.ts` — a no-op logger with a typed event schema. The intent was to give every contract a structured place to emit "starting X", "finished X in Nms", "failed X with reason Y" events.

At MVP, there is no consumer. There is no second human using the tool, no dashboard, no error-reporting backend, and no compliance requirement. A structured logger now would be solving a problem that hasn't landed.

Separately, several agent-produced plans have a tendency to reach for Sentry, PostHog, or OpenTelemetry the moment a module named `logging.ts` exists. This ADR pre-empts that.

## Decision

**No telemetry module, no error-reporting SDK, no analytics, no metrics collection.** Through V1.5 and through the MVP demo.

What replaces it:

- **User-facing progress** — the orchestrator phase contract (see ADR 0005) emits `ProgressEvent` callbacks during long operations. The popup renders these directly. No logger in between.
- **Developer debugging** — `console.error` gated on a debug flag (`localStorage.debug` or a DevTools toggle) is enough. Errors from core are already Result-typed; the caller decides whether to log.
- **Test diagnostics** — Vitest output, Playwright traces, `.verify/*.json`. These are plenty.

## Consequences

- Reviewers should reject a PR that adds Sentry, PostHog, LaunchDarkly, OpenTelemetry, Datadog, or any similar SDK without an ADR superseding this one.
- No `packages/core/src/shared/logging.ts` file exists. Don't create one speculatively.
- This ADR is revisited under any of: (a) a second human starts using the tool, (b) error reporting is needed for a specific incident class, (c) a compliance requirement lands. Until then, this is the right answer.
- A structured logger is not architecturally hard to add later — the contracts already emit Results at the boundary. Retrofitting logging is a reviewer-gated mechanical change, not a design decision. Cost of deferring is ≈ zero.
