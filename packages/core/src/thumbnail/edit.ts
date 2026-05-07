/**
 * Contract: editThumbnail
 *
 * Iterative refinement on a previously generated thumbnail. The caller passes
 * the prior image bytes plus a free-form natural-language instruction
 * ("make the character bigger, drop the corner text"); the function wraps
 * the instruction with a preservation guard + the shared no-text rule and
 * sends the bundle to Gemini's image-edit-capable model. Returns the new
 * image. Statelessness is intentional — chain compounding is the medium's
 * job (feed the latest output back as priorImage next round).
 *
 * EditReference is a richer cousin of ThumbnailReference: each reference
 * carries a `role` so the prompt wrapper can produce a labeled clause
 * telling the model what to do with that specific attachment (apply pose,
 * incorporate item, preserve identity, etc.). Without role attribution the
 * model averages all attachments together.
 *
 * Transport: same Gemini generateContent endpoint as generateThumbnail.
 * The prior image is the first inline part (anchor); auxiliary references
 * follow in declared order, and the wrapped prompt addresses each by
 * 1-based index so the model can correlate "attachment 2 (pose reference)"
 * with the right inline image.
 */

import type { Result } from '../result.js';
import { ok, err } from '../result.js';
import { NO_TEXT_RULE } from '../prompt/no-text-rule.js';
import type { ThumbnailReference } from './generate.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EditReferenceRole =
  | 'pose'
  | 'item'
  | 'character'
  | 'environment'
  | 'style'
  | 'other';

export interface EditReference {
  /** Base64-encoded image bytes (no data: prefix). */
  data: string;
  mimeType: string;
  role: EditReferenceRole;
  /** User's note about this reference — surfaces verbatim in the prompt. */
  note?: string;
}

export type ThumbnailEditErrorReason =
  | 'missing-api-key'
  | 'missing-instruction'
  | 'missing-prior-image'
  | 'network'
  | 'api-error'
  | 'no-image-returned'
  | 'invalid-response';

export interface ThumbnailEditError {
  reason: ThumbnailEditErrorReason;
  message: string;
  status?: number;
}

export interface EditedThumbnail {
  dataUrl: string;
  mimeType: string;
  /** The user's raw instruction as supplied. */
  instructionUsed: string;
  /** The wrapped prompt actually sent — useful for debug / telemetry. */
  promptUsed: string;
  model: string;
  generatedAt: number;
}

export interface EditThumbnailOptions {
  apiKey: string;
  instruction: string;
  priorImage: ThumbnailReference;
  references?: readonly EditReference[];
  model?: string;
  signal?: AbortSignal;
  /** Injectable for tests. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─── Public API ──────────────────────────────────────────────────────────────

export async function editThumbnail(
  options: EditThumbnailOptions,
): Promise<Result<EditedThumbnail, ThumbnailEditError>> {
  const { apiKey, instruction, priorImage, references, signal } = options;
  const model = options.model ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!apiKey) {
    return err({
      reason: 'missing-api-key',
      message: 'VITE_GEMINI_API_KEY is not set. Add it to your .env file.',
    });
  }

  if (!instruction || instruction.trim().length === 0) {
    return err({
      reason: 'missing-instruction',
      message: 'editThumbnail requires a non-empty instruction string.',
    });
  }

  if (!priorImage || !priorImage.data) {
    return err({
      reason: 'missing-prior-image',
      message: 'editThumbnail requires priorImage with non-empty data.',
    });
  }

  const prompt = buildEditPrompt(instruction, references ?? []);

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [
    { text: prompt },
    { inlineData: { mimeType: priorImage.mimeType, data: priorImage.data } },
  ];
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
    instructionUsed: instruction,
    promptUsed: prompt,
    model,
    generatedAt: Date.now(),
  });
}

// ─── Prompt wrapper ─────────────────────────────────────────────────────────

/**
 * Wrap a raw user instruction into the full edit prompt. Exposed for tests
 * and callers that want to inspect/log the wrapped form.
 *
 * The prompt is structured so attachments are addressable by 1-based index:
 *   1. prior image (always first)
 *   2..N. auxiliary references (one clause per role)
 * Each role has its own clause so the model knows whether to copy identity,
 * apply pose only, incorporate an item, etc.
 */
export function buildEditPrompt(
  instruction: string,
  references: readonly EditReference[],
): string {
  const clauses: string[] = [
    'You are editing a previously generated thumbnail. Apply the user instruction below while preserving the existing composition, art style, characters, palette, and aspect ratio of the prior image — change only what the instruction explicitly asks for.',
    'Attachment 1 is the prior image being edited; treat it as the canvas.',
  ];

  references.forEach((ref, idx) => {
    const attachmentNum = idx + 2; // 1 is the prior image
    clauses.push(roleClause(attachmentNum, ref));
  });

  clauses.push(`User edit instruction: ${instruction.trim()}`);
  clauses.push(NO_TEXT_RULE);

  return clauses.join(' ');
}

function roleClause(attachmentNum: number, ref: EditReference): string {
  const note = ref.note?.trim();
  const noteSuffix = note ? ` Note from user: "${note}".` : '';
  const prefix = `Attachment ${attachmentNum}`;
  switch (ref.role) {
    case 'pose':
      return `${prefix} (pose reference): match the pose, body language, and gesture shown here for the main character. Do NOT copy its art style, framing, background, or color palette — those stay from attachment 1.${noteSuffix}`;
    case 'item':
      return `${prefix} (item reference): incorporate this specific object/prop into the scene, rendered in the art style of attachment 1. Do NOT copy the reference's framing or background.${noteSuffix}`;
    case 'character':
      return `${prefix} (character reference): use this image as the identity anchor for the main character — preserve their design, proportions, costume, and personality.${noteSuffix}`;
    case 'environment':
      return `${prefix} (environment reference): use this as inspiration for the setting/background mood. Do NOT copy literally; absorb the atmosphere and re-render in the art style of attachment 1.${noteSuffix}`;
    case 'style':
      return `${prefix} (style reference): apply the art style, line quality, rendering, and color feel of this image to the edit. Do NOT copy its subject or composition.${noteSuffix}`;
    case 'other':
    default:
      return `${prefix}: additional reference — interpret based on the user's note.${noteSuffix}`;
  }
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
