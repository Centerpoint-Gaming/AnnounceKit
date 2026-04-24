interface ActionBarProps {
  isEditor: boolean;
  announcementTitle?: string;
}

export function ActionBar({ isEditor, announcementTitle }: ActionBarProps) {
  return (
    <div className="mb-4">
      <button
        disabled={!isEditor}
        className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-colors ${
          isEditor
            ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
        title={
          isEditor
            ? 'Generate a thumbnail for this announcement'
            : 'Navigate to a Steam announcement editor to generate thumbnails'
        }
      >
        Generate Thumbnail
      </button>
      {!isEditor && (
        <p className="text-xs text-gray-600 text-center mt-1.5">
          Open an announcement editor to enable
        </p>
      )}
      {isEditor && announcementTitle && (
        <p className="text-xs text-gray-500 text-center mt-1.5 truncate">
          for "{announcementTitle}"
        </p>
      )}
    </div>
  );
}
