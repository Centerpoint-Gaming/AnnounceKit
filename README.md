# AnnounceKit

A tool for generating thumbnails, announcement content, and translations — starting with Steam. The architecture separates portable core logic from platform-specific mediums so the same engine can power a Chrome extension, web app, CLI, or bot.

## Current Status

**V1 Milestone: Context Capture** — automatically detecting and extracting game data from Steam pages.

### What works today

- Chrome extension detects Steam announcement editor pages and extracts App ID, event title, subtitle, and body
- Fetches game metadata from the Steam Store API (name, description, genres, tags, screenshots, developer, publisher, release status)
- Extracts a structured color palette from game capsule art (k-means clustering with primary/secondary/accent/neutral roles, vibrancy + luminance classification)
- Persists game profiles in extension storage for instant loading on return visits
- Debug view for inspecting all captured context
- **Automated validation** — full type-check, unit, and E2E test pipeline via `npm run verify`

## Setup

```bash
# Install dependencies
npm install

# Install Playwright's Chromium binary (one-time, for E2E tests)
npx playwright install chromium

# Build the Chrome extension
npm run build:ext
```

## Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `extensions/chrome/dist`
5. Navigate to a Steam page and click the extension icon

> After loading, refresh any Steam pages that were already open so the content script injects.

## Testing & Validation

Every feature is validated through three layers. One entry point:

```bash
npm run verify
```

This runs types → unit → e2e and exits non-zero on any failure. Use it before declaring a change done.

| Command | What it runs | Speed |
|---------|--------------|-------|
| `npm run verify` | Full pipeline (types + unit + e2e) | ~15s |
| `npm run verify:types` | `tsc --noEmit` on core and chrome | ~2s |
| `npm run verify:unit` | Vitest contract tests against committed fixtures | ~3s |
| `npm run verify:e2e` | Builds extension + Playwright tests | ~10s |

Structured JSON reports land in `.verify/unit.json` and `.verify/e2e.json` for scripting or agent consumption.

### Contract tests (Layer 1)

Pure core functions (`parseSteamAppDetails`, `extractPaletteFromImageData`, `fetchStoreMetadata`) are tested in `packages/core/tests/` against committed Steam snapshots. No network. Deterministic via seeded k-means++ init + pinned fixture inputs.

### Extension E2E (Layer 2)

Playwright launches Chromium with the built extension loaded, intercepts every Steam network call with committed fixtures, navigates to a mocked Steam app page, and asserts the content-script → service-worker messaging path updates the action badge. No live Steam calls ever.

Tests live in `extensions/chrome/tests/e2e/`.

### Fixtures

All tests use committed snapshots of real Steam responses from `packages/core/tests/fixtures/`:

- `api/<appId>.json` — appdetails API response
- `images/<appId>-capsule.jpg`, `<appId>-header.jpg` — capsule and header art
- `pages/<appId>.html` — store page HTML (for DOM-parsing tests)

To refresh from live Steam:

```bash
npm run refresh-fixtures -- 1366800 <more-app-ids>
```

Commit the resulting diff. The diff **is** the signal for Steam schema drift — review it before merging.

Regenerate Vitest snapshot files (`__snapshots__/`) only when a behavior change is intentional:

```bash
npm --prefix packages/core run test:update
```

## Project Structure

```
AnnounceKit/
├── packages/core/                   # Platform-agnostic types, API parsing, palette extraction
│   ├── src/                         # Contracts: result, store-metadata, palette, steam-page, cache, ...
│   ├── tests/                       # Vitest contract tests + fixtures
│   └── vitest.config.ts
├── extensions/chrome/               # Chrome extension (Manifest V3, React, Tailwind)
│   ├── src/                         # Content script, service worker, popup UI, storage
│   └── tests/e2e/                   # Playwright extension tests
├── scripts/
│   └── refresh-fixtures.ts          # Captures live Steam → commits into packages/core/tests/fixtures/
├── playwright.config.ts
├── CLAUDE.md                        # Working agreement for AI agents
├── ARCHITECTURE.md                  # Core vs medium, contracts, data flow, build system
└── package.json                     # npm workspaces root + verify scripts
```

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run build:ext` | Full extension build with tsc type-check |
| `npm run build:ext:vite` | Extension build via vite only (skip tsc — for iterating when types are in flux) |
| `npm run refresh-fixtures -- <appId>...` | Re-capture Steam fixtures |
| `npm run verify` | Types + unit + e2e |
| `npm --prefix packages/core run test:watch` | Live Vitest on core |
| `npm --prefix packages/core run test:update` | Regenerate Vitest snapshots |

## Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Core vs medium separation, data flow, contract signatures, build system
- **[CLAUDE.md](CLAUDE.md)** — Working agreement for AI agents (contract conventions, verify pipeline, fixture discipline)
