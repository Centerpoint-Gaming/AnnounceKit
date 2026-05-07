import { useCallback, useMemo, useState } from 'react';
import type { GameProfile, OverlayVariant, OverlayGenError, Result, BrandGuidelines } from '@announcekit/core';
import { assembleBrandGuidelines } from '@announcekit/core';
import { OverlayPicker } from './OverlayPicker';

type OverlayState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'error'; error: OverlayGenError }
  | { status: 'ready'; variants: OverlayVariant[] };

interface TextOverlayProps {
  imageDataUrl: string;
  gameName: string;
  announcementTitle?: string;
  announcementBody?: string;
  profile: GameProfile;
  onBack: () => void;
}

export function TextOverlay({
  imageDataUrl,
  gameName,
  announcementTitle,
  announcementBody,
  profile,
  onBack,
}: TextOverlayProps) {
  const [overlayState, setOverlayState] = useState<OverlayState>({ status: 'idle' });
  const [fontFamily, setFontFamily] = useState('');
  const [userPrompt, setUserPrompt] = useState('');

  const brand = useMemo(
    () => assembleBrandGuidelines(
      profile.palette,
      profile.brand.colors,
      fontFamily.trim() || undefined,
    ),
    [profile.palette, profile.brand.colors, fontFamily],
  );

  const handleGenerate = useCallback(async () => {
    if (overlayState.status === 'generating') return;

    setOverlayState({ status: 'generating' });
    try {
      const result: Result<OverlayVariant[], OverlayGenError> =
        await chrome.runtime.sendMessage({
          type: 'GENERATE_OVERLAYS',
          profile,
          thumbnailDataUrl: imageDataUrl,
          announcementTitle,
          announcementBody,
          userPrompt: userPrompt.trim() || undefined,
          fontFamily: fontFamily.trim() || undefined,
        });

      if (!result?.ok) {
        setOverlayState({
          status: 'error',
          error: result?.error ?? {
            reason: 'invalid-response',
            message: 'No response from background worker',
          },
        });
        return;
      }

      setOverlayState({ status: 'ready', variants: result.data });
    } catch (e) {
      setOverlayState({
        status: 'error',
        error: {
          reason: 'network',
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  }, [overlayState.status, profile, imageDataUrl, announcementTitle, announcementBody, userPrompt, fontFamily]);

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors mb-3"
      >
        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 2L4 6l4 4" />
        </svg>
        Back
      </button>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Generate Text Overlay</h2>
      </div>

      {/* Thumbnail preview — idle state */}
      {overlayState.status !== 'ready' && (
        <div className="rounded-lg border border-gray-700 overflow-hidden mb-3">
          <img
            src={imageDataUrl}
            alt=""
            draggable={false}
            className="w-full block"
          />
        </div>
      )}

      {/* User inputs */}
      <div className="space-y-2 mb-3">
        <label className="block">
          <span className="text-xs text-gray-400">Font Family</span>
          <input
            type="text"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            placeholder="system-ui, sans-serif"
            className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <span className="text-[10px] text-gray-600 mt-0.5 block">
            e.g. Bebas Neue, Oswald, Montserrat — Google Fonts link is auto-included
          </span>
        </label>
        <label className="block">
          <span className="text-xs text-gray-400">Style Direction</span>
          <textarea
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder="e.g. bold and aggressive, neon cyberpunk, minimalist clean..."
            rows={2}
            className="w-full mt-0.5 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </label>
      </div>

      {/* Generate / regenerate CTA */}
      <button
        onClick={handleGenerate}
        disabled={overlayState.status === 'generating'}
        className={`w-full mb-3 py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
          overlayState.status === 'generating'
            ? 'bg-gray-800 text-gray-500 cursor-wait'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {overlayState.status === 'generating' ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            Generating overlays...
          </span>
        ) : overlayState.status === 'ready' ? (
          'Regenerate Overlays'
        ) : (
          'Generate AI Overlays'
        )}
      </button>

      {/* Error display */}
      {overlayState.status === 'error' && (
        <div className="mb-3 bg-red-900/30 border border-red-800 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-red-300 uppercase tracking-wide">
            {overlayState.error.reason}
          </p>
          <p className="text-xs text-red-200 mt-0.5 break-words">
            {overlayState.error.message}
          </p>
        </div>
      )}

      {/* Brand Guidelines debug card */}
      <BrandGuidelinesCard brand={brand} />

      {/* AI overlay picker */}
      {overlayState.status === 'ready' && (
        <OverlayPicker
          variants={overlayState.variants}
          imageDataUrl={imageDataUrl}
          gameName={gameName}
        />
      )}
    </div>
  );
}

function BrandGuidelinesCard({ brand }: { brand: BrandGuidelines }) {
  const curatedRoles = new Set(brand.colors.curated.map((c) => c.role));

  const resolvedSlots = [
    { slot: 'Primary', hex: brand.colors.primary, overriddenBy: curatedRoles.has('primary') ? 'primary' : null },
    { slot: 'Secondary', hex: brand.colors.secondary, overriddenBy: null },
    { slot: 'Accent', hex: brand.colors.accent, overriddenBy: curatedRoles.has('accent') ? 'accent' : null },
    { slot: 'Neutral', hex: brand.colors.neutral, overriddenBy: curatedRoles.has('background') ? 'background' : null },
  ];

  return (
    <details className="mb-3 border border-gray-700 rounded-lg overflow-hidden">
      <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Brand Guidelines
        </span>
        <span className="ml-2 text-xs text-gray-500">
          {brand.colors.curated.length} curated · {brand.colors.vibrancy} · {brand.colors.luminance}
        </span>
      </summary>
      <div className="p-3 space-y-2.5">
        {/* Resolved color slots sent to the AI */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            Resolved Colors (sent to AI)
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {resolvedSlots.map((s) => (
              <div key={s.slot} className="flex items-center gap-1">
                <div
                  className="w-4 h-4 rounded border border-gray-600"
                  style={{ backgroundColor: s.hex }}
                />
                <div>
                  <div className="text-[10px] text-gray-400 leading-none">
                    {s.slot}
                    {s.overriddenBy && (
                      <span className="ml-1 text-green-400">curated</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono leading-none">{s.hex}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1">
            <span className="text-[10px] text-gray-500">
              vibrancy: <span className="text-gray-300">{brand.colors.vibrancy}</span>
            </span>
            <span className="text-[10px] text-gray-500">
              luminance: <span className="text-gray-300">{brand.colors.luminance}</span>
            </span>
          </div>
        </div>

        {/* All curated brand colors */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">
            All Curated Colors
          </div>
          {brand.colors.curated.length === 0 ? (
            <div className="text-[10px] text-gray-600">None — all slots filled from auto-extracted palette</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {brand.colors.curated.map((c, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-800 rounded px-1.5 py-0.5">
                  <div
                    className="w-3 h-3 rounded border border-gray-600"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span className="text-[10px] text-gray-300">{c.role}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{c.hex}</span>
                  {c.label && <span className="text-[10px] text-gray-600">({c.label})</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Font family */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">
            Font Family
          </div>
          <div className="text-xs text-gray-300 font-mono">{brand.fontFamily}</div>
        </div>
      </div>
    </details>
  );
}
