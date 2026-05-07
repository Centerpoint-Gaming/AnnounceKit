import type { PromptSection } from './types.js';

export const subjectSection: PromptSection = {
  id: 'subject',
  contribute(ctx) {
    const name = ctx.game?.name;
    if (!name) return null;
    // When the medium is attaching either brand assets or reference layouts,
    // drop the prescriptive "cinematic key-art" framing — the attached images
    // dictate style/format and a generic aesthetic anchor at the top of the
    // prompt tends to override the brand's actual art direction.
    const hasAttachments =
      (ctx.brandAssets?.items.length ?? 0) > 0 ||
      (ctx.referenceImages?.items.length ?? 0) > 0;
    const artifact = hasAttachments ? 'a thumbnail' : 'cinematic key-art';
    const title = ctx.announcement?.title;
    const lead = title
      ? `Create ${artifact} for "${title}", a Steam announcement for the game "${name}".`
      : `Create ${artifact} for a Steam announcement about the game "${name}".`;
    // Anchor the no-text rule at position-0 of the prompt — image models
    // weight the first sentence heavily. The full enumerated NO_TEXT_RULE
    // still lands at the end as a hard cap.
    return `${lead} Output is pure illustration — no text, letters, or wordmarks of any kind.`;
  },
};
