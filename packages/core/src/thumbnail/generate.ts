/**
 * Contract: generateThumbnail
 *
 * Given a finished prompt string (plus optional reference image bytes), call
 * the Gemini image generation API. Returns a Result — never throws for
 * expected failures.
 *
 * Prompt synthesis lives in `prompt/` — this function does not build prompts,
 * it transmits them. Reference selection lives in the medium — this function
 * accepts whatever ThumbnailReference array the caller provides and ships it.
 *
 * Transport: the Gemini generateContent REST endpoint returns base64-encoded
 * image bytes inline. We package them as a data URL so the caller can drop
 * the result straight into an <img src>.
 *
 * Performance budget: the API itself is the bottleneck (2–15s typical for
 * image gen). This function adds no processing beyond JSON parsing.
 * Side effects: one outbound HTTPS request. No storage writes.
 */

import type { Result } from '../result.js';
import { ok, err } from '../result.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ThumbnailGenErrorReason =
  | 'missing-api-key'
  | 'missing-prompt'
  | 'network'
  | 'api-error'
  | 'no-image-returned'
  | 'invalid-response';

export interface ThumbnailGenError {
  reason: ThumbnailGenErrorReason;
  message: string;
  status?: number;
}

/**
 * A reference image part ready to be sent to the model. The medium is
 * responsible for resolving any StoredAsset binaryRef → bytes and producing
 * this shape; core never touches a binary store directly.
 */
export interface ThumbnailReference {
  /** Base64-encoded image bytes (no data: prefix). */
  data: string;
  mimeType: string;
}

export interface GeneratedThumbnail {
  dataUrl: string;
  mimeType: string;
  promptUsed: string;
  model: string;
  generatedAt: number;
}

export interface GenerateThumbnailOptions {
  apiKey: string;
  prompt: string;
  references?: readonly ThumbnailReference[];
  model?: string;
  signal?: AbortSignal;
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Public API ──────────────────────────────────────────────────────────────

export async function generateThumbnail(
  options: GenerateThumbnailOptions,
): Promise<Result<GeneratedThumbnail, ThumbnailGenError>> {
  const { apiKey, prompt, references, signal } = options;
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
      message: 'generateThumbnail requires a non-empty prompt string.',
    });
  }

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];
  for (const ref of references ?? []) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
  }

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

  const inline = findInlineImage(json);
  if (!inline) {
    return err({
      reason: 'no-image-returned',
      message: 'Gemini response contained no inline image data',
    });
  }

  return ok({
    dataUrl: `data:${inline.mimeType};base64,${inline.data}`,
    mimeType: inline.mimeType,
    promptUsed: prompt,
    model,
    generatedAt: Date.now(),
  });
}

// ─── Internal ────────────────────────────────────────────────────────────────

interface InlineImage {
  mimeType: string;
  data: string;
}

function findInlineImage(json: unknown): InlineImage | null {
  if (!json || typeof json !== 'object') return null;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) return null;

  for (const c of candidates) {
    const parts = (c as { content?: { parts?: unknown } })?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      const inline = (p as { inlineData?: { mimeType?: unknown; data?: unknown } })
        ?.inlineData;
      if (
        inline &&
        typeof inline.data === 'string' &&
        inline.data.length > 0
      ) {
        return {
          mimeType:
            typeof inline.mimeType === 'string' ? inline.mimeType : 'image/png',
          data: inline.data,
        };
      }
    }
  }
  return null;
}
