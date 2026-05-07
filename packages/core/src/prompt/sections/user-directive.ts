import type { PromptSection } from './types.js';

export const userDirectiveSection: PromptSection = {
  id: 'user-directive',
  contribute(ctx) {
    const direction = ctx.userPrompt?.trim();
    if (!direction) return null;
    return `User direction: ${direction}`;
  },
};
