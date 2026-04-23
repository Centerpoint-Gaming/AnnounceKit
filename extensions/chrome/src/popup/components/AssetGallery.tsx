interface AssetGalleryProps {
  screenshots: string[];
  headerCapsule: string;
  heroImage: string | null;
  logo: string | null;
}

export function AssetGallery({ screenshots, headerCapsule, heroImage, logo }: AssetGalleryProps) {
  const allAssets = [
    { label: 'Header', url: headerCapsule },
    ...(heroImage ? [{ label: 'Hero', url: heroImage }] : []),
    ...(logo ? [{ label: 'Logo', url: logo }] : []),
    ...screenshots.map((url, i) => ({ label: `Screenshot ${i + 1}`, url })),
  ];

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Store Assets
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {allAssets.map((asset) => (
          <div key={asset.url} className="relative group">
            <img
              src={asset.url}
              alt={asset.label}
              className="w-full rounded border border-gray-700 object-cover aspect-video"
              loading="lazy"
            />
            <span className="absolute bottom-1 left-1 text-xs bg-black/70 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
              {asset.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
