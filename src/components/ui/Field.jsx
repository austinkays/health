export default function Field({ label, value, onChange, type = 'text', placeholder, options, textarea, required }) {
  const inputCls = 'w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none focus:border-salve-lav transition-colors';

  return (
    <div className="mb-4">
      <label className="block text-[11px] font-semibold text-salve-textMid mb-1.5 uppercase tracking-widest">
        {label} {required && <span className="text-salve-rose">*</span>}
      </label>
      {options ? (
        <select
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
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${inputCls} resize-y leading-relaxed`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputCls}
        />
      )}
    </div>
  );
}
