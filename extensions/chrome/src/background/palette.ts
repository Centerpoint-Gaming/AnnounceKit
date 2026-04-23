/**
 * Contract: extractPalette
 *
 * Browser-side wrapper around core's extractPaletteFromImageData. Fetches
 * the image, decodes it on an OffscreenCanvas downsampled to 100x100, and
 * delegates the clustering logic to core.
 *
 * Runs in the service worker, where OffscreenCanvas + fetch + createImageBitmap
 * are all available. Steam CDN images are reachable thanks to the
 * cdn.akamai.steamstatic.com host permission in manifest.json.
 *
 * Invariants:
 *   - Deterministic: same image URL → same palette (core uses a deterministic
 *     k-means++ init; canvas downsampling is also deterministic).
 *   - No pixel data retained: the ImageBitmap is closed and the ImageData
 *     reference goes out of scope before the function returns.
 *   - Works offline if the image is already in the browser's fetch cache.
 */

import { extractPaletteFromImageData, err } from '@announcekit/core';
import type { Palette, PaletteError, Result } from '@announcekit/core';

const DOWNSAMPLE_SIZE = 100;

export async function extractPalette(
  imageUrl: string,
): Promise<Result<Palette, PaletteError>> {
  let response: Response;
  try {
    response = await fetch(imageUrl);
  } catch (e) {
    return err({
      reason: 'fetch-failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
  if (!response.ok) {
    return err({
      reason: 'fetch-failed',
      message: `HTTP ${response.status} fetching ${imageUrl}`,
    });
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch (e) {
    return err({
      reason: 'fetch-failed',
      message: e instanceof Error ? e.message : 'Failed to read response body',
    });
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch (e) {
    return err({
      reason: 'decode-failed',
      message: e instanceof Error ? e.message : 'Failed to decode image',
    });
  }

  try {
    const canvas = new OffscreenCanvas(DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return err({ reason: 'decode-failed', message: 'OffscreenCanvas 2D context unavailable' });
    }
    ctx.drawImage(bitmap, 0, 0, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);
    const { data } = ctx.getImageData(0, 0, DOWNSAMPLE_SIZE, DOWNSAMPLE_SIZE);

    const lowConfidence =
      bitmap.width < DOWNSAMPLE_SIZE || bitmap.height < DOWNSAMPLE_SIZE;
    return extractPaletteFromImageData(data, { lowConfidence });
  } finally {
    bitmap.close();
  }
}
