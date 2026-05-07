# AnnounceKit roadmap

**End goal:** User is on a Steam announcement page. The extension has captured the necessary context. The user describes the thumbnail they want via a text input, hits generate, sees 4 options in a grid, picks one, and can regenerate in that style or save it.

**Image generator:** Gemini (current). Architecture keeps generation behind a contract so the provider can be swapped.

---

## Context currently captured

This is what the extension captures today and passes to the prompt builder / generator.

**From the Steam store API:**
- Game name, short description, tags, genres, categories
- Release status (`released` | `early-access` | `coming-soon` | `unknown`), release date
- Developer, publisher
- Asset URLs: header capsule, library hero, logo, screenshots, background

**From the Steam announcement page:**
- Is announcement editor active (`isAnnouncementEditor`)
- Existing title, subtitle, body text from the editor fields
- Event type (raw number), event name
- Localized title image + capsule image URLs from past event data

**Brand assets (user-managed):**
- User-uploaded images stored in IndexedDB (content-addressed by SHA-256)
- Steam assets the user promotes into the bucket (`source: 'steam'`)
- Each asset has a role: `logo` | `character` | `environment` | `mood` | `other`
- Palette: dominant colors, vibrancy, luminance (extracted from header capsule)

---

## Completed

- [x] Store metadata extraction (`fetchStoreMetadata`)
- [x] Announcement page context extraction (`PageContext`, `SteamEventData`)
- [x] Brand asset bucketing — roles, dedup, add/remove/rename helpers
- [x] IndexedDB `BinaryStore` — content-addressed byte storage
- [x] Download store assets → promote to brand assets (UI: `BrandAssets.tsx`)
- [x] Single thumbnail generation via Gemini (`generateThumbnail`)
- [x] Prompt builder (`buildPromptFromContext`)
- [x] User prompt input (Task A) — `userPrompt` plumbed from ActionBar textarea through to Gemini
- [x] Generation UI text input + trigger (Task C) — multi-line textarea above Generate button
- [x] Reference Images bucket — separate from Brand Assets, framed as approved-layout templates the model should match (composition/framing); brand assets reframed as identity ingredients to incorporate (not copy verbatim)

---

## V1 — Complete the generation flow

Tasks are ordered by dependency. Each task notes whether it touches `packages/core` (core) or `extensions/chrome` (extension), and what it would break if changed.

### Task A — User prompt input [core] ✅ done
Add an optional `userPrompt: string` field to `GenerateThumbnailOptions`.
Pass it through to the Gemini request alongside the auto-built context prompt.
- Depends on: nothing
- Breaking: no

### Task B — Multi-image generation [core]
Change `generateThumbnail` to return `GeneratedThumbnail[]` (N=4) instead of a single result.
- Depends on: Task A (or parallel)
- Breaking: **yes** — `ActionBar.tsx` and `App.tsx` consume the return type and need updates at the same time

### Task C — Generation UI: text input + trigger [extension] ✅ done
Replace the current bare "Generate Thumbnail" button in `ActionBar.tsx` with a text input where the user describes what they want, plus the generate button.
- Depends on: Task A
- Breaking: no (ActionBar is self-contained)

### Task D — 4-thumbnail grid UI [extension]
New component that displays the 4 returned thumbnails in a 2×2 grid.
User can click one to select it.
- Depends on: Task B + Task C
- Breaking: no (new component)

### Task E — Regenerate in style [extension]
When the user selects a thumbnail from the grid, offer a "Regenerate" button.
Re-sends the same prompt with the selected image attached as a style reference.
No new core work — uses existing `ThumbnailReference` field in `GenerateThumbnailOptions`.
- Depends on: Task D
- Breaking: no

### Task F — Save thumbnail [extension]
From the grid selection, offer a "Save" action.
Download the image to disk via the browser download API.
- Depends on: Task D
- Breaking: no

---

## How to pick the next task

1. Work tasks in the order A → B → C+D (parallel) → E → F.
2. B is the only breaking change — do not ship B without updating `ActionBar.tsx` and `App.tsx` in the same PR.
3. Each core change lands as a contract extension with fixtures + tests. See `CLAUDE.md` for the verify workflow.
4. Update this file when a task is done or a new gap is discovered.

---

## V1.5 — Iterative refinement

**Goal.** After a thumbnail is generated, the user can issue follow-up instructions ("make the character bigger, drop the corner text") and get a new image that preserves the prior composition where not asked to change. Image models won't honor "no text" or other guards perfectly on a single shot, so the iterative loop is how users actually reach the final result.

### Task G — Edit contract [core] ✅ done
New contract `editThumbnail` in `packages/core/src/thumbnail/edit.ts`. Takes a prior image + instruction + role-tagged auxiliary references; returns a new `EditedThumbnail`. Reuses the same Gemini transport as `generateThumbnail` but with a distinct prompt shape: instruction-anchored, with a preservation guard and the shared `NO_TEXT_RULE`. `EditReferenceRole` covers `pose | item | character | environment | style | other` so the prompt addresses each attachment with a role-specific clause.
- Depends on: nothing
- Breaking: no

### Task H — Edit UI surface [extension] ✅ done
`ThumbnailEditor.tsx` renders below `ActionBar` once a thumbnail is ready. Provides:
- An instruction textarea + "Apply edit" button
- Optional reference attachments via file picker, each with a role dropdown + free-form note
- A horizontal version strip showing the compounding chain; clicking a past version makes it the priorImage for the next edit (chatbot-style fork)

`App.tsx` owns the in-memory `editChain: ChainNode[]` + `currentIndex`. The service worker exposes an `EDIT_THUMBNAIL` message that decodes the prior data URL, calls `editThumbnail`, and persists the result via `BinaryStore` + `ThumbnailCache` so edits show up in the existing `ThumbnailHistory`.
- Depends on: Task G + Task D
- Breaking: no
