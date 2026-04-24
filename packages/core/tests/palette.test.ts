import { describe, it, expect } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPaletteFromImageData } from '../src/palette.js';
import { decodeImageToRgba } from './helpers/load-image.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('extractPaletteFromImageData', () => {
  it('extracts a stable palette from the Crosshair X (1366800) capsule', async () => {
    const { data } = await decodeImageToRgba(
      join(FIXTURES, 'images', '1366800-capsule.jpg'),
    );
    const result = extractPaletteFromImageData(data);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const p = result.data;
    expect(p.full).toHaveLength(8);
    expect(p.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.secondary).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.accent).toMatch(/^#[0-9a-f]{6}$/);
    expect(p.neutral).toMatch(/^#[0-9a-f]{6}$/);
    expect(['muted', 'balanced', 'vibrant']).toContain(p.vibrancy);
    expect(['dark', 'mid', 'light']).toContain(p.luminance);
  });

  it('produces byte-identical output across runs (determinism contract)', async () => {
    const { data: d1 } = await decodeImageToRgba(
      join(FIXTURES, 'images', '1366800-capsule.jpg'),
    );
    const { data: d2 } = await decodeImageToRgba(
      join(FIXTURES, 'images', '1366800-capsule.jpg'),
    );
    const r1 = extractPaletteFromImageData(d1);
    const r2 = extractPaletteFromImageData(d2);
    expect(r1).toEqual(r2);
  });

  it('snapshots the palette (catches unintended algorithm drift)', async () => {
    const { data } = await decodeImageToRgba(
      join(FIXTURES, 'images', '1366800-capsule.jpg'),
    );
    const result = extractPaletteFromImageData(data);
    expect(result).toMatchSnapshot();
  });

  it('returns insufficient-color-data when every pixel is transparent', () => {
    const transparent = new Uint8ClampedArray(100 * 100 * 4);
    const result = extractPaletteFromImageData(transparent);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('insufficient-color-data');
  });

  it('flags lowConfidence when caller signals a low-res source', async () => {
    const { data } = await decodeImageToRgba(
      join(FIXTURES, 'images', '1366800-capsule.jpg'),
    );
    const result = extractPaletteFromImageData(data, { lowConfidence: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.lowConfidence).toBe(true);
  });
});
