import type { OverlayVariant } from './types.js';

/**
 * Extract HTML overlay variants from Gemini's response text.
 *
 * Expected format per variant:
 *   <!-- variant: ShortName | one-line rationale -->
 *   ```html
 *   <div ...>...</div>
 *   ```
 *
 * Robust to extra whitespace, leading markdown prose, and minor formatting
 * quirks. Variants without a comment header get a generated name.
 */
export function parseOverlayVariants(responseText: string): OverlayVariant[] {
  const variants: OverlayVariant[] = [];

  // Match fenced html blocks. The regex captures everything between ```html and ```.
  const fencePattern = /```html\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = fencePattern.exec(responseText)) !== null) {
    const html = match[1].trim();
    if (html.length === 0) continue;

    // Look backwards from the fence start for the nearest variant comment header.
    const preceding = responseText.slice(
      Math.max(0, match.index - 300),
      match.index,
    );
    const commentPattern = /<!--\s*variant:\s*([^|]+?)\s*\|\s*(.*?)\s*-->/g;
    let commentMatch: RegExpExecArray | null = null;
    let lastComment: RegExpExecArray | null = null;
    while ((commentMatch = commentPattern.exec(preceding)) !== null) {
      lastComment = commentMatch;
    }

    const name = lastComment ? lastComment[1].trim() : `Variant ${index + 1}`;
    const rationale = lastComment ? lastComment[2].trim() : '';

    variants.push({
      id: `variant-${index}`,
      name,
      rationale,
      html,
    });
    index++;
  }

  return variants;
}
