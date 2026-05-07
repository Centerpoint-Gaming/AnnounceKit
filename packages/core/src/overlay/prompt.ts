import type { OverlayPromptContext } from './types.js';

/**
 * Build the complete system prompt for overlay variant generation.
 *
 * The prompt is a single monolithic instruction — not composable sections —
 * because the vision model needs one coherent design brief. Values from
 * OverlayPromptContext are interpolated directly.
 */
export function buildOverlayPrompt(ctx: OverlayPromptContext): string {
  const { gameName, brand, dimensions, variantCount } = ctx;
  const w = dimensions.width;
  const h = dimensions.height;

  const colorBlock = buildColorBlock(ctx);
  const contentBlock = buildContentBlock(ctx);

  return `You are a thumbnail text-overlay designer. You will receive a thumbnail image. Analyze it and generate exactly ${variantCount} self-contained HTML text overlays.

## Image Analysis

Study the provided thumbnail carefully:
- Identify the focal subject — the main visual element the viewer's eye goes to.
- Map dark zones, light zones, busy areas, and empty/low-detail areas.
- Each variant must place text in a DIFFERENT viable zone based on your analysis.
- NEVER place text over the focal subject.

## Text Content

${contentBlock}
- Hero text: 2–4 words maximum. Distill the announcement into a punchy, attention-grabbing phrase. Not the full title — a short summary.
- Brand name: "${gameName}" — small, positioned in a corner, never competing with hero text.
- Subtitle (optional): 3–6 words expanding on the hero if space allows.
- No feature lists, no body copy, no URLs.

## Typography

- Base font: \`${brand.fontFamily}\`. If this requires Google Fonts, include ONE \`<link>\` tag at the top of the overlay div.
- Hero: \`font-weight:900\`, \`font-size:${scaleFont(140, w)}px\` (adjust within ${scaleFont(120, w)}–${scaleFont(160, w)}px range), \`paint-order:stroke fill\`, \`-webkit-text-stroke:${scaleFont(4, w)}px rgba(0,0,0,0.5)\` for thick outlines.
- Brand name: \`font-size:${scaleFont(20, w)}px\`, \`font-weight:700\`, \`letter-spacing:${scaleFont(3, w)}px\`.
- Subtitle: \`font-size:${scaleFont(32, w)}px\`, \`font-weight:700\`.

## Colors

${colorBlock}
- Hero text: white (\`#ffffff\`) or the brand primary color — pick whichever has better contrast against the placement zone.
- Accent elements (subtitle, highlights): use the accent or secondary color.
- Brand name supports mixed color via \`<span>\` — e.g. white text with one word in the accent color.
- Respect the palette mood: ${brand.colors.vibrancy} vibrancy, ${brand.colors.luminance} luminance. Muted palettes → subtler overlays. Vibrant palettes → bolder pops.

## Layout Variation

- You decide layout based on the image — no prescribed patterns.
- Analyze the thumbnail and find open zones, dark regions, and low-detail areas.
- Each of the ${variantCount} variants MUST use a meaningfully different text placement strategy so the user has real choices.
- Consider: bottom-heavy, top-heavy, left-aligned, right-aligned, centered, split, angled — whatever the image supports.

## Gradient Overlays

- You decide whether a gradient overlay is needed. If the text zone already has enough contrast, skip it.
- When used: the gradient div sits between the image layer and text layers (\`position:absolute; inset:0\`).
- Gradient direction must follow text placement (text at bottom → fade from bottom, text at top → fade from top).
- Start with \`rgba(0,0,0,0.5)\` to \`transparent\` — adjust opacity based on how busy the underlying region is.
- The gradient div must carry \`data-layer="gradient"\`.

## Output Format

For EACH variant, output a comment header followed by a fenced HTML block:

<!-- variant: ShortName | one-line rationale explaining the placement choice -->
\`\`\`html
<div style="position:relative; width:${w}px; height:${h}px; overflow:hidden; font-family:'${brand.fontFamily.split(',')[0].trim()}',${brand.fontFamily};">
  <!-- gradient overlay if needed, with data-layer="gradient" -->
  <!-- text layers with data-layer="hero", data-layer="subtitle", data-layer="brand" -->
</div>
\`\`\`

Rules:
- Root element: \`div\` with explicit \`width:${w}px; height:${h}px; position:relative; overflow:hidden\`.
- The HTML is an OVERLAY ONLY — do NOT include the background image. The extension composites it.
- Every text element MUST have a \`data-layer\` attribute: \`"hero"\`, \`"subtitle"\`, or \`"brand"\`.
- All styles inline. No \`<style>\` tags, no CSS classes, no JavaScript, no animations.
- No \`<img>\` tags — text and gradients only.
- Only external resource allowed: one Google Fonts \`<link>\` tag if the font requires it.

Generate exactly ${variantCount} variants now.`;
}

function buildColorBlock(ctx: OverlayPromptContext): string {
  const { brand } = ctx;
  const lines: string[] = [];
  lines.push(`Auto-extracted palette: primary ${brand.colors.primary}, secondary ${brand.colors.secondary}, accent ${brand.colors.accent}, neutral ${brand.colors.neutral}.`);

  if (brand.colors.curated.length > 0) {
    lines.push('The user has explicitly chosen these brand colors — prefer them over auto-extracted for the roles they specify:');
    for (const c of brand.colors.curated) {
      const label = c.label ? ` (${c.label})` : '';
      lines.push(`  - ${c.role}${label}: ${c.hex}`);
    }
  }

  return lines.join('\n');
}

function buildContentBlock(ctx: OverlayPromptContext): string {
  const lines: string[] = [];
  lines.push(`Game: "${ctx.gameName}".`);
  if (ctx.announcementTitle) {
    lines.push(`Announcement title: "${ctx.announcementTitle}".`);
  }
  if (ctx.announcementBody) {
    const trimmed = ctx.announcementBody.slice(0, 500).replace(/\[.*?\]/g, '').trim();
    if (trimmed.length > 0) {
      lines.push(`Announcement body (for context, do NOT reproduce verbatim): "${trimmed}"`);
    }
  }
  if (ctx.userPrompt) {
    lines.push(`User direction: "${ctx.userPrompt}".`);
  }
  return lines.join('\n');
}

function scaleFont(basePx: number, imageWidth: number): number {
  return Math.round(basePx * (imageWidth / 1920));
}
