import { C } from '../../constants/colors';

function parseInlineFormatting(text) {
  const parts = [];
  // Match **bold**, *italic*, and plain text
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    if (match[2]) {
      parts.push({ type: 'bold', content: match[2] });
    } else if (match[3]) {
      parts.push({ type: 'italic', content: match[3] });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return parts;
}

function InlineText({ text }) {
  const parts = parseInlineFormatting(text);
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'bold') return <strong key={i} className="font-semibold text-salve-text">{p.content}</strong>;
        if (p.type === 'italic') return <em key={i} className="text-salve-textMid">{p.content}</em>;
        return <span key={i}>{p.content}</span>;
      })}
    </>
  );
}

function parseBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentList = null;

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      flushList();
      continue;
    }

    // Disclaimer separator — skip the --- itself
    if (trimmed === '---') {
      flushList();
      blocks.push({ type: 'divider' });
      continue;
    }

    // Headings: ## or ### or bold-only lines used as headers
    if (/^#{1,4}\s/.test(trimmed)) {
      flushList();
      const level = trimmed.match(/^(#+)/)[1].length;
      const content = trimmed.replace(/^#+\s*/, '');
      blocks.push({ type: 'heading', level, content });
      continue;
    }

    // Numbered list items: 1. or 1)
    if (/^\d+[.)]\s/.test(trimmed)) {
      const content = trimmed.replace(/^\d+[.)]\s*/, '');
      if (!currentList || currentList.type !== 'numbered-list') {
        flushList();
        currentList = { type: 'numbered-list', items: [] };
      }
      currentList.items.push(content);
      continue;
    }

    // Bullet list items: - or *  (but not * italic * which has content after)
    if (/^[-*]\s/.test(trimmed) && !/^\*[^*]+\*$/.test(trimmed)) {
      const content = trimmed.replace(/^[-*]\s*/, '');
      if (!currentList || currentList.type !== 'bullet-list') {
        flushList();
        currentList = { type: 'bullet-list', items: [] };
      }
      currentList.items.push(content);
      continue;
    }

    // Bold-only line as a section label (e.g. "**Medication Interactions:**")
    if (/^\*\*[^*]+\*\*:?\s*$/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\*\*/, '').replace(/\*\*:?\s*$/, '');
      blocks.push({ type: 'section-label', content });
      continue;
    }

    // Regular paragraph
    flushList();
    blocks.push({ type: 'paragraph', content: trimmed });
  }

  flushList();
  return blocks;
}

export default function InsightRenderer({ text, compact = false }) {
  if (!text) return null;

  const blocks = parseBlocks(text);

  return (
    <div className={`space-y-2.5 ${compact ? '' : ''}`}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading':
            return (
              <div key={i} className={`font-playfair font-semibold ${
                block.level <= 2 ? 'text-sm text-salve-text' : 'text-[13px] text-salve-text'
              } ${i > 0 ? 'mt-1' : ''}`}>
                <InlineText text={block.content} />
              </div>
            );

          case 'section-label':
            return (
              <div key={i} className="text-[13px] font-semibold text-salve-lav mt-1">
                <InlineText text={block.content} />
              </div>
            );

          case 'bullet-list':
            return (
              <ul key={i} className="space-y-1.5 ml-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[13px] text-salve-textMid leading-relaxed">
                    <span className="text-salve-lav mt-0.5 shrink-0">&#8226;</span>
                    <span><InlineText text={item} /></span>
                  </li>
                ))}
              </ul>
            );

          case 'numbered-list':
            return (
              <ol key={i} className="space-y-1.5 ml-1">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2 text-[13px] text-salve-textMid leading-relaxed">
                    <span className="text-salve-lav font-semibold shrink-0 w-4 text-right">{j + 1}.</span>
                    <span><InlineText text={item} /></span>
                  </li>
                ))}
              </ol>
            );

          case 'divider':
            return (
              <div key={i} className="border-t border-salve-border/50 my-1" />
            );

          case 'paragraph':
            return (
              <p key={i} className="text-[13px] text-salve-textMid leading-relaxed">
                <InlineText text={block.content} />
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
}
