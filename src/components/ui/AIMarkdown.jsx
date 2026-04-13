import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Convert bare URLs (not already in markdown link/image syntax) into markdown links
function linkifyBareUrls(text) {
  if (!text) return text;
  // Match URLs not preceded by ]( or ( or " or ', i.e. bare URLs in text
  return text.replace(
    /(?<!\]\()(?<!\()(?<!")(?<!')(?<!=)(https?:\/\/[^\s)<>\]"']+)/g,
    '[$1]($1)'
  );
}

const components = {
  h1: ({ children }) => <h1 className="text-base font-semibold text-salve-lav font-playfair mt-3 mb-1.5 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[14px] font-semibold text-salve-lav font-playfair mt-3 mb-1 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[15px] font-semibold text-salve-text font-montserrat mt-2.5 mb-1 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="text-[14px] font-semibold text-salve-text font-montserrat mt-2 mb-0.5">{children}</h4>,
  p: ({ children }) => <p className="text-[15px] text-salve-textMid leading-relaxed my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 pl-4 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 pl-4 space-y-0.5 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-[15px] text-salve-textMid leading-relaxed list-disc marker:text-salve-lavDim">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-salve-text">{children}</strong>,
  em: ({ children }) => <em className="italic text-salve-textMid">{children}</em>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-salve-lav hover:underline">{children}</a>,
  hr: () => <hr className="border-salve-border my-3" />,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-salve-lav/30 pl-3 my-2 italic">{children}</blockquote>,
  code: ({ inline, children }) => inline
    ? <code className="bg-salve-card2 text-salve-lav text-[14px] px-1.5 py-0.5 rounded">{children}</code>
    : <pre className="bg-salve-card2 border border-salve-border rounded-lg p-3 overflow-x-auto my-2"><code className="text-[14px] text-salve-textMid">{children}</code></pre>,
  table: ({ children }) => <div className="overflow-x-auto my-2"><table className="w-full text-[14px] border-collapse">{children}</table></div>,
  thead: ({ children }) => <thead className="border-b border-salve-border">{children}</thead>,
  th: ({ children }) => <th className="text-left text-salve-text font-semibold px-2 py-1.5 text-[13px]">{children}</th>,
  td: ({ children }) => <td className="text-salve-textMid px-2 py-1.5 border-b border-salve-border/50">{children}</td>,
};

const compactComponents = {
  ...components,
  p: ({ children }) => <p className="text-[14px] text-salve-textMid leading-relaxed my-1 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="text-[15px] font-semibold text-salve-lav font-playfair mt-2 mb-1 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-[14px] font-semibold text-salve-lav font-playfair mt-2 mb-0.5 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-[14px] font-semibold text-salve-text font-montserrat mt-1.5 mb-0.5 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="my-1 pl-3.5 space-y-0">{children}</ul>,
  ol: ({ children }) => <ol className="my-1 pl-3.5 space-y-0 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-[14px] text-salve-textMid leading-relaxed list-disc marker:text-salve-lavDim">{children}</li>,
};

const DISCLAIMER_RE = /\n---\n\*(?:AI|Sage'?s?) suggestions are not medical advice\.[^*]*\*\s*$/;

export default function AIMarkdown({ children, compact = false, reveal = false }) {
  if (!children) return null;
  const clean = children.replace(DISCLAIMER_RE, '').trim();
  const processed = linkifyBareUrls(clean);
  const md = (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={compact ? compactComponents : components}
    >
      {processed}
    </ReactMarkdown>
  );
  return reveal ? <div className="ai-prose-reveal">{md}</div> : md;
}
