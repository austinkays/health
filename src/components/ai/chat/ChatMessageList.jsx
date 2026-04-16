import { memo } from 'react';
import { Leaf } from 'lucide-react';
import AIMarkdown from '../../ui/AIMarkdown';
import { getAIProvider } from '../../../services/ai';
import { stripDisclaimer, fmtMsgTime } from '../helpers';
import { CopyButton } from '../SharedButtons';
import ToolExecutionCard from './ToolExecutionCard';
import ChatThinking from './ChatThinking';

const ChatMessageList = memo(function ChatMessageList({ messages, toolExecutions, loading, confirmPending, chatEndRef }) {
  return (
    <div className="flex flex-col gap-2 mb-3" style={{ minHeight: 200 }}>
      {messages.map((m, i) => (
        <article key={i} className={`max-w-[85%] md:max-w-[70%] rounded-xl ${
          m.role === 'user'
            ? 'self-end bg-salve-lav/20 text-salve-text ml-auto px-3.5 py-2.5 text-[15px] leading-relaxed'
            : 'self-start bg-salve-card border border-salve-border text-salve-textMid px-3.5 pt-2.5 pb-1.5'
        }`}>
          {m.role === 'assistant' ? (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded-full bg-salve-sage/15 flex items-center justify-center flex-shrink-0">
                  <Leaf size={9} className="text-salve-sage" />
                </div>
                <span className="text-[12px] font-semibold text-salve-sage font-montserrat tracking-wide">Sage</span>
                <span className="text-[9px] text-salve-textFaint font-montserrat ml-auto">{fmtMsgTime(m.ts)}{fmtMsgTime(m.ts) && ' · '}via {getAIProvider() === 'anthropic' ? 'Claude' : 'Gemini'}</span>
              </div>
              <AIMarkdown compact>{stripDisclaimer(m.content)}</AIMarkdown>
              {m.toolExecutions?.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {m.toolExecutions.map(t => (
                    <ToolExecutionCard key={t.id} execution={t} />
                  ))}
                </div>
              )}
              <div className="flex justify-end mt-1.5 -mr-1">
                <CopyButton text={stripDisclaimer(m.content)} className="!text-[12px] !px-2 !py-0.5" />
              </div>
            </>
          ) : (
            <>
              {m.content}
              {m.ts && <div className="text-[9px] text-salve-lav/40 font-montserrat text-right mt-1">{fmtMsgTime(m.ts)}</div>}
            </>
          )}
        </article>
      ))}
      {toolExecutions.length > 0 && loading && (
        <div className="self-start flex flex-col gap-1 max-w-[85%] md:max-w-[70%]">
          {toolExecutions.map(t => (
            <ToolExecutionCard key={t.id} execution={t} onConfirm={confirmPending} />
          ))}
        </div>
      )}
      {loading && <ChatThinking />}
      <div ref={chatEndRef} />
    </div>
  );
});

export default ChatMessageList;
