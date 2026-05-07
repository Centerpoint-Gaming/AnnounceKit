import { describe, it, expect } from 'vitest';
import { buildPromptFromContext } from '../../src/prompt/build.js';
import type { PromptContext } from '../../src/prompt/context.js';

const FULL_CTX: PromptContext = {
  game: {
    name: 'Crosshair X',
    shortDescription: 'Customize and overlay a crosshair in any game.',
    tags: ['Utility', 'Tools', 'Overlay'],
  },
  palette: {
    primary: '#1a1a1a',
    secondary: '#2a2a2a',
    accent: '#ff0044',
    neutral: '#cccccc',
    full: ['#1a1a1a', '#2a2a2a', '#ff0044', '#cccccc'],
    vibrancy: 'vibrant',
    luminance: 'dark',
  },
};

describe('buildPromptFromContext', () => {
  it('snapshots the prompt for a full context with no announcement title', () => {
    expect(buildPromptFromContext(FULL_CTX)).toMatchSnapshot();
  });

  it('snapshots the prompt with an announcement title', () => {
    expect(
      buildPromptFromContext({
        ...FULL_CTX,
        announcement: { title: 'Spring Sale' },
      }),
    ).toMatchSnapshot();
  });

  it('snapshots the prompt with a userPrompt directive (anchored after subject)', () => {
    expect(
      buildPromptFromContext({
        ...FULL_CTX,
        announcement: { title: 'Spring Sale' },
        userPrompt: 'make it cyberpunk neon, lots of bloom and rain',
      }),
    ).toMatchSnapshot();
  });

  it('snapshots the prompt with brand assets + reference images attached', () => {
    expect(
      buildPromptFromContext({
        ...FULL_CTX,
        announcement: { title: 'Spring Sale' },
        userPrompt: 'cozy spring vibe',
        brandAssets: {
          items: [
            { role: 'logo', description: 'wordmark' },
            { role: 'character', description: 'mascot Akira' },
          ],
        },
        referenceImages: {
          items: [
            { description: 'I like the diagonal split layout' },
            { description: 'keep the dark vignette' },
          ],
        },
      }),
    ).toMatchSnapshot();
  });

  it('omits sections whose context fields are missing', () => {
    const out = buildPromptFromContext({ game: { name: 'X' } });
    expect(out).toContain('"X"');
    expect(out).not.toContain('About the game');
    expect(out).not.toContain('Genre / mood tags');
    expect(out).not.toContain('Color direction');
    // style-constraints always contributes
    expect(out).toContain('Composition');
  });

  it('caps tags at 8', () => {
    const big: PromptContext = {
      game: { name: 'X', tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) },
    };
    const out = buildPromptFromContext(big);
    expect(out).toContain('tag0');
    expect(out).toContain('tag7');
    expect(out).not.toContain('tag8');
  });
});
