# AnnounceKit Architecture

A tool for generating announcement thumbnails and banners, starting with Steam. The architecture separates **core logic** from **mediums** so the rendering engine and data models can be reused across different interfaces.

## Core vs Medium

```
┌─────────────────────────────────────────┐
│              packages/core              │
│  Platform-agnostic logic & types        │
│  - Game context types (GameProfile)     │
│  - Steam API response parser            │
│  - Color palette extraction             │
│  - Renderer (future)                    │
│  - Templates (future)                   │
│  No browser/extension/DOM dependencies  │
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
| Core package     | TypeScript (no DOM dependencies)  |
| Chrome extension | Manifest V3, React, Vite, Tailwind CSS |
| Build            | Vite                              |
| Testing          | Vitest                            |

## Project Structure

```
AnnounceKit/
├── packages/
│   └── core/
│       └── src/
│           ├── types.ts           # GameProfile, StoredAsset, SteamAppDetails
│           ├── steam-api.ts       # Parse Steam Store API response → SteamAppDetails
│           ├── color-extract.ts   # Median-cut color quantization from image data
│           └── index.ts           # Public API exports
├── extensions/
│   └── chrome/
│       ├── src/
│       │   ├── popup/             # React UI
│       │   │   ├── App.tsx        # Root — routes between states (no-steam / loading / ready)
│       │   │   └── components/    # GameCard, AssetGallery
│       │   ├── content/
│       │   │   └── scraper.ts     # Extracts App ID from Steam page URLs
│       │   ├── background/
│       │   │   └── service-worker.ts  # Proxies Steam API, extracts colors
│       │   └── storage/
│       │       └── gameProfiles.ts    # CRUD for GameProfile in chrome.storage.local
│       ├── public/
│       │   └── manifest.json
│       └── popup.html
└── package.json                   # Workspace root
```

## Data Flow

1. **User navigates** to a Steam page (store, partner, or community)
2. **Content script** extracts the App ID from the URL
3. **Popup** opens, asks content script for the App ID
4. **Popup** checks `chrome.storage.local` for a saved GameProfile
   - If found → display immediately
   - If not → request game details from service worker
5. **Service worker** fetches the Steam Store API (`/api/appdetails`), parses via core's `parseSteamAppDetails()`
6. **Service worker** loads the capsule image, decodes it onto an `OffscreenCanvas` downsampled to 100×100, and runs core's `extractPaletteFromImageData()` (k-means k=8, deterministic k-means++ init) to produce a structured `Palette`
7. **Popup** assembles a `GameProfile`, saves to storage, and displays it

## Data Model

```typescript
interface GameProfile {
  appId: string;
  name: string;
  shortDescription: string;
  tags: string[];                  // genres + categories from Steam
  storeAssets: {
    headerCapsule: string;         // URL
    heroImage: string | null;      // URL
    screenshots: string[];         // URLs
    logo: string | null;           // URL
  };
  palette: Palette;                // primary/secondary/accent/neutral + full[8] + vibrancy + luminance
  brand: {                         // user-configured (future)
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
5. The core logic — API parsing, color extraction, and (future) rendering — is shared
