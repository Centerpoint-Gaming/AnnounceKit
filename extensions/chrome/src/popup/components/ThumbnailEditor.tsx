import { useRef, useState } from 'react';
import type {
  EditReference,
  EditReferenceRole,
  ThumbnailEditError,
} from '@announcekit/core';

export interface ChainNode {
  dataUrl: string;
  mimeType: string;
  model: string;
  generatedAt: number;
  /** null for the original generation; set for edits. */
  instruction: string | null;
}

export type EditingState =
  | { status: 'idle' }
  | { status: 'applying' }
  | { status: 'error'; error: ThumbnailEditError };

interface AttachedRef extends EditReference {
  /** UI-only key for React list rendering. */
  uid: string;
  /** Original filename for display. */
  fileName: string;
}

interface ThumbnailEditorProps {
  chain: readonly ChainNode[];
  currentIndex: number;
  editingState: EditingState;
  onApply: (instruction: string, references: readonly EditReference[]) => void;
  onPickVersion: (index: number) => void;
}

const ROLE_LABELS: Record<EditReferenceRole, string> = {
  pose: 'Pose',
  item: 'Item',
  character: 'Character',
  environment: 'Environment',
  style: 'Style',
  other: 'Other',
};

export function ThumbnailEditor({
  chain,
  currentIndex,
  editingState,
  onApply,
  onPickVersion,
}: ThumbnailEditorProps) {
  const [instruction, setInstruction] = useState('');
  const [refs, setRefs] = useState<AttachedRef[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applying = editingState.status === 'applying';
  const canApply = !applying && instruction.trim().length > 0;

  function handleApply() {
    if (!canApply) return;
    const payload: EditReference[] = refs.map(({ uid: _uid, fileName: _fn, ...rest }) => rest);
    onApply(instruction.trim(), payload);
    // Reset on submit so the textarea is ready for the next turn (chat-like).
    setInstruction('');
    setRefs([]);
  }

  async function handleFilePicked(file: File) {
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const data = btoa(binary);
    setRefs((prev) => [
      ...prev,
      {
        uid: crypto.randomUUID(),
        fileName: file.name,
        data,
        mimeType: file.type || 'image/png',
        role: 'pose',
      },
    ]);
  }

  function updateRef(uid: string, patch: Partial<EditReference>) {
    setRefs((prev) => prev.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function removeRef(uid: string) {
    setRefs((prev) => prev.filter((r) => r.uid !== uid));
  }

  return (
    <div className="mt-4 bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Edit / refine
        </h3>
        {chain.length > 1 && (
          <span className="text-[10px] text-gray-500">
            v{currentIndex + 1} of {chain.length}
          </span>
        )}
      </div>

      {/* Reference attachments */}
      {refs.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {refs.map((ref) => (
            <div
              key={ref.uid}
              className="flex items-center gap-2 bg-gray-800 rounded px-2 py-1.5"
            >
              <img
                src={`data:${ref.mimeType};base64,${ref.data}`}
                alt={ref.fileName}
                className="w-8 h-8 rounded object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 truncate" title={ref.fileName}>
                  {ref.fileName}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <select
                    value={ref.role}
                    onChange={(e) =>
                      updateRef(ref.uid, {
                        role: e.target.value as EditReferenceRole,
                      })
                    }
                    className="text-[10px] bg-gray-900 border border-gray-700 rounded px-1 py-0.5 text-gray-200"
                  >
                    {(Object.keys(ROLE_LABELS) as EditReferenceRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={ref.note ?? ''}
                    onChange={(e) => updateRef(ref.uid, { note: e.target.value })}
                    placeholder="note (optional)"
                    className="flex-1 text-[10px] bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 min-w-0"
                  />
                </div>
              </div>
              <button
                onClick={() => removeRef(ref.uid)}
                className="text-gray-500 hover:text-red-400 text-xs px-1"
                title="Remove reference"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Instruction textarea */}
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Describe your edit — e.g. 'make the character bigger', 'warmer lighting', 'remove the corner watermark'"
        rows={2}
        disabled={applying}
        className="w-full bg-gray-950 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-60"
      />

      {/* Action row */}
      <div className="flex items-center gap-2 mt-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFilePicked(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={applying}
          className="text-[11px] px-2 py-1.5 rounded border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          title="Attach a reference image (pose, item, style, etc.)"
        >
          + Reference
        </button>
        <button
          onClick={handleApply}
          disabled={!canApply}
          className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-xs transition-colors ${
            canApply
              ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          {applying ? (
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
              Applying...
            </span>
          ) : (
            'Apply edit'
          )}
        </button>
      </div>

      {/* Error display */}
      {editingState.status === 'error' && (
        <div className="mt-2 bg-red-900/30 border border-red-800 rounded-lg p-2">
          <p className="text-[10px] font-semibold text-red-300 uppercase tracking-wide">
            {editingState.error.reason}
          </p>
          <p className="text-[10px] text-red-200 mt-0.5 break-words">
            {editingState.error.message}
          </p>
        </div>
      )}

      {/* Version strip — chat-like history of compounding edits */}
      {chain.length > 1 && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-[10px] text-gray-500 mb-1.5 uppercase tracking-wide">
            History
          </p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {chain.map((node, idx) => (
              <button
                key={node.generatedAt}
                onClick={() => onPickVersion(idx)}
                className={`relative flex-shrink-0 rounded border-2 transition-colors ${
                  idx === currentIndex
                    ? 'border-blue-500'
                    : 'border-gray-700 hover:border-gray-500'
                }`}
                title={
                  node.instruction
                    ? `Edit: ${node.instruction}`
                    : 'Original generation'
                }
              >
                <img
                  src={node.dataUrl}
                  alt={`v${idx + 1}`}
                  className="w-12 h-12 rounded object-cover"
                />
                <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] px-1 rounded-tl">
                  v{idx + 1}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
