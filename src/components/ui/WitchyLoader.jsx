import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { getRandomWitchyMessage } from '../../constants/witchyMessages';
import { C } from '../../constants/colors';

export default function WitchyLoader({ className = '' }) {
  const [message, setMessage] = useState(getRandomWitchyMessage);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessage(getRandomWitchyMessage());
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`flex flex-col items-center gap-3 py-4 ${className}`}>
      <Loader2 size={22} className="animate-spin text-salve-lav" />
      <div
        className="text-[13px] text-salve-textMid italic font-montserrat transition-opacity duration-500"
        key={message}
        style={{ animation: 'witchyFade 3s ease-in-out' }}
      >
        {message}
      </div>
    </div>
  );
}
