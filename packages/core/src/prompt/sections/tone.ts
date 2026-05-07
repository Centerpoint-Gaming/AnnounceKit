import type { PromptSection } from './types.js';

const MAX_TAGS = 8;

export const toneSection: PromptSection = {
  id: 'tone',
  contribute(ctx) {
    // Gate off when images are attached — see descriptionSection for
    // rationale. Tags inferred from store metadata are mood scaffolding
    // for the no-image path; once attachments exist they only dilute.
    const hasAttachments =
      (ctx.brandAssets?.items.length ?? 0) > 0 ||
      (ctx.referenceImages?.items.length ?? 0) > 0;
    if (hasAttachments) return null;
    const tags = (ctx.game?.tags ?? [])
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .slice(0, MAX_TAGS);
    if (tags.length === 0) return null;
    return `Genre / mood tags: ${tags.join(', ')}.`;
  },
};
