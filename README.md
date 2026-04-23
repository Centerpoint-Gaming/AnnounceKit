# AnnounceKit

A tool for generating thumbnails, announcement content, and translations — starting with Steam. The architecture separates portable core logic from platform-specific mediums so the same engine can power a Chrome extension, web app, CLI, or bot.

## Current Status

**V1 Milestone: Context Capture** — automatically detecting and extracting game data from Steam pages.

### What works today

- Chrome extension detects Steam announcement editor pages and extracts App ID, event title, subtitle, and body
- Fetches game metadata from the Steam Store API (name, description, genres, tags, screenshots, developer, publisher, release status)
- Extracts a structured color palette from game capsule art (k-means clustering with primary/secondary/accent/neutral roles)
- Persists game profiles in extension storage for instant loading on return visits
- Debug view for inspecting all captured context

## Setup

```bash
# Install dependencies
npm install

# Build the Chrome extension
cd extensions/chrome
npm run build
```

## Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `extensions/chrome/dist`
5. Navigate to a Steam page and click the extension icon

> After loading, refresh any Steam pages that were already open so the content script injects.

## Project Structure

```
AnnounceKit/
├── packages/core/       # Platform-agnostic types, API parsing, palette extraction
├── extensions/chrome/   # Chrome extension (Manifest V3, React, Tailwind)
├── ARCHITECTURE.md      # Detailed architecture documentation
└── package.json         # npm workspaces root
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for full details on the core vs medium separation, data flow, contracts, and build system.
