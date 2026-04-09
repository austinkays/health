// Thumbs up/down rating component for AI-generated content.
// Compact — fits inline with other action buttons.

import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { C } from '../../constants/colors';

export default function ThumbsRating({ surface, contentKey, getRating, rate, metadata, size = 12 }) {
  const current = getRating(surface, contentKey);

  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        onClick={(e) => { e.stopPropagation(); rate(surface, contentKey, 1, metadata); }}
        className="p-1 rounded-md bg-transparent border-none cursor-pointer transition-colors"
        style={{ color: current === 1 ? C.sage : C.textFaint }}
        aria-label="Helpful"
        title="Helpful"
      >
        <ThumbsUp size={size} fill={current === 1 ? C.sage : 'none'} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); rate(surface, contentKey, -1, metadata); }}
        className="p-1 rounded-md bg-transparent border-none cursor-pointer transition-colors"
        style={{ color: current === -1 ? C.rose : C.textFaint }}
        aria-label="Not helpful"
        title="Not helpful"
      >
        <ThumbsDown size={size} fill={current === -1 ? C.rose : 'none'} />
      </button>
    </span>
  );
}
