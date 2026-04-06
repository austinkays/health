import { ChevronLeft } from 'lucide-react';

export default function FormWrap({ title, onBack, children }) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={onBack} aria-label="Go back" className="bg-transparent border-none cursor-pointer text-salve-textMid flex p-1">
          <ChevronLeft size={20} />
        </button>
        <h3 className="font-playfair m-0 text-[17px] font-semibold text-salve-text">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex justify-between items-center mt-6 md:mt-8 mb-3 md:mb-4">
      <h2 className="font-playfair text-[17px] md:text-lg font-semibold text-salve-text m-0">{children}</h2>
      {action}
    </div>
  );
}
