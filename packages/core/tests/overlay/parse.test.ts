import { describe, it, expect } from 'vitest';
import { parseOverlayVariants } from '../../src/overlay/parse.js';

describe('parseOverlayVariants', () => {
  it('extracts variants with comment headers', () => {
    const text = `
Some prose from the model.

<!-- variant: Bottom Hero | Large centered text at bottom over gradient fade -->
\`\`\`html
<div style="position:relative; width:1024px; height:576px;">
  <div data-layer="hero" style="position:absolute; bottom:20px;">BATTLE</div>
</div>
\`\`\`

<!-- variant: Top Left | Text in upper-left dark zone -->
\`\`\`html
<div style="position:relative; width:1024px; height:576px;">
  <div data-layer="hero" style="position:absolute; top:20px; left:20px;">LAUNCH</div>
</div>
\`\`\`
`;

    const variants = parseOverlayVariants(text);
    expect(variants).toHaveLength(2);

    expect(variants[0].id).toBe('variant-0');
    expect(variants[0].name).toBe('Bottom Hero');
    expect(variants[0].rationale).toBe(
      'Large centered text at bottom over gradient fade',
    );
    expect(variants[0].html).toContain('data-layer="hero"');
    expect(variants[0].html).toContain('BATTLE');

    expect(variants[1].id).toBe('variant-1');
    expect(variants[1].name).toBe('Top Left');
    expect(variants[1].html).toContain('LAUNCH');
  });

  it('assigns generated names when comment headers are missing', () => {
    const text = `
\`\`\`html
<div style="width:800px; height:450px;">
  <span data-layer="hero">HELLO</span>
</div>
\`\`\`

\`\`\`html
<div style="width:800px; height:450px;">
  <span data-layer="hero">WORLD</span>
</div>
\`\`\`
`;

    const variants = parseOverlayVariants(text);
    expect(variants).toHaveLength(2);
    expect(variants[0].name).toBe('Variant 1');
    expect(variants[0].rationale).toBe('');
    expect(variants[1].name).toBe('Variant 2');
  });

  it('returns empty array for text with no HTML fences', () => {
    const text = 'Here is a description but no code blocks.';
    expect(parseOverlayVariants(text)).toHaveLength(0);
  });

  it('skips empty HTML fences', () => {
    const text = `
\`\`\`html

\`\`\`

\`\`\`html
<div>content</div>
\`\`\`
`;
    const variants = parseOverlayVariants(text);
    expect(variants).toHaveLength(1);
    expect(variants[0].html).toContain('content');
    expect(variants[0].name).toBe('Variant 1');
  });

  it('handles a single variant', () => {
    const text = `
<!-- variant: Centered | Full center placement -->
\`\`\`html
<div style="position:relative;">
  <div data-layer="hero">ONE</div>
</div>
\`\`\`
`;
    const variants = parseOverlayVariants(text);
    expect(variants).toHaveLength(1);
    expect(variants[0].name).toBe('Centered');
    expect(variants[0].rationale).toBe('Full center placement');
  });
});
