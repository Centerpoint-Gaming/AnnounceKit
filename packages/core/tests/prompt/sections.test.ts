import { describe, it, expect } from 'vitest';
import { subjectSection } from '../../src/prompt/sections/subject.js';
import { userDirectiveSection } from '../../src/prompt/sections/user-directive.js';
import { brandAssetsSection } from '../../src/prompt/sections/brand-assets.js';
import { referenceImagesSection } from '../../src/prompt/sections/reference-images.js';
import { announcementBodySection } from '../../src/prompt/sections/announcement-body.js';
import { descriptionSection } from '../../src/prompt/sections/description.js';
import { toneSection } from '../../src/prompt/sections/tone.js';
import { paletteSection } from '../../src/prompt/sections/palette.js';
import { styleConstraintsSection } from '../../src/prompt/sections/style-constraints.js';

describe('subjectSection', () => {
  it('returns null when game name is missing', () => {
    expect(subjectSection.contribute({})).toBeNull();
  });

  it('frames the prompt as a Steam announcement when no title is given', () => {
    const out = subjectSection.contribute({ game: { name: 'Foo' } });
    expect(out).toContain(
      'Create cinematic key-art for a Steam announcement about the game "Foo".',
    );
    // Anchored no-text imperative at the start of the prompt.
    expect(out).toContain('no text');
  });

  it('puts the announcement title in the lead position when given', () => {
    const out = subjectSection.contribute({
      game: { name: 'Foo' },
      announcement: { title: 'v2.0 Update' },
    });
    expect(out).toContain(
      'Create cinematic key-art for "v2.0 Update", a Steam announcement for the game "Foo".',
    );
  });

  it('drops the cinematic key-art framing when brand assets are attached', () => {
    const out = subjectSection.contribute({
      game: { name: 'Foo' },
      brandAssets: {
        items: [
          { role: 'logo' },
          { role: 'character' },
        ],
      },
    });
    expect(out).not.toContain('cinematic');
    expect(out).not.toContain('key-art');
    expect(out).toContain(
      'Create a thumbnail for a Steam announcement about the game "Foo".',
    );
  });

  it('drops the cinematic framing when reference images alone are attached', () => {
    const out = subjectSection.contribute({
      game: { name: 'Foo' },
      referenceImages: { items: [{ description: 'approved layout' }] },
    });
    expect(out).not.toContain('cinematic');
    expect(out).toContain('a thumbnail');
  });
});

describe('brandAssetsSection', () => {
  it('returns null when no brand assets are attached', () => {
    expect(brandAssetsSection.contribute({})).toBeNull();
    expect(brandAssetsSection.contribute({ brandAssets: { items: [] } })).toBeNull();
  });

  it('emits an environment role clause without a generic preamble', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: { items: [{ role: 'environment' }] },
    });
    expect(out).toContain('Environment ref');
    expect(out).toContain('do not duplicate the scene');
    // Compression pass dropped the verbose "identity ingredients" preamble —
    // role clauses speak for themselves now.
    expect(out).not.toContain('identity ingredients');
    expect(out).not.toContain('canonical art style');
  });

  it('emits role-specific imperative clauses for each present role', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: {
        items: [
          { role: 'logo' },
          { role: 'character' },
          { role: 'environment' },
          { role: 'mood' },
        ],
      },
    });
    expect(out).toContain('Logo ref');
    expect(out).toContain('Character ref');
    expect(out).toContain('Environment ref');
    expect(out).toContain('Mood ref');
  });

  it('character clause names every non-character element to ignore', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: { items: [{ role: 'character' }] },
    })!;
    expect(out).toContain('Ignore EVERYTHING else');
    for (const offender of [
      'background',
      'scenery',
      'props',
      'other characters',
      'lighting',
      'composition',
    ]) {
      expect(out).toContain(offender);
    }
  });

  it('logo clause excludes backdrop/padding to prevent backdrop bleed', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: { items: [{ role: 'logo' }] },
    })!;
    expect(out).toContain('only the mark itself');
    expect(out).toContain('backdrop');
  });

  it('returns null guidance for "other"-only attachments (no role clause emitted)', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: { items: [{ role: 'other' }] },
    });
    // No role clause for "other"; with no notes either, output is empty
    // string after the join.
    expect(out).toBe('');
  });

  it('appends per-asset notes when descriptions are provided', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: {
        items: [
          { role: 'logo', description: 'Shibu mascot wordmark' },
          { role: 'character', description: 'Akira, redhead with green sword' },
          { role: 'environment' },
        ],
      },
    });
    expect(out).toContain('User notes');
    expect(out).toContain('asset 1 (logo) — "Shibu mascot wordmark"');
    expect(out).toContain('asset 2 (character) — "Akira, redhead with green sword"');
    expect(out).not.toContain('asset 3');
  });

  it('omits the per-asset notes block when no description is set', () => {
    const out = brandAssetsSection.contribute({
      brandAssets: { items: [{ role: 'logo' }, { role: 'character' }] },
    });
    expect(out).not.toContain('User notes');
  });
});

describe('referenceImagesSection', () => {
  it('returns null when no reference images are attached', () => {
    expect(referenceImagesSection.contribute({})).toBeNull();
    expect(
      referenceImagesSection.contribute({ referenceImages: { items: [] } }),
    ).toBeNull();
  });

  it('without a character brand asset, pulls character + art style from references', () => {
    const out = referenceImagesSection.contribute({
      referenceImages: { items: [{}] },
    });
    expect(out).toContain('main character');
    expect(out).toContain('art style');
    expect(out).toContain('Do NOT copy');
  });

  it('with a character brand asset present, defers identity to brand-assets and stays purely stylistic', () => {
    const out = referenceImagesSection.contribute({
      referenceImages: { items: [{}] },
      brandAssets: { items: [{ role: 'character' }] },
    })!;
    // Avoid duplicating the "extract main character" instruction across
    // sections — when brand-assets owns identity, references stay stylistic.
    expect(out).not.toContain('main character');
    expect(out).toContain('art style');
    expect(out).toContain('Do NOT copy');
  });

  it('emits per-image notes verbatim when descriptions are provided', () => {
    const out = referenceImagesSection.contribute({
      referenceImages: {
        items: [
          { description: 'I like the diagonal split' },
          { description: 'keep the dark vignette' },
          {},
        ],
      },
    });
    expect(out).toContain('User notes');
    expect(out).toContain('reference 1 — "I like the diagonal split"');
    expect(out).toContain('reference 2 — "keep the dark vignette"');
    expect(out).not.toContain('reference 3');
  });

  it('omits the notes block when no description is set', () => {
    const out = referenceImagesSection.contribute({
      referenceImages: { items: [{}, {}] },
    });
    expect(out).not.toContain('User notes');
  });
});

describe('announcementBodySection', () => {
  it('returns null when no body is set', () => {
    expect(announcementBodySection.contribute({})).toBeNull();
    expect(
      announcementBodySection.contribute({ announcement: { title: 'X' } }),
    ).toBeNull();
  });

  it('returns null on whitespace-only body', () => {
    expect(
      announcementBodySection.contribute({ announcement: { body: '   \n  ' } }),
    ).toBeNull();
  });

  it('emits the cleaned body verbatim when short and plain', () => {
    const out = announcementBodySection.contribute({
      announcement: { body: 'New skins this weekend.' },
    });
    expect(out).toBe('Announcement description: New skins this weekend.');
  });

  it('strips BBCode tags but keeps the inner text', () => {
    const out = announcementBodySection.contribute({
      announcement: {
        body: '[h1]Spring Sale[/h1] [b]50% off[/b] all units. Visit [url=https://example.com]our site[/url].',
      },
    });
    expect(out).toBe(
      'Announcement description: Spring Sale 50% off all units. Visit our site.',
    );
  });

  it('drops [img] blocks entirely (URLs are useless to the model)', () => {
    const out = announcementBodySection.contribute({
      announcement: {
        body: 'Check this out: [img]https://example.com/x.png[/img] amazing right?',
      },
    });
    expect(out).toBe('Announcement description: Check this out: amazing right?');
  });

  it('truncates very long bodies with an ellipsis', () => {
    const long = 'word '.repeat(500); // 2500 chars
    const out = announcementBodySection.contribute({
      announcement: { body: long },
    });
    expect(out).not.toBeNull();
    expect(out!.endsWith('…')).toBe(true);
    // Prefix + ~1500 char body cap → comfortably under 1600 chars total.
    expect(out!.length).toBeLessThan(1600);
  });
});

describe('userDirectiveSection', () => {
  it('returns null when userPrompt is missing', () => {
    expect(userDirectiveSection.contribute({})).toBeNull();
  });

  it('returns null when userPrompt is empty or whitespace', () => {
    expect(userDirectiveSection.contribute({ userPrompt: '' })).toBeNull();
    expect(userDirectiveSection.contribute({ userPrompt: '   \n  ' })).toBeNull();
  });

  it('includes the trimmed user direction', () => {
    const out = userDirectiveSection.contribute({
      userPrompt: '  make it cyberpunk neon  ',
    });
    expect(out).toBe('User direction: make it cyberpunk neon');
  });
});

describe('descriptionSection', () => {
  it('returns null when description is missing', () => {
    expect(descriptionSection.contribute({})).toBeNull();
    expect(descriptionSection.contribute({ game: { name: 'Foo' } })).toBeNull();
  });

  it('formats the description', () => {
    const out = descriptionSection.contribute({
      game: { name: 'Foo', shortDescription: 'A puzzle game.' },
    });
    expect(out).toBe('About the game: A puzzle game.');
  });

  it('returns null when images are attached, even with a description', () => {
    expect(
      descriptionSection.contribute({
        game: { name: 'Foo', shortDescription: 'A puzzle game.' },
        brandAssets: { items: [{ role: 'character' }] },
      }),
    ).toBeNull();
    expect(
      descriptionSection.contribute({
        game: { name: 'Foo', shortDescription: 'A puzzle game.' },
        referenceImages: { items: [{}] },
      }),
    ).toBeNull();
  });
});

describe('toneSection', () => {
  it('returns null when tags are missing or empty', () => {
    expect(toneSection.contribute({})).toBeNull();
    expect(toneSection.contribute({ game: { name: 'X', tags: [] } })).toBeNull();
  });

  it('caps the tag list at 8', () => {
    const out = toneSection.contribute({
      game: { name: 'X', tags: Array.from({ length: 20 }, (_, i) => `tag${i}`) },
    });
    expect(out).toContain('tag0');
    expect(out).toContain('tag7');
    expect(out).not.toContain('tag8');
  });

  it('skips empty / non-string tag entries', () => {
    const out = toneSection.contribute({
      game: { name: 'X', tags: ['Action', '', 'RPG'] },
    });
    expect(out).toBe('Genre / mood tags: Action, RPG.');
  });

  it('returns null when images are attached, even with tags', () => {
    expect(
      toneSection.contribute({
        game: { name: 'X', tags: ['Action', 'RPG'] },
        brandAssets: { items: [{ role: 'logo' }] },
      }),
    ).toBeNull();
  });
});

describe('paletteSection', () => {
  it('returns null without a palette primary', () => {
    expect(paletteSection.contribute({})).toBeNull();
  });

  it('omits the accent phrase when accent is empty', () => {
    const out = paletteSection.contribute({
      palette: {
        primary: '#000000',
        secondary: '#111111',
        accent: '',
        neutral: '#ffffff',
        full: ['#000000'],
        vibrancy: 'balanced',
        luminance: 'mid',
      },
    });
    expect(out).not.toContain('with accents of');
    expect(out).toContain('#000000');
  });

  it('includes the accent when present', () => {
    const out = paletteSection.contribute({
      palette: {
        primary: '#000000',
        secondary: '#111111',
        accent: '#ff0044',
        neutral: '#ffffff',
        full: ['#000000'],
        vibrancy: 'vibrant',
        luminance: 'dark',
      },
    });
    expect(out).toContain('with accents of #ff0044');
    expect(out).toContain('dark value');
    expect(out).toContain('vibrant saturation');
  });

  it('prefers brandColors over the auto-extracted palette', () => {
    const out = paletteSection.contribute({
      palette: {
        primary: '#000000',
        secondary: '#111111',
        accent: '#ff0044',
        neutral: '#ffffff',
        full: ['#000000'],
        vibrancy: 'vibrant',
        luminance: 'dark',
      },
      brandColors: [
        { hex: '#deadbe', role: 'primary' },
        { hex: '#cafeba', role: 'accent' },
        { hex: '#beadab', role: 'accent' },
      ],
    });
    expect(out).toContain('#deadbe');
    expect(out).toContain('with accents of #cafeba, #beadab');
    expect(out).not.toContain('#000000');
    expect(out).not.toContain('#ff0044');
    // luminance/vibrancy still come from the auto palette
    expect(out).toContain('dark value');
    expect(out).toContain('vibrant saturation');
  });

  it('falls back to defaults when brandColors are present but no auto palette', () => {
    const out = paletteSection.contribute({
      brandColors: [{ hex: '#112233', role: 'primary' }],
    });
    expect(out).toBe('Color direction: #112233, mid value, balanced saturation.');
  });

  it('ignores entries with missing/empty hex', () => {
    const out = paletteSection.contribute({
      brandColors: [
        { hex: '', role: 'primary' },
        { hex: '   ', role: 'accent' },
        { hex: '#abcdef', role: 'primary' },
      ],
    });
    expect(out).toContain('#abcdef');
    expect(out).not.toContain('with accents of');
  });

  it('emits a background phrase for background-role colors', () => {
    const out = paletteSection.contribute({
      brandColors: [
        { hex: '#111111', role: 'primary' },
        { hex: '#222222', role: 'background' },
      ],
    });
    expect(out).toContain('on a #222222 background');
  });

  it('emits a separate sentence for brand-locked colors', () => {
    const out = paletteSection.contribute({
      brandColors: [
        { hex: '#111111', role: 'primary' },
        { hex: '#aabbcc', role: 'brand' },
        { hex: '#ddeeff', role: 'brand' },
      ],
    });
    expect(out).toContain('Brand colors to reproduce exactly: #aabbcc, #ddeeff.');
  });

  it('emits each custom color with its label', () => {
    const out = paletteSection.contribute({
      brandColors: [
        { hex: '#111111', role: 'primary' },
        { hex: '#445566', role: 'custom', label: 'rim light' },
        { hex: '#778899', role: 'custom' },
      ],
    });
    expect(out).toContain('rim light: #445566.');
    expect(out).toContain('custom: #778899.');
  });

  it('falls back to first entry when no primary role is set', () => {
    const out = paletteSection.contribute({
      brandColors: [
        { hex: '#aabbcc', role: 'accent' },
        { hex: '#112233', role: 'accent' },
      ],
    });
    // First non-custom entry becomes the primary; remaining accents follow.
    expect(out).toContain('Color direction: #aabbcc');
    expect(out).toContain('with accents of #112233');
  });

  it('returns null with auto palette only when images are attached', () => {
    expect(
      paletteSection.contribute({
        palette: {
          primary: '#000000',
          secondary: '#111111',
          accent: '#ff0044',
          neutral: '#ffffff',
          full: ['#000000'],
          vibrancy: 'vibrant',
          luminance: 'dark',
        },
        brandAssets: { items: [{ role: 'character' }] },
      }),
    ).toBeNull();
  });

  it('still emits user-curated brandColors when images are attached (explicit choice wins)', () => {
    const out = paletteSection.contribute({
      brandColors: [{ hex: '#deadbe', role: 'primary' }],
      brandAssets: { items: [{ role: 'character' }] },
    });
    expect(out).toContain('#deadbe');
  });
});

describe('styleConstraintsSection', () => {
  it('always contributes regardless of context', () => {
    expect(styleConstraintsSection.contribute({})).toContain('ZERO text');
    expect(styleConstraintsSection.contribute({})).toContain('Composition');
  });

  it('keeps the painterly/dynamic-lighting prescription when no references', () => {
    const out = styleConstraintsSection.contribute({})!;
    expect(out).toContain('painterly detail');
    expect(out).toContain('dynamic lighting');
  });

  it('drops the entire composition prescription when brand assets are attached', () => {
    const out = styleConstraintsSection.contribute({
      brandAssets: { items: [{ role: 'environment' }] },
    })!;
    // Compression pass: when images are attached they dictate composition;
    // emitting our own composition cue only competes with what the model
    // observes. Only the NO_TEXT_RULE remains as a hard cap.
    expect(out).not.toContain('Composition');
    expect(out).not.toContain('16:9');
    expect(out).not.toContain('painterly detail');
    expect(out).not.toContain('dynamic lighting');
    expect(out).toContain('ZERO text');
  });

  it('drops the composition prescription when reference images alone are attached', () => {
    const out = styleConstraintsSection.contribute({
      referenceImages: { items: [{ description: 'approved layout' }] },
    })!;
    expect(out).not.toContain('Composition');
    expect(out).toContain('ZERO text');
  });
});
