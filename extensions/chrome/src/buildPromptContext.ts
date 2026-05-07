import type { GameProfile, PromptContext } from '@announcekit/core';
import { selectReferenceImages } from './selectReferences.js';

// Shared by the service worker (which sends to Gemini) and the popup's Prompt
// debug tab (which previews what would be sent). They MUST agree — drift would
// silently make the debug view lie.
export interface PromptContextInput {
  announcementTitle?: string;
  announcementBody?: string;
  userPrompt?: string;
}

export function buildPromptContextFromProfile(
  profile: GameProfile,
  input: PromptContextInput = {},
): PromptContext {
  const { selected: selectedRefs } = selectReferenceImages(profile.brand);

  const refItems = selectedRefs.map((a) => ({
    description: a.description,
  }));

  const announcement: NonNullable<PromptContext['announcement']> = {};
  if (input.announcementTitle) announcement.title = input.announcementTitle;
  if (input.announcementBody) announcement.body = input.announcementBody;

  // Brand assets are intentionally skipped from the prompt / attachments while
  // we tune the generation pipeline. Re-enable by re-adding selectBrandAssets
  // and the brandAssets field below — and matching change in service-worker.ts.
  return {
    game: {
      name: profile.name,
      shortDescription: profile.shortDescription,
      tags: profile.tags,
    },
    announcement: Object.keys(announcement).length > 0 ? announcement : undefined,
    palette: profile.palette,
    brandColors:
      profile.brand.colors.length > 0 ? profile.brand.colors : undefined,
    referenceImages: refItems.length > 0 ? { items: refItems } : undefined,
    userPrompt: input.userPrompt,
  };
}
