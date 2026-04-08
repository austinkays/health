import { useState, useRef, useCallback, useMemo } from 'react';
import { ClipboardPaste, Sparkles, Copy, Check, ChevronDown, AlertTriangle, Leaf, RotateCcw, X, ChevronRight, ImagePlus, FileText, Pencil, Plus, Clock, Trash2, Printer, CalendarDays, FileSearch, ChevronUp } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import AIConsentGate from '../ui/AIConsentGate';
import { buildProfile } from '../../services/profile';
import { fillFormQuestions } from '../../services/ai';
import useWellnessMessage from '../../hooks/useWellnessMessage';
import { FORM_TEMPLATES } from '../../constants/formTemplates';

// ── Parse AI response into structured Q&A pairs ──

function parseAnswers(text) {
  const pairs = [];
  const lines = text.split('\n');
  let currentQ = null;
  let currentA = [];

  for (const line of lines) {
    const qMatch = line.match(/^\*{0,2}Q\d*[:.]\*{0,2}\s*(.+)/i);
    const aMatch = line.match(/^\*{0,2}A\d*[:.]\*{0,2}\s*(.*)/i);

    if (qMatch) {
      if (currentQ && currentA.length > 0) {
        pairs.push({ question: currentQ, answer: currentA.join('\n').trim() });
      }
      currentQ = qMatch[1].trim();
      currentA = [];
    } else if (aMatch) {
      currentA.push(aMatch[1]);
    } else if (currentQ && !line.match(/^---/)) {
      currentA.push(line);
    }
  }
  if (currentQ && currentA.length > 0) {
    pairs.push({ question: currentQ, answer: currentA.join('\n').trim() });
  }

  return pairs;
}

// ── Question count heuristic ──

function countQuestions(text) {
  if (!text || text.length < 5) return 0;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    if (line.endsWith('?')) { count++; continue; }
    if (/^(name|date of birth|dob|address|phone|email|age|sex|gender|height|weight|ssn|occupation)\s*[:/]?\s*$/i.test(line)) { count++; continue; }
    if (/^(please|do you|have you|are you|what|when|where|which|who|how|why|list|describe|check all|select all)/i.test(line)) { count++; continue; }
    if (/:\s*(_+|\[?\s*\]?)\s*$/.test(line)) { count++; continue; }
  }
  return count;
}

// ── Answer fingerprint cache ──

const CACHE_KEY = 'salve:form-cache';
const CACHE_MAX = 200;

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return String(hash);
}

function getAnswerCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}

function setAnswerCache(cache) {
  const keys = Object.keys(cache);
  if (keys.length > CACHE_MAX) {
    const sorted = keys
      .map(k => ({ k, t: cache[k].updatedAt || 0 }))
      .sort((a, b) => a.t - b.t);
    const remove = sorted.slice(0, keys.length - CACHE_MAX);
    for (const r of remove) delete cache[r.k];
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

function cacheAnswers(pairs) {
  const cache = getAnswerCache();
  for (const p of pairs) {
    const key = simpleHash(p.question.toLowerCase().trim());
    cache[key] = { answer: p.answer, updatedAt: Date.now() };
  }
  setAnswerCache(cache);
}

function lookupCached(question) {
  const cache = getAnswerCache();
  const key = simpleHash(question.toLowerCase().trim());
  return cache[key] || null;
}

// ── Form history (localStorage) ──

const HISTORY_KEY = 'salve:form-history';
const HISTORY_MAX = 20;

function getFormHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

function saveFormHistory(entry) {
  const history = getFormHistory();
  history.unshift(entry);
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function clearFormHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

// ── CopyButton ──

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0 shrink-0"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check size={10} className="text-salve-sage" /> : <Copy size={10} />}
      {copied ? 'Copied' : label}
    </button>
  );
}

// ── Nav hint extraction ──

const SECTION_NAV_MAP = {
  'medications': 'meds', 'conditions': 'conditions', 'allergies': 'allergies',
  'providers': 'providers', 'vitals': 'vitals', 'procedures': 'procedures',
  'vaccines': 'immunizations', 'insurance': 'insurance', 'journal': 'journal',
  'activities': 'activities', 'labs': 'labs', 'visits': 'appts',
  'cycle tracker': 'cycles', 'genetics': 'genetics', 'about me': 'aboutme',
};

function parseNavHint(answer) {
  const match = answer.match(/You can (?:add|track|log) this in \*\*(.+?)\*\*/i);
  if (!match) return null;
  const sectionName = match[1].toLowerCase();
  const navId = SECTION_NAV_MAP[sectionName];
  if (!navId) return null;
  return { label: match[1], navId };
}

// ── AnswerCard with inline editing ──

function AnswerCard({ pair, index, onNav, onEdit }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const isPersonal = pair.answer.includes('⚠') || pair.answer.toLowerCase().includes('answer this personally');
  const navHint = isPersonal ? parseNavHint(pair.answer) : null;
  const displayAnswer = navHint
    ? pair.answer.replace(/You can (?:add|track|log) this in \*\*.+?\*\*\.?/i, '').trim()
    : pair.answer;

  const startEdit = () => {
    setEditText(pair.answer.replace(/⚠\s*/g, '').replace(/\*/g, ''));
    setEditing(true);
  };

  const saveEdit = () => {
    if (editText.trim()) onEdit(index, editText.trim());
    setEditing(false);
  };

  return (
    <Card className={isPersonal ? '!border-salve-amber/30' : ''}>
      <button
        className="w-full flex items-start gap-2 bg-transparent border-none cursor-pointer p-0 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-[10px] text-salve-textFaint font-montserrat font-semibold mt-0.5 shrink-0">
          {index + 1}.
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-salve-text font-montserrat font-medium m-0 leading-relaxed">
            {pair.question}
          </p>
        </div>
        <ChevronDown
          size={13}
          className={`text-salve-textFaint shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-2 pt-2 border-t border-salve-border/50">
          {isPersonal && !editing ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle size={13} className="text-salve-amber shrink-0 mt-0.5" />
                <p className="text-[12px] text-salve-textMid font-montserrat m-0 leading-relaxed italic">
                  {displayAnswer.replace(/⚠\s*/g, '').replace(/\*/g, '')}
                </p>
              </div>
              {navHint && onNav && (
                <button
                  onClick={() => onNav(navHint.navId)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-salve-lav/8 hover:bg-salve-lav/15 border border-salve-lav/20 cursor-pointer transition-colors w-full text-left"
                >
                  <span className="text-[11px] text-salve-lav font-montserrat font-medium">
                    Add in {navHint.label}
                  </span>
                  <ChevronRight size={12} className="text-salve-lav ml-auto" />
                </button>
              )}
              <div className="flex justify-end">
                <button
                  onClick={startEdit}
                  className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  aria-label="Edit answer"
                >
                  <Pencil size={10} />
                  Write your answer
                </button>
              </div>
            </div>
          ) : editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={3}
                className="w-full py-2 px-3 rounded-lg border border-salve-lav/40 text-[13px] font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors resize-y leading-relaxed"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setEditing(false)}
                  className="text-[10px] text-salve-textFaint hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 text-[10px] text-salve-lav hover:text-salve-text bg-transparent border-none cursor-pointer font-montserrat font-medium transition-colors p-0"
                >
                  <Check size={10} />
                  Done
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-salve-card2 rounded-lg px-3 py-2.5">
              <p className="text-[13px] text-salve-text font-montserrat m-0 leading-relaxed whitespace-pre-wrap">
                {pair.answer.replace(/^\*{2}|^\*{2}$/g, '')}
              </p>
              {pair.edited && (
                <span className="inline-block mt-1 text-[9px] text-salve-lav/70 font-montserrat italic">edited</span>
              )}
              {pair.cached && !pair.edited && (
                <span className="inline-block mt-1 text-[9px] text-salve-textFaint font-montserrat italic">cached</span>
              )}
            </div>
          )}
          {!isPersonal && !editing && (
            <div className="flex items-center justify-between mt-2">
              <button
                onClick={startEdit}
                className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                aria-label="Edit answer"
              >
                <Pencil size={10} />
                Edit
              </button>
              <CopyButton text={pair.answer.replace(/⚠\s*/g, '')} label="Copy answer" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Data gap summary ──

function GapSummary({ pairs, onNav }) {
  const gaps = useMemo(() => {
    const sectionSet = new Map();
    for (const p of pairs) {
      if (!p.answer.includes('⚠')) continue;
      const hint = parseNavHint(p.answer);
      if (hint && !sectionSet.has(hint.navId)) {
        sectionSet.set(hint.navId, hint.label);
      }
    }
    return [...sectionSet.entries()];
  }, [pairs]);

  if (gaps.length === 0) return null;
  const gapCount = pairs.filter(p => p.answer.includes('⚠')).length;

  return (
    <Card className="!border-salve-amber/20 !bg-salve-amber/[0.04]">
      <div className="space-y-2">
        <p className="text-xs text-salve-text font-montserrat font-medium m-0">
          Sage couldn&apos;t answer {gapCount} question{gapCount !== 1 ? 's' : ''}
        </p>
        <p className="text-[11px] text-salve-textMid font-montserrat m-0 leading-relaxed">
          Add your info to fill these automatically next time:
        </p>
        <div className="flex flex-wrap gap-1.5">
          {gaps.map(([navId, label]) => (
            <button
              key={navId}
              onClick={() => onNav(navId)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-montserrat font-medium text-salve-lav bg-salve-lav/10 hover:bg-salve-lav/20 border border-salve-lav/20 cursor-pointer transition-colors"
            >
              {label}
              <ChevronRight size={10} />
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

// ── Appointment picker ──

function AppointmentPicker({ appointments, selected, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const upcoming = useMemo(() => {
    if (!appointments?.length) return [];
    const today = new Date().toISOString().slice(0, 10);
    return appointments
      .filter(a => a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [appointments]);

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-xl border border-salve-border/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left"
      >
        <CalendarDays size={13} className="text-salve-lav shrink-0" />
        <span className="text-[11px] text-salve-textMid font-montserrat flex-1">
          {selected ? `For: ${selected.provider || selected.reason || 'Upcoming appointment'}` : 'Filling forms for an appointment?'}
        </span>
        <ChevronDown size={12} className={`text-salve-textFaint transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-salve-border/40 px-1 py-1">
          {upcoming.map(appt => {
            const isSelected = selected?.id === appt.id;
            return (
              <button
                key={appt.id}
                onClick={() => { onSelect(isSelected ? null : appt); setExpanded(false); }}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left border-none cursor-pointer transition-colors ${isSelected ? 'bg-salve-lav/15' : 'bg-transparent hover:bg-salve-card2'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-salve-text font-montserrat font-medium m-0 truncate">
                    {appt.provider || appt.reason || 'Appointment'}
                  </p>
                  <p className="text-[10px] text-salve-textFaint font-montserrat m-0">
                    {new Date(appt.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {appt.time ? ` at ${appt.time}` : ''}
                    {appt.reason && appt.provider ? ` · ${appt.reason}` : ''}
                  </p>
                </div>
                {isSelected && <Check size={12} className="text-salve-lav shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Template picker ──

function TemplatePicker({ onSelect }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? FORM_TEMPLATES : FORM_TEMPLATES.slice(0, 4);

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase px-1 m-0">Quick start templates</p>
      <div className="grid grid-cols-2 gap-2">
        {visible.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="flex flex-col items-start gap-1 p-2.5 rounded-lg border border-salve-border/60 bg-transparent hover:bg-salve-card2 hover:border-salve-lav/30 cursor-pointer transition-colors text-left"
          >
            <span className="text-[11px] text-salve-text font-montserrat font-medium leading-tight">{t.name}</span>
            <span className="text-[9px] text-salve-textFaint font-montserrat">{t.description}</span>
          </button>
        ))}
      </div>
      {FORM_TEMPLATES.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="flex items-center gap-1 px-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors"
        >
          {showAll ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {showAll ? 'Show less' : `${FORM_TEMPLATES.length - 4} more templates`}
        </button>
      )}
    </div>
  );
}

// ── Form history list ──

function RecentForms({ onRestore, onClear }) {
  const [history, setHistory] = useState(getFormHistory);
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  return (
    <div className="rounded-xl border border-salve-border/60 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-transparent border-none cursor-pointer text-left"
      >
        <Clock size={13} className="text-salve-textFaint shrink-0" />
        <span className="text-[11px] text-salve-textMid font-montserrat flex-1">
          Recent forms ({history.length})
        </span>
        <ChevronDown size={12} className={`text-salve-textFaint transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-salve-border/40">
          <div className="px-1 py-1 space-y-0.5 max-h-[200px] overflow-y-auto">
            {history.map((entry, i) => (
              <button
                key={entry.id || i}
                onClick={() => onRestore(entry)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-transparent hover:bg-salve-card2 border-none cursor-pointer text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-salve-text font-montserrat font-medium m-0 truncate">
                    {entry.label || `${entry.questionCount} question${entry.questionCount !== 1 ? 's' : ''}`}
                  </p>
                  <p className="text-[10px] text-salve-textFaint font-montserrat m-0">
                    {new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    {entry.inputType === 'image' ? ' · Screenshot' : entry.inputType === 'both' ? ' · Text + Screenshot' : ' · Text'}
                  </p>
                </div>
                <ChevronRight size={12} className="text-salve-textFaint shrink-0" />
              </button>
            ))}
          </div>
          <div className="border-t border-salve-border/40 px-3 py-2">
            <button
              onClick={() => { clearFormHistory(); setHistory([]); onClear?.(); }}
              className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-rose bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
            >
              <Trash2 size={10} />
              Clear history
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Read a file as base64 data URL ──

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const [header, data] = dataUrl.split(',');
      const mediaType = header.match(/data:(.+);/)?.[1] || 'image/png';
      resolve({ data, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── PDF page renderer (lazy-loaded) ──

async function renderPdfPages(file) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.min.mjs');
  const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL('image/png');
    const [header, data] = dataUrl.split(',');
    const mediaType = header.match(/data:(.+);/)?.[1] || 'image/png';
    pages.push({ data, mediaType, preview: dataUrl });
  }

  return pages;
}

// ── Constants ──

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB per image
const MAX_IMAGES = 5;

// ── Main FormHelper ──

export default function FormHelper({ data, onNav }) {
  const [questions, setQuestions] = useState('');
  const [imageFiles, setImageFiles] = useState([]); // [{ file?, preview, data, mediaType }]
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfProgress, setPdfProgress] = useState('');
  const [selectedAppt, setSelectedAppt] = useState(null);
  const fileInputRef = useRef(null);
  const wellness = useWellnessMessage(10000);

  const questionCount = useMemo(() => countQuestions(questions), [questions]);

  const handleImageSelect = async (file) => {
    if (!file) return;

    // Handle PDF files
    if (file.type === 'application/pdf' || file.name?.endsWith('.pdf')) {
      if (imageFiles.length >= MAX_IMAGES) {
        setError(`Maximum ${MAX_IMAGES} pages. Remove some before adding more.`);
        return;
      }
      setError('');
      setPdfProgress('Processing PDF...');
      try {
        const pages = await renderPdfPages(file);
        const remaining = MAX_IMAGES - imageFiles.length;
        const toAdd = pages.slice(0, remaining);
        setPdfProgress(`Extracted ${toAdd.length} of ${pages.length} page${pages.length !== 1 ? 's' : ''}`);
        setImageFiles(prev => [...prev, ...toAdd]);
        setTimeout(() => setPdfProgress(''), 3000);
      } catch {
        setError('Could not process that PDF. Try uploading screenshots instead.');
        setPdfProgress('');
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file or PDF.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image is too large. Please use an image under 5MB.');
      return;
    }
    if (imageFiles.length >= MAX_IMAGES) {
      setError(`Maximum ${MAX_IMAGES} pages. Remove some before adding more.`);
      return;
    }
    setError('');
    try {
      const { data: b64data, mediaType } = await readFileAsBase64(file);
      setImageFiles(prev => [...prev, {
        file,
        preview: URL.createObjectURL(file),
        data: b64data,
        mediaType,
      }]);
    } catch {
      setError('Could not read that image. Please try another one.');
    }
  };

  const removeImage = (index) => {
    setImageFiles(prev => {
      const next = [...prev];
      if (next[index]?.preview && next[index].file) URL.revokeObjectURL(next[index].preview);
      next.splice(index, 1);
      return next;
    });
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'pasted-image.png', { type: imageType });
          await handleImageSelect(file);
          return;
        }
      }
      const text = await navigator.clipboard.readText();
      if (text) setQuestions(prev => prev ? prev + '\n' + text : text);
    } catch {
      try {
        const text = await navigator.clipboard.readText();
        if (text) setQuestions(prev => prev ? prev + '\n' + text : text);
      } catch { /* clipboard not available */ }
    }
  };

  const [dragOver, setDragOver] = useState(false);
  const hasInput = questions.trim() || imageFiles.length > 0;

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer?.files;
    if (files) {
      for (const file of files) {
        handleImageSelect(file);
      }
    }
  };

  const handleGenerate = async () => {
    if (!hasInput) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const profile = buildProfile(data);
      const imageDataArray = imageFiles.length > 0
        ? imageFiles.map(f => ({ data: f.data, mediaType: f.mediaType }))
        : null;

      const apptCtx = selectedAppt
        ? [
          selectedAppt.provider && `Provider: ${selectedAppt.provider}`,
          selectedAppt.reason && `Reason for visit: ${selectedAppt.reason}`,
          selectedAppt.location && `Location: ${selectedAppt.location}`,
          selectedAppt.date && `Date: ${selectedAppt.date}`,
        ].filter(Boolean).join('; ')
        : undefined;

      const raw = await fillFormQuestions(questions, profile, imageDataArray, apptCtx);
      const pairs = parseAnswers(raw);

      let resultPairs;
      if (pairs.length === 0) {
        resultPairs = [{ question: 'Form responses', answer: raw }];
      } else {
        resultPairs = pairs.map(p => {
          const cached = lookupCached(p.question);
          return cached && cached.answer === p.answer ? { ...p, cached: true } : p;
        });
        cacheAnswers(pairs);
      }

      const finalResults = { pairs: resultPairs, raw };
      setResults(finalResults);

      saveFormHistory({
        id: Date.now().toString(36),
        label: selectedAppt?.provider
          ? `${selectedAppt.provider} visit`
          : resultPairs[0]?.question?.slice(0, 50) || 'Form',
        timestamp: new Date().toISOString(),
        questionCount: resultPairs.length,
        pairs: resultPairs,
        inputType: imageFiles.length > 0 && questions.trim() ? 'both' : imageFiles.length > 0 ? 'image' : 'text',
      });
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setResults(null);
    setQuestions('');
    for (const img of imageFiles) {
      if (img.preview && img.file) URL.revokeObjectURL(img.preview);
    }
    setImageFiles([]);
    setSelectedAppt(null);
  };

  const handleEditAnswer = useCallback((index, newText) => {
    setResults(prev => {
      if (!prev) return prev;
      const updated = [...prev.pairs];
      updated[index] = { ...updated[index], answer: newText, edited: true, cached: false };
      return { ...prev, pairs: updated };
    });
  }, []);

  const handleRestoreHistory = useCallback((entry) => {
    setResults({ pairs: entry.pairs, raw: '' });
  }, []);

  const handleSelectTemplate = useCallback((template) => {
    setQuestions(template.questions);
  }, []);

  const handlePrint = () => {
    const name = data?.settings?.name || 'Patient';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Form Answers - ${name}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 650px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
        .qa { margin-bottom: 16px; page-break-inside: avoid; }
        .q { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
        .a { font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
        .personal { color: #b45309; font-style: italic; }
        .edited { font-size: 10px; color: #7c3aed; font-style: italic; }
        .disclaimer { font-size: 10px; color: #999; margin-top: 32px; padding-top: 12px; border-top: 1px solid #eee; }
        @media print { body { margin: 20px; } }
      </style>
    </head><body>
      <h1>Medical Form Answers</h1>
      <div class="meta">${name} &middot; Generated ${date} by Salve</div>
      ${results.pairs.map((p, i) => `
        <div class="qa">
          <div class="q">${i + 1}. ${p.question.replace(/</g, '&lt;')}</div>
          <div class="a${p.answer.includes('⚠') ? ' personal' : ''}">${p.answer.replace(/⚠\s*/g, '').replace(/\*/g, '').replace(/</g, '&lt;')}</div>
          ${p.edited ? '<div class="edited">(edited)</div>' : ''}
        </div>
      `).join('')}
      <div class="disclaimer">Generated by Salve Form Helper. AI-generated answers should be reviewed for accuracy before submitting.</div>
    </body></html>`);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <AIConsentGate>
      <div className="space-y-4">
        {/* Input area */}
        {!results && (
          <>
            {/* Instructional hero card */}
            <Card className="!border-salve-lav/20 !bg-salve-lav/[0.04]">
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-full bg-salve-sage/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Leaf size={18} className="text-salve-sage" />
                </div>
                <div className="space-y-1.5 min-w-0">
                  <p className="text-sm text-salve-text font-montserrat font-semibold m-0 leading-snug">
                    Tired of filling out the same medical forms?
                  </p>
                  <p className="text-xs text-salve-textMid font-montserrat m-0 leading-relaxed">
                    Select all the form text, copy it, and paste below — or snap a screenshot. Sage will match the questions to your health records and draft your answers.
                  </p>
                </div>
              </div>
            </Card>

            {/* Appointment picker */}
            <AppointmentPicker
              appointments={data?.appts}
              selected={selectedAppt}
              onSelect={setSelectedAppt}
            />

            {/* Template picker */}
            <TemplatePicker onSelect={handleSelectTemplate} />

            {/* Form history */}
            <RecentForms
              onRestore={handleRestoreHistory}
              onClear={() => {}}
            />

            {/* Image previews (thumbnail strip for multi-image) */}
            {imageFiles.length > 0 && (
              <Card>
                {imageFiles.length === 1 ? (
                  <div className="relative">
                    <img
                      src={imageFiles[0].preview}
                      alt="Form screenshot"
                      className="w-full max-h-[240px] object-contain rounded-lg border border-salve-border bg-salve-card2"
                    />
                    <button
                      onClick={() => removeImage(0)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-salve-card border border-salve-border flex items-center justify-center cursor-pointer hover:bg-salve-rose/10 hover:border-salve-rose/30 transition-colors"
                      aria-label="Remove image"
                    >
                      <X size={12} className="text-salve-textMid" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <FileSearch size={13} className="text-salve-lav" />
                      <span className="text-[10px] text-salve-textFaint font-montserrat tracking-wide uppercase">
                        {imageFiles.length} page{imageFiles.length !== 1 ? 's' : ''} attached
                      </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {imageFiles.map((img, i) => (
                        <div key={i} className="relative shrink-0">
                          <img
                            src={img.preview}
                            alt={`Page ${i + 1}`}
                            className="w-20 h-28 object-cover rounded-lg border border-salve-border bg-salve-card2"
                          />
                          <button
                            onClick={() => removeImage(i)}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-salve-card border border-salve-border flex items-center justify-center cursor-pointer hover:bg-salve-rose/10 hover:border-salve-rose/30 transition-colors"
                            aria-label={`Remove page ${i + 1}`}
                          >
                            <X size={9} className="text-salve-textMid" />
                          </button>
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-salve-card/85 text-[8px] text-salve-textFaint font-montserrat font-medium">
                            {i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {imageFiles.length < MAX_IMAGES && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 mt-2 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  >
                    <Plus size={10} />
                    Add another page
                  </button>
                )}
              </Card>
            )}

            {/* Screenshot drop zone (hidden when images attached) */}
            {imageFiles.length === 0 && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                aria-label="Drop a screenshot or PDF, or click to browse"
                className={`
                  flex flex-col items-center justify-center gap-2 py-8 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200
                  ${dragOver
                    ? 'border-salve-lav bg-salve-lav/10 scale-[1.01]'
                    : 'border-salve-border hover:border-salve-lav/50 hover:bg-salve-card2/50'
                  }
                `}
              >
                <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${dragOver ? 'bg-salve-lav/20' : 'bg-salve-card2'}`}>
                  <ImagePlus size={22} className={`transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-textFaint'}`} />
                </div>
                <span className={`text-sm font-medium font-montserrat transition-colors ${dragOver ? 'text-salve-lav' : 'text-salve-textMid'}`}>
                  {dragOver ? 'Drop your form here' : 'Drop a screenshot or PDF, or tap to upload'}
                </span>
                <span className="text-[11px] text-salve-textFaint font-montserrat">
                  PNG, JPG, PDF — up to {MAX_IMAGES} pages, 5 MB each
                </span>
              </div>
            )}

            {/* PDF progress */}
            {pdfProgress && (
              <p className="text-[11px] text-salve-sage font-montserrat text-center m-0">{pdfProgress}</p>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 px-2">
              <div className="flex-1 h-px bg-salve-border/60" />
              <span className="text-[10px] text-salve-textFaint font-montserrat tracking-wider uppercase">or paste text</span>
              <div className="flex-1 h-px bg-salve-border/60" />
            </div>

            {/* Text input card */}
            <Card>
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText size={13} className="text-salve-textFaint" />
                  <span className="text-[11px] text-salve-textFaint font-montserrat font-medium tracking-wide uppercase">Form text</span>
                </div>
                <textarea
                  value={questions}
                  onChange={e => setQuestions(e.target.value)}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (items) {
                      for (const item of items) {
                        if (item.type.startsWith('image/')) {
                          e.preventDefault();
                          const file = item.getAsFile();
                          if (file) handleImageSelect(file);
                          return;
                        }
                      }
                    }
                  }}
                  placeholder="Select all the text on your form, copy it, and paste it right here..."
                  rows={5}
                  className="w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors resize-y leading-relaxed"
                />
                <div className="flex items-center justify-between">
                  {questionCount > 0 ? (
                    <span className="text-[10px] text-salve-sage font-montserrat font-medium">
                      ~{questionCount} question{questionCount !== 1 ? 's' : ''} detected
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={handlePaste}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-salve-textFaint hover:text-salve-sage hover:bg-salve-sage/5 bg-transparent border border-salve-border cursor-pointer font-montserrat transition-colors"
                    aria-label="Paste from clipboard"
                  >
                    <ClipboardPaste size={12} />
                    Paste from clipboard
                  </button>
                </div>
              </div>
            </Card>

            {/* Generate button */}
            <div className="flex justify-center pt-1">
              <Button onClick={handleGenerate} disabled={!hasInput || loading} className="w-full">
                <Sparkles size={14} />
                {loading ? 'Working on it...' : 'Fill Out My Form'}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,application/pdf"
              capture="environment"
              onChange={e => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); e.target.value = ''; }}
              className="hidden"
            />
          </>
        )}

        {/* Loading state */}
        {loading && (
          <Card>
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-10 h-10 rounded-full bg-salve-sage/15 flex items-center justify-center animate-pulse">
                <Leaf size={20} className="text-salve-sage" />
              </div>
              <p className="text-sm text-salve-textMid font-montserrat text-center">
                Sage is reading {imageFiles.length > 1 ? `${imageFiles.length} pages` : 'the form'} and looking up your records...
              </p>
              <p className="text-xs text-salve-textFaint font-montserrat text-center italic max-w-[260px]">
                {wellness.message}
              </p>
            </div>
          </Card>
        )}

        {/* Error */}
        {error && (
          <Card className="!border-salve-rose/30">
            <p className="text-sm text-salve-rose font-montserrat m-0">{error}</p>
          </Card>
        )}

        {/* Results */}
        {results && (
          <>
            {/* Gap summary */}
            <GapSummary pairs={results.pairs} onNav={onNav} />

            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase m-0">
                {results.pairs.length} answer{results.pairs.length !== 1 ? 's' : ''} ready
              </p>
              <div className="flex items-center gap-3">
                <CopyButton
                  text={results.pairs.map((p, i) => `${i + 1}. ${p.question}\n${p.answer.replace(/⚠\s*/g, '')}`).join('\n\n')}
                  label="Copy all"
                />
                <CopyButton
                  text={results.pairs.map(p => p.answer.replace(/⚠\s*/g, '').replace(/\*/g, '')).join('\n\n')}
                  label="Answers only"
                />
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  aria-label="Print answers"
                >
                  <Printer size={10} />
                  Print
                </button>
                <button
                  onClick={handleStartOver}
                  className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  aria-label="Start over with a new form"
                >
                  <RotateCcw size={10} />
                  New form
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {results.pairs.map((pair, i) => (
                <AnswerCard key={i} pair={pair} index={i} onNav={onNav} onEdit={handleEditAnswer} />
              ))}
            </div>

            <Card className="!border-salve-border/50">
              <p className="text-[10px] text-salve-textFaint font-montserrat italic text-center m-0 leading-relaxed">
                Always review before submitting — Sage fills in what it can from your records. Answers marked with ⚠ are personal questions only you can answer.
              </p>
            </Card>
          </>
        )}
      </div>
    </AIConsentGate>
  );
}
