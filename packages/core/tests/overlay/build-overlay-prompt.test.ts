import { describe, it, expect } from 'vitest';
import { buildOverlayPrompt } from '../../src/overlay/prompt.js';
import type { OverlayPromptContext } from '../../src/overlay/types.js';

const BASE_CTX: OverlayPromptContext = {
  gameName: 'Crosshair X',
  brand: {
    colors: {
      primary: '#1a1a1a',
      secondary: '#2a2a2a',
      accent: '#ff0044',
      neutral: '#cccccc',
      vibrancy: 'vibrant',
      luminance: 'dark',
      curated: [],
    },
    fontFamily: 'system-ui, sans-serif',
  },
  dimensions: { width: 1920, height: 1080 },
  variantCount: 4,
};

describe('buildOverlayPrompt', () => {
  it('snapshots the prompt for a base context', () => {
    expect(buildOverlayPrompt(BASE_CTX)).toMatchSnapshot();
  });

  it('snapshots with announcement title and user prompt', () => {
    expect(
      buildOverlayPrompt({
        ...BASE_CTX,
        announcementTitle: 'Season 3 Launch',
        userPrompt: 'make it bold and aggressive',
      }),
    ).toMatchSnapshot();
  });

  it('snapshots with curated brand colors', () => {
    expect(
      buildOverlayPrompt({
        ...BASE_CTX,
        brand: {
          ...BASE_CTX.brand,
          colors: {
            ...BASE_CTX.brand.colors,
            curated: [
              { hex: '#e8622d', role: 'primary', label: 'orange brand' },
              { hex: '#5ec4d4', role: 'accent', label: 'cyan' },
            ],
          },
        },
      }),
    ).toMatchSnapshot();
  });

  it('scales font sizes proportionally to image width', () => {
    const smallPrompt = buildOverlayPrompt({
      ...BASE_CTX,
      dimensions: { width: 960, height: 540 },
    });
    expect(smallPrompt).toContain('font-size:70px');

    const largePrompt = buildOverlayPrompt(BASE_CTX);
    expect(largePrompt).toContain('font-size:140px');
  });

  it('includes game name as brand', () => {
    const prompt = buildOverlayPrompt(BASE_CTX);
    expect(prompt).toContain('"Crosshair X"');
  });

  it('includes announcement body context when provided', () => {
    const prompt = buildOverlayPrompt({
      ...BASE_CTX,
      announcementBody: 'We added new weapons, maps, and balance changes.',
    });
    expect(prompt).toContain('new weapons, maps, and balance changes');
    expect(prompt).toContain('do NOT reproduce verbatim');
  });
});
