import type { GeneratedThumbnail, ThumbnailGenError, Result } from '@announcekit/core';

export type ThumbnailState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'error'; error: ThumbnailGenError }
  | { status: 'ready'; thumbnail: GeneratedThumbnail };

interface ActionBarProps {
  isEditor: boolean;
  announcementTitle?: string;
  thumbnailState: ThumbnailState;
  userPrompt: string;
  onUserPromptChange: (value: string) => void;
  onGenerate: () => void;
  onNext?: () => void;
}

export function ActionBar({
  isEditor,
  announcementTitle,
  thumbnailState,
  userPrompt,
  onUserPromptChange,
  onGenerate,
  onNext,
}: ActionBarProps) {
  const generating = thumbnailState.status === 'generating';
  const disabled = !isEditor || generating;

  return (
    <div className="mb-4">
      <textarea
        value={userPrompt}
        onChange={(e) => onUserPromptChange(e.target.value)}
        placeholder="Additional context for the model (optional) — e.g. 'cozy fall vibe', 'lean into the cyberpunk neon'"
        rows={2}
        disabled={generating}
        className="w-full mb-2 bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-60"
      />
      <button
        disabled={disabled}
        onClick={onGenerate}
        className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
          disabled
            ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
        }`}
        title={
          isEditor
            ? 'Generate a thumbnail for this announcement'
            : 'Navigate to a Steam announcement editor to generate thumbnails'
        }
      >
        {generating ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
            Generating...
          </span>
        ) : (
          'Generate Thumbnail'
        )}
      </button>

      {!isEditor && (
        <p className="text-xs text-gray-600 text-center mt-1.5">
          Open an announcement editor to enable
        </p>
      )}

      {isEditor && announcementTitle && thumbnailState.status === 'idle' && (
        <p className="text-xs text-gray-500 text-center mt-1.5 truncate">
          for "{announcementTitle}"
        </p>
      )}

      {thumbnailState.status === 'ready' && (
        <div className="mt-3">
          <img
            src={thumbnailState.thumbnail.dataUrl}
            alt="Generated thumbnail"
            className="w-full rounded-lg border border-gray-700"
          />
          <p className="text-[10px] text-gray-600 mt-1">
            {thumbnailState.thumbnail.model} ·{' '}
            {new Date(thumbnailState.thumbnail.generatedAt).toLocaleTimeString()}
          </p>
          {onNext && (
            <button
              onClick={onNext}
              className="w-full mt-2 py-2 px-4 rounded-lg font-medium text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-colors flex items-center justify-center gap-2"
            >
              Next: Add Text
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3l5 5-5 5" />
              </svg>
            </button>
          )}
        </div>
      )}

      {thumbnailState.status === 'error' && (
        <div className="mt-3 bg-red-900/30 border border-red-800 rounded-lg p-2.5">
          <p className="text-xs font-semibold text-red-300 uppercase tracking-wide">
            {thumbnailState.error.reason}
          </p>
          <p className="text-xs text-red-200 mt-0.5 break-words">
            {thumbnailState.error.message}
          </p>
          {thumbnailState.error.reason === 'missing-api-key' && (
            <p className="text-[10px] text-gray-400 mt-1.5">
              Add <code className="text-gray-300">VITE_GEMINI_API_KEY</code> to
              your <code className="text-gray-300">.env</code> file at the repo
              root, then rebuild the extension.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Re-exported so App.tsx can type the `sendMessage` reply without duplication.
export type GenerateThumbnailResult = Result<GeneratedThumbnail, ThumbnailGenError>;
