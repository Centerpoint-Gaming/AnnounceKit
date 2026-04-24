import type { SerializedPageContext } from '../../content/scraper';
import type { GameProfile, StoreMetadata, CacheEntry } from '@announcekit/core';

interface DebugViewProps {
  context: SerializedPageContext;
  profile?: GameProfile;
  storeMetadata?: StoreMetadata;
  cacheEntry?: CacheEntry<GameProfile>;
}

function StatusBadge({ value, label }: { value: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
        value
          ? 'bg-green-900/50 text-green-400 border border-green-800'
          : 'bg-gray-800 text-gray-500 border border-gray-700'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${value ? 'bg-green-400' : 'bg-gray-600'}`} />
      {label}
    </span>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="border border-gray-700 rounded-lg overflow-hidden">
      <summary className="bg-gray-800/50 px-3 py-1.5 border-b border-gray-700 cursor-pointer select-none">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide inline">{title}</h3>
      </summary>
      <div className="p-3 space-y-2">{children}</div>
    </details>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-2">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs text-gray-300 text-right break-all">{value ?? '—'}</span>
    </div>
  );
}

function ColorSwatch({ color, label }: { color: string; label?: string }) {
  return (
    <div className="text-center">
      <div
        className="w-10 h-10 rounded-lg border border-gray-700"
        style={{ backgroundColor: color }}
        title={`${label ? label + ': ' : ''}${color}`}
      />
      <span className="text-xs text-gray-500 mt-1 block">{label || color}</span>
    </div>
  );
}

function TagList({ tags, label }: { tags: string[]; label: string }) {
  if (tags.length === 0) return null;
  return (
    <div>
      <span className="text-xs text-gray-500 block mb-1">{label}</span>
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <span key={tag} className="text-xs px-1.5 py-0.5 bg-gray-800 rounded text-gray-400">
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DebugView({ context, profile, storeMetadata, cacheEntry }: DebugViewProps) {
  const staleness = Date.now() - context.detectedAt;
  const stalenessLabel =
    staleness < 5000
      ? 'fresh'
      : staleness < 30000
        ? `${Math.round(staleness / 1000)}s ago`
        : 'stale';

  return (
    <div className="space-y-3">
      {/* Header badges */}
      <div className="flex flex-wrap gap-1.5">
        <StatusBadge value={context.isAnnouncementEditor} label="Editor" />
        <StatusBadge value={!!context.appId} label="App ID" />
        <StatusBadge value={context.editorState.hasTitleField} label="Title Field" />
        <StatusBadge value={context.editorState.hasSubtitleField} label="Subtitle" />
        <StatusBadge value={context.editorState.hasBodyField} label="Body Field" />
        <StatusBadge value={!!context.event} label="Event Data" />
        <StatusBadge value={!!context.communityConfig} label="Community Config" />
        <StatusBadge value={!!profile} label="Game Profile" />
        <StatusBadge value={!!storeMetadata} label="Store Metadata" />
        <StatusBadge value={!!cacheEntry} label="Cache Entry" />
      </div>

      {/* Page Detection */}
      <Section title="Page Detection">
        <Field label="Page Variant" value={context.pageVariant} />
        <Field label="App ID" value={context.appId} />
        <Field label="Event GID" value={context.eventGid} />
        <Field label="Is Editor" value={context.isAnnouncementEditor ? 'Yes' : 'No'} />
        <Field
          label="Detected"
          value={
            <span className={staleness > 30000 ? 'text-yellow-400' : ''}>
              {stalenessLabel}
            </span>
          }
        />
      </Section>

      {/* Cache Entry */}
      {cacheEntry && (
        <Section title="Cache Entry">
          <Field label="Schema Version" value={cacheEntry.schemaVersion} />
          <Field label="Cached At" value={new Date(cacheEntry.cachedAt).toLocaleString()} />
          <Field label="Expires At" value={cacheEntry.expiresAt ? new Date(cacheEntry.expiresAt).toLocaleString() : 'never'} />
          <Field label="Source" value={cacheEntry.source} />
          <Field label="Age" value={
            (() => {
              const mins = Math.floor((Date.now() - cacheEntry.cachedAt) / 60000);
              if (mins < 1) return 'less than a minute';
              if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
              const days = Math.floor(hrs / 24);
              return `${days} day${days === 1 ? '' : 's'}`;
            })()
          } />
        </Section>
      )}

      {/* Editor State */}
      <Section title="Editor State">
        <Field label="Title Field Found" value={context.editorState.hasTitleField ? 'Yes' : 'No'} />
        <Field label="Subtitle Field Found" value={context.editorState.hasSubtitleField ? 'Yes' : 'No'} />
        <Field label="Body Field Found" value={context.editorState.hasBodyField ? 'Yes' : 'No'} />
        <div>
          <span className="text-xs text-gray-500 block mb-1">Title</span>
          <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1.5 font-mono break-all max-h-16 overflow-y-auto">
            {context.editorState.existingTitle || '(empty)'}
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 block mb-1">Subtitle</span>
          <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1.5 font-mono break-all max-h-16 overflow-y-auto">
            {context.editorState.existingSubtitle || '(empty)'}
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-500 block mb-1">Body</span>
          <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1.5 font-mono break-all max-h-32 overflow-y-auto whitespace-pre-wrap">
            {context.editorState.existingBody
              ? context.editorState.existingBody.slice(0, 500) +
                (context.editorState.existingBody.length > 500 ? '\n…' : '')
              : '(empty)'}
          </div>
        </div>
      </Section>

      {/* Store Metadata */}
      {storeMetadata && (
        <Section title="Store Metadata (fetchStoreMetadata)">
          <Field label="Name" value={storeMetadata.name} />
          <Field label="App ID" value={storeMetadata.appId} />
          <Field label="Developer" value={storeMetadata.developer} />
          <Field label="Publisher" value={storeMetadata.publisher} />
          <Field label="Release Date" value={storeMetadata.releaseDate} />
          <Field label="Release Status" value={storeMetadata.releaseStatus} />
          <Field label="Source" value={
            <span className={storeMetadata.source === 'mixed' ? 'text-blue-400' : ''}>
              {storeMetadata.source}
            </span>
          } />
          <Field label="Fetched At" value={new Date(storeMetadata.fetchedAt).toLocaleString()} />
          <div>
            <span className="text-xs text-gray-500 block mb-1">Description</span>
            <div className="text-xs text-gray-300 bg-gray-800 rounded px-2 py-1.5 font-mono break-all max-h-20 overflow-y-auto">
              {storeMetadata.shortDescription || '(empty)'}
            </div>
          </div>
          <TagList tags={storeMetadata.tags} label={`User Tags (${storeMetadata.tags.length})`} />
          <TagList tags={storeMetadata.genres} label="Genres" />
          <TagList tags={storeMetadata.categories} label="Categories" />
          <div>
            <span className="text-xs text-gray-500 block mb-1">Assets</span>
            <div className="space-y-1">
              <Field label="Capsule" value={storeMetadata.assets.capsule ? 'Yes' : 'No'} />
              <Field label="Header" value={storeMetadata.assets.header ? 'Yes' : 'No'} />
              <Field label="Library Hero" value={storeMetadata.assets.library ? 'Yes' : 'No'} />
              <Field label="Background" value={storeMetadata.assets.background ? 'Yes' : 'No'} />
              <Field label="Screenshots" value={`${storeMetadata.assets.screenshots.length}`} />
            </div>
          </div>
        </Section>
      )}

      {/* Game Profile + Palette */}
      {profile && (
        <Section title="Game Profile (stored)">
          <Field label="App ID" value={profile.appId} />
          <Field label="Name" value={profile.name} />
          <Field label="Created" value={new Date(profile.createdAt).toLocaleString()} />
          <Field label="Last Used" value={new Date(profile.lastUsedAt).toLocaleString()} />
          <TagList tags={profile.tags} label={`Tags (${profile.tags.length})`} />

          {/* Palette */}
          {profile.palette && (
            <div>
              <span className="text-xs text-gray-500 block mb-1">
                Palette — {profile.palette.vibrancy} / {profile.palette.luminance}
                {profile.palette.lowConfidence && (
                  <span className="text-yellow-400 ml-1">(low confidence)</span>
                )}
              </span>
              <div className="flex gap-2 mb-2">
                <ColorSwatch color={profile.palette.primary} label="primary" />
                <ColorSwatch color={profile.palette.secondary} label="secondary" />
                <ColorSwatch color={profile.palette.accent} label="accent" />
                <ColorSwatch color={profile.palette.neutral} label="neutral" />
              </div>
              {profile.palette.full.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {profile.palette.full.map((color, i) => (
                    <div
                      key={`${color}-${i}`}
                      className="w-6 h-6 rounded border border-gray-700"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Brand assets */}
          <div>
            <span className="text-xs text-gray-500 block mb-1">Brand Assets</span>
            <Field label="Logos" value={profile.brand.logos.length} />
            <Field label="Custom Colors" value={profile.brand.colors.length} />
            <Field label="Example Thumbnails" value={profile.brand.exampleThumbnails.length} />
          </div>

          {/* Store assets */}
          <div>
            <span className="text-xs text-gray-500 block mb-1">Store Assets</span>
            <Field label="Header Capsule" value={profile.storeAssets.headerCapsule ? 'Yes' : 'No'} />
            <Field label="Hero Image" value={profile.storeAssets.heroImage ? 'Yes' : 'No'} />
            <Field label="Logo" value={profile.storeAssets.logo ? 'Yes' : 'No'} />
            <Field label="Screenshots" value={profile.storeAssets.screenshots.length} />
          </div>
        </Section>
      )}

      {/* Event Data */}
      {context.event && (
        <Section title="Event Data" defaultOpen={false}>
          <Field label="Event Name" value={context.event.eventName} />
          <Field label="Event Type" value={context.event.eventType} />
          <Field label="Event GID" value={context.event.gid} />
          {context.event.announcementBody && (
            <>
              <Field label="Headline" value={context.event.announcementBody.headline} />
              <Field
                label="Post Time"
                value={new Date(context.event.announcementBody.posttime * 1000).toLocaleString()}
              />
              <Field
                label="Update Time"
                value={new Date(context.event.announcementBody.updatetime * 1000).toLocaleString()}
              />
            </>
          )}
          {context.event.jsonData?.localizedCapsuleImage?.[0] && (
            <Field label="Capsule Image" value={context.event.jsonData.localizedCapsuleImage[0]} />
          )}
          {context.event.jsonData?.localizedTitleImage?.[0] && (
            <Field label="Title Image" value={context.event.jsonData.localizedTitleImage[0]} />
          )}
        </Section>
      )}

      {/* Community Config */}
      {context.communityConfig && (
        <Section title="Community Config" defaultOpen={false}>
          <Field label="App ID" value={context.communityConfig.appId} />
          <Field label="Clan Account ID" value={context.communityConfig.clanAccountId} />
          <Field label="Clan Steam ID" value={context.communityConfig.clanSteamId} />
          <Field label="Is OGG" value={context.communityConfig.isOgg ? 'Yes' : 'No'} />
          <Field
            label="Can Upload Images"
            value={context.communityConfig.canUploadImages ? 'Yes' : 'No'}
          />
        </Section>
      )}

      {/* Raw JSON */}
      <Section title="Raw JSON" defaultOpen={false}>
        <div className="text-xs text-gray-400 bg-gray-800 rounded px-2 py-1.5 font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all">
          {JSON.stringify({ pageContext: context, storeMetadata, gameProfile: profile, cacheEntry: cacheEntry ? { schemaVersion: cacheEntry.schemaVersion, cachedAt: cacheEntry.cachedAt, expiresAt: cacheEntry.expiresAt, source: cacheEntry.source } : null }, null, 2)}
        </div>
      </Section>
    </div>
  );
}
