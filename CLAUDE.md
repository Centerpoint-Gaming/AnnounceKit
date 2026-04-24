# AnnounceKit — agent working agreement

This file is the rules of engagement for any AI agent working in this repo. It's loaded automatically every session.

## Current focus

**Milestone V1.5 — close the image-gen data gaps.** V1 captures enough to display a game profile; it does not yet capture enough to drive a modern image generator (Flux, Ideogram, Nano Banana, Imagen, etc.) to on-brand results. The punch list is in [`docs/roadmap.md`](docs/roadmap.md), organized in four tiers by cheapness × leverage.

When starting new work, prefer a task that closes an open tier-1 box. If you think a later-tier item should jump the queue, say why in the PR. Update `docs/roadmap.md` when you finish a box or discover a new gap.

## The bar for "done"

`npm run verify` exits 0. Not "code compiles", not "tests mostly pass", not "I tested it locally". Green verify is the bar.

When reporting a feature as complete, always quote:
- The exit code of `npm run verify`
- A one-line summary of each layer (types pass/fail, N/N unit tests, N/N e2e tests)
- Any failure lines verbatim from `.verify/unit.json` or `.verify/e2e.json`

If verify is red for reasons unrelated to your change, say so explicitly — don't pretend the work is done.

## Verify pipeline

| Layer | Command | What it proves |
|-------|---------|----------------|
| 1. Types | `npm run verify:types` | `tsc --noEmit` on both `packages/core` and `extensions/chrome`. No `any` regressions, no broken imports. |
| 2. Unit | `npm run verify:unit` | Vitest contract tests in `packages/core/tests/` run against committed Steam fixtures. Deterministic. Fast (<3s). |
| 3. E2E | `npm run verify:e2e` | Vite-builds the extension, launches Chromium with it loaded, intercepts Steam network with fixtures, asserts the full content-script → service-worker path. No live Steam calls. |

JSON reports at `.verify/unit.json` and `.verify/e2e.json`. Parse them when you need structured diagnostics.

## Working on features

1. **Start from a contract.** If the user hasn't given one, propose a typed spec (inputs, outputs, failure `reason` enum) before writing code. This repo is contract-driven; every public function in `packages/core` is shaped like `Contract 2: fetchStoreMetadata` and `Contract 3: extractPalette`.
2. **Implement in core first.** Platform-agnostic logic goes in `packages/core/src/<contract>.ts`. No `chrome.*`, no `OffscreenCanvas`, no DOM — core must be importable from any medium.
3. **Wrap for the medium.** Browser/extension-specific bits go in `extensions/chrome/src/background/` or equivalent. The wrapper adapts transport (fetch, canvas, storage) and delegates to the pure core function.
4. **Fixture + test.** Capture real fixtures via `npm run refresh-fixtures -- <appId>`. Write tests in `packages/core/tests/<contract>.test.ts` covering the happy path, every declared failure mode, and a snapshot of the full output.
5. **Update `ARCHITECTURE.md`.** Add a contract entry describing inputs, outputs, failure modes, performance budget.
6. **Run `npm run verify`.** Iterate until green.

## Contract conventions

- **Result, not throw.** Every fallible function returns `Result<T, E>` from `packages/core/src/result.ts`. Use `ok(data)` / `err({ reason, message })`. Never throw for expected failures; never return `null | T` as a failure signal.
- **Enumerated error reasons.** `PaletteError.reason`, `StoreFetchError.reason` — error types carry a narrow union of reason strings, not free-form messages. Add a new reason by extending the union, not by squeezing meaning into `message`.
- **Pure in core.** `packages/core` is platform-agnostic TypeScript. Anything that needs a browser API lives in a medium.
- **No hidden throws.** Internal throws are fine if caught at the boundary and converted to `Result`. Don't leak them.

## Fixture discipline

- Fixtures live in `packages/core/tests/fixtures/{api,images,pages}/`. They are committed — the diff is the truth.
- Refresh with `npm run refresh-fixtures -- <appId>...`. Commit the diff, even if it looks noisy. Steam schema drift is invisible unless fixtures are kept current.
- Snapshot files in `__snapshots__/` are regenerated via `npm --prefix packages/core run test:update`. Only regenerate when the behavior change is intentional and reviewed.
- Don't invent fixture data. Don't hand-edit captured JSON or HTML. If a fixture is wrong, capture a new one.

## Task tracking

Use `TaskCreate` for any multi-step feature work. Mark each task `in_progress` when you start it and `completed` the moment it's done — don't batch. This lets the user watch progress and resume mid-session.

## Don't

- Don't run destructive git commands (`reset --hard`, `stash` against dirty trees, force-push, branch deletion) without explicit user approval for that specific action.
- Don't skip verify layers to "save time" — if types are red, the user needs to know, not discover later.
- Don't add `// @ts-ignore`, `any`, `skipLibCheck` tweaks, or other shortcuts that silence real errors. Fix the root cause.
- Don't create helpers or abstractions "for the future". Write the three similar lines. Extract when a third caller actually lands.
- Don't install global tooling or edit global config. Add devDependencies at the workspace root.
- Don't write comments explaining what the code does. Only write comments when the *why* is non-obvious (a workaround, a hidden invariant, a performance-critical choice).

## Automated hooks

Two hooks run automatically via `.claude/settings.json`:

- **PostToolUse on `Edit|Write|MultiEdit`** → runs `npm run verify:types`. If tsc finds errors, stderr is shown to Claude and should be fixed before continuing.
- **Stop** → runs `npm run verify:unit && npm run verify:e2e` via `.claude/hooks/stop-verify.sh` (a 3-line wrapper). On failure, emits `{"decision":"block","reason":"..."}` so Claude continues instead of declaring the work done.

**Bypass:** add `"disableAllHooks": true` to `.claude/settings.local.json` (local, gitignored). Use sparingly — the point of these hooks is that "done" means verified.

## Reference

- Roadmap / current milestone: `docs/roadmap.md`
- Architecture: `ARCHITECTURE.md`
- Human-facing overview: `README.md`
- Verify workflow details: `README.md` → Testing & Validation
- Fixture refresh script: `scripts/refresh-fixtures.ts`
- Vitest config: `packages/core/vitest.config.ts`
- Playwright config: `playwright.config.ts`
- Hook scripts: `.claude/hooks/`
