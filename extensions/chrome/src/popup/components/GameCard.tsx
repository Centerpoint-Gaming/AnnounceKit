import type { GameProfile } from '@announcekit/core';
import { AssetGallery } from './AssetGallery';

interface GameCardProps {
  profile: GameProfile;
}

export function GameCard({ profile }: GameCardProps) {
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
      {profile.tags.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {profile.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2 py-1 bg-gray-800 rounded-full text-gray-300"
              >
                {tag}
              </span>
            ))}
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
