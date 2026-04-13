import { useState, useRef } from 'react';
import { FileText, Upload, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import DropZone from './DropZone';
import { detectCCDA, parseCCDA, deduplicateAgainst, MYCHART_DEDUP_KEYS } from '../../services/mychart';
import { db } from '../../services/db';
import { trackEvent, EVENTS } from '../../services/analytics';

// Tables in order of user-facing importance — used for preview display + insert loop
const TABLE_ORDER = [
  { key: 'conditions',    label: 'Conditions / diagnoses' },
  { key: 'medications',   label: 'Medications' },
  { key: 'allergies',     label: 'Allergies' },
  { key: 'immunizations', label: 'Immunizations' },
  { key: 'labs',          label: 'Lab results' },
  { key: 'vitals',        label: 'Vital signs' },
  { key: 'procedures',    label: 'Procedures' },
  { key: 'providers',     label: 'Providers' },
];

// Salve state keys → the array on the `data` prop used for dedup comparison
const DATA_KEY_MAP = {
  conditions:    'conditions',
  medications:   'meds',       // useHealthData exposes meds (not medications)
  allergies:     'allergies',
  immunizations: 'immunizations',
  labs:          'labs',
  vitals:        'vitals',
  procedures:    'procedures',
  providers:     'providers',
};

export default function MyChartImport({ data, reloadData }) {
  const [stage, setStage] = useState('idle'); // idle, help, parsing, preview, importing, done, error
  const [showHelp, setShowHelp] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const reset = () => {
    setStage('idle');
    setPreview(null);
    setError('');
    setResult(null);
  };

  /* ── File handler ────────────────────────────────────── */
  const handleFile = async (file) => {
    if (!file) return;
    setStage('parsing');
    setError('');

    try {
      let xmlText;
      const lowerName = (file.name || '').toLowerCase();

      if (lowerName.endsWith('.zip')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const fileNames = Object.keys(zip.files).filter(n => !zip.files[n].dir);
        // Prefer files that look like CCDA: .xml / .ccda / .ccd extension
        const candidates = fileNames
          .filter(n => /\.(xml|ccda?|ccd)$/i.test(n))
          .sort((a, b) => {
            // Prefer files without "stylesheet" or "schema" in the name
            const aStyle = /style|schema/i.test(a);
            const bStyle = /style|schema/i.test(b);
            if (aStyle && !bStyle) return 1;
            if (!aStyle && bStyle) return -1;
            // Prefer larger files (the real record, not stubs)
            return (zip.files[b]._data?.uncompressedSize || 0) - (zip.files[a]._data?.uncompressedSize || 0);
          });
        if (!candidates.length) {
          throw new Error('No XML or CCDA file found inside the ZIP.');
        }
        // Try each candidate until one parses as CCDA
        let lastErr = null;
        for (const name of candidates) {
          try {
            const text = await zip.files[name].async('string');
            if (!detectCCDA(text)) continue;
            xmlText = text;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!xmlText) {
          throw new Error(lastErr?.message || 'Could not find a MyChart / CCDA file inside the ZIP.');
        }
      } else {
        xmlText = await file.text();
      }

      if (!detectCCDA(xmlText)) {
        throw new Error('This doesn\'t look like a MyChart export. Make sure you downloaded a CCDA file (Continuity of Care Document) from MyChart → Document Center.');
      }

      const parsed = parseCCDA(xmlText);

      // Dedup each table against existing data
      const previewData = {};
      const newCounts = {};
      const skippedCounts = {};
      for (const { key } of TABLE_ORDER) {
        const existing = data[DATA_KEY_MAP[key]] || [];
        const newRecs = deduplicateAgainst(parsed[key] || [], existing, MYCHART_DEDUP_KEYS[key]);
        previewData[key] = newRecs;
        newCounts[key] = newRecs.length;
        skippedCounts[key] = (parsed[key]?.length || 0) - newRecs.length;
      }

      setPreview({ total: parsed.counts, new: newCounts, skipped: skippedCounts, data: previewData });
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Failed to parse MyChart export');
      setStage('error');
    }
  };

  /* ── Import confirmed ───────────────────────────────── */
  const doImport = async () => {
    if (!preview?.data) return;
    setStage('importing');
    try {
      const counts = {};
      for (const { key } of TABLE_ORDER) {
        const records = preview.data[key];
        if (!records?.length) continue;
        // providers uses `providers`, not `medications` etc. — all match the Salve
        // table names directly except for the odd pluralization in useHealthData
        await db.bulkAdd(key, records);
        counts[key] = records.length;
      }
      setResult(counts);
      trackEvent(`${EVENTS.IMPORT_COMPLETED}:mychart`);
      setStage('done');
      reloadData();
    } catch (err) {
      setError(err.message || 'Import failed');
      setStage('error');
    }
  };

  /* ── Render ─────────────────────────────────────────── */

  if (stage === 'parsing') {
    return (
      <Card>
        <div className="text-center py-6">
          <Loader2 size={28} className="animate-spin text-salve-sage mx-auto mb-3" />
          <p className="text-sm text-salve-text font-montserrat">Reading your MyChart export…</p>
        </div>
      </Card>
    );
  }

  if (stage === 'preview' && preview) {
    const totalNew = Object.values(preview.new).reduce((a, b) => a + b, 0);
    const totalSkipped = Object.values(preview.skipped).reduce((a, b) => a + b, 0);

    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <FileText size={16} className="text-salve-sage" />
          <span className="text-sm font-semibold text-salve-text font-montserrat">Import Preview</span>
        </div>

        <div className="space-y-1.5 mb-3">
          {TABLE_ORDER.map(({ key, label }) => {
            const n = preview.new[key] || 0;
            if (n === 0) return null;
            return (
              <div key={key} className="flex justify-between text-xs text-salve-textMid font-montserrat">
                <span>{label}</span>
                <span className="text-salve-sage font-semibold">{n} new</span>
              </div>
            );
          })}
          {totalSkipped > 0 && (
            <div className="text-[12px] text-salve-textFaint italic pt-1">
              {totalSkipped} record{totalSkipped !== 1 ? 's' : ''} already in your chart, will be skipped
            </div>
          )}
        </div>

        {totalNew === 0 ? (
          <div className="text-center py-2">
            <p className="text-xs text-salve-textFaint italic mb-2">
              Everything in this file already exists in Salve. Nothing new to import.
            </p>
            <button onClick={reset} className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Back</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="lavender" onClick={doImport} className="flex-1 justify-center">
              Import {totalNew} record{totalNew !== 1 ? 's' : ''}
            </Button>
            <button onClick={reset} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:underline px-2">Cancel</button>
          </div>
        )}
      </Card>
    );
  }

  if (stage === 'importing') {
    return (
      <Card>
        <div className="text-center py-6">
          <Loader2 size={28} className="animate-spin text-salve-sage mx-auto mb-3" />
          <p className="text-sm text-salve-text font-montserrat">Importing your health record…</p>
        </div>
      </Card>
    );
  }

  if (stage === 'done' && result) {
    const parts = [];
    for (const { key, label } of TABLE_ORDER) {
      if (result[key]) parts.push(`${result[key]} ${label.toLowerCase()}`);
    }
    return (
      <Card>
        <div className="text-center py-4">
          <CheckCircle2 size={28} className="text-salve-sage mx-auto mb-2" />
          <p className="text-sm text-salve-text font-semibold font-montserrat mb-1">Import Complete</p>
          <p className="text-xs text-salve-textMid font-montserrat leading-relaxed">
            Added: {parts.join(', ')}.
          </p>
          <button onClick={reset} className="mt-3 text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Import another file</button>
        </div>
      </Card>
    );
  }

  if (stage === 'error') {
    return (
      <Card>
        <div className="text-center py-4">
          <AlertTriangle size={28} className="text-salve-rose mx-auto mb-2" />
          <p className="text-sm text-salve-rose font-semibold font-montserrat mb-1">Import Error</p>
          <p className="text-xs text-salve-textMid font-montserrat mb-3 leading-relaxed">{error}</p>
          <button onClick={reset} className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Try again</button>
        </div>
      </Card>
    );
  }

  // Idle state — the walkthrough lives here
  return (
    <Card>
      <p className="text-[15px] text-salve-text font-medium leading-relaxed mb-2">
        Import conditions, medications, allergies, immunizations, labs, and vitals from MyChart.
      </p>
      <p className="text-[13px] text-salve-textFaint mb-3 leading-relaxed">
        Works with any hospital that uses <strong className="text-salve-textMid">Epic MyChart</strong>,{' '}
        plus most other patient portals that export CCDA files (Continuity of Care Documents).
      </p>

      <button
        onClick={() => setShowHelp(h => !h)}
        className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-lg bg-salve-card2 border border-salve-border text-[13px] text-salve-textMid font-montserrat cursor-pointer hover:border-salve-sage/40 hover:text-salve-sage transition-colors mb-3"
        aria-expanded={showHelp}
      >
        <span className="flex items-center gap-1.5">
          <HelpCircle size={13} /> How do I get my MyChart file?
        </span>
        {showHelp ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {showHelp && (
        <div className="mb-4 p-3 rounded-lg bg-salve-card2/60 border border-salve-border/50">
          <p className="text-[12px] text-salve-textFaint font-montserrat mb-2 uppercase tracking-wider">On your phone or computer</p>
          <ol className="text-[14px] text-salve-textMid space-y-1.5 leading-relaxed list-decimal pl-5 mb-3">
            <li>Sign in to <strong className="text-salve-text">MyChart</strong> (your hospital's app or website)</li>
            <li>Open the <strong className="text-salve-text">menu</strong> and search for <strong className="text-salve-text">"Document Center"</strong></li>
            <li>Tap <strong className="text-salve-text">"Visit Records"</strong> or <strong className="text-salve-text">"Requested Records"</strong></li>
            <li>Tap <strong className="text-salve-text">"Request"</strong>, choose a date range (longer is better), and pick <strong className="text-salve-text">"All chart notes"</strong> or similar</li>
            <li>When the record is ready, tap <strong className="text-salve-text">"Download"</strong> — you'll get a ZIP or XML file</li>
            <li>Upload that file below</li>
          </ol>

          <p className="text-[12px] text-salve-textFaint font-montserrat mb-1.5 uppercase tracking-wider">A few tips</p>
          <ul className="text-[13px] text-salve-textFaint space-y-1 leading-relaxed list-disc pl-5">
            <li>The file might be called <code className="text-salve-textMid">ccd.xml</code>, <code className="text-salve-textMid">VisitSummary.xml</code>, or similar</li>
            <li>You can upload the ZIP as-is — no need to unzip it first</li>
            <li>Nothing leaves your device during the import. Your data goes straight into your own Salve account.</li>
            <li>If you see multiple hospitals in your MyChart app, you'll need to download a file from each one separately</li>
          </ul>
        </div>
      )}

      <DropZone
        onFile={handleFile}
        accept=".xml,.zip,.ccda,.ccd"
        label="Drop MyChart export here"
        hint=".xml, .ccda, or .zip from your patient portal"
        className="mb-3"
      />

      <input
        ref={fileRef}
        type="file"
        accept=".xml,.zip,.ccda,.ccd"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        variant="lavender"
        onClick={() => fileRef.current?.click()}
        className="w-full justify-center md:hidden"
      >
        <Upload size={15} /> Upload MyChart File
      </Button>
    </Card>
  );
}
