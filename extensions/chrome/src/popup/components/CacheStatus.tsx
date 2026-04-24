interface CacheStatusProps {
  cachedAt: number;
  source: string;
  refreshing: boolean;
  onRefresh: () => void;
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

export function CacheStatus({ cachedAt, source, refreshing, onRefresh }: CacheStatusProps) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 bg-gray-800/50 rounded-lg mb-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span>Updated {formatRelativeTime(cachedAt)}</span>
        {source !== 'unknown' && (
          <span className="text-gray-600">via {source}</span>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="text-gray-500 hover:text-white transition-colors disabled:opacity-50"
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
    </div>
  );
}
