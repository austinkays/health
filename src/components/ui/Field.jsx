import { useId } from 'react';

export default function Field({ label, value, onChange, type = 'text', placeholder, options, textarea, required, id, error }) {
  const autoId = useId();
  const inputId = id || `field-${autoId}`;
  const inputCls = `w-full py-2.5 px-3.5 rounded-lg border ${error ? 'border-salve-rose' : 'border-salve-border'} text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors`;

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
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${inputCls} resize-y leading-relaxed`}
        />
      ) : (
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
      {error && (
        <p className="mt-1.5 text-[11px] text-salve-rose font-montserrat">{error}</p>
      )}
    </div>
  );
}
