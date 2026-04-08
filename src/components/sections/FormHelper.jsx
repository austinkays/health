import { useState, useRef } from 'react';
import { Camera, ClipboardPaste, Sparkles, Copy, Check, ChevronDown, AlertTriangle, Leaf, RotateCcw, X, ChevronRight, ImagePlus, FileText } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import AIConsentGate from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { buildProfile } from '../../services/profile';
import { fillFormQuestions } from '../../services/ai';
import useWellnessMessage from '../../hooks/useWellnessMessage';

// Parse AI response into structured Q&A pairs
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

// Map section names mentioned in AI responses to navigation tab IDs
const SECTION_NAV_MAP = {
  'medications': 'meds', 'conditions': 'conditions', 'allergies': 'allergies',
  'providers': 'providers', 'vitals': 'vitals', 'procedures': 'procedures',
  'vaccines': 'immunizations', 'insurance': 'insurance', 'journal': 'journal',
  'activities': 'activities', 'labs': 'labs', 'visits': 'appts',
  'cycle tracker': 'cycles', 'genetics': 'genetics', 'about me': 'aboutme',
};

function parseNavHint(answer) {
  // Look for "You can add this in **SectionName**" or "You can track this in **SectionName**"
  const match = answer.match(/You can (?:add|track|log) this in \*\*(.+?)\*\*/i);
  if (!match) return null;
  const sectionName = match[1].toLowerCase();
  const navId = SECTION_NAV_MAP[sectionName];
  if (!navId) return null;
  return { label: match[1], navId };
}

function AnswerCard({ pair, index, onNav }) {
  const [expanded, setExpanded] = useState(true);
  const isPersonal = pair.answer.includes('⚠') || pair.answer.toLowerCase().includes('answer this personally');
  const navHint = isPersonal ? parseNavHint(pair.answer) : null;
  // Clean display text: remove the nav hint line from what's shown since we render it as a button
  const displayAnswer = navHint
    ? pair.answer.replace(/You can (?:add|track|log) this in \*\*.+?\*\*\.?/i, '').trim()
    : pair.answer;

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
          {isPersonal ? (
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
            </div>
          ) : (
            <div className="bg-salve-card2 rounded-lg px-3 py-2.5">
              <p className="text-[13px] text-salve-text font-montserrat m-0 leading-relaxed whitespace-pre-wrap">
                {pair.answer.replace(/^\*{2}|^\*{2}$/g, '')}
              </p>
            </div>
          )}
          {!isPersonal && (
            <div className="flex justify-end mt-2">
              <CopyButton text={pair.answer.replace(/⚠\s*/g, '')} label="Copy answer" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Read a file as base64 data URL
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

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

export default function FormHelper({ data, onNav }) {
  const [questions, setQuestions] = useState('');
  const [imageFile, setImageFile] = useState(null); // { file, preview, data, mediaType }
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const wellness = useWellnessMessage(10000);

  const handleImageSelect = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (photo, screenshot, or PDF scan).');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError('Image is too large. Please use an image under 5MB.');
      return;
    }
    setError('');
    try {
      const { data: b64data, mediaType } = await readFileAsBase64(file);
      setImageFile({
        file,
        preview: URL.createObjectURL(file),
        data: b64data,
        mediaType,
      });
    } catch {
      setError('Could not read that image. Please try another one.');
    }
  };

  const removeImage = () => {
    if (imageFile?.preview) URL.revokeObjectURL(imageFile.preview);
    setImageFile(null);
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        // Check for image in clipboard first
        const imageType = item.types.find(t => t.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], 'pasted-image.png', { type: imageType });
          await handleImageSelect(file);
          return;
        }
      }
      // Fall back to text
      const text = await navigator.clipboard.readText();
      if (text) setQuestions(prev => prev ? prev + '\n' + text : text);
    } catch {
      // Fallback for browsers that don't support clipboard.read()
      try {
        const text = await navigator.clipboard.readText();
        if (text) setQuestions(prev => prev ? prev + '\n' + text : text);
      } catch { /* clipboard not available */ }
    }
  };

  const [dragOver, setDragOver] = useState(false);
  const hasInput = questions.trim() || imageFile;

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleImageSelect(file);
  };

  const handleGenerate = async () => {
    if (!hasInput) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const profile = buildProfile(data);
      const imageData = imageFile ? { data: imageFile.data, mediaType: imageFile.mediaType } : null;
      const raw = await fillFormQuestions(questions, profile, imageData);
      const pairs = parseAnswers(raw);
      if (pairs.length === 0) {
        setResults({ pairs: [{ question: 'Form responses', answer: raw }], raw });
      } else {
        setResults({ pairs, raw });
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOver = () => {
    setResults(null);
    setQuestions('');
    removeImage();
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

            {/* Image preview (shown when an image is attached) */}
            {imageFile && (
              <Card>
                <div className="relative">
                  <img
                    src={imageFile.preview}
                    alt="Form screenshot"
                    className="w-full max-h-[240px] object-contain rounded-lg border border-salve-border bg-salve-card2"
                  />
                  <button
                    onClick={removeImage}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-salve-card border border-salve-border flex items-center justify-center cursor-pointer hover:bg-salve-rose/10 hover:border-salve-rose/30 transition-colors"
                    aria-label="Remove image"
                  >
                    <X size={12} className="text-salve-textMid" />
                  </button>
                  <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-salve-card/85 backdrop-blur-sm border border-salve-border/50">
                    <span className="text-[10px] text-salve-sage font-montserrat font-medium">Screenshot attached</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Screenshot drop zone (hidden when image is already attached) */}
            {!imageFile && (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                aria-label="Drop a screenshot or click to browse"
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
                  {dragOver ? 'Drop your screenshot here' : 'Drop a screenshot or tap to upload'}
                </span>
                <span className="text-[11px] text-salve-textFaint font-montserrat">
                  PNG, JPG, or any image up to 5 MB
                </span>
              </div>
            )}

            {/* Divider with "or" */}
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
                <div className="flex items-center justify-end">
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
              accept="image/*"
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
                Sage is reading the form and looking up your records...
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
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] text-salve-textFaint font-montserrat tracking-widest uppercase m-0">
                {results.pairs.length} answer{results.pairs.length !== 1 ? 's' : ''} ready
              </p>
              <div className="flex items-center gap-3">
                <CopyButton text={results.pairs.map((p, i) => `${i + 1}. ${p.question}\n${p.answer.replace(/⚠\s*/g, '')}`).join('\n\n')} label="Copy all" />
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
                <AnswerCard key={i} pair={pair} index={i} onNav={onNav} />
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
