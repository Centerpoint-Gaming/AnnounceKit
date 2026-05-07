import { useCallback, useEffect, useRef, useState } from 'react';
import { domToPng } from 'modern-screenshot';
import type { OverlayVariant } from '@announcekit/core';

interface OverlayPickerProps {
  variants: OverlayVariant[];
  imageDataUrl: string;
  gameName: string;
}

interface ImageDims {
  width: number;
  height: number;
}

const POPUP_CONTENT_W = 368;
const GRID_CELL_W = 176;

export function OverlayPicker({
  variants,
  imageDataUrl,
  gameName,
}: OverlayPickerProps) {
  const [selectedId, setSelectedId] = useState<string>(variants[0]?.id ?? '');
  const [imageDims, setImageDims] = useState<ImageDims | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageDims({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const previewScale = imageDims ? POPUP_CONTENT_W / imageDims.width : 1;
  const gridScale = imageDims ? GRID_CELL_W / imageDims.width : 1;

  const handleExport = useCallback(async () => {
    const node = previewRef.current;
    if (!node || !imageDims || exporting) return;

    setExporting(true);
    try {
      const dataUrl = await domToPng(node, {
        width: imageDims.width,
        height: imageDims.height,
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
      });
      setExportUrl(dataUrl);
    } finally {
      setExporting(false);
    }
  }, [exporting, imageDims]);

  const handleDownload = useCallback(() => {
    if (!exportUrl) return;
    const a = document.createElement('a');
    a.href = exportUrl;
    a.download = `${gameName.replace(/[^a-z0-9]/gi, '_')}_overlay.png`;
    a.click();
  }, [exportUrl, gameName]);

  if (!imageDims) {
    return <div className="text-xs text-gray-500 text-center py-8">Loading image...</div>;
  }

  const aspectRatio = imageDims.height / imageDims.width;

  return (
    <div>
      {/* Selected variant — large preview */}
      {selected && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-300">{selected.name}</span>
            <span className="text-[10px] text-gray-500">
              {imageDims.width} x {imageDims.height}
            </span>
          </div>
          {selected.rationale && (
            <p className="text-[10px] text-gray-500 mb-1.5">{selected.rationale}</p>
          )}
          <div
            className="rounded-lg border border-gray-700 overflow-hidden"
            style={{ width: POPUP_CONTENT_W, height: POPUP_CONTENT_W * aspectRatio }}
          >
            <div
              ref={previewRef}
              style={{
                width: imageDims.width,
                height: imageDims.height,
                position: 'relative',
                overflow: 'hidden',
                transformOrigin: 'top left',
                transform: `scale(${previewScale})`,
              }}
            >
              <img
                src={imageDataUrl}
                alt=""
                draggable={false}
                style={{ width: imageDims.width, height: imageDims.height, display: 'block' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                }}
                dangerouslySetInnerHTML={{ __html: selected.html }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Variant grid */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 mb-1.5">
          {variants.length} variant{variants.length !== 1 ? 's' : ''}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {variants.map((variant) => (
            <button
              key={variant.id}
              onClick={() => {
                setSelectedId(variant.id);
                setExportUrl(null);
              }}
              className={`rounded-lg border overflow-hidden transition-colors ${
                selectedId === variant.id
                  ? 'border-blue-500 ring-1 ring-blue-500/50'
                  : 'border-gray-700 hover:border-gray-500'
              }`}
            >
              <div
                style={{
                  width: GRID_CELL_W,
                  height: GRID_CELL_W * aspectRatio,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: imageDims.width,
                    height: imageDims.height,
                    position: 'relative',
                    overflow: 'hidden',
                    transformOrigin: 'top left',
                    transform: `scale(${gridScale})`,
                  }}
                >
                  <img
                    src={imageDataUrl}
                    alt=""
                    draggable={false}
                    style={{ width: imageDims.width, height: imageDims.height, display: 'block' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                    }}
                    dangerouslySetInnerHTML={{ __html: variant.html }}
                  />
                </div>
              </div>
              <div className="px-2 py-1 bg-gray-800/80">
                <div className="text-[10px] text-gray-300 truncate">{variant.name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Export / download */}
      <div className="flex gap-2">
        <button
          onClick={handleExport}
          disabled={exporting || !selected}
          className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition-colors ${
            exporting
              ? 'bg-gray-700 text-gray-400 cursor-wait'
              : 'bg-green-700 hover:bg-green-600 text-white'
          }`}
        >
          {exporting ? 'Rendering...' : 'Render to PNG'}
        </button>
        {exportUrl && (
          <button
            onClick={handleDownload}
            className="flex-1 py-2 px-3 rounded-lg font-medium text-sm bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            Download
          </button>
        )}
      </div>

      {exportUrl && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Rendered output:</p>
          <img
            src={exportUrl}
            alt="Rendered overlay"
            className="w-full rounded-lg border border-gray-700"
          />
        </div>
      )}
    </div>
  );
}
