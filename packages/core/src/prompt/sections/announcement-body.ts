import type { PromptSection } from './types.js';

const MAX_BODY_CHARS = 1500;

// Steam announcement bodies use BBCode (`[h1]…[/h1]`, `[img]…[/img]`, `[url=…]`).
// The model handles plain prose better than markup, so strip tags but keep text.
// `[img]` blocks point to URLs the model can't fetch — drop them entirely.
const IMG_TAG_RE = /\[img[^\]]*\][^\[]*\[\/img\]/gi;
const ANY_BBCODE_RE = /\[\/?[a-z0-9*][^\]]*\]/gi;

function cleanBody(raw: string): string {
  const stripped = raw
    .replace(IMG_TAG_RE, '')
    .replace(ANY_BBCODE_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (stripped.length <= MAX_BODY_CHARS) return stripped;
  return stripped.slice(0, MAX_BODY_CHARS).trimEnd() + '…';
}

export const announcementBodySection: PromptSection = {
  id: 'announcement-body',
  contribute(ctx) {
    const raw = ctx.announcement?.body?.trim();
    if (!raw) return null;
    const clean = cleanBody(raw);
    if (!clean) return null;
    return `Announcement description: ${clean}`;
  },
};
