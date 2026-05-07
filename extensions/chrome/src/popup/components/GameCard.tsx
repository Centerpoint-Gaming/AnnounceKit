import { useState } from 'react';
import type { GameProfile } from '@announcekit/core';
import { AssetGallery } from './AssetGallery';

interface GameCardProps {
  profile: GameProfile;
}

const COLLAPSED_TAGS = 3;

export function GameCard({ profile }: GameCardProps) {
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const totalTags = profile.tags.length;
  const visibleTags = tagsExpanded ? profile.tags : profile.tags.slice(0, COLLAPSED_TAGS);
  const hiddenCount = totalTags - visibleTags.length;
  const hasOverflow = totalTags > COLLAPSED_TAGS;

  return (
    <div className="space-y-4">
      {/* Header with capsule image */}
      <div className="relative">
        <img
          src={profile.storeAssets.headerCapsule}
          alt={profile.name}
          className="w-full rounded-lg"
        />
      </div>

      {/* Game info */}
      <div>
        <h2 className="text-xl font-bold">{profile.name}</h2>
        <p className="text-sm text-gray-400 mt-1">{profile.shortDescription}</p>
      </div>

      {/* Tags */}
      {totalTags > 0 && (
        <div>
          <button
            type="button"
            onClick={() => hasOverflow && setTagsExpanded((v) => !v)}
            disabled={!hasOverflow}
            className={`w-full flex items-center justify-between mb-2 ${
              hasOverflow ? 'cursor-pointer' : 'cursor-default'
            }`}
            aria-expanded={tagsExpanded}
          >
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Tags <span className="text-gray-600 normal-case">({totalTags})</span>
            </h3>
            {hasOverflow && (
              <span className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                {tagsExpanded ? 'Collapse' : 'Expand'}
                <svg
                  className={`inline-block w-3 h-3 ml-1 transition-transform ${
                    tagsExpanded ? 'rotate-180' : ''
                  }`}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M3 5l3 3 3-3" />
                </svg>
              </span>
            )}
          </button>
          <div className="flex flex-wrap gap-1.5">
            {visibleTags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-300"
              >
                {tag}
              </span>
            ))}
            {!tagsExpanded && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setTagsExpanded(true)}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded-full text-gray-400 hover:text-white transition-colors"
                title={`Show ${hiddenCount} more tag${hiddenCount === 1 ? '' : 's'}`}
              >
                +{hiddenCount}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Color palette */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Color Palette
          </h3>
          <div className="flex gap-1.5 text-[10px] text-gray-500 uppercase tracking-wide">
            <span className="px-1.5 py-0.5 bg-gray-800 rounded">{profile.palette.vibrancy}</span>
            <span className="px-1.5 py-0.5 bg-gray-800 rounded">{profile.palette.luminance}</span>
            {profile.palette.lowConfidence && (
              <span className="px-1.5 py-0.5 bg-amber-900/60 text-amber-300 rounded">low-res</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-3">
          {(
            [
              ['Primary', profile.palette.primary],
              ['Secondary', profile.palette.secondary],
              ['Accent', profile.palette.accent],
              ['Neutral', profile.palette.neutral],
            ] as const
          ).map(([label, color]) => (
            <div key={label} className="text-center">
              <div
                className="w-full h-12 rounded-lg border border-gray-700"
                style={{ backgroundColor: color }}
                title={color}
              />
              <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">{label}</div>
              <div className="text-[10px] text-gray-600 font-mono">{color}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-1">
          {profile.palette.full.map((color, i) => (
            <div
              key={`${color}-${i}`}
              className="flex-1 h-6 rounded border border-gray-700"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Store assets gallery */}
      <AssetGallery
        screenshots={profile.storeAssets.screenshots}
        headerCapsule={profile.storeAssets.headerCapsule}
        heroImage={profile.storeAssets.heroImage}
        logo={profile.storeAssets.logo}
      />

      {/* App ID footer */}
      <div className="text-xs text-gray-600 pt-2 border-t border-gray-800">
        App ID: {profile.appId}
      </div>
    </div>
  );
}
