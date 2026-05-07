import type { AssetRole } from '../../profile/types.js';
import type { PromptSection } from './types.js';

/**
 * Per-role imperative clauses. Tight, concrete, no preamble — image models
 * weight short directives more reliably than long descriptive paragraphs.
 * The character clause carries the strongest "ignore non-target elements"
 * negation because character bleeding (background, scene, props) is the
 * most common failure mode for character references.
 */
const ROLE_GUIDANCE: Partial<Record<AssetRole, string>> = {
  logo: 'Logo ref: preserve glyphs and colors; use only the mark itself, ignore any backdrop, padding, or surrounding artwork in the source.',
  character:
    'Character ref: match identity (silhouette, costume, palette, personality), then place the character in a NEW scene built for this announcement. Ignore EVERYTHING else in the source image — background, scenery, props, other characters, lighting, color grading, composition. The original scene is unrelated to what is being announced.',
  environment:
    'Environment ref: borrow setting, atmosphere, and time of day; do not duplicate the scene.',
  mood: 'Mood ref: borrow color grading and emotional tone.',
};

/**
 * When the medium attaches brand-asset images, this section emits one
 * imperative clause per present role plus per-asset user notes. The
 * verbose "identity ingredients" preamble was removed in the V1.5
 * compression pass — it added length without sharpening any single
 * instruction.
 */
export const brandAssetsSection: PromptSection = {
  id: 'brand-assets',
  contribute(ctx) {
    const items = ctx.brandAssets?.items ?? [];
    if (items.length === 0) return null;

    const presentRoles = new Set(items.map((i) => i.role));
    const parts: string[] = [];

    // Emit role guidance in a stable order so output is deterministic.
    for (const role of ['logo', 'character', 'environment', 'mood'] as const) {
      if (presentRoles.has(role)) {
        const line = ROLE_GUIDANCE[role];
        if (line) parts.push(line);
      }
    }

    const notes: string[] = [];
    items.forEach((item, idx) => {
      const desc = item.description?.trim();
      if (desc) notes.push(`asset ${idx + 1} (${item.role}) — "${desc}"`);
    });
    if (notes.length > 0) {
      parts.push(`User notes: ${notes.join('; ')}.`);
    }

    return parts.join(' ');
  },
};
