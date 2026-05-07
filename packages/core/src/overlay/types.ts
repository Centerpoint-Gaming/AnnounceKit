import type { Palette } from '../palette/index.js';
import type { BrandColor } from '../profile/types.js';

/**
 * Consolidated brand identity — one object the model reads for all visual
 * decisions. Merges the auto-extracted palette with user-curated overrides.
 */
export interface BrandGuidelines {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutral: string;
    vibrancy: Palette['vibrancy'];
    luminance: Palette['luminance'];
    /**
     * User-curated overrides. When present, these take priority over auto-
     * extracted colors for the roles they specify.
     */
    curated: Array<{ hex: string; role: string; label?: string }>;
  };
  fontFamily: string;
}

export interface OverlayPromptContext {
  gameName: string;
  announcementTitle?: string;
  announcementBody?: string;
  userPrompt?: string;
  brand: BrandGuidelines;
  dimensions: { width: number; height: number };
  variantCount: number;
}

export interface OverlayVariant {
  id: string;
  name: string;
  rationale: string;
  html: string;
}

export interface GenerateOverlaysOptions {
  apiKey: string;
  prompt: string;
  thumbnailBase64: string;
  thumbnailMimeType: string;
  model?: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export type OverlayGenErrorReason =
  | 'missing-api-key'
  | 'missing-prompt'
  | 'network'
  | 'api-error'
  | 'no-text-returned'
  | 'parse-failed'
  | 'invalid-response';

export interface OverlayGenError {
  reason: OverlayGenErrorReason;
  message: string;
  status?: number;
}

/**
 * Build a BrandGuidelines from a GameProfile's palette and brand colors.
 * Keeps the assembly logic in core so mediums don't duplicate it.
 *
 * Curated colors override palette slots when their role matches:
 *   curated "primary"    → colors.primary
 *   curated "accent"     → colors.accent
 *   curated "background" → colors.neutral
 * The auto-extracted palette fills any slots not covered by curated colors.
 */
export function assembleBrandGuidelines(
  palette: Palette,
  brandColors: readonly BrandColor[],
  fontFamily?: string,
): BrandGuidelines {
  const curatedByRole = new Map(brandColors.map((c) => [c.role, c.hex]));

  return {
    colors: {
      primary: curatedByRole.get('primary') ?? palette.primary,
      secondary: palette.secondary,
      accent: curatedByRole.get('accent') ?? palette.accent,
      neutral: curatedByRole.get('background') ?? palette.neutral,
      vibrancy: palette.vibrancy,
      luminance: palette.luminance,
      curated: brandColors.map((c) => ({
        hex: c.hex,
        role: c.role,
        label: c.label,
      })),
    },
    fontFamily: fontFamily ?? 'system-ui, sans-serif',
  };
}
