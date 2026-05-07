import { describe, it, expect } from 'vitest';
import { generateThumbnail } from '../../src/thumbnail/generate.js';

const PROMPT = 'Create a cinematic key-art thumbnail for the Steam game "Crosshair X".';

describe('generateThumbnail', () => {
  it('returns missing-api-key when apiKey is empty', async () => {
    const result = await generateThumbnail({
      apiKey: '',
      prompt: PROMPT,
      fetchImpl: async () => new Response(''),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-api-key');
  });

  it('returns missing-prompt when prompt is empty or whitespace', async () => {
    let called = false;
    const result = await generateThumbnail({
      apiKey: 'x',
      prompt: '   ',
      fetchImpl: async () => {
        called = true;
        return new Response('');
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('missing-prompt');
    expect(called).toBe(false);
  });

  it('returns network when fetch throws', async () => {
    const result = await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
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
    const result = await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
      fetchImpl: async () => new Response('quota exceeded', { status: 429 }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('api-error');
    expect(result.error.status).toBe(429);
  });

  it('returns no-image-returned when candidates are empty', async () => {
    const result = await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
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

  it('returns a data URL on a valid response', async () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              { text: 'Here is your image.' },
              { inlineData: { mimeType: 'image/png', data: 'iVBORw0KGgo=' } },
            ],
          },
        },
      ],
    };
    const result = await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
      fetchImpl: async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.dataUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(result.data.mimeType).toBe('image/png');
    expect(result.data.model).toBe('gemini-3-pro-image-preview');
    expect(result.data.promptUsed).toBe(PROMPT);
  });

  it('sends the API key in the URL and the prompt in the JSON body', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    await generateThumbnail({
      apiKey: 'secret-key-123',
      prompt: PROMPT,
      fetchImpl: async (url, init) => {
        capturedUrl = String(url);
        capturedBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    expect(capturedUrl).toContain('gemini-3-pro-image-preview:generateContent');
    expect(capturedUrl).toContain('key=secret-key-123');
    const body = JSON.parse(capturedBody);
    expect(body.contents[0].parts[0]).toEqual({ text: PROMPT });
  });

  it('respects a custom model override', async () => {
    let capturedUrl = '';
    await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
      model: 'imagen-4.0-generate-001',
      fetchImpl: async (url) => {
        capturedUrl = String(url);
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    expect(capturedUrl).toContain('imagen-4.0-generate-001:generateContent');
  });

  it('inlines references as additional parts in the request body', async () => {
    let capturedBody = '';
    await generateThumbnail({
      apiKey: 'x',
      prompt: PROMPT,
      references: [
        { mimeType: 'image/jpeg', data: 'HEROBYTES' },
        { mimeType: 'image/png', data: 'LOGOBYTES' },
      ],
      fetchImpl: async (_url, init) => {
        capturedBody = String(init?.body ?? '');
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    const body = JSON.parse(capturedBody);
    expect(body.contents[0].parts[0]).toEqual({ text: PROMPT });
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: 'HEROBYTES' },
    });
    expect(body.contents[0].parts[2]).toEqual({
      inlineData: { mimeType: 'image/png', data: 'LOGOBYTES' },
    });
  });
});
