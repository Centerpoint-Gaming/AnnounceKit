import type { GameBrand } from '@announcekit/core';

interface ReferenceImagesCardProps {
  brand: GameBrand;
  onView: () => void;
}

export function ReferenceImagesCard({ brand, onView }: ReferenceImagesCardProps) {
  const total = brand.referenceImages.length;
  const withNotes = brand.referenceImages.filter(
    (a) => a.description?.trim(),
  ).length;

  return (
    <button
      onClick={onView}
      className="w-full bg-gray-800/60 border border-gray-700 hover:border-gray-600 rounded-lg p-3 mb-3 text-left transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold">Reference Images</h2>
          <span className="text-xs text-gray-500 shrink-0">
            {total} {total === 1 ? 'layout' : 'layouts'}
          </span>
        </div>
        <span className="text-xs text-purple-400 shrink-0">Manage &rarr;</span>
      </div>

      {total === 0 ? (
        <p className="text-xs text-gray-500 mt-2">
          Add approved thumbnail layouts the model should match for composition
          and framing.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5 mt-2">
          <span className="text-[10px] bg-gray-900/60 text-gray-400 rounded px-1.5 py-0.5">
            {withNotes}/{total} with notes
          </span>
        </div>
      )}
    </button>
  );
}
