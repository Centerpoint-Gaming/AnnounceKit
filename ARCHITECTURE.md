# AnnounceKit Architecture

A tool for generating announcement thumbnails and banners, starting with Steam. The architecture separates **core logic** from **mediums** so the rendering engine, prompt system, and data models can be reused across different interfaces.

## Core vs Medium

```
┌─────────────────────────────────────────┐
│              packages/core              │
│  Platform-agnostic logic & types        │
│  - Steam page parsing & store metadata  │
│  - Palette extraction (k-means)         │
│  - Profile assembly (pure merge)        │
│  - Prompt section pipeline              │
│  - Thumbnail generation transport       │
│  - BinaryStore + brand-assets contracts │
│  No browser-extension dependencies      │
└──────────────────┬──────────────────────┘
                   │ imports
┌──────────────────▼──────────────────────┐
│     extensions/chrome (medium #1)       │
│  Chrome-specific wiring                 │
│  - Content script (page scrape)         │
│  - Service worker (network + canvas)    │
│  - Popup UI (React + Tailwind)          │
│  - Storage adapters (chrome.storage,    │
│    IndexedDB binary store)              │
└─────────────────────────────────────────┘
```

**Architectural rule.** Core is push-fed, never pull-fed. The medium gathers (fetches, scrapes, hashes, caches) and hands ready-shaped core types to core functions. Core never reaches for `fetch`, `chrome.*`, `OffscreenCanvas`, or any storage backend.

## Stack

| Layer            | Technology                        |
|------------------|-----------------------------------|
| Monorepo         | npm workspaces                    |
| Core package     | TypeScript (DOM lib for fetch/AbortSignal) |
| Chrome extension | Manifest V3, React, Vite, Tailwind CSS |
| Build            | Vite (3-stage: popup, content IIFE, service worker IIFE) |
| Testing          | Vitest (unit) + Playwright (e2e) |

## Project Structure

The shape below lists **directories** and **contract files** (the public surface of `packages/core`). Implementation files, UI components, and medium-internal modules are not enumerated — they churn. If you add a new *contract*, list it here. If you add a React component or a storage helper, don't.

```
AnnounceKit/
├── packages/core/                      # Platform-agnostic. No browser APIs.
│   ├── src/
│   │   ├── index.ts                    # Public API barrel — re-exports each domain
│   │   ├── result.ts                   # Contract: Result<T, E>, ok(), err()
│   │   ├── cache/                      # ContextCache + StorageAdapter + cacheKeys
│   │   ├── steam/                      # page.ts, store-metadata.ts (parsers + fetchStoreMetadata)
│   │   ├── palette/                    # extractPaletteFromImageData
│   │   ├── profile/                    # types.ts (GameProfile, GameBrand, StoredAsset) + assemble.ts
│   │   ├── prompt/                     # PromptContext + section pipeline
│   │   │   ├── context.ts              # PromptContext type
│   │   │   ├── build.ts                # buildPromptFromContext + ordered SECTIONS
│   │   │   └── sections/               # one file per contributor
│   │   ├── thumbnail/                  # generate.ts (Gemini transport)
│   │   ├── binary-store/               # BinaryStore interface (medium implements it)
│   │   └── brand-assets/               # validation + hashing + immutable bucket helpers
│   └── tests/                          # Vitest, mirrors src/ layout, committed Steam fixtures
├── extensions/chrome/                  # Medium #1
│   ├── src/
│   │   ├── popup/                      # React UI (components churn — not listed)
│   │   ├── content/                    # Content script: page scraping
│   │   ├── background/                 # Service worker + OffscreenCanvas wrapper
│   │   ├── adapters/                   # chrome.storage StorageAdapter
│   │   └── storage/                    # ContextCache + IndexedDB BinaryStore wiring
│   ├── tests/e2e/                      # Playwright
│   ├── public/manifest.json
│   └── vite.{config,content.config,sw.config}.ts
├── scripts/refresh-fixtures.ts
├── playwright.config.ts
├── docs/roadmap.md                     # V1.5 punch list (image-gen data gaps)
├── ARCHITECTURE.md
├── CLAUDE.md
└── README.md
```

**The rule of thumb:** a new file requires a doc edit only if it's a new contract in `packages/core/src/` or a new top-level directory.

## Contracts

### detectPageContext (steam/page.ts)

Pure parsers for Steam's `#application_config` payload. Runs in the content script; the script handles DOM access and passes raw JSON strings into core. Editor fields are matched by placeholder text (Steam obfuscates class names) — English-only, falls back to structured `data-partnereventstore`.

### fetchStoreMetadata (steam/store-metadata.ts)

**Input:** App ID + optional `{ fetch, timeout, signal }`
**Output:** `Result<StoreMetadata, StoreFetchError>`
**Errors:** `not-found | rate-limited | network-error | timeout | aborted | parse-error`

Primary: Steam `appdetails` API. Fallback: store-page HTML scrape for user tags. Library hero URL constructed from CDN pattern.

### extractPaletteFromImageData (palette/index.ts)

**Input:** RGBA `Uint8ClampedArray` (medium decodes the image first)
**Output:** `Result<Palette, PaletteError>`

Deterministic k-means++ (k=8). Returns primary/secondary/accent/neutral hex codes, full 8-cluster array, plus `vibrancy` and `luminance` classifications.

### ContextCache (cache/index.ts)

Platform-agnostic cache. Each medium provides a `StorageAdapter` (Chrome uses `chrome.storage.local`; in-memory adapter ships for tests). Per-entry-type schema versions in `CACHE_SCHEMA_VERSIONS` — bumping one type invalidates only that type. Storage errors degrade to cache miss; never surface to UI.

### assembleGameProfile (profile/assemble.ts)

Pure merge of core types into a `GameProfile`. The medium fetches and hands core-typed inputs.

```ts
assembleGameProfile({
  appId: string,
  metadata: StoreMetadata,   // from fetchStoreMetadata
  palette: Palette,          // from extractPaletteFromImageData
  brand?: GameBrand,         // existing bucket to preserve, defaults to empty
  now?: number,              // override Date.now() for tests
}): GameProfile
```

### PromptContext + buildPromptFromContext (prompt/)

A typed bag of inputs the prompt builder reads:

```ts
interface PromptContext {
  game?: { name, shortDescription?, detailedDescription?, tags?, requiredAge? };
  announcement?: { title?, subtitle? };
  palette?: Palette;
  references?: { hero?, logo?, screenshots?, pastEventThumbnails? };
  derived?: { vlmCaptions?, moodTags?, blendedPalette? };
  target?: { aspectRatio?, surface? };
}
```

Every field optional. Sections that need a missing field skip themselves. The medium populates whatever it has; core synthesizes.

`buildPromptFromContext(ctx)` runs an ordered list of `PromptSection`s and joins their fragments. Reference selection is medium policy — core formats text from `ctx`, the medium chooses which `references` to send to `generateThumbnail`.

### generateThumbnail (thumbnail/generate.ts)

**Input:** `{ apiKey, prompt: string, references?: ThumbnailReference[], model?, signal?, fetchImpl? }`
**Output:** `Result<GeneratedThumbnail, ThumbnailGenError>`
**Errors:** `missing-api-key | missing-prompt | network | api-error | no-image-returned | invalid-response`

Pure transport — does not build prompts, does not select references. The medium builds the prompt via `buildPromptFromContext`, resolves any `StoredAsset.binaryRef` to bytes via its `BinaryStore`, packages them as `ThumbnailReference[]`, and calls this function.

### editThumbnail (thumbnail/edit.ts)

**Input:** `{ apiKey, instruction: string, priorImage: ThumbnailReference, references?: EditReference[], model?, signal?, fetchImpl? }`
**Output:** `Result<EditedThumbnail, ThumbnailEditError>`
**Errors:** `missing-api-key | missing-instruction | missing-prior-image | network | api-error | no-image-returned | invalid-response`

Iterative refinement on a previously generated thumbnail. The contract wraps a free-form natural-language `instruction` with a preservation guard + the shared `NO_TEXT_RULE`, places the prior image as inline part 1 (the canvas), and appends each `EditReference` after it.

`EditReference` carries a `role` (`pose | item | character | environment | style | other`) so the prompt addresses each attachment by 1-based index with a role-specific clause — e.g. attachment 2 (pose reference): "match the pose, body language, and gesture; do NOT copy art style or background." Without role attribution the model averages all attachments together.

Statelessness is intentional. Compounding chains (chat-style edit history) are the medium's job: feed the latest output back as `priorImage` next round.

### BinaryStore (binary-store/index.ts)

Content-addressed byte storage. Pure interface; the medium implements it (Chrome uses IndexedDB). Bytes keyed by SHA-256 hex digest — same content → same key, so `put()` is idempotent.

### brand-assets helpers (brand-assets/index.ts)

Pure helpers for the unified `GameProfile.brand.brandAssets` bucket: SHA-256 hashing, MIME validation, dedup-aware add/remove/rename. The bucket holds both user uploads and Steam-derived assets the user promoted into the brand collection — both shapes share `StoredAsset`.

## Data Flow

1. **User navigates** to a Steam page. Content script runs `detectPageContext()` (parses `#application_config`).
2. **Service worker** receives `PAGE_CONTEXT_READY`, sets the badge.
3. **Popup** opens, requests fresh page context, then checks the cache for a saved `GameProfile`.
4. **Cache hit** → display immediately.
5. **Cache miss** — popup orchestrates:
   - Sends `FETCH_GAME_DETAILS` → service worker calls `fetchStoreMetadata` → returns `StoreMetadata`
   - Sends `EXTRACT_PALETTE` → service worker fetches the image, decodes via `OffscreenCanvas`, calls `extractPaletteFromImageData` → returns `Palette`
   - Calls `assembleGameProfile({ appId, metadata, palette })` to merge into a `GameProfile`
   - Persists via `saveGameProfile`
6. **User clicks Generate** — popup sends `GENERATE_THUMBNAIL` with the profile + announcement title.
7. **Service worker** builds a `PromptContext` from the profile + title, runs `buildPromptFromContext`, then calls `generateThumbnail({ apiKey, prompt, references })`.

## Adding a Prompt Section

Sections are independently testable contributors to the prompt. To add one:

1. Create `packages/core/src/prompt/sections/<id>.ts` exporting a `PromptSection`. Read whatever fields you need from `ctx` and return either a string fragment or `null` (skip when inputs are missing).
2. Append the section to the `SECTIONS` array in `packages/core/src/prompt/build.ts` at the position where it reads naturally (subject first sets the frame; style-constraints last locks the format).
3. If your section reads new context fields, add them to `PromptContext` in `prompt/context.ts`. Existing sections ignore unknown fields — adding a field is non-breaking.
4. Write per-section unit tests in `tests/prompt/sections.test.ts` covering both the present-input and missing-input cases.
5. Update `tests/prompt/build-prompt.test.ts` snapshots if the new section changes the assembled prompt for the canonical fixture.

There is no plugin/registration system — core owns the canonical `SECTIONS` array. Mediums pass data, not behavior. Different mediums that genuinely need different phrasing should drive that via `ctx.target` rather than custom sections.

## Adding a New Medium

To add a new way to interact with AnnounceKit (e.g., a web app):

1. Create a new directory (e.g., `apps/web/`).
2. Import types and functions from `@announcekit/core`.
3. Implement a `StorageAdapter` for your persistence backend; pass it to `createContextCache`.
4. Implement a `BinaryStore` if you need brand-asset uploads.
5. Wire your I/O (Steam fetch, palette extraction, Gemini call) — call core's pure functions to do the work.
6. Build your UI.

The shared surface — Steam parsing, store fetching, palette extraction, profile assembly, prompt building, thumbnail transport, brand-asset helpers — is medium-agnostic.
