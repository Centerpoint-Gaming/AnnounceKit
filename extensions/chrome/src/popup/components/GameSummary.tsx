import type { GameProfile } from '@announcekit/core';

interface GameSummaryProps {
  profile: GameProfile;
  cachedAt: number;
  source: string;
  refreshing: boolean;
  onRefresh: () => void;
  onViewDetails: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);

  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export function GameSummary({
  profile,
  cachedAt,
  source,
  refreshing,
  onRefresh,
  onViewDetails,
}: GameSummaryProps) {
  const logoUrl = profile.storeAssets.logo || profile.storeAssets.headerCapsule;

  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 mb-3">
      {/* Game identity row */}
      <div className="flex items-center gap-3">
        {logoUrl && (
          <img
            src={logoUrl}
            alt={profile.name}
            className="w-12 h-12 rounded-lg object-cover border border-gray-700 shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold truncate">{profile.name}</h2>
          <p className="text-xs text-gray-500">App {profile.appId}</p>
        </div>
      </div>

      {/* Cache info row */}
      <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-gray-700/50">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span>Updated {formatRelativeTime(cachedAt)}</span>
          {source !== 'unknown' && (
            <span className="text-gray-600 hidden sm:inline">via {source}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-gray-500 hover:text-white transition-colors disabled:opacity-50 p-0.5"
            title="Refresh game data"
          >
            {refreshing ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2.5 8a5.5 5.5 0 0 1 9.3-4M13.5 8a5.5 5.5 0 0 1-9.3 4" />
                <path d="M12 2v3h-3M4 11v3h3" />
              </svg>
            )}
          </button>

          {/* View details link */}
          <button
            onClick={onViewDetails}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View Details
          </button>
        </div>
      </div>
    </div>
  );
}
