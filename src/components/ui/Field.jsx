import { useId } from 'react';

export default function Field({ label, value, onChange, type = 'text', placeholder, options, textarea, required, id, error, hint, maxLength, min, max, ...inputProps }) {
  const autoId = useId();
  const inputId = id || `field-${autoId}`;
  const errorId = `${inputId}-error`;
  const descBy = error ? errorId : undefined;
  const inputCls = `w-full py-2.5 px-3.5 rounded-lg border ${error ? 'border-salve-rose' : 'border-salve-border'} text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors`;
  const len = typeof value === 'string' ? value.length : 0;
  const showCount = textarea && maxLength;

  return (
    <div className="mb-4">
      <label htmlFor={inputId} className="block text-[11px] font-semibold text-salve-textMid mb-1.5 uppercase tracking-widest">
        {label} {required && <span className="text-salve-rose">*</span>}
      </label>
      {options ? (
        <select
          id={inputId}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={inputCls}
          aria-describedby={descBy}
          aria-invalid={error ? 'true' : undefined}
        >
          <option value="">Select...</option>
          {options.map(o => {
            const val = o.value ?? o;
            const lab = o.label ?? o;
            return <option key={val} value={val}>{lab}</option>;
          })}
        </select>
      ) : textarea ? (
        <textarea
          id={inputId}
          value={value}
          onChange={e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
          placeholder={placeholder}
          rows={3}
          maxLength={maxLength}
          className={`${inputCls} resize-y leading-relaxed`}
          aria-describedby={descBy}
          aria-invalid={error ? 'true' : undefined}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
          placeholder={placeholder}
          className={inputCls}
          maxLength={maxLength}
          min={min}
          max={max}
          aria-describedby={descBy}
          aria-invalid={error ? 'true' : undefined}
          {...inputProps}
        />
      )}
      {(error || hint || showCount) && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span id={error ? errorId : undefined} role={error ? 'alert' : undefined} className={`text-[11px] font-montserrat ${error ? 'text-salve-rose' : 'text-salve-textFaint'}`}>
            {error || hint || ''}
          </span>
          {showCount && (
            <span className={`text-[11px] font-montserrat tabular-nums ${len > maxLength * 0.9 ? 'text-salve-rose' : 'text-salve-textFaint'}`}>
              {len}/{maxLength}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
