import { useState } from 'react';
import { Bookmark, Copy, Check, Info } from 'lucide-react';
import ThumbsRating from '../ui/ThumbsRating';
import { stripDisclaimer } from './helpers';

export function SaveInsightButton({ type, label, text, savedInsights }) {
  const { save, isSaved } = savedInsights;
  const alreadySaved = isSaved(type, text);
  if (alreadySaved) {
    return (
      <span className="inline-flex items-center gap-1 text-[13px] text-salve-sage font-montserrat font-medium px-2.5 py-1 rounded-full bg-salve-sage/10">
        <Bookmark size={11} className="fill-salve-sage" /> Saved
      </span>
    );
  }
  return (
    <button
      onClick={() => save(type, label, text)}
      className="inline-flex items-center gap-1 text-[13px] font-medium rounded-full px-2.5 py-1 transition-all duration-200 border-none cursor-pointer font-montserrat bg-salve-card2 text-salve-textFaint hover:text-salve-text hover:bg-salve-border"
      aria-label="Save this insight"
    >
      <Bookmark size={11} /> Save
    </button>
  );
}

export function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className={`inline-flex items-center gap-1 text-[13px] font-medium rounded-full px-2.5 py-1 transition-all duration-200 border-none cursor-pointer font-montserrat ${
        copied
          ? 'bg-salve-sage/20 text-salve-sage'
          : 'bg-salve-card2 text-salve-textFaint hover:text-salve-text hover:bg-salve-border'
      } ${className}`}
      aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  );
}

export function ResultHeader({ icon: Icon, label, color, text, featureType, savedInsights, insightRatings }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '20' }}>
          <Icon size={15} color={color} strokeWidth={1.8} />
        </div>
        <span className="text-[15px] font-semibold text-salve-text font-montserrat tracking-wide">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {insightRatings && <ThumbsRating surface={featureType} contentKey={featureType} getRating={insightRatings.getRating} rate={insightRatings.rate} size={12} />}
        {text && savedInsights && <SaveInsightButton type={featureType} label={label} text={text} savedInsights={savedInsights} insightRatings={insightRatings} />}
        {text && <CopyButton text={stripDisclaimer(text)} />}
      </div>
    </div>
  );
}

export function Disclaimer() {
  return (
    <div className="flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-salve-border/30">
      <Info size={10} className="text-salve-textFaint shrink-0" />
      <p className="text-[12px] text-salve-textFaint italic m-0 font-montserrat">
        Sage's suggestions are not medical advice. Always consult your healthcare providers.
      </p>
    </div>
  );
}
