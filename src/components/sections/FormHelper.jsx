import { useState, useRef } from 'react';
import { Camera, ClipboardPaste, Sparkles, Copy, Check, ChevronDown, AlertTriangle, Leaf, RotateCcw, X, ChevronRight } from 'lucide-react';
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
  'cycle tracker': 'cycles', 'genetics': 'genetics',
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

  const hasInput = questions.trim() || imageFile;

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
        {/* Friendly intro */}
        <div className="px-1 mt-1 mb-0">
          <p className="text-sm text-salve-textMid font-montserrat mb-2">
            New doctor or therapist form? Sage can fill it out for you using your health records.
          </p>
          <div className="text-[12px] text-salve-textFaint font-montserrat space-y-1">
            <p className="m-0"><strong className="text-salve-textMid">How to use:</strong></p>
            <p className="m-0">1. Take a <strong className="text-salve-textMid">screenshot</strong> of the form, or <strong className="text-salve-textMid">select all</strong> the text on the page (Ctrl+A / Cmd+A) and copy it</p>
            <p className="m-0">2. Paste it here — don't worry about formatting, Sage will figure out the questions</p>
            <p className="m-0">3. Review the answers and copy them into the form</p>
          </div>
        </div>

        {/* Input area */}
        {!results && (
          <Card>
            <div className="space-y-3">
              {/* Image upload area */}
              {imageFile ? (
                <div className="relative">
                  <img
                    src={imageFile.preview}
                    alt="Form screenshot"
                    className="w-full max-h-[200px] object-contain rounded-lg border border-salve-border bg-salve-card2"
                  />
                  <button
                    onClick={removeImage}
                    className="absolute top-2 right-2 w-6 h-6 rounded-full bg-salve-card border border-salve-border flex items-center justify-center cursor-pointer hover:bg-salve-rose/10 hover:border-salve-rose/30 transition-colors"
                    aria-label="Remove image"
                  >
                    <X size={12} className="text-salve-textMid" />
                  </button>
                  <p className="text-[10px] text-salve-sage font-montserrat mt-1.5 m-0 flex items-center gap-1">
                    <Check size={10} /> Screenshot attached — Sage will read the questions from it
                  </p>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border border-dashed border-salve-border hover:border-salve-lav/50 hover:bg-salve-lav/5 transition-all cursor-pointer bg-transparent"
                  >
                    <Camera size={20} className="text-salve-lav" />
                    <span className="text-[11px] text-salve-textMid font-montserrat font-medium">Upload photo</span>
                    <span className="text-[10px] text-salve-textFaint font-montserrat">screenshot or photo of form</span>
                  </button>
                  <button
                    onClick={handlePaste}
                    className="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 rounded-lg border border-dashed border-salve-border hover:border-salve-sage/50 hover:bg-salve-sage/5 transition-all cursor-pointer bg-transparent"
                  >
                    <ClipboardPaste size={20} className="text-salve-sage" />
                    <span className="text-[11px] text-salve-textMid font-montserrat font-medium">Paste from clipboard</span>
                    <span className="text-[10px] text-salve-textFaint font-montserrat">text or screenshot</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={e => { if (e.target.files?.[0]) handleImageSelect(e.target.files[0]); e.target.value = ''; }}
                    className="hidden"
                  />
                </div>
              )}

              {/* Text input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-montserrat text-salve-textFaint">
                    {imageFile ? 'Any additional text from the form (optional)' : 'Or type / paste the form text here'}
                  </label>
                </div>
                <textarea
                  value={questions}
                  onChange={e => setQuestions(e.target.value)}
                  onPaste={(e) => {
                    // Handle pasted images directly into textarea
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
                  placeholder="Select all the text on the form page (Ctrl+A / Cmd+A), copy it (Ctrl+C / Cmd+C), then paste it here (Ctrl+V / Cmd+V). It's okay if extra stuff gets copied — Sage will find the questions."
                  rows={imageFile ? 3 : 6}
                  className="w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors resize-y leading-relaxed"
                />
              </div>

              {/* Generate button */}
              <div className="flex items-center gap-3">
                <Button onClick={handleGenerate} disabled={!hasInput || loading}>
                  <Sparkles size={14} />
                  {loading ? 'Working on it...' : 'Fill Out My Form'}
                </Button>
              </div>
            </div>
          </Card>
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
