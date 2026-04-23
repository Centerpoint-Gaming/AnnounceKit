/**
 * Palette extraction via k-means clustering.
 *
 * Pure core layer — no browser or DOM dependencies. Takes already-decoded
 * RGBA pixel data and returns a structured Palette. The browser-side
 * wrapper (fetch + OffscreenCanvas + downsample) lives in the chrome medium.
 */

import type { Result } from './result.js';
import { ok, err } from './result.js';

export type PaletteErrorReason =
  | 'fetch-failed'
  | 'decode-failed'
  | 'insufficient-color-data';

export interface PaletteError {
  reason: PaletteErrorReason;
  message: string;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
  full: string[];
  vibrancy: 'muted' | 'balanced' | 'vibrant';
  luminance: 'dark' | 'mid' | 'light';
  lowConfidence?: boolean;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

interface Cluster {
  centroid: RGB;
  count: number;
}

const K = 8;
const MAX_ITERATIONS = 15;
const MIN_PIXELS = K * 4;
const ACCENT_MIN_SHARE = 0.02;

function rgbToHex({ r, g, b }: RGB): string {
  return (
    '#' +
    [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function sqDist(a: RGB, b: RGB): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/**
 * Deterministic k-means++ init: seed with the first pixel, then repeatedly
 * pick the pixel whose minimum distance to any existing centroid is largest.
 * Avoids the randomness of vanilla k-means++ so the same input always
 * produces the same palette.
 */
function initCentroids(pixels: RGB[], k: number): RGB[] {
  const centroids: RGB[] = [{ ...pixels[0] }];
  while (centroids.length < k) {
    let farthest = pixels[0];
    let farthestDist = -1;
    for (const p of pixels) {
      let minDist = Infinity;
      for (const c of centroids) {
        const d = sqDist(p, c);
        if (d < minDist) minDist = d;
      }
      if (minDist > farthestDist) {
        farthestDist = minDist;
        farthest = p;
      }
    }
    centroids.push({ ...farthest });
  }
  return centroids;
}

function kmeans(pixels: RGB[], k: number, maxIter: number): Cluster[] {
  const centroids = initCentroids(pixels, k);
  const sums = Array.from({ length: k }, () => ({
    r: 0,
    g: 0,
    b: 0,
    count: 0,
  }));
  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < maxIter; iter++) {
    for (let c = 0; c < k; c++) {
      sums[c].r = 0;
      sums[c].g = 0;
      sums[c].b = 0;
      sums[c].count = 0;
    }

    let moved = false;
    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(p, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      if (iter === 0 || assignments[i] !== bestIdx) {
        if (iter > 0) moved = true;
        assignments[i] = bestIdx;
      }
      sums[bestIdx].r += p.r;
      sums[bestIdx].g += p.g;
      sums[bestIdx].b += p.b;
      sums[bestIdx].count++;
    }

    for (let c = 0; c < k; c++) {
      if (sums[c].count > 0) {
        centroids[c] = {
          r: Math.round(sums[c].r / sums[c].count),
          g: Math.round(sums[c].g / sums[c].count),
          b: Math.round(sums[c].b / sums[c].count),
        };
      }
    }

    if (iter > 0 && !moved) break;
  }

  return centroids.map((centroid, i) => ({ centroid, count: sums[i].count }));
}

function classifyVibrancy(avgSat: number): Palette['vibrancy'] {
  if (avgSat < 0.2) return 'muted';
  if (avgSat < 0.5) return 'balanced';
  return 'vibrant';
}

function classifyLuminance(avgLum: number): Palette['luminance'] {
  if (avgLum < 0.33) return 'dark';
  if (avgLum < 0.66) return 'mid';
  return 'light';
}

/**
 * Extract a structured palette from decoded RGBA pixel data.
 *
 * @param data - RGBA bytes from a canvas getImageData (length must be a
 *               multiple of 4). Not retained after this function returns.
 * @param options.lowConfidence - Mark the palette as low-confidence (e.g.
 *               caller detected the source image is smaller than the
 *               downsample target).
 */
export function extractPaletteFromImageData(
  data: Uint8ClampedArray,
  options?: { lowConfidence?: boolean },
): Result<Palette, PaletteError> {
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }

  if (pixels.length < MIN_PIXELS) {
    return err({
      reason: 'insufficient-color-data',
      message: `Only ${pixels.length} non-transparent pixels (need at least ${MIN_PIXELS})`,
    });
  }

  const clusters = kmeans(pixels, K, MAX_ITERATIONS)
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  if (clusters.length < 2) {
    return err({
      reason: 'insufficient-color-data',
      message: 'Image resolved to fewer than 2 distinct color clusters',
    });
  }

  const hsls = clusters.map((c) => rgbToHsl(c.centroid));
  const totalCount = clusters.reduce((s, c) => s + c.count, 0);

  let avgSat = 0;
  let avgLum = 0;
  for (let i = 0; i < clusters.length; i++) {
    const w = clusters[i].count / totalCount;
    avgSat += hsls[i].s * w;
    avgLum += hsls[i].l * w;
  }

  // Accent = highest-saturation cluster with enough presence to matter.
  // The 2% floor keeps a single stray rainbow pixel from hijacking accent.
  const minCount = totalCount * ACCENT_MIN_SHARE;
  let accentIdx = 0;
  let maxSat = -1;
  for (let i = 0; i < clusters.length; i++) {
    if (clusters[i].count < minCount) continue;
    if (hsls[i].s > maxSat) {
      maxSat = hsls[i].s;
      accentIdx = i;
    }
  }

  // Neutral = whichever extreme gives the best text contrast against the
  // image's overall tone. Dark-leaning image → pick the lightest cluster;
  // light-leaning image → pick the darkest.
  let neutralIdx = 0;
  if (avgLum < 0.5) {
    let maxL = -1;
    for (let i = 0; i < clusters.length; i++) {
      if (hsls[i].l > maxL) {
        maxL = hsls[i].l;
        neutralIdx = i;
      }
    }
  } else {
    let minL = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      if (hsls[i].l < minL) {
        minL = hsls[i].l;
        neutralIdx = i;
      }
    }
  }

  const hex = clusters.map((c) => rgbToHex(c.centroid));

  const palette: Palette = {
    primary: hex[0],
    secondary: hex[1],
    accent: hex[accentIdx],
    neutral: hex[neutralIdx],
    full: hex,
    vibrancy: classifyVibrancy(avgSat),
    luminance: classifyLuminance(avgLum),
  };
  if (options?.lowConfidence) palette.lowConfidence = true;

  return ok(palette);
}
