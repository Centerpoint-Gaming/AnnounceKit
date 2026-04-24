# AnnounceKit roadmap — closing the image-gen data gaps

**Current milestone: V1.5 — context capture is shipping. Now we fill the gaps that will bottleneck image generation.**

The V1 pipeline captures enough to *display* a game profile. It does not yet capture enough to hand a modern image generator (Flux, Ideogram, Nano Banana, Seedream, Imagen, etc.) a prompt + reference set that produces on-brand results. This roadmap is the punch list for that.

Tiers are ordered by "cheapness × leverage." Work the top of tier 1 first. Don't start a tier-3 item while tier-1 boxes are unchecked unless you have a specific reason — note it in the PR.

---

## Tier 1 — Extend what we already fetch

No new pipeline stages. Every item is "parse a field we're already ignoring" or "follow one URL we already know."

- [ ] **Fetch `library_logo.png`** and populate `GameProfile.storeAssets.logo`. The URL follows the same CDN pattern as `library_hero`. This is the single most useful asset for generation — it lets us composite the real wordmark instead of relying on the model to spell it.
- [ ] **Re-base palette extraction on `library_hero.jpg`** instead of `header.jpg`. Header has the wordmark baked in, which contaminates `accent`/`neutral`. Hero is the clean, subject-isolated render.
- [ ] **Keep `detailedDescription`** (strip HTML, cap to ~1–2KB) alongside `shortDescription`. Genres are keywords; the description is the studio's own voice.
- [ ] **Populate `brand.exampleThumbnails` from `parsePartnerEventStore`.** The parser already sees past events and their `localized_title_image` / `localized_capsule_image` URLs — just persist them.
- [ ] **Map `eventType: number` to an enum** (`major-update`, `patch`, `sale`, `seasonal`, `cross-promo`, …). Generation intent differs by event type.
- [ ] **Pass-through fields from the API we currently drop:** `overall_reviews` / `recommendations.total` (sentiment), `required_age` (content rating), `supported_languages` (locale hints).

## Tier 2 — Reference asset pipeline

Image generators want bytes, not URLs. This tier is the path from "we know the URL" to "we can hand the generator a reference image."

- [ ] **Fetch and store image bytes as `dataUrl`** for hero, logo, and the top 2–3 example thumbnails. `StoredAsset.dataUrl` already exists on the type.
- [ ] **Define target aspect ratios** (Steam capsule 460×215, event banner, square social) and the asset-selection rule for each.
- [ ] **Fixture coverage for more shapes:** at least one coming-soon game (no release date), one free-to-play, one with no library_logo, one early-access. Current fixture is Crosshair X only and won't catch schema edges.

## Tier 3 — Analysis layers

Derived signal from the assets we've captured. Each item is a pure-core contract that takes pixels/URLs and returns structured data.

- [ ] **VLM caption of hero + top screenshots.** One line of "what's in this image" is worth more than any number of tags for prompt synthesis.
- [ ] **Per-screenshot palette + blended palette** across hero and top N screenshots, so the palette represents in-engine aesthetic, not just the key-art render.
- [ ] **Screenshot ranking / dedup.** Not all 8 screenshots are equally useful as references. Rank by distinctiveness, subject clarity, size.
- [ ] **Mood / style classification** derived from tags + description + palette (e.g. "dark-gritty-realistic" vs "cozy-pastel-stylized").

## Tier 4 — Generation-ready synthesis

Turning captured data into something a generator will act on well.

- [ ] **Prompt template** combining name, caption, tone words, event type, brand notes.
- [ ] **Genre/tag → style-descriptor map** (so "First-Person Shooter" + "Gritty" → visual-style words a generator understands).
- [ ] **Aspect-ratio-aware reference selection** — which asset to feed for a square thumbnail vs a wide banner.

---

## How to pick the next task

1. Is there an open tier-1 box? Pick one.
2. If tier 1 is clean, pick the tier-2 item that unblocks the most tier-3 work.
3. Each item lands as its own contract in `packages/core` (or as a field extension to an existing contract) with fixtures + tests. See `CLAUDE.md` for the contract/verify workflow.
4. Update this file when you finish a box or discover a new gap.
