const variants = {
  primary: 'bg-salve-sage text-white border-transparent btn-magic',
  secondary: 'bg-transparent text-salve-sage border-salve-sage btn-magic',
  danger: 'bg-salve-rose text-white border-transparent btn-magic btn-magic-danger',
  ghost: 'bg-transparent text-salve-textMid border-transparent btn-magic',
  lavender: 'bg-salve-lav/20 text-salve-lav border-transparent btn-magic btn-magic-lav',
};

export default function Button({ children, onClick, variant = 'primary', className = '', disabled, style }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={`px-5 py-2.5 rounded-full text-[13px] font-medium font-montserrat inline-flex items-center gap-1.5 tracking-wide border ${variants[variant] || variants.primary} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {children}
    </button>
  );
}
