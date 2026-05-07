import type { BrandColor, BrandColorRole } from '../../profile/types.js';
import type { PromptSection } from './types.js';

function pickByRole(
  colors: readonly BrandColor[],
  role: BrandColorRole,
): string[] {
  return colors.filter((c) => c.role === role).map((c) => c.hex);
}

export const paletteSection: PromptSection = {
  id: 'palette',
  contribute(ctx) {
    const palette = ctx.palette;
    const brandColors = (ctx.brandColors ?? []).filter(
      (c): c is BrandColor =>
        !!c && typeof c.hex === 'string' && c.hex.trim().length > 0,
    );

    const luminance = palette?.luminance ?? 'mid';
    const vibrancy = palette?.vibrancy ?? 'balanced';

    // Gate off auto-extracted palette when images are attached — the model
    // sees the palette directly in the attachments and explicit hex codes
    // can fight what it observes. User-curated brandColors are an explicit
    // choice and override this gate (handled below: brandColors.length > 0
    // bypasses the early return).
    const hasAttachments =
      (ctx.brandAssets?.items.length ?? 0) > 0 ||
      (ctx.referenceImages?.items.length ?? 0) > 0;

    if (brandColors.length === 0) {
      if (hasAttachments) return null;
      if (!palette?.primary) return null;
      const accent = palette.accent ? ` with accents of ${palette.accent}` : '';
      return `Color direction: ${palette.primary}${accent}, ${luminance} value, ${vibrancy} saturation.`;
    }

    const primaries = pickByRole(brandColors, 'primary');
    const accents = pickByRole(brandColors, 'accent');
    const backgrounds = pickByRole(brandColors, 'background');
    const brand = pickByRole(brandColors, 'brand');
    const customs = brandColors.filter((c) => c.role === 'custom');

    let primary: string;
    let extraAccents: string[] = [];
    if (primaries.length > 0) {
      primary = primaries[0];
      extraAccents = primaries.slice(1);
    } else {
      const fallback = brandColors.find((c) => c.role !== 'custom') ?? brandColors[0];
      primary = fallback.hex;
    }

    // A promoted-to-primary fallback may also appear in `accents`; drop it.
    const allAccents = [...extraAccents, ...accents].filter((h) => h !== primary);
    const accentPhrase =
      allAccents.length > 0 ? ` with accents of ${allAccents.join(', ')}` : '';
    const backgroundPhrase =
      backgrounds.length > 0 ? ` on a ${backgrounds.join(', ')} background` : '';

    const parts: string[] = [
      `Color direction: ${primary}${accentPhrase}${backgroundPhrase}, ${luminance} value, ${vibrancy} saturation.`,
    ];

    if (brand.length > 0) {
      parts.push(`Brand colors to reproduce exactly: ${brand.join(', ')}.`);
    }

    for (const c of customs) {
      const label = (c.label ?? '').trim() || 'custom';
      parts.push(`${label}: ${c.hex}.`);
    }

    return parts.join(' ');
  },
};
