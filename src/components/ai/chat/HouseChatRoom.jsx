import { Sparkles, Shield, Stethoscope, Loader2, Send } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import Button from '../../ui/Button';
import { Disclaimer } from '../SharedButtons';

export default function HouseChatRoom({ messages, loadingWho, input, onInputChange, onSend, inputRef, endRef }) {
  return (
    <div>
      <div className="rounded-xl border border-salve-amber/20 bg-salve-amber/5 p-4 mb-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Stethoscope size={15} className="text-salve-amber" />
          <span className="text-[14px] font-semibold font-montserrat text-salve-amber">Group Consultation</span>
        </div>
        <p className="text-[13px] text-salve-textFaint leading-relaxed font-montserrat">
          A group chat with Claude and Gemini. Claude responds first, then Gemini reacts, they can agree, disagree, or build on each other's ideas.
        </p>
      </div>

      <div className="flex flex-col gap-3 mb-4 max-h-[60vh] overflow-y-auto no-scrollbar">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[14px] text-salve-textFaint font-montserrat italic">Ask a health question to start the conversation.</p>
          </div>
        )}
        {messages.map((msg, i) => {
          if (msg.role === 'user') return (
            <div key={i} className="self-end max-w-[80%] bg-salve-lav/10 border border-salve-lav/20 rounded-xl px-4 py-2.5">
              <p className="text-[15px] text-salve-text font-montserrat m-0">{msg.content}</p>
            </div>
          );
          const isClaude = msg.role === 'claude';
          const color = isClaude ? 'lav' : 'sage';
          const Icon = isClaude ? Sparkles : Shield;
          const name = isClaude ? 'Claude' : 'Gemini';
          return (
            <div key={i} className={`max-w-[88%] rounded-xl border border-salve-${color}/20 bg-salve-${color}/5 overflow-hidden`}>
              <div className={`border-l-[3px] border-salve-${color}/40 p-3.5 pl-4`}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-4 h-4 rounded-full bg-salve-${color}/15 flex items-center justify-center`}>
                    <Icon size={9} className={`text-salve-${color}`} />
                  </div>
                  <span className={`text-[12px] font-semibold font-montserrat text-salve-${color} tracking-wide uppercase`}>{name}</span>
                </div>
                <AIMarkdown>{msg.content}</AIMarkdown>
              </div>
            </div>
          );
        })}
        {loadingWho && (
          <div className={`max-w-[88%] rounded-xl border border-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/20 bg-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/5 overflow-hidden`}>
            <div className={`border-l-[3px] border-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/40 p-3.5 pl-4`}>
              <div className="flex items-center gap-1.5">
                <Loader2 size={11} className={`text-salve-${loadingWho === 'claude' ? 'lav' : 'sage'} animate-spin`} />
                <span className={`text-[13px] font-montserrat text-salve-${loadingWho === 'claude' ? 'lav' : 'sage'}/80`}>{loadingWho === 'claude' ? 'Claude' : 'Gemini'} is thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Disclaimer />

      <div className="flex gap-2 mt-3">
        <input
          ref={inputRef}
          className="flex-1 bg-salve-card2 border border-salve-border rounded-xl px-3.5 py-2.5 text-[15px] text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder="Ask both your AI consultants..."
          disabled={!!loadingWho}
        />
        <Button onClick={onSend} disabled={!input.trim() || !!loadingWho} className="!px-3" aria-label="Send to both AI consultants">
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
