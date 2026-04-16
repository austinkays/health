import { Lightbulb, X, ExternalLink, ChevronRight } from 'lucide-react';
import Reveal from '../ui/Reveal';
import { C } from '../../constants/colors';

export default function GettingStartedTips({ tips, onDismiss, onDismissAll, onNav }) {
  if (tips.length === 0) return null;
  return (
    <Reveal as="section" aria-label="Getting started" className="mb-5 md:mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <Lightbulb size={13} className="text-salve-amber" />
          <span className="text-ui-sm text-salve-textFaint font-montserrat tracking-widest uppercase">Getting Started</span>
        </div>
        <button
          onClick={onDismissAll}
          className="text-[12px] text-salve-textFaint/60 hover:text-salve-textMid font-montserrat bg-transparent border-none cursor-pointer transition-colors px-1"
          aria-label="Dismiss all tips"
        >
          Hide all
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-fluid-md">
        {tips.map((tip, i) => {
          const TipIcon = tip.icon;
          const colorVar = tip.color === 'sage' ? C.sage : tip.color === 'amber' ? C.amber : C.lav;
          const isLastOdd = tips.length % 2 !== 0 && i === tips.length - 1;
          return (
            <div
              key={tip.id}
              className={`bg-salve-card border border-salve-border/50 rounded-xl p-fluid-lg flex flex-col relative${isLastOdd ? ' col-span-2' : ''}`}
            >
              <button
                onClick={() => onDismiss(tip.id)}
                className="absolute top-2 right-2 p-1 rounded-md bg-transparent border-none cursor-pointer text-salve-textFaint/30 hover:text-salve-textFaint hover:bg-salve-card2 transition-colors"
                aria-label={`Dismiss ${tip.title}`}
              >
                <X size={11} />
              </button>
              <div
                className="w-7 h-7 md:w-9 md:h-9 rounded-lg flex items-center justify-center mb-2"
                style={{ background: `${colorVar}15` }}
              >
                <TipIcon size={14} color={colorVar} strokeWidth={1.5} />
              </div>
              <div className="text-[14px] md:text-sm text-salve-text font-medium mb-1 pr-5">{tip.title}</div>
              <p className="text-ui-base text-salve-textFaint leading-relaxed m-0 mb-2 flex-1">{tip.body}</p>
              {tip.href ? (
                <a
                  href={tip.href}
                  className="inline-flex items-center gap-1 text-[10.5px] md:text-xs font-medium font-montserrat no-underline transition-colors mt-auto"
                  style={{ color: colorVar }}
                >
                  {tip.actionLabel}
                  <ExternalLink size={9} />
                </a>
              ) : (
                <button
                  onClick={() => onNav(tip.action)}
                  className="inline-flex items-center gap-1 text-[10.5px] md:text-xs font-medium font-montserrat bg-transparent border-none cursor-pointer p-0 transition-colors mt-auto"
                  style={{ color: colorVar }}
                >
                  {tip.actionLabel}
                  <ChevronRight size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}
