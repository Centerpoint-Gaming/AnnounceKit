import { useEffect, useMemo, useState } from 'react';
import type { GameProfile, StoredAsset } from '@announcekit/core';
import { SECTIONS, buildPromptFromContext, buildOverlayPrompt, assembleBrandGuidelines } from '@announcekit/core';
import type { SerializedPageContext } from '../../content/scraper';
import { buildPromptContextFromProfile } from '../../buildPromptContext';
import {
  MAX_BRAND_ASSETS,
  MAX_REFERENCE_IMAGES,
  selectBrandAssets,
  selectReferenceImages,
} from '../../selectReferences';
import { createIndexedDBBinaryStore } from '../../storage/binaryStore';

interface PromptViewProps {
  profile: GameProfile;
  pageContext?: SerializedPageContext;
  userPrompt?: string;
}

const binaryStore = createIndexedDBBinaryStore();

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function PromptView({ profile, pageContext, userPrompt }: PromptViewProps) {
  const { ctx, prompt, perSection, brandAssets, referenceImages, overlayPrompt, overlayCtx } = useMemo(() => {
    const ctx = buildPromptContextFromProfile(profile, {
      announcementTitle: pageContext?.editorState.existingTitle,
      announcementBody: pageContext?.editorState.existingBody,
      userPrompt,
    });
    const prompt = buildPromptFromContext(ctx);
    const perSection = SECTIONS.map((s) => ({
      id: s.id,
      fragment: s.contribute(ctx),
    }));
    const brandAssets = selectBrandAssets(profile.brand);
    const referenceImages = selectReferenceImages(profile.brand);

    const brand = assembleBrandGuidelines(profile.palette, profile.brand.colors);
    const overlayCtx = {
      gameName: profile.name,
      announcementTitle: pageContext?.editorState.existingTitle,
      announcementBody: pageContext?.editorState.existingBody,
      userPrompt,
      brand,
      dimensions: { width: 1024, height: 1024 },
      variantCount: 4,
    };
    const overlayPrompt = buildOverlayPrompt(overlayCtx);

    return { ctx, prompt, perSection, brandAssets, referenceImages, overlayPrompt, overlayCtx };
  }, [profile, pageContext, userPrompt]);

  const charCount = prompt.length;
  const wordCount = prompt.length === 0 ? 0 : prompt.split(/\s+/).filter(Boolean).length;

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500">
        Preview of the prompt sent on <span className="text-gray-300">Generate Thumbnail</span>.
        Mirrors what the service worker assembles.
      </div>

      <details open className="border border-gray-700 rounded-lg overflow-hidden">
        <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">
            Assembled Prompt
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {wordCount} words · {charCount} chars
          </span>
        </summary>
        <div className="p-3">
          <div className="text-xs text-gray-200 bg-gray-800 rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-words max-h-80 overflow-y-auto">
            {prompt || '(empty — no sections contributed)'}
          </div>
        </div>
      </details>

      <details open className="border border-gray-700 rounded-lg overflow-hidden">
        <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">
            Brand Assets (identity)
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {brandAssets.selected.length}/{MAX_BRAND_ASSETS} sent
            {brandAssets.skipped.length > 0
              ? ` · ${brandAssets.skipped.length} over cap`
              : ''}
          </span>
        </summary>
        <div className="p-3">
          <ReferenceList
            kind="brand"
            cap={MAX_BRAND_ASSETS}
            selected={brandAssets.selected}
            skipped={brandAssets.skipped}
          />
        </div>
      </details>

      <details open className="border border-gray-700 rounded-lg overflow-hidden">
        <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">
            Reference Images (layout)
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {referenceImages.selected.length}/{MAX_REFERENCE_IMAGES} sent
            {referenceImages.skipped.length > 0
              ? ` · ${referenceImages.skipped.length} over cap`
              : ''}
          </span>
        </summary>
        <div className="p-3">
          <ReferenceList
            kind="reference"
            cap={MAX_REFERENCE_IMAGES}
            selected={referenceImages.selected}
            skipped={referenceImages.skipped}
          />
        </div>
      </details>

      <details open className="border border-gray-700 rounded-lg overflow-hidden">
        <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">
            Section Breakdown
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {perSection.filter((s) => s.fragment !== null).length}/{perSection.length} contributed
          </span>
        </summary>
        <div className="p-3 space-y-2">
          {perSection.map(({ id, fragment }) => (
            <div key={id}>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    fragment !== null ? 'bg-green-400' : 'bg-gray-600'
                  }`}
                />
                <span className="text-xs font-mono text-gray-400">{id}</span>
                {fragment === null && (
                  <span className="text-xs text-gray-600">skipped</span>
                )}
              </div>
              {fragment !== null && (
                <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-words">
                  {fragment}
                </div>
              )}
            </div>
          ))}
        </div>
      </details>

      <details className="border border-indigo-900/50 rounded-lg overflow-hidden">
        <summary className="bg-indigo-900/20 px-3 py-1.5 border-b border-indigo-900/50 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-indigo-400 uppercase tracking-wide inline">
            Overlay Prompt
          </h3>
          <span className="ml-2 text-xs text-gray-500">
            {overlayPrompt.split(/\s+/).filter(Boolean).length} words · {overlayPrompt.length} chars
          </span>
        </summary>
        <div className="p-3 space-y-2">
          <div className="text-xs text-gray-500 mb-1">
            Preview of the system prompt sent with the thumbnail on <span className="text-indigo-300">Generate AI Overlays</span>.
            Dimensions shown as 1024x1024 placeholder — actual dimensions come from the selected thumbnail at runtime.
          </div>
          <div className="text-xs text-gray-200 bg-gray-800 rounded px-2 py-1.5 font-mono whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
            {overlayPrompt}
          </div>
          <details className="border border-gray-700/50 rounded overflow-hidden mt-2">
            <summary className="bg-gray-800/30 px-2 py-1 cursor-pointer select-none">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                OverlayPromptContext (input)
              </span>
            </summary>
            <div className="p-2">
              <div className="text-xs text-gray-400 bg-gray-800 rounded px-2 py-1.5 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
                {JSON.stringify(overlayCtx, null, 2)}
              </div>
            </div>
          </details>
        </div>
      </details>

      <details className="border border-gray-700 rounded-lg overflow-hidden">
        <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">
            PromptContext (input)
          </h3>
        </summary>
        <div className="p-3">
          <div className="text-xs text-gray-400 bg-gray-800 rounded px-2 py-1.5 font-mono max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
            {JSON.stringify(ctx, null, 2)}
          </div>
        </div>
      </details>
    </div>
  );
}

function ReferenceList({
  kind,
  cap,
  selected,
  skipped,
}: {
  kind: 'brand' | 'reference';
  cap: number;
  selected: StoredAsset[];
  skipped: StoredAsset[];
}) {
  if (selected.length === 0 && skipped.length === 0) {
    const emptyCopy =
      kind === 'brand'
        ? 'No brand assets — identity ingredients (logo, character, mood) will be absent from the request.'
        : 'No reference images — the model will compose the layout freely.';
    return <div className="text-xs text-gray-500">{emptyCopy}</div>;
  }

  const totalBytes = selected.reduce((sum, a) => sum + a.bytes, 0);

  return (
    <div className="space-y-2">
      {selected.map((asset, i) => (
        <ReferenceRow key={asset.id} asset={asset} index={i} included kind={kind} />
      ))}
      {skipped.length > 0 && (
        <div className="pt-2 border-t border-gray-700/50">
          <div className="text-xs text-gray-500 mb-1">
            Skipped (over {cap}-image cap):
          </div>
          {skipped.map((asset, i) => (
            <ReferenceRow
              key={asset.id}
              asset={asset}
              index={cap + i}
              included={false}
              kind={kind}
            />
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="text-xs text-gray-500 pt-1">
          Total source bytes: {formatBytes(totalBytes)} (inline base64 inflates
          ~33% on the wire)
        </div>
      )}
    </div>
  );
}

function ReferenceRow({
  asset,
  index,
  included,
  kind,
}: {
  asset: StoredAsset;
  index: number;
  included: boolean;
  kind: 'brand' | 'reference';
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let url: string | null = null;
    binaryStore.get(asset.binaryRef).then((res) => {
      if (revoked || !res.ok) return;
      const buf = new ArrayBuffer(res.data.bytes.byteLength);
      new Uint8Array(buf).set(res.data.bytes);
      const blob = new Blob([buf], { type: res.data.mimeType });
      url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    });
    return () => {
      revoked = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.binaryRef]);

  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded ${
        included ? 'bg-gray-800/60' : 'bg-gray-800/20 opacity-60'
      }`}
    >
      <span className="text-xs font-mono text-gray-500 w-4 text-right shrink-0">
        {index}
      </span>
      <div className="w-10 h-10 rounded border border-gray-700 bg-gray-900 shrink-0 overflow-hidden flex items-center justify-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={asset.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[10px] text-gray-600">…</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-300 truncate">{asset.name}</div>
        <div className="text-xs text-gray-500 truncate">
          <span
            className={`inline-block px-1 rounded text-[10px] mr-1 ${
              included ? 'bg-green-900/40 text-green-400' : 'bg-gray-700/40 text-gray-500'
            }`}
          >
            {kind === 'brand' ? (asset.role ?? 'other') : 'layout'}
          </span>
          {asset.mimeType} · {formatBytes(asset.bytes)} · {asset.source}
        </div>
      </div>
    </div>
  );
}
