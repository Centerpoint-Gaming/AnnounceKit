import type { PromptSection } from './types.js';

/**
 * Reference images are stylistic inspiration, not templates. When a
 * character-role brand asset is also present, that asset owns
 * character-extraction and this section defers to it (just art style +
 * energy) — duplicating "extract the character" wording across both
 * sections forces the model to reconcile two near-identical instructions
 * and tends to weaken both.
 */
export const referenceImagesSection: PromptSection = {
  id: 'reference-images',
  contribute(ctx) {
    const items = ctx.referenceImages?.items ?? [];
    if (items.length === 0) return null;

    const hasCharacterBrandAsset = (ctx.brandAssets?.items ?? []).some(
      (i) => i.role === 'character',
    );

    const parts: string[] = [];
    if (hasCharacterBrandAsset) {
      // Brand-assets character clause owns identity extraction. Keep the
      // reference image purely stylistic so the two don't compete.
      parts.push(
        'Reference image(s): match the art style, line quality, color feel, and energy. Do NOT copy framing, layout, camera angle, pose, or composition.',
      );
    } else {
      // No dedicated character ref — pull the main character from references.
      parts.push(
        'Reference image(s): pull the main character (design, proportions, costume, personality) and absorb the art style and energy. Do NOT copy framing, layout, camera angle, or composition; the new thumbnail is an original scene.',
      );
    }

    const notes: string[] = [];
    items.forEach((item, idx) => {
      const desc = item.description?.trim();
      if (desc) notes.push(`reference ${idx + 1} — "${desc}"`);
    });
    if (notes.length > 0) {
      parts.push(`User notes: ${notes.join('; ')}.`);
    }

    return parts.join(' ');
  },
};
