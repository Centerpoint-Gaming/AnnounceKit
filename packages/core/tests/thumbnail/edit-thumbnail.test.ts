import { describe, it, expect } from 'vitest';
import {
  editThumbnail,
  buildEditPrompt,
} from '../../src/thumbnail/edit.js';
import type {
  EditReference,
  ThumbnailReference,
} from '../../src/thumbnail/index.js';

const PRIOR: ThumbnailReference = { mimeType: 'image/png', data: 'PRIORBYTES' };
const INSTRUCTION = 'make the character bigger and drop the corner text';

function imageResponse(data = 'NEWBYTES', mimeType = 'image/png'): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ inlineData: { mimeType, data } }],
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('editThumbnail', () => {
  it('returns missing-api-key when apiKey is empty', async () => {
    const result = await editThumbnail({
      apiKey: '',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () => new Response(''),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-api-key');
  });

  it('returns missing-instruction when instruction is empty or whitespace', async () => {
    let called = false;
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: '   ',
      priorImage: PRIOR,
      fetchImpl: async () => {
        called = true;
        return new Response('');
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-instruction');
    expect(called).toBe(false);
  });

  it('returns missing-prior-image when priorImage data is empty', async () => {
    let called = false;
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: { mimeType: 'image/png', data: '' },
      fetchImpl: async () => {
        called = true;
        return new Response('');
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-prior-image');
    expect(called).toBe(false);
  });

  it('returns network when fetch throws', async () => {
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('network');
    expect(result.error.message).toContain('offline');
  });

  it('returns api-error on non-2xx response', async () => {
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () => new Response('quota exceeded', { status: 429 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('api-error');
    expect(result.error.status).toBe(429);
  });

  it('returns no-image-returned when candidates are empty', async () => {
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () =>
        new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('no-image-returned');
  });

  it('returns invalid-response when JSON parsing fails', async () => {
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () =>
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('invalid-response');
  });

  it('returns a data URL on a valid response', async () => {
    const result = await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      fetchImpl: async () => imageResponse('iVBORw0KGgo='),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(result.data.mimeType).toBe('image/png');
    expect(result.data.model).toBe('gemini-3-pro-image-preview');
    expect(result.data.instructionUsed).toBe(INSTRUCTION);
    expect(result.data.promptUsed).toContain(INSTRUCTION);
  });

  it('places the prior image as the first inline part and references after it', async () => {
    let capturedBody = '';
    const refs: EditReference[] = [
      { mimeType: 'image/jpeg', data: 'POSEBYTES', role: 'pose' },
      { mimeType: 'image/png', data: 'ITEMBYTES', role: 'item' },
    ];
    await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      references: refs,
      fetchImpl: async (_url, init) => {
        capturedBody = String(init?.body ?? '');
        return imageResponse();
      },
    });
    const body = JSON.parse(capturedBody);
    const parts = body.contents[0].parts;
    expect(parts[0].text).toBeTypeOf('string');
    expect(parts[1]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'PRIORBYTES' },
    });
    expect(parts[2]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: 'POSEBYTES' },
    });
    expect(parts[3]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'ITEMBYTES' },
    });
  });

  it('respects a custom model override', async () => {
    let capturedUrl = '';
    await editThumbnail({
      apiKey: 'x',
      instruction: INSTRUCTION,
      priorImage: PRIOR,
      model: 'gemini-2.5-flash-image',
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return imageResponse();
      },
    });
    expect(capturedUrl).toContain('gemini-2.5-flash-image:generateContent');
  });
});

describe('buildEditPrompt', () => {
  it('always includes the no-text rule', () => {
    const prompt = buildEditPrompt('rotate the camera', []);
    expect(prompt).toContain('ZERO text');
  });

  it('addresses the prior image as Attachment 1', () => {
    const prompt = buildEditPrompt('change lighting', []);
    expect(prompt).toContain('Attachment 1');
  });

  it('includes the user instruction verbatim', () => {
    const prompt = buildEditPrompt('  add a hat  ', []);
    expect(prompt).toContain('add a hat');
  });

  it('produces role-specific clauses for each reference, indexed from 2', () => {
    const refs: EditReference[] = [
      { mimeType: 'image/png', data: 'a', role: 'pose' },
      { mimeType: 'image/png', data: 'b', role: 'item' },
      { mimeType: 'image/png', data: 'c', role: 'character' },
      { mimeType: 'image/png', data: 'd', role: 'environment' },
      { mimeType: 'image/png', data: 'e', role: 'style' },
      { mimeType: 'image/png', data: 'f', role: 'other' },
    ];
    const prompt = buildEditPrompt('do the thing', refs);
    expect(prompt).toContain('Attachment 2 (pose reference)');
    expect(prompt).toContain('Attachment 3 (item reference)');
    expect(prompt).toContain('Attachment 4 (character reference)');
    expect(prompt).toContain('Attachment 5 (environment reference)');
    expect(prompt).toContain('Attachment 6 (style reference)');
    expect(prompt).toContain('Attachment 7');
  });

  it('surfaces user notes verbatim alongside role clauses', () => {
    const refs: EditReference[] = [
      {
        mimeType: 'image/png',
        data: 'a',
        role: 'item',
        note: 'a glowing sword in their right hand',
      },
    ];
    const prompt = buildEditPrompt('add a weapon', refs);
    expect(prompt).toContain('"a glowing sword in their right hand"');
  });
});
