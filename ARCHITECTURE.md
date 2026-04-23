# AnnounceKit Architecture

A tool for generating announcement thumbnails and banners, starting with Steam. The architecture separates **core logic** from **mediums** so the rendering engine and data models can be reused across different interfaces.

## Core vs Medium

```
┌─────────────────────────────────────────┐
│              packages/core              │
│  Platform-agnostic logic & types        │
│  - Steam page context parsing           │
│  - Store metadata fetching (Result<T>)  │
│  - Palette extraction (k-means)         │
│  - Renderer (future)                    │
│  - Templates (future)                   │
│  No browser-extension dependencies      │
└──────────────────┬──────────────────────┘
                   │ imports
┌──────────────────▼──────────────────────┐
│     extensions/chrome (medium #1)       │
│  Chrome-specific wiring                 │
│  - Content script (scrape App ID)       │
│  - Service worker (proxy API calls)     │
│  - Popup UI (React + Tailwind)          │
│  - Storage (chrome.storage.local)       │
└─────────────────────────────────────────┘
```

Future mediums (web app, CLI, Electron, Discord bot, etc.) import the same core — only the UI shell and storage layer change.

## Stack

| Layer            | Technology                        |
|------------------|-----------------------------------|
| Monorepo         | npm workspaces                    |
| Core package     | TypeScript (DOM lib for fetch/AbortSignal) |
| Chrome extension | Manifest V3, React, Vite, Tailwind CSS |
| Build            | Vite (3-stage: popup, content IIFE, service worker IIFE) |
| Testing          | Vitest                            |

## Project Structure

```
AnnounceKit/
├── packages/
│   └── core/
│       └── src/
│           ├── types.ts           # GameProfile, StoredAsset, SteamAppDetails
│           ├── result.ts          # Result<T, E> discriminated union
│           ├── steam-page.ts      # Parse #application_config data attributes
│           ├── steam-api.ts       # Parse Steam Store API response
│           ├── store-metadata.ts  # fetchStoreMetadata() contract
│           ├── palette.ts         # k-means color extraction → Palette
│           └── index.ts           # Public API exports
├── extensions/
│   └── chrome/
│       ├── src/
│       │   ├── popup/             # React UI
│       │   │   ├── App.tsx        # Root — routes between states
│       │   │   └── components/    # GameCard, AssetGallery, DebugView
│       │   ├── content/
│       │   │   └── scraper.ts     # detectPageContext() + message handler
│       │   ├── background/
│       │   │   ├── service-worker.ts  # Proxies API calls, delegates to core
│       │   │   └── palette.ts     # OffscreenCanvas wrapper for palette extraction
│       │   └── storage/
│       │       └── gameProfiles.ts    # CRUD for GameProfile
│       ├── public/
│       │   └── manifest.json
│       ├── vite.config.ts             # Popup build (ES module)
│       ├── vite.content.config.ts     # Content script build (IIFE)
│       ├── vite.sw.config.ts          # Service worker build (IIFE)
│       └── popup.html
└── package.json                   # Workspace root
```

## Contracts

### 1. detectPageContext

Runs in the content script on Steam pages. Extracts structured context from the page DOM and `#application_config` data attributes.

**Input:** Current page DOM (reads only, no side effects)
**Output:** `PageContext` with App ID, editor field references, event data, page variant

**Key design decisions:**
- Editor fields are matched by **placeholder text** (e.g. `input[placeholder="Enter Event Name here"]`) because Steam sanitizes/obfuscates CSS class names
- This will break with localization — English-only placeholders. Falls back to structured data from `data-partnereventstore`
- Re-detects fresh on every popup request to avoid stale cache from SPA hydration race conditions

### 2. fetchStoreMetadata

Core contract that fetches game metadata from Steam's public API.

**Input:** App ID string, optional timeout/AbortSignal
**Output:** `Result<StoreMetadata, StoreFetchError>` — never throws

**Data sources:**
- Primary: Steam `appdetails` API (`?cc=us&l=english` for region consistency)
- Fallback: Store page HTML scrape for user tags (API doesn't expose them)
- Constructed: Library hero URL from CDN pattern

**Error handling:** Typed `StoreFetchError` with reasons: `not-found`, `rate-limited`, `network-error`, `timeout`, `aborted`, `parse-error`

### 3. Palette Extraction

Core contract that extracts a structured color palette from image pixel data using deterministic k-means++ clustering (k=8).

**Input:** RGBA pixel data (`Uint8ClampedArray`)
**Output:** `Result<Palette, PaletteError>`

**Palette structure:** `primary`, `secondary`, `accent` (highest saturation), `neutral` (best text contrast), `full` (all 8 clusters), plus `vibrancy` and `luminance` classifications.

## Build System

Chrome extension content scripts and service workers **cannot use ES module imports**. They must be self-contained scripts.

We solve this with three separate Vite builds:

| Target         | Config                    | Format | Code splitting |
|----------------|---------------------------|--------|----------------|
| Popup          | `vite.config.ts`          | ESM    | Yes (via popup.html) |
| Content script | `vite.content.config.ts`  | IIFE   | No — all deps inlined |
| Service worker | `vite.sw.config.ts`       | IIFE   | No — all deps inlined |

Build command: `npm run build` (runs all three sequentially, popup first with `emptyOutDir: true`, then content and SW with `emptyOutDir: false`).

## Data Flow

1. **User navigates** to a Steam page (store, partner, or community)
2. **Content script** runs `detectPageContext()` — extracts App ID from URL and `#application_config`, finds editor fields by placeholder text
3. **Service worker** receives `PAGE_CONTEXT_READY` and sets badge ("Edit" on editor pages, "OK" on game pages)
4. **Popup** opens, sends `GET_PAGE_CONTEXT` — content script runs a **fresh detection** (avoids stale cache from SPA hydration)
5. **Popup** checks `chrome.storage.local` for a saved GameProfile
   - If found → display immediately
   - If not → request game details from service worker
6. **Service worker** calls core's `fetchStoreMetadata()` (API + tag scrape) and extracts palette via `OffscreenCanvas` + core's `extractPaletteFromImageData()`
7. **Popup** assembles a `GameProfile`, saves to storage, and displays it

## Data Model

```typescript
interface GameProfile {
  appId: string;
  name: string;
  shortDescription: string;
  tags: string[];
  storeAssets: {
    headerCapsule: string;
    heroImage: string | null;
    screenshots: string[];
    logo: string | null;
  };
  palette: Palette;    // primary/secondary/accent/neutral + full[8] + vibrancy + luminance
  brand: {             // user-configured (future)
    logos: StoredAsset[];
    colors: string[];
    exampleThumbnails: StoredAsset[];
  };
  createdAt: number;
  lastUsedAt: number;
}
```

## Adding a New Medium

To add a new way to interact with AnnounceKit (e.g., a web app):

1. Create a new directory (e.g., `apps/web/`)
2. Import types and functions from `@announcekit/core`
3. Implement your own storage layer (localStorage, database, etc.)
4. Implement your own UI
5. The core logic — API fetching, palette extraction, and (future) rendering — is shared
