import type { PromptSection } from './types.js';

export const descriptionSection: PromptSection = {
  id: 'description',
  contribute(ctx) {
    // Gate off when images are attached — the model has concrete visual
    // anchors and prose about the game becomes noise that competes with
    // the high-stakes attachment-handling rules above.
    const hasAttachments =
      (ctx.brandAssets?.items.length ?? 0) > 0 ||
      (ctx.referenceImages?.items.length ?? 0) > 0;
    if (hasAttachments) return null;
    const desc = ctx.game?.shortDescription;
    if (!desc) return null;
    return `About the game: ${desc}`;
  },
};
