import type { AssetRole, GameBrand } from '@announcekit/core';
import { ASSET_ROLES, getAssetRole } from '@announcekit/core';

interface BrandAssetsCardProps {
  brand: GameBrand;
  onView: () => void;
}

const ROLE_LABEL: Record<AssetRole, string> = {
  logo: 'Logo',
  character: 'Character',
  environment: 'Environment',
  mood: 'Mood',
  other: 'Other',
};

export function BrandAssetsCard({ brand, onView }: BrandAssetsCardProps) {
  const total = brand.brandAssets.length;
  const byRole = ASSET_ROLES.map((role) => ({
    role,
    count: brand.brandAssets.filter((a) => getAssetRole(a) === role).length,
  })).filter((x) => x.count > 0);

  return (
    <button
      onClick={onView}
      className="w-full bg-gray-800/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 mb-3 text-left transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold">Brand Assets</h2>
          <span className="text-xs text-gray-500 shrink-0">
            {total} {total === 1 ? 'asset' : 'assets'}
          </span>
        </div>
        <span className="text-xs text-blue-400 shrink-0">Manage &rarr;</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-gray-500 mt-2">
          Upload images or promote from Steam to seed the prompt builder.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {byRole.map(({ role, count }) => (
            <span
              key={role}
              className="text-[10px] bg-gray-900/60 text-gray-400 rounded px-1.5 py-0.5"
            >
              {ROLE_LABEL[role]}: {count}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
