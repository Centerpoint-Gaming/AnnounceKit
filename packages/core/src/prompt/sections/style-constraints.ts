import type { PromptSection } from './types.js';
import { NO_TEXT_RULE } from '../no-text-rule.js';

export const styleConstraintsSection: PromptSection = {
  id: 'style-constraints',
  contribute(ctx) {
    const hasAttachments =
      (ctx.brandAssets?.items.length ?? 0) > 0 ||
      (ctx.referenceImages?.items.length ?? 0) > 0;
    // When images are attached they dictate composition — emitting our own
    // composition prescription only competes with what the model observes.
    // Always emit the full NO_TEXT_RULE as the terminal hard cap.
    if (hasAttachments) return NO_TEXT_RULE;
    return `Composition: wide 16:9 framing, strong focal subject, dynamic lighting, painterly detail. ${NO_TEXT_RULE}`;
  },
};
