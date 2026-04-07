import { useState, useRef } from 'react';
import { ClipboardPaste, Sparkles, Copy, Check, ChevronDown, AlertTriangle, Leaf, RotateCcw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Field from '../ui/Field';
import AIConsentGate from '../ui/AIConsentGate';
import AIMarkdown from '../ui/AIMarkdown';
import { buildProfile } from '../../services/profile';
import { fillFormQuestions } from '../../services/ai';
import useWellnessMessage from '../../hooks/useWellnessMessage';

// Parse AI response into structured Q&A pairs
function parseAnswers(text) {
  // Expected format from AI: lines starting with Q: and A: (or **Q:** / **A:**)
  const pairs = [];
  const lines = text.split('\n');
  let currentQ = null;
  let currentA = [];

  for (const line of lines) {
    const qMatch = line.match(/^\*{0,2}Q\d*[:.]\*{0,2}\s*(.+)/i);
    const aMatch = line.match(/^\*{0,2}A\d*[:.]\*{0,2}\s*(.*)/i);

    if (qMatch) {
      // Save previous pair
      if (currentQ && currentA.length > 0) {
        pairs.push({ question: currentQ, answer: currentA.join('\n').trim() });
      }
      currentQ = qMatch[1].trim();
      currentA = [];
    } else if (aMatch) {
      currentA.push(aMatch[1]);
    } else if (currentA.length > 0 || (currentQ && !line.match(/^---/))) {
      // Continuation line for the current answer
      if (currentQ) currentA.push(line);
    }
  }
  // Save last pair
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

function AnswerCard({ pair, index }) {
  const [expanded, setExpanded] = useState(true);
  const isPersonal = pair.answer.includes('⚠') || pair.answer.toLowerCase().includes('answer this personally');

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
            <div className="flex items-start gap-2">
              <AlertTriangle size={13} className="text-salve-amber shrink-0 mt-0.5" />
              <div className="flex-1">
                <AIMarkdown compact>{pair.answer}</AIMarkdown>
              </div>
            </div>
          ) : (
            <div className="bg-salve-card2 rounded-lg px-3 py-2.5">
              <p className="text-[13px] text-salve-text font-montserrat m-0 leading-relaxed whitespace-pre-wrap">
                {pair.answer.replace(/^\*{2}|^\*{2}$/g, '')}
              </p>
            </div>
          )}
          <div className="flex justify-end mt-2">
            <CopyButton text={pair.answer.replace(/⚠\s*/g, '')} label="Copy answer" />
          </div>
        </div>
      )}
    </Card>
  );
}

export default function FormHelper({ data }) {
  const [questions, setQuestions] = useState('');
  const [results, setResults] = useState(null); // { pairs, raw }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef(null);
  const wellness = useWellnessMessage(10000);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setQuestions(text);
    } catch { /* clipboard not available */ }
  };

  const handleGenerate = async () => {
    if (!questions.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    try {
      const profile = buildProfile(data);
      const raw = await fillFormQuestions(questions, profile);
      const pairs = parseAnswers(raw);
      if (pairs.length === 0) {
        // Fallback: show raw response if parsing fails
        setResults({ pairs: [{ question: 'Form responses', answer: raw }], raw });
      } else {
        setResults({ pairs, raw });
      }
    } catch (e) {
      setError(e.message || 'Failed to generate answers. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!results) return;
    const text = results.pairs
      .map((p, i) => `${i + 1}. ${p.question}\n${p.answer.replace(/⚠\s*/g, '')}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <AIConsentGate>
      <div className="space-y-4">
        <p className="text-sm text-salve-textFaint font-montserrat px-1 mt-1 mb-0">
          Paste questions from a new patient form and Sage will draft answers from your health records. Review each answer before submitting.
        </p>

        {/* Input */}
        {!results && (
          <Card>
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-montserrat font-semibold text-salve-text">
                  Form questions
                </label>
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1 text-[10px] text-salve-lav hover:text-salve-lavDim bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  aria-label="Paste from clipboard"
                >
                  <ClipboardPaste size={11} />
                  Paste
                </button>
              </div>
              <textarea
                ref={textareaRef}
                value={questions}
                onChange={e => setQuestions(e.target.value)}
                placeholder={'Paste the form questions here...\n\nExample:\nWhat medications are you currently taking?\nDo you have any allergies?\nWho is your primary care physician?'}
                rows={10}
                className="w-full py-2.5 px-3.5 rounded-lg border border-salve-border text-sm font-montserrat text-salve-text bg-salve-card2 box-border focus:outline-none field-magic transition-colors resize-y leading-relaxed"
              />

              <div className="flex items-center gap-3">
                <Button onClick={handleGenerate} disabled={!questions.trim() || loading}>
                  <Sparkles size={14} />
                  {loading ? 'Generating...' : 'Generate Answers'}
                </Button>
                {questions.trim() && !loading && (
                  <span className="text-[10px] text-salve-textFaint font-montserrat">
                    {questions.split('\n').filter(l => l.trim() && l.trim().endsWith('?')).length || '—'} questions detected
                  </span>
                )}
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
                Sage is reviewing your records...
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
                {results.pairs.length} answer{results.pairs.length !== 1 ? 's' : ''} generated
              </p>
              <div className="flex items-center gap-3">
                <CopyButton text={results.pairs.map((p, i) => `${i + 1}. ${p.question}\n${p.answer.replace(/⚠\s*/g, '')}`).join('\n\n')} label="Copy all" />
                <button
                  onClick={() => { setResults(null); setQuestions(''); }}
                  className="flex items-center gap-1 text-[10px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors p-0"
                  aria-label="Start over"
                >
                  <RotateCcw size={10} />
                  New form
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {results.pairs.map((pair, i) => (
                <AnswerCard key={i} pair={pair} index={i} />
              ))}
            </div>

            <Card className="!border-salve-border/50">
              <p className="text-[10px] text-salve-textFaint font-montserrat italic text-center m-0 leading-relaxed">
                Review all answers before submitting. Sage drafts responses from your health records — some questions may need your personal input. Answers marked with ⚠ require you to respond directly.
              </p>
            </Card>
          </>
        )}
      </div>
    </AIConsentGate>
  );
}
