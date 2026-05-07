import { useCallback, useMemo, useState } from 'react';
import type {
  BrandColor,
  BrandColorRole,
  ContextCache,
  GameProfile,
} from '@announcekit/core';
import { BRAND_COLOR_ROLES, cacheKeys } from '@announcekit/core';

interface BrandColorsProps {
  profile: GameProfile;
  cache: ContextCache;
  onProfileChange: (next: GameProfile) => void;
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

const ROLE_LABELS: Record<BrandColorRole, string> = {
  primary: 'Primary',
  accent: 'Accent',
  background: 'Background',
  brand: 'Brand',
  custom: 'Custom',
};

const ROLE_BADGE: Record<BrandColorRole, string> = {
  primary: 'bg-blue-900/70 text-blue-200',
  accent: 'bg-purple-900/70 text-purple-200',
  background: 'bg-emerald-900/70 text-emerald-200',
  brand: 'bg-amber-900/70 text-amber-200',
  custom: 'bg-gray-700 text-gray-200',
};

function normalizeHex(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (!v) return null;
  const withHash = v.startsWith('#') ? v : `#${v}`;
  if (/^#[0-9a-f]{3}$/.test(withHash)) {
    const [, r, g, b] = withHash;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return HEX_RE.test(withHash) ? withHash : null;
}

function dedupHexes(hexes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of hexes) {
    const norm = normalizeHex(c);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

export function BrandColors({ profile, cache, onProfileChange }: BrandColorsProps) {
  const [editingHexIdx, setEditingHexIdx] = useState<number | null>(null);
  const [draftHex, setDraftHex] = useState('');
  const [editingLabelIdx, setEditingLabelIdx] = useState<number | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sourcePool = useMemo(() => {
    const palette = profile.palette;
    const named = [palette.primary, palette.secondary, palette.accent, palette.neutral];
    return dedupHexes([...named, ...palette.full]);
  }, [profile.palette]);

  const curated = profile.brand.colors;
  const curatedHexes = useMemo(
    () => new Set(curated.map((c) => c.hex.toLowerCase())),
    [curated],
  );

  const persist = useCallback(
    async (nextColors: BrandColor[]) => {
      const next: GameProfile = {
        ...profile,
        brand: { ...profile.brand, colors: nextColors },
        lastUsedAt: Date.now(),
      };
      await cache.set(cacheKeys.gameProfile(next.appId), next, {
        source: 'brand-colors',
      });
      onProfileChange(next);
    },
    [profile, cache, onProfileChange],
  );

  const handleAdd = useCallback(
    async (raw: string, role: BrandColorRole = 'accent') => {
      const norm = normalizeHex(raw);
      if (!norm) {
        setError(`Not a valid hex color: ${raw}`);
        return;
      }
      if (curatedHexes.has(norm)) {
        setError(null);
        return;
      }
      setError(null);
      // First-ever add defaults to primary, otherwise the requested role.
      const inferred: BrandColorRole = curated.length === 0 ? 'primary' : role;
      await persist([...curated, { hex: norm, role: inferred }]);
    },
    [curated, curatedHexes, persist],
  );

  const handleRemove = useCallback(
    async (idx: number) => {
      const next = curated.filter((_, i) => i !== idx);
      await persist(next);
    },
    [curated, persist],
  );

  const handleRoleChange = useCallback(
    async (idx: number, role: BrandColorRole) => {
      const next = curated.map((c, i) => (i === idx ? { ...c, role } : c));
      await persist(next);
    },
    [curated, persist],
  );

  const startHexEdit = useCallback((idx: number) => {
    setEditingHexIdx(idx);
    setDraftHex(curated[idx]?.hex ?? '');
    setError(null);
  }, [curated]);

  const commitHexEdit = useCallback(async () => {
    if (editingHexIdx === null) return;
    const norm = normalizeHex(draftHex);
    if (!norm) {
      setError(`Not a valid hex color: ${draftHex}`);
      setEditingHexIdx(null);
      return;
    }
    const next = curated.map((c, i) => (i === editingHexIdx ? { ...c, hex: norm } : c));
    setEditingHexIdx(null);
    // Drop any duplicates the edit may have introduced.
    const seen = new Set<string>();
    const deduped: BrandColor[] = [];
    for (const c of next) {
      const k = c.hex.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(c);
    }
    await persist(deduped);
  }, [editingHexIdx, draftHex, curated, persist]);

  const startLabelEdit = useCallback((idx: number) => {
    setEditingLabelIdx(idx);
    setDraftLabel(curated[idx]?.label ?? '');
  }, [curated]);

  const commitLabelEdit = useCallback(async () => {
    if (editingLabelIdx === null) return;
    const trimmed = draftLabel.trim();
    const next = curated.map((c, i) =>
      i === editingLabelIdx ? { ...c, label: trimmed || undefined } : c,
    );
    setEditingLabelIdx(null);
    await persist(next);
  }, [editingLabelIdx, draftLabel, curated, persist]);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Brand Colors
        </h3>
        <span className="text-xs text-gray-600">
          {curated.length} {curated.length === 1 ? 'color' : 'colors'}
        </span>
      </div>

      <p className="text-[10px] text-gray-600 mb-2">
        Roles drive the prompt: <span className="text-blue-300">primary</span> sets the
        dominant tone, <span className="text-purple-300">accent</span> adds pops,{' '}
        <span className="text-emerald-300">background</span> defines atmosphere,{' '}
        <span className="text-amber-300">brand</span> must reproduce exactly, and{' '}
        <span className="text-gray-300">custom</span> takes a free-form label.
      </p>

      {/* Curated chips */}
      {curated.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {curated.map((color, i) => {
            const isEditingHex = editingHexIdx === i;
            const isEditingLabel = editingLabelIdx === i;
            return (
              <div
                key={`${color.hex}-${i}`}
                className="flex items-center gap-1.5 bg-gray-800 rounded border border-gray-700 px-1.5 py-1"
              >
                <span
                  className="w-5 h-5 rounded border border-gray-600 shrink-0"
                  style={{ backgroundColor: color.hex }}
                />
                {isEditingHex ? (
                  <input
                    type="text"
                    value={draftHex}
                    onChange={(e) => setDraftHex(e.target.value)}
                    onBlur={() => void commitHexEdit()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitHexEdit();
                      if (e.key === 'Escape') setEditingHexIdx(null);
                    }}
                    autoFocus
                    spellCheck={false}
                    className="w-20 bg-gray-900 border border-gray-600 rounded text-[11px] font-mono text-white px-1 py-0.5 focus:outline-none focus:border-blue-500"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startHexEdit(i)}
                    className="text-[11px] font-mono text-gray-300 hover:text-white w-20 text-left"
                    title="Edit hex"
                  >
                    {color.hex}
                  </button>
                )}

                <select
                  value={color.role}
                  onChange={(e) =>
                    void handleRoleChange(i, e.target.value as BrandColorRole)
                  }
                  className={`text-[10px] rounded border-0 px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 ${ROLE_BADGE[color.role]}`}
                  aria-label="Color role"
                >
                  {BRAND_COLOR_ROLES.map((r) => (
                    <option key={r} value={r} className="bg-gray-900 text-gray-200">
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>

                {color.role === 'custom' && (
                  isEditingLabel ? (
                    <input
                      type="text"
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      onBlur={() => void commitLabelEdit()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitLabelEdit();
                        if (e.key === 'Escape') setEditingLabelIdx(null);
                      }}
                      autoFocus
                      placeholder="label e.g. rim light"
                      className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded text-[11px] text-white px-1 py-0.5 focus:outline-none focus:border-blue-500"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startLabelEdit(i)}
                      className="flex-1 min-w-0 text-left text-[11px] truncate text-gray-300 hover:text-white"
                      title="Edit label"
                    >
                      {color.label || <span className="text-gray-600 italic">add label…</span>}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => void handleRemove(i)}
                  className="text-gray-600 hover:text-red-400 leading-none px-1 ml-auto"
                  title="Remove color"
                  aria-label="Remove color"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-gray-600 mb-3 italic">
          No brand colors yet — pick from the Steam palette below or add a custom one.
        </div>
      )}

      {/* Source pool from Steam palette */}
      {sourcePool.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              From Steam palette
            </h4>
            <label className="text-[10px] text-gray-500 hover:text-gray-300 cursor-pointer">
              + Custom
              <input
                type="color"
                className="sr-only"
                // Native color picker fires onChange continuously while the
                // user types into its hex sub-input or scrubs the sliders —
                // committing on every event would spam the palette. Wait
                // until the picker closes (blur) and commit the final value.
                onBlur={(e) => {
                  const v = e.target.value;
                  if (v) void handleAdd(v, 'custom');
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {sourcePool.map((hex) => {
              const added = curatedHexes.has(hex);
              return (
                <button
                  key={hex}
                  type="button"
                  onClick={() => void handleAdd(hex)}
                  disabled={added}
                  title={added ? `${hex} (already added)` : `Add ${hex} as accent`}
                  className={`relative aspect-square rounded border transition-transform ${
                    added
                      ? 'border-green-600 cursor-default'
                      : 'border-gray-700 hover:border-gray-400 hover:scale-105 cursor-pointer'
                  }`}
                  style={{ backgroundColor: hex }}
                >
                  {added && (
                    <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-300 bg-red-900/30 border border-red-800 rounded p-2 break-words">
          {error}
        </p>
      )}
    </div>
  );
}
