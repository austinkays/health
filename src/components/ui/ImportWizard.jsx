/**
 * ImportWizard - generic UI shell for any data import parser.
 *
 * Each parser (Clue, Daylio, Samsung Health, etc.) provides a metadata
 * object + a parse function. This component handles the rest: file drop,
 * progress bar, detect, dedupe against existing data, preview, confirm,
 * bulkAdd, and error/done states.
 *
 * Usage:
 *
 *   <ImportWizard
 *     parser={clueParser}   // { META, detect, parse } from services/clue.js
 *     data={data}
 *     reloadData={reloadData}
 *   />
 *
 * Parser contract (each service file exports):
 *
 *   export const META = {
 *     id: 'clue',
 *     accept: '.csv,.zip',
 *     inputType: 'text' | 'json' | 'zip',
 *     walkthrough: ['Step 1...', 'Step 2...'],
 *   };
 *
 *   export function detect(content) { return boolean }
 *
 *   // Returns { vitals?, activities?, cycles?, journal_entries?, labs?, counts? }
 *   // For zip inputs, content is a JSZip instance.
 *   export async function parse(content, { onProgress }) { ... }
 */

import { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import DropZone from './DropZone';
import { readFileAsText, readFileAsArrayBuffer, deduplicateAgainst, DEDUP_KEYS } from '../../services/_parse';
import { db } from '../../services/db';
import { trackEvent, EVENTS } from '../../services/analytics';

// Human labels for each table used in the preview card.
const TABLE_LABEL = {
  vitals:          'Vitals (sleep, HR, weight, glucose, etc.)',
  activities:      'Workouts & activity',
  cycles:          'Cycle & period entries',
  journal_entries: 'Journal entries',
  labs:            'Lab results',
};

const TABLE_ORDER = ['vitals', 'activities', 'cycles', 'journal_entries', 'labs'];

export default function ImportWizard({ parser, data, reloadData }) {
  const { META, detect, parse } = parser;
  const [stage, setStage] = useState('idle'); // idle, parsing, preview, importing, done, error
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const reset = () => {
    setStage('idle');
    setProgress(0);
    setPreview(null);
    setError('');
    setResult(null);
  };

  /* ── Shared dedup + preview builder ───────────────────── */
  const finishParsing = (parsed) => {
    const existing = {
      vitals:          data.vitals || [],
      activities:      data.activities || [],
      cycles:          data.cycles || [],
      journal_entries: data.journal || [],
      labs:            data.labs || [],
    };

    const newData = {};
    const counts = {};
    const skipped = {};
    let totalNew = 0;
    let totalSkipped = 0;

    for (const table of TABLE_ORDER) {
      const incoming = parsed[table] || [];
      if (!incoming.length) continue;
      const fresh = deduplicateAgainst(incoming, existing[table], DEDUP_KEYS[table]);
      newData[table] = fresh;
      counts[table] = fresh.length;
      skipped[table] = incoming.length - fresh.length;
      totalNew += fresh.length;
      totalSkipped += skipped[table];
    }

    setPreview({
      new: counts,
      skipped,
      totalNew,
      totalSkipped,
      data: newData,
      tooOld: parsed.counts?.tooOld || 0,
    });
    setStage('preview');
  };

  /* ── File handler ─────────────────────────────────────── */
  const handleFile = async (file) => {
    if (!file) return;
    setStage('parsing');
    setProgress(0);
    setError('');

    try {
      let input;

      if (META.inputType === 'zip' || (file.name || '').toLowerCase().endsWith('.zip')) {
        setProgress(5);
        const JSZip = (await import('jszip')).default;
        const buf = await readFileAsArrayBuffer(file);
        setProgress(15);
        input = await JSZip.loadAsync(buf);
        setProgress(25);
      } else if (META.inputType === 'json') {
        const text = await readFileAsText(file);
        try { input = JSON.parse(text); }
        catch { throw new Error("This file isn't valid JSON. Double check you uploaded the right export."); }
      } else {
        input = await readFileAsText(file);
      }

      if (detect && !detect(input)) {
        throw new Error(`This doesn't look like a ${META.label} export. Double check you uploaded the right file.`);
      }

      const parsed = await parse(input, {
        onProgress: (p) => setProgress(Math.min(95, 25 + Math.round(p * 0.7))),
      });
      setProgress(100);

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parser returned no data. The file may be empty or in an unexpected format.');
      }

      finishParsing(parsed);
    } catch (err) {
      console.error(`[${META.id} import]`, err);
      setError(err.message || `Failed to parse ${META.label} export`);
      setStage('error');
    }
  };

  /* ── Confirmed import ─────────────────────────────────── */
  const doImport = async () => {
    if (!preview?.data) return;
    setStage('importing');
    try {
      const counts = {};
      for (const table of TABLE_ORDER) {
        const rows = preview.data[table];
        if (!rows || !rows.length) continue;
        // journal_entries is the actual table name, db.journal is the service name
        const tableName = table === 'journal_entries' ? 'journal_entries' : table;
        await db.bulkAdd(tableName, rows);
        counts[table] = rows.length;
      }
      setResult(counts);
      trackEvent(`${EVENTS.IMPORT_COMPLETED}:${META.id}`);
      setStage('done');
      reloadData();
    } catch (err) {
      console.error(`[${META.id} import]`, err);
      setError(err.message || 'Import failed');
      setStage('error');
    }
  };

  /* ── Render ───────────────────────────────────────────── */

  if (stage === 'parsing') {
    return (
      <Card>
        <div className="text-center py-6">
          <Loader2 size={28} className="animate-spin text-salve-sage mx-auto mb-3" />
          <p className="text-sm text-salve-text font-montserrat mb-2">Parsing {META.label} data...</p>
          <div className="w-full bg-salve-card2 rounded-full h-1.5 mb-1">
            <div className="bg-salve-sage h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[12px] text-salve-textFaint">{progress}%</p>
        </div>
      </Card>
    );
  }

  if (stage === 'preview' && preview) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 size={16} className="text-salve-sage" />
          <span className="text-sm font-semibold text-salve-text font-montserrat">Import Preview</span>
        </div>

        <div className="space-y-1.5 mb-3">
          {TABLE_ORDER.map(t => (
            preview.new[t] > 0 && (
              <div key={t} className="flex justify-between text-xs text-salve-textMid font-montserrat">
                <span>{TABLE_LABEL[t]}</span>
                <span className="text-salve-sage font-semibold">{preview.new[t]} new</span>
              </div>
            )
          ))}
          {preview.tooOld > 0 && (
            <div className="text-[12px] text-salve-textFaint italic">
              {preview.tooOld.toLocaleString()} older records skipped
            </div>
          )}
          {preview.totalSkipped > 0 && (
            <div className="text-[12px] text-salve-textFaint italic">
              {preview.totalSkipped} duplicate{preview.totalSkipped !== 1 ? 's' : ''} will be skipped
            </div>
          )}
        </div>

        {preview.totalNew === 0 ? (
          <div className="text-center py-2">
            <p className="text-xs text-salve-textFaint italic mb-2">All records already exist, nothing new to import.</p>
            <button onClick={reset} className="text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Back</button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="lavender" onClick={doImport} className="flex-1 justify-center">
              Import {preview.totalNew} record{preview.totalNew !== 1 ? 's' : ''}
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
          <p className="text-sm text-salve-text font-montserrat">Importing records...</p>
        </div>
      </Card>
    );
  }

  if (stage === 'done' && result) {
    const parts = [];
    for (const t of TABLE_ORDER) {
      if (result[t]) {
        const label = t === 'journal_entries' ? 'journal entries' : t === 'activities' ? 'workouts' : t;
        parts.push(`${result[t]} ${label}`);
      }
    }
    return (
      <Card>
        <div className="text-center py-4">
          <CheckCircle2 size={28} className="text-salve-sage mx-auto mb-2" />
          <p className="text-sm text-salve-text font-semibold font-montserrat mb-1">Import Complete</p>
          <p className="text-xs text-salve-textMid font-montserrat">{parts.join(', ')} added to your health data.</p>
          <button onClick={reset} className="mt-3 text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Import more</button>
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
          <p className="text-xs text-salve-textMid font-montserrat">{error}</p>
          <button onClick={reset} className="mt-3 text-xs text-salve-lav bg-transparent border-none cursor-pointer font-montserrat hover:underline">Try again</button>
        </div>
      </Card>
    );
  }

  // Idle state, file picker + walkthrough
  return (
    <Card>
      {META.tagline && (
        <p className="text-[15px] text-salve-text font-medium leading-relaxed mb-3">
          {META.tagline}
        </p>
      )}
      {META.walkthrough && META.walkthrough.length > 0 && (
        <ol className="text-[14px] text-salve-textMid space-y-1.5 leading-relaxed list-decimal pl-5 mb-4">
          {META.walkthrough.map((step, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: step }} />
          ))}
        </ol>
      )}

      <DropZone
        onFile={handleFile}
        accept={META.accept}
        label={`Drop ${META.label} export here`}
        hint={META.hint || `${META.accept} file from ${META.label}`}
        className="mb-3"
      />

      <input
        ref={fileRef}
        type="file"
        accept={META.accept}
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        variant="lavender"
        onClick={() => fileRef.current?.click()}
        className="w-full justify-center md:hidden"
      >
        <Upload size={15} /> Upload {META.label} Export
      </Button>
    </Card>
  );
}
