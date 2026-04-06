import { useState, useCallback, useRef } from 'react';
import { Upload } from 'lucide-react';

/**
 * DropZone — drag-and-drop file target for desktop, with click-to-browse fallback.
 * Hidden on mobile (md:block only) unless `alwaysVisible` is set.
 *
 * @param {function} onFile - called with the dropped/selected File
 * @param {string} accept - file input accept attribute (e.g. ".json", ".xml,.zip")
 * @param {string} label - main label text
 * @param {string} hint - smaller hint text below label
 * @param {boolean} alwaysVisible - show on mobile too (default: desktop only)
 * @param {string} className - additional classes
 */
export default function DropZone({ onFile, accept = '*', label, hint, alwaysVisible = false, className = '' }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const handleClick = () => fileRef.current?.click();

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      aria-label={label || 'Drop file here or click to browse'}
      className={`
        ${alwaysVisible ? '' : 'hidden md:flex'}
        flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200
        ${dragOver
          ? 'border-salve-lav bg-salve-lav/10 scale-[1.01]'
          : 'border-salve-border hover:border-salve-lav/50 hover:bg-salve-card2/50'
        }
        ${className}
      `}
    >
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <Upload
        size={24}
        className={`transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-textFaint'}`}
      />
      <span className={`text-sm font-medium font-montserrat transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-textMid'}`}>
        {label || 'Drop file here or click to browse'}
      </span>
      {hint && (
        <span className="text-[11px] text-salve-textFaint font-montserrat">
          {hint}
        </span>
      )}
    </div>
  );
}
