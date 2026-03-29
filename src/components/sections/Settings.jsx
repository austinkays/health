import { useState, useRef } from 'react';
import { Trash2, Download, Upload, ShieldOff, Shield, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';
import { generateHealthSummary } from '../../services/ai';

export default function Settings({ data, updateSettings, eraseAll, reloadData }) {
  const s = data.settings;
  const set = (k, v) => updateSettings({ [k]: v });
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [aiConsent, setAiConsent] = useState(() => hasAIConsent());

  // Import state
  const [importFile, setImportFile] = useState(null);
  const [importData, setImportData] = useState(null);
  const [importValidation, setImportValidation] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const fileInputRef = useRef(null);

  // AI Health Summary state
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState(null);
  const [showPostImportPrompt, setShowPostImportPrompt] = useState(false);

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    setImportError(null);
    setImportData(null);
    setImportValidation(null);

    if (!file.name.endsWith('.json')) {
      setImportError('Please select a .json file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);

        // Check if file is encrypted
        if (parsed._encrypted) {
          setImportFile(file.name);
          setImportData(parsed);
          setImportValidation({ encrypted: true });
          return;
        }

        const validation = validateImport(parsed);

        if (!validation.valid) {
          setImportError(validation.error);
          return;
        }

        setImportFile(file.name);
        setImportData(parsed);
        setImportValidation(validation);
      } catch {
        setImportError('Could not parse file. Make sure it is valid JSON.');
      }
    };
    reader.readAsText(file);
  }

  async function executeImport() {
    if (!importValidation) return;

    setImporting(true);
    setImportError(null);

    try {
      if (importValidation.mode === 'merge') {
        const stats = await importMerge(importValidation.normalized);
        const addedTotal = Object.values(stats.added).reduce((s, n) => s + n, 0);
        const skippedTotal = Object.values(stats.skipped).reduce((s, n) => s + n, 0);

        const parts = [];
        for (const [key, count] of Object.entries(stats.added)) {
          parts.push(`${count} ${key}`);
        }

        setImportResult(
          addedTotal > 0
            ? `Added ${parts.join(', ')}. Skipped ${skippedTotal} existing records.`
            : `All ${skippedTotal} records already exist. Nothing new to add.`
        );

        await reloadData();
        if (hasAIConsent()) setShowPostImportPrompt(true);
      } else {
        await importRestore(importValidation.normalized);
        setImportResult('Full restore complete. Reloading...');
        setTimeout(() => window.location.reload(), 1500);
        return;
      }

      setImportData(null);
      setImportValidation(null);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      setImportError('Import failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    const exported = await exportAll();
    const json = JSON.stringify(exported, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salve-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleEncryptedExport() {
    if (!exportPassphrase || exportPassphrase.length < 6) {
      setExportError('Passphrase must be at least 6 characters.');
      return;
    }
    setExportError(null);
    try {
      const exported = await exportAll();
      const encrypted = await encryptExport(exported, exportPassphrase);
      const blob = new Blob([encrypted], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `salve-backup-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setExportPassphrase('');
    } catch {
      setExportError('Encryption failed.');
    }
  }

  async function handleGenerateSummary() {
    setGeneratingSummary(true);
    setSummaryError(null);
    try {
      const summary = await generateHealthSummary(data);
      await updateSettings({
        ai_health_summary: summary,
        ai_summary_updated_at: new Date().toISOString(),
      });
    } catch (e) {
      setSummaryError('Failed to generate summary: ' + e.message);
    } finally {
      setGeneratingSummary(false);
      setShowPostImportPrompt(false);
    }
  }

  function cancelImport() {
    setImportData(null);
    setImportValidation(null);
    setImportFile(null);
    setImportError(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="mt-2">
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Field label="Your Name" value={s.name || ''} onChange={v => set('name', v)} placeholder="How should we greet you?" />
        <Field label="Location" value={s.location || ''} onChange={v => set('location', v)} placeholder="City, State" />
      </Card>

      <SectionTitle>AI Companion</SectionTitle>
      <Card>
        <Field
          label="AI Mode"
          value={s.ai_mode || 'onDemand'}
          onChange={v => set('ai_mode', v)}
          options={[
            { value: 'alwaysOn', label: '✨ Always On' },
            { value: 'onDemand', label: '☽ On Demand' },
            { value: 'off', label: '✧ Off — tracker only' },
          ]}
        />
        <p className="text-xs text-salve-textFaint italic leading-relaxed mt-1">
          AI features use your health profile for personalized insights.
        </p>
      </Card>

      {aiConsent && (
        <Card className="!mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-salve-sage" />
              <span className="text-[13px] text-salve-textMid">AI data sharing enabled</span>
            </div>
            <button
              onClick={() => { revokeAIConsent(); setAiConsent(false); }}
              className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline"
            >
              Revoke
            </button>
          </div>
        </Card>
      )}

      <SectionTitle>Pharmacy</SectionTitle>
      <Card>
        <Field label="Preferred Pharmacy" value={s.pharmacy || ''} onChange={v => set('pharmacy', v)} placeholder="Name & location" />
      </Card>

      <SectionTitle>Insurance</SectionTitle>
      <Card>
        <Field label="Plan" value={s.insurance_plan || ''} onChange={v => set('insurance_plan', v)} placeholder="e.g. Kaiser HMO" />
        <Field label="Member ID" value={s.insurance_id || ''} onChange={v => set('insurance_id', v)} placeholder="Member ID" />
        <Field label="Group #" value={s.insurance_group || ''} onChange={v => set('insurance_group', v)} placeholder="Group number" />
        <Field label="Member Services" value={s.insurance_phone || ''} onChange={v => set('insurance_phone', v)} type="tel" placeholder="Phone" />
      </Card>

      <SectionTitle>Health Background</SectionTitle>

      {/* AI-Generated Health Summary */}
      <Card>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles size={14} className="text-salve-lav" />
          <span className="text-[13px] font-medium text-salve-text">AI Health Summary</span>
        </div>
        <p className="text-xs text-salve-textMid mb-3 leading-relaxed italic">
          Auto-generated from all your health data. Cross-references conditions, medications, labs, and more to build a complete picture for the AI.
        </p>

        {s.ai_health_summary ? (
          <>
            <div className="bg-salve-bg border border-salve-border rounded-lg p-3 mb-3 max-h-64 overflow-y-auto">
              <p className="text-[13px] text-salve-text leading-relaxed whitespace-pre-wrap">{s.ai_health_summary}</p>
            </div>
            {s.ai_summary_updated_at && (
              <p className="text-[11px] text-salve-textFaint mb-3">
                Last updated: {new Date(s.ai_summary_updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
            <button
              onClick={handleGenerateSummary}
              disabled={generatingSummary || !hasAIConsent()}
              className="w-full py-2.5 rounded-lg bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm
                hover:bg-salve-border transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {generatingSummary ? (
                <><Loader2 size={14} className="animate-spin" /> Regenerating...</>
              ) : (
                <><RefreshCw size={14} /> Regenerate Summary</>
              )}
            </button>
          </>
        ) : (
          <button
            onClick={handleGenerateSummary}
            disabled={generatingSummary || !hasAIConsent()}
            className="w-full py-3 rounded-xl bg-salve-lav/15 border border-salve-lav/30 text-salve-lav font-medium text-sm
              hover:bg-salve-lav/25 transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            {generatingSummary ? (
              <><Loader2 size={14} className="animate-spin" /> Generating Summary...</>
            ) : (
              <><Sparkles size={14} /> Generate AI Health Summary</>
            )}
          </button>
        )}

        {!hasAIConsent() && !s.ai_health_summary && (
          <p className="text-xs text-salve-textFaint mt-2 italic">
            Enable AI data sharing above to generate a health summary.
          </p>
        )}

        {summaryError && (
          <div className="mt-3 p-3 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-sm">
            {summaryError}
          </div>
        )}
      </Card>

      {/* Post-import summary prompt */}
      {showPostImportPrompt && (
        <Card className="!mt-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-salve-sage" />
            <span className="text-[13px] font-medium text-salve-sage">Data imported</span>
          </div>
          <p className="text-xs text-salve-textMid mb-3 leading-relaxed">
            Your data has been updated. Would you like to regenerate the AI health summary with the new data?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleGenerateSummary}
              disabled={generatingSummary}
              className="flex-1 py-2 rounded-lg bg-salve-sage/20 text-salve-sage text-sm font-medium hover:bg-salve-sage/30 transition-colors disabled:opacity-40"
            >
              {generatingSummary ? 'Generating...' : 'Yes, Regenerate'}
            </button>
            <button
              onClick={() => setShowPostImportPrompt(false)}
              className="px-4 py-2 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors"
            >
              Skip
            </button>
          </div>
        </Card>
      )}

      {/* Manual health background notes */}
      <Card className="!mt-2">
        <p className="text-xs text-salve-textMid mb-2.5 leading-relaxed italic">
          Your personal notes — always preserved, never overwritten by AI.
        </p>
        <Field
          label="Background & Context"
          value={s.health_background || ''}
          onChange={v => set('health_background', v)}
          textarea
          placeholder="e.g. I've had chronic fatigue since 2019, my pain flares are worst in cold weather..."
        />
      </Card>

      <SectionTitle>Data</SectionTitle>
      <Card>
        <p className="text-[13px] text-salve-textMid mb-3.5 leading-relaxed">
          All data is synced to your account and available across devices.
        </p>
        {showEraseConfirm ? (
          <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
            <p className="text-[13px] text-salve-rose font-medium mb-2.5">
              Permanently erase ALL health data? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={eraseAll} className="text-xs">
                <Trash2 size={14} /> Yes, Erase Everything
              </Button>
              <Button variant="ghost" onClick={() => setShowEraseConfirm(false)} className="text-xs">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setShowEraseConfirm(true)} className="text-xs">
            <Trash2 size={14} /> Erase All Data
          </Button>
        )}
      </Card>

      <SectionTitle>Import Data</SectionTitle>
      <Card>
        <p className="text-[13px] text-salve-textMid mb-3.5 leading-relaxed">
          Upload a backup file or a health sync file.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="block w-full text-sm text-salve-textMid
            file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
            file:text-sm file:font-medium file:bg-salve-card2 file:text-salve-lav
            file:cursor-pointer hover:file:bg-salve-border cursor-pointer"
        />

        {importError && (
          <div className="mt-3 p-3 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-sm">
            {importError}
          </div>
        )}

        {importValidation && importValidation.encrypted && (
          <div className="mt-4 p-4 rounded-xl bg-salve-card2 border border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-2 block">Encrypted Backup</span>
            <p className="text-[13px] text-salve-textMid mb-3">Enter the passphrase to decrypt this backup file.</p>
            <input
              type="password"
              value={importPassphrase}
              onChange={e => setImportPassphrase(e.target.value)}
              placeholder="Passphrase"
              className="w-full bg-salve-bg border border-salve-border rounded-lg px-3 py-2 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-3"
            />
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (!importPassphrase) { setImportError('Passphrase is required.'); return; }
                  setImportError(null);
                  try {
                    const decrypted = await decryptExport(importData, importPassphrase);
                    const validation = validateImport(decrypted);
                    if (!validation.valid) { setImportError(validation.error); return; }
                    setImportData(decrypted);
                    setImportValidation(validation);
                    setImportPassphrase('');
                  } catch {
                    setImportError('Incorrect passphrase or corrupted file.');
                  }
                }}
                className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-salve-lav/20 text-salve-lav hover:bg-salve-lav/30 transition-colors"
              >
                Decrypt
              </button>
              <button onClick={cancelImport} className="px-4 py-2.5 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {importValidation && !importValidation.encrypted && (
          <div className="mt-4 p-4 rounded-xl bg-salve-card2 border border-salve-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint">
                {importValidation.mode === 'merge' ? 'Sync Preview' : 'Restore Preview'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-md ${
                importValidation.mode === 'merge'
                  ? 'bg-salve-sage/20 text-salve-sage'
                  : 'bg-salve-amber/20 text-salve-amber'
              }`}>
                {importValidation.mode === 'merge' ? 'Add new only' : 'Full overwrite'}
              </span>
            </div>

            <div className="space-y-1.5">
              {Object.entries(importValidation.preview).map(([key, count]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-salve-textMid capitalize">{key}</span>
                  <span className="text-salve-text">{count}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex gap-3">
              <button
                onClick={executeImport}
                disabled={importing}
                className={`flex-1 py-2.5 rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2 ${
                  importValidation.mode === 'merge'
                    ? 'bg-salve-sage/20 text-salve-sage hover:bg-salve-sage/30'
                    : 'bg-salve-amber/20 text-salve-amber hover:bg-salve-amber/30'
                } disabled:opacity-50`}
              >
                <Upload size={14} />
                {importing ? 'Importing...' : importValidation.mode === 'merge' ? 'Merge New Records' : 'Restore All Data'}
              </button>
              <button
                onClick={cancelImport}
                className="px-4 py-2.5 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors"
              >
                Cancel
              </button>
            </div>

            {importValidation.mode === 'restore' && (
              <p className="mt-3 text-xs text-salve-rose/80 leading-relaxed">
                This will replace all current data. Any records not in this file will be lost.
              </p>
            )}
          </div>
        )}

        {importResult && (
          <div className="mt-3 p-3 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-sm">
            {importResult}
          </div>
        )}
      </Card>

      <SectionTitle>Download Backup</SectionTitle>
      <Card>
        <p className="text-[13px] text-salve-textMid mb-3.5 leading-relaxed">
          Save all your health data as a JSON file. Use this to restore later or transfer to another device.
        </p>
        <button
          onClick={handleExport}
          className="w-full py-3 rounded-xl bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm
            hover:bg-salve-border transition-colors flex items-center justify-center gap-2"
        >
          <Download size={16} />
          Download Backup
        </button>

        <div className="mt-4 pt-4 border-t border-salve-border">
          <p className="text-[13px] text-salve-textMid mb-2.5 leading-relaxed">
            Or download an encrypted backup protected with a passphrase.
          </p>
          <input
            type="password"
            value={exportPassphrase}
            onChange={e => { setExportPassphrase(e.target.value); setExportError(null); }}
            placeholder="Set a passphrase (min 6 chars)"
            className="w-full bg-salve-bg border border-salve-border rounded-lg px-3 py-2 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-2.5"
          />
          {exportError && <p className="text-xs text-salve-rose mb-2">{exportError}</p>}
          <button
            onClick={handleEncryptedExport}
            disabled={!exportPassphrase}
            className="w-full py-3 rounded-xl bg-salve-card2 border border-salve-border text-salve-sage font-medium text-sm
              hover:bg-salve-border transition-colors flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Shield size={16} />
            Download Encrypted Backup
          </button>
        </div>
      </Card>

      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-1.5 mb-1.5">
          <Motif type="sparkle" size={10} color="#6e6a80" />
          <Motif type="moon" size={14} />
          <Motif type="sparkle" size={10} color="#6e6a80" />
        </div>
        <p className="text-[11px] text-salve-textFaint italic leading-relaxed">
          Personal health reference tool<br />Always consult your healthcare providers
        </p>
      </div>
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex justify-between items-center mt-6 mb-3">
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0">{children}</h2>
      {action}
    </div>
  );
}
