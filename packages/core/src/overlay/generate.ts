/**
 * Contract: generateOverlays
 *
 * Given a thumbnail image and a system prompt, call the Gemini text/vision
 * API and parse the response into OverlayVariant[]. Returns a Result —
 * never throws for expected failures.
 *
 * This mirrors generateThumbnail's transport pattern but targets the text
 * generation endpoint (not image generation). The thumbnail is sent as an
 * inline image for the model to analyze; the response is text containing
 * fenced HTML blocks.
 */

import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import type {
  GenerateOverlaysOptions,
  OverlayGenError,
  OverlayVariant,
} from './types.js';
import { parseOverlayVariants } from './parse.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateOverlays(
  options: GenerateOverlaysOptions,
): Promise<Result<OverlayVariant[], OverlayGenError>> {
  const {
    apiKey,
    prompt,
    thumbnailBase64,
    thumbnailMimeType,
    signal,
  } = options;
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    return err({
      reason: 'missing-api-key',
      message: 'VITE_GEMINI_API_KEY is not set. Add it to your .env file.',
    });
  }

  if (!prompt || prompt.trim().length === 0) {
    return err({
      reason: 'missing-prompt',
      message: 'generateOverlays requires a non-empty prompt string.',
    });
  }

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: prompt },
    { inlineData: { mimeType: thumbnailMimeType, data: thumbnailBase64 } },
  ];

  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
      signal,
    });
  } catch (e) {
    return err({
      reason: 'network',
      message: e instanceof Error ? e.message : String(e),
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return err({
      reason: 'api-error',
      status: response.status,
      message: `Gemini API returned ${response.status}: ${text.slice(0, 500)}`,
    });
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (e) {
    return err({
      reason: 'invalid-response',
      message: e instanceof Error ? e.message : 'Failed to parse JSON',
    });
  }

  const responseText = extractTextContent(json);
  if (!responseText) {
    return err({
      reason: 'no-text-returned',
      message: 'Gemini response contained no text content',
    });
  }

  const variants = parseOverlayVariants(responseText);
  if (variants.length === 0) {
    return err({
      reason: 'parse-failed',
      message: 'Could not extract any HTML overlay variants from the response',
    });
  }

  return ok(variants);
}

function extractTextContent(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;

  const parts: string[] = [];
  for (const c of candidates) {
    const contentParts = (c as { content?: { parts?: unknown } })?.content?.parts;
    if (!Array.isArray(contentParts)) continue;
    for (const p of contentParts) {
      const text = (p as { text?: unknown })?.text;
      if (typeof text === 'string' && text.length > 0) {
        parts.push(text);
      }
    }
  }

  return parts.length > 0 ? parts.join('\n') : null;
}
