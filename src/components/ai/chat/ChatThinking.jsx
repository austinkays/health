import { Leaf } from 'lucide-react';
import useWellnessMessage from '../../../hooks/useWellnessMessage';

export default function ChatThinking() {
  const { message, key } = useWellnessMessage();
  return (
    <div className="self-start flex items-start gap-2 text-salve-textFaint text-xs">
      <div className="w-5 h-5 rounded-full bg-salve-sage/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Leaf size={11} className="text-salve-sage" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-semibold text-salve-sage font-montserrat tracking-wide">Sage</span>
        <span key={key} className="wellness-msg italic" role="status" aria-live="polite">{message}</span>
      </div>
    </div>
  );
}
