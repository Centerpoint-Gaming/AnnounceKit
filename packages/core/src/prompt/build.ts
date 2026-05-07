import type { PromptContext } from './context.js';
import type { PromptSection } from './sections/types.js';
import { subjectSection } from './sections/subject.js';
import { userDirectiveSection } from './sections/user-directive.js';
import { brandAssetsSection } from './sections/brand-assets.js';
import { referenceImagesSection } from './sections/reference-images.js';
import { announcementBodySection } from './sections/announcement-body.js';
import { descriptionSection } from './sections/description.js';
import { toneSection } from './sections/tone.js';
import { paletteSection } from './sections/palette.js';
import { styleConstraintsSection } from './sections/style-constraints.js';

/**
 * Canonical ordered list of sections that compose a prompt.
 *
 * Order matters: subject first sets the frame, user-directive comes
 * immediately after so explicit user voice anchors the model. Brand-assets
 * follows — identity ingredients to incorporate. Reference-images comes
 * after — approved layouts the model should match. Then announcement-body
 * anchors what THIS announcement is specifically about, then game
 * description fills in. Style-constraints last locks the format.
 */
export const SECTIONS: readonly PromptSection[] = [
  subjectSection,
  userDirectiveSection,
  brandAssetsSection,
  referenceImagesSection,
  announcementBodySection,
  descriptionSection,
  toneSection,
  paletteSection,
  styleConstraintsSection,
];

export function buildPromptFromContext(ctx: PromptContext): string {
  const fragments: string[] = [];
  for (const section of SECTIONS) {
    const fragment = section.contribute(ctx);
    if (fragment !== null) fragments.push(fragment);
  }
  return fragments.join(' ');
}
