/**
 * PromptContext is the structured bag of inputs the prompt builder reads.
 *
 * Every field is optional. Sections that need a field skip themselves when
 * it's missing — sections never throw and never demand their input. The
 * medium populates whatever it has from its own sources (Steam API, page
 * DOM, image bytes, future VLM caption pipeline) and hands the bag to
 * buildPromptFromContext.
 *
 * Extending the context: add a field, populate it from the medium, read it
 * from a section. No section signature changes; no medium changes for
 * sections that ignore the field.
 */

import type { Palette } from '../palette/index.js';
import type { AssetRole, BrandColor } from '../profile/types.js';

export interface PromptContext {
  /** Identity & copy from the Steam store API. */
  game?: {
    name: string;
    shortDescription?: string;
    detailedDescription?: string;
    tags?: string[];
    requiredAge?: number;
  };

  /** What the user is announcing — drives subject phrasing. */
  announcement?: {
    title?: string;
    subtitle?: string;
    /**
     * Body copy of the announcement post (the description authors write inside
     * the editor). Drives "what THIS announcement is about" — anchored before
     * the generic game description because it's much more specific. May arrive
     * as Steam BBCode; the section consuming it strips markup and caps length.
     */
    body?: string;
  };

  /** Visual direction extracted from key-art. */
  palette?: Palette;

  /**
   * User-curated brand colors with compositional intent. When non-empty, the
   * palette section uses these instead of the auto-extracted `palette`
   * primary/accent — they represent an explicit choice and should win over
   * the k-means guess.
   */
  brandColors?: BrandColor[];

  /**
   * Summary of brand-asset images the medium will send alongside the prompt,
   * in attachment order. Bytes don't cross into core — the medium fetches
   * them. The prompt treats brand assets as identity ingredients to
   * incorporate (not literal targets), so the section uses inspiration
   * language. Per-asset descriptions surface as inline notes.
   */
  brandAssets?: {
    items: ReadonlyArray<{
      role: AssetRole;
      /** Free-form note from the user, shown to the model verbatim. */
      description?: string;
    }>;
  };

  /**
   * Summary of reference-image attachments — approved layouts/formats from
   * past accepted thumbnails. Bytes don't cross into core. The prompt treats
   * these as composition/framing templates the model should match, distinct
   * from brand-asset identity ingredients. No role: reference images are
   * uniformly format-anchors. Per-image descriptions surface as inline notes
   * ("what I like about this one").
   */
  referenceImages?: {
    items: ReadonlyArray<{
      /** Free-form note from the user — what about this reference to keep. */
      description?: string;
    }>;
  };

  /** Derived signal — VLM captions, mood tags, etc. (tier 3 territory). */
  derived?: {
    vlmCaptions?: string[];
    moodTags?: string[];
    blendedPalette?: Palette;
  };

  /** What surface the output is for — informs aspect ratio and framing. */
  target?: {
    aspectRatio?: '16:9' | '1:1' | '460:215';
    surface?: 'capsule' | 'event-banner' | 'social';
  };

  /**
   * Free-form direction supplied by the user ("make it cyberpunk neon",
   * "lean into the cozy fall vibe"). Anchored near the start of the prompt
   * so the model treats it as a primary instruction rather than a
   * stylistic afterthought. Empty / whitespace-only input is ignored.
   */
  userPrompt?: string;
}
