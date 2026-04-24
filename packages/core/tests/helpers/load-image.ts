/**
 * Decode an image file on disk into the same RGBA byte layout that
 * `canvas.getImageData().data` produces in the browser. Lets Node tests
 * exercise the browser-originated `extractPaletteFromImageData` contract
 * without a real DOM.
 */

import sharp from 'sharp';

export interface DecodedImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export async function decodeImageToRgba(
  path: string,
  size = 100,
): Promise<DecodedImage> {
  const { data, info } = await sharp(path)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Buffer → Uint8ClampedArray over the same bytes, no copy.
  const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  return { data: rgba, width: info.width, height: info.height };
}
