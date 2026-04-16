// Strip the AI disclaimer from markdown text for separate rendering
export function stripDisclaimer(text) {
  if (!text) return '';
  return text.replace(/\n---\n\*(?:AI|Sage'?s?) suggestions are not medical advice\.[^*]*\*\s*$/, '').trim();
}

// Split markdown text into sections by ## headings or --- separators
export function splitSections(text) {
  if (!text) return [];
  const cleaned = stripDisclaimer(text);
  // Split by ## headings, keep the heading with its content
  const parts = cleaned.split(/(?=^## )/m).filter(s => s.trim());
  if (parts.length > 1) {
    // Drop preamble text before first ## heading
    const filtered = parts.filter(p => p.trimStart().startsWith('## '));
    if (filtered.length > 0) return filtered;
    return parts;
  }
  // Fallback: split by horizontal rules
  const hrParts = cleaned.split(/\n---\n/).filter(s => s.trim());
  return hrParts.length > 1 ? hrParts : [cleaned];
}

// Format a chat message timestamp relative to now.
// > 6 days: short date. Same week: "Nd ago". Today: local time.
export function fmtMsgTime(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays > 6) return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  if (diffDays > 0) return `${diffDays}d ago`;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
