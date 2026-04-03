import { useState, useRef } from 'react';
import { Apple, Upload, Loader2, CheckCircle2, AlertTriangle, Clipboard } from 'lucide-react';
import Card from './Card';
import Button from './Button';
import { C } from '../../constants/colors';
import { detectAppleHealthFormat, detectAppleHealthJSON, parseAppleHealthExport, deduplicateAgainst, DEDUP_KEYS, parseFhirToLab } from '../../services/healthkit';
import { db } from '../../services/db';

export default function AppleHealthImport({ data, reloadData }) {
  const [stage, setStage] = useState('idle'); // idle, parsing, preview, importing, done, error, paste
  const [progress, setProgress] = useState(0);
  const [pasteText, setPasteText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const fileRef = useRef();

  const reset = () => {
    setStage('idle');
    setProgress(0);
    setPreview(null);
    setError('');
    setResult(null);
  };

  /* ── Shared: dedup + preview ──────────────────────────── */
  const finishParsing = (parsed) => {
    const newVitals = deduplicateAgainst(parsed.vitals, data.vitals || [], DEDUP_KEYS.vitals);
    const newLabs = deduplicateAgainst(parsed.labs, data.labs || [], DEDUP_KEYS.labs);
    const newActivities = deduplicateAgainst(parsed.activities, data.activities || [], DEDUP_KEYS.activities);

    setPreview({
      total: parsed.counts,
      tooOld: parsed.counts.tooOld || 0,
      new: { vitals: newVitals.length, labs: newLabs.length, activities: newActivities.length },
      skipped: {
        vitals: parsed.vitals.length - newVitals.length,
        labs: parsed.labs.length - newLabs.length,
        activities: parsed.activities.length - newActivities.length,
      },
      data: { vitals: newVitals, labs: newLabs, activities: newActivities },
    });
    setStage('preview');
  };

  /* ── File handler ────────────────────────────────────── */
  const handleFile = async (file) => {
    if (!file) return;
    setStage('parsing');
    setProgress(0);
    setError('');

    try {
      let xmlText;

      let clinicalLabs = [];

      if (file.name.endsWith('.zip')) {
        setProgress(5);
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const allFiles = Object.keys(zip.files);
        // Prefer export.xml specifically (may be inside apple_health_export/ folder)
        const xmlFile = allFiles.find(n => n.endsWith('/export.xml') || n === 'export.xml')
          || allFiles.find(n => n.endsWith('.xml') && !n.includes('cda'));
        if (!xmlFile) throw new Error('No export.xml found in ZIP. Make sure this is an Apple Health export.');

        // Get arraybuffer — parser handles chunked decoding internally
        setProgress(10);
        const buf = await zip.files[xmlFile].async('arraybuffer');
        setProgress(20);

        // Parse FHIR JSON files from clinical-records folder
        const clinicalFiles = allFiles.filter(n => n.includes('clinical-records') && n.endsWith('.json'));
        for (const cf of clinicalFiles) {
          try {
            const json = JSON.parse(await zip.files[cf].async('string'));
            const lab = parseFhirToLab(json);
            if (lab) {
              if (Array.isArray(lab)) clinicalLabs.push(...lab);
              else clinicalLabs.push(lab);
            }
          } catch { /* skip unparseable files */ }
        }
        // For ZIP, we pass the ArrayBuffer directly — parser decodes in chunks
        const parsed = parseAppleHealthExport(buf, {
          onProgress: (p) => setProgress(20 + Math.round(p * 0.7)),
        });

        // Merge clinical-records folder labs
        if (clinicalLabs.length) {
          parsed.labs.push(...clinicalLabs);
          parsed.counts.labs += clinicalLabs.length;
        }

        return finishParsing(parsed);
      } else {
        xmlText = await file.text();
      }

      if (!detectAppleHealthFormat(xmlText)) {
        throw new Error('This doesn\'t look like an Apple Health export. Expected a file containing <HealthData>.');
      }

      const parsed = parseAppleHealthExport(xmlText, {
        onProgress: (p) => setProgress(Math.max(10, p)),
      });
      return finishParsing(parsed);
    } catch (err) {
      setError(err.message || 'Failed to parse Apple Health export');
      setStage('error');
    }
  };

  /* ── Paste from textarea (iOS Shortcut) ─────────────── */
  const processPaste = () => {
    if (!pasteText.trim()) return;
    try {
      const parsed = JSON.parse(pasteText.trim());
      if (!detectAppleHealthJSON(parsed)) {
        throw new Error('Data is not from the Salve Health Shortcut. Expected { _source: "salve-healthkit-shortcut" }');
      }

      const newVitals = deduplicateAgainst(parsed.vitals || [], data.vitals || [], DEDUP_KEYS.vitals);
      const newActivities = deduplicateAgainst(parsed.activities || [], data.activities || [], DEDUP_KEYS.activities);

      setPreview({
        total: { vitals: (parsed.vitals || []).length, activities: (parsed.activities || []).length, labs: 0 },
        new: { vitals: newVitals.length, labs: 0, activities: newActivities.length },
        skipped: {
          vitals: (parsed.vitals || []).length - newVitals.length,
          labs: 0,
          activities: (parsed.activities || []).length - newActivities.length,
        },
        data: { vitals: newVitals, labs: [], activities: newActivities },
      });
      setPasteText('');
      setStage('preview');
    } catch (err) {
      setError(err.message || 'Could not parse data');
      setStage('error');
    }
  };

  /* ── Import confirmed ───────────────────────────────── */
  const doImport = async () => {
    if (!preview?.data) return;
    setStage('importing');
    try {
      const counts = { vitals: 0, labs: 0, activities: 0 };
      if (preview.data.vitals.length) {
        await db.bulkAdd('vitals', preview.data.vitals);
        counts.vitals = preview.data.vitals.length;
      }
      if (preview.data.labs.length) {
        await db.bulkAdd('labs', preview.data.labs);
        counts.labs = preview.data.labs.length;
      }
      if (preview.data.activities.length) {
        await db.bulkAdd('activities', preview.data.activities);
        counts.activities = preview.data.activities.length;
      }
      setResult(counts);
      setStage('done');
      reloadData();
    } catch (err) {
      setError(err.message || 'Import failed');
      setStage('error');
    }
  };

  /* ── Render ─────────────────────────────────────────── */

  // Parsing state
  if (stage === 'parsing') {
    return (
      <Card>
        <div className="text-center py-6">
          <Loader2 size={28} className="animate-spin text-salve-sage mx-auto mb-3" />
          <p className="text-sm text-salve-text font-montserrat mb-2">Parsing Apple Health data...</p>
          <div className="w-full bg-salve-card2 rounded-full h-1.5 mb-1">
            <div className="bg-salve-sage h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-[10px] text-salve-textFaint">{progress}%</p>
        </div>
      </Card>
    );
  }

  // Preview state
  if (stage === 'preview' && preview) {
    const totalNew = preview.new.vitals + preview.new.labs + preview.new.activities;
    const totalSkipped = preview.skipped.vitals + preview.skipped.labs + preview.skipped.activities;

    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Apple size={16} className="text-salve-sage" />
          <span className="text-sm font-semibold text-salve-text font-montserrat">Import Preview</span>
        </div>

        <div className="space-y-1.5 mb-3">
          {preview.new.vitals > 0 && (
            <div className="flex justify-between text-xs text-salve-textMid font-montserrat">
              <span>Vitals (steps, HR, sleep, etc.)</span>
              <span className="text-salve-sage font-semibold">{preview.new.vitals} new</span>
            </div>
          )}
          {preview.new.activities > 0 && (
            <div className="flex justify-between text-xs text-salve-textMid font-montserrat">
              <span>Workouts</span>
              <span className="text-salve-sage font-semibold">{preview.new.activities} new</span>
            </div>
          )}
          {preview.new.labs > 0 && (
            <div className="flex justify-between text-xs text-salve-textMid font-montserrat">
              <span>Lab results</span>
              <span className="text-salve-sage font-semibold">{preview.new.labs} new</span>
            </div>
          )}
          {preview.tooOld > 0 && (
            <div className="text-[10px] text-salve-textFaint italic">
              {preview.tooOld.toLocaleString()} older records skipped (6+ months ago)
            </div>
          )}
          {totalSkipped > 0 && (
            <div className="text-[10px] text-salve-textFaint italic">
              {totalSkipped} duplicate{totalSkipped !== 1 ? 's' : ''} will be skipped
            </div>
          )}
        </div>

        {totalNew === 0 ? (
          <div className="text-center py-2">
            <p className="text-xs text-salve-textFaint italic mb-2">All records already exist — nothing new to import.</p>
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

  // Importing state
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

  // Done state
  if (stage === 'done' && result) {
    const parts = [];
    if (result.vitals) parts.push(`${result.vitals} vitals`);
    if (result.activities) parts.push(`${result.activities} workouts`);
    if (result.labs) parts.push(`${result.labs} labs`);

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

  // Error state
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

  // Paste state — textarea for iOS Shortcut data
  if (stage === 'paste') {
    return (
      <Card>
        <p className="text-[13px] text-salve-text font-medium leading-relaxed mb-2">Paste from iOS Shortcut</p>
        <p className="text-[11px] text-salve-textFaint mb-2 leading-relaxed">
          Run the Salve Health Shortcut on your iPhone, then paste the output below.
        </p>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          placeholder="Paste JSON data here..."
          className="w-full bg-salve-card2 border border-salve-border rounded-lg px-3 py-2 text-[12px] text-salve-text font-montserrat outline-none focus:border-salve-sage placeholder:text-salve-textFaint resize-y min-h-[80px]"
          rows={4}
        />
        <div className="flex gap-2 mt-2">
          <Button variant="lavender" onClick={processPaste} className="flex-1 justify-center" disabled={!pasteText.trim()}>
            Import
          </Button>
          <button onClick={reset} className="text-xs text-salve-textFaint bg-transparent border-none cursor-pointer font-montserrat hover:text-salve-text px-2">Cancel</button>
        </div>
      </Card>
    );
  }

  // Idle state — file picker + paste button
  return (
    <Card>
      <p className="text-[13px] text-salve-text font-medium leading-relaxed mb-3">
        Import vitals, workouts, and lab results from Apple Health.
      </p>
      <ol className="text-[12px] text-salve-textMid space-y-1.5 leading-relaxed list-decimal pl-5 mb-4">
        <li>Open the <strong className="text-salve-text">Health</strong> app on your iPhone</li>
        <li>Tap your <strong className="text-salve-text">profile picture</strong> (top right)</li>
        <li>Tap <strong className="text-salve-text">Export All Health&nbsp;Data</strong></li>
        <li>AirDrop or save the .zip file to this device</li>
        <li>Upload it below</li>
      </ol>

      <input
        ref={fileRef}
        type="file"
        accept=".xml,.zip"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <Button
        variant="lavender"
        onClick={() => fileRef.current?.click()}
        className="w-full justify-center mb-2"
      >
        <Upload size={15} /> Upload Apple Health Export
      </Button>

      <button
        onClick={() => setStage('paste')}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-medium font-montserrat cursor-pointer transition-colors bg-salve-card2 border border-salve-border text-salve-textMid hover:border-salve-sage/40 hover:text-salve-sage"
      >
        <Clipboard size={13} /> Paste from iOS Shortcut
      </button>
    </Card>
  );
}
