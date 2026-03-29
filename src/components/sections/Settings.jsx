import { useState, useRef, useCallback } from 'react';
import { Trash2, Download, Upload, Shield, Smartphone, FileText, Lock } from 'lucide-react';
import Card from '../ui/Card';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { parseAppleHealthXML, extractZipXML, getAppleHealthPreview } from '../../services/appleHealth';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';

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
  const [processing, setProcessing] = useState(false);
  const [exportPassphrase, setExportPassphrase] = useState('');
  const [exportError, setExportError] = useState(null);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  // ── Unified file handler — auto-detects file type ──
  const processFile = useCallback(async (file) => {
    setImportResult(null);
    setImportError(null);
    setImportData(null);
    setImportValidation(null);
    setImportFile(file.name);
    setProcessing(true);

    const name = file.name.toLowerCase();

    try {
      // ── Apple Health ZIP ──
      if (name.endsWith('.zip')) {
        const xmlString = await extractZipXML(file);
        const parsed = parseAppleHealthXML(xmlString);
        const preview = getAppleHealthPreview(parsed);
        if (Object.keys(preview).length === 0) {
          setImportError('No supported health records found in this Apple Health export.');
          return;
        }
        setImportData(parsed);
        setImportValidation({ valid: true, mode: 'merge', preview, normalized: parsed, source: 'apple-health' });
        return;
      }

      // ── Apple Health XML (extracted manually) ──
      if (name.endsWith('.xml') || name === 'export.xml') {
        const text = await readFileText(file);
        const parsed = parseAppleHealthXML(text);
        const preview = getAppleHealthPreview(parsed);
        if (Object.keys(preview).length === 0) {
          setImportError('No supported health records found in this file.');
          return;
        }
        setImportData(parsed);
        setImportValidation({ valid: true, mode: 'merge', preview, normalized: parsed, source: 'apple-health' });
        return;
      }

      // ── JSON files (Salve backup, encrypted, MCP sync) ──
      if (name.endsWith('.json')) {
        const text = await readFileText(file);
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          setImportError('Could not parse file. Make sure it is valid JSON.');
          return;
        }

        // Encrypted backup
        if (parsed._encrypted) {
          setImportData(parsed);
          setImportValidation({ encrypted: true });
          return;
        }

        // Standard Salve/MCP import
        const validation = validateImport(parsed);
        if (!validation.valid) {
          setImportError(validation.error);
          return;
        }
        setImportData(parsed);
        setImportValidation(validation);
        return;
      }

      setImportError('Unsupported file type. Drop a .json, .zip (Apple Health), or .xml file.');
    } catch (e) {
      setImportError(e.message || 'Failed to process file.');
    } finally {
      setProcessing(false);
    }
  }, []);

  // ── Drag & drop handlers ──
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Execute import (works for all types) ──
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

        // If Apple Health included height in settings, update profile
        if (importValidation.source === 'apple-health' && importValidation.normalized.settings?.height) {
          await updateSettings({ height: importValidation.normalized.settings.height });
        }

        setImportResult(
          addedTotal > 0
            ? `Added ${parts.join(', ')}. Skipped ${skippedTotal} existing records.`
            : `All ${skippedTotal} records already exist. Nothing new to add.`
        );
        await reloadData();
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
    downloadBlob(json, 'application/json', `salve-backup-${new Date().toISOString().slice(0, 10)}.json`);
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
      downloadBlob(encrypted, 'application/json', `salve-backup-encrypted-${new Date().toISOString().slice(0, 10)}.json`);
      setExportPassphrase('');
    } catch {
      setExportError('Encryption failed.');
    }
  }

  function cancelImport() {
    setImportData(null);
    setImportValidation(null);
    setImportFile(null);
    setImportError(null);
    setImportResult(null);
    setProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Source label for detected file types ──
  function getSourceLabel() {
    if (importValidation?.source === 'apple-health') return { icon: Smartphone, label: 'Apple Health', color: 'text-salve-sage' };
    if (importValidation?.encrypted) return { icon: Lock, label: 'Encrypted Backup', color: 'text-salve-amber' };
    if (importValidation?.mode === 'merge') return { icon: FileText, label: 'Salve Sync', color: 'text-salve-sage' };
    return { icon: FileText, label: 'Salve Backup', color: 'text-salve-lav' };
  }

  return (
    <div className="mt-2">
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Field label="Your Name" value={s.name || ''} onChange={v => set('name', v)} placeholder="How should we greet you?" />
        <Field label="Date of Birth" value={s.dob || ''} onChange={v => set('dob', v)} type="date" />
        <Field label="Sex" value={s.sex || ''} onChange={v => set('sex', v)} options={[
          { value: '', label: 'Select...' },
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'intersex', label: 'Intersex' },
          { value: 'prefer-not', label: 'Prefer not to say' },
        ]} />
        <Field label="Height" value={s.height || ''} onChange={v => set('height', v)} placeholder="e.g. 5'6&quot; or 168cm" />
        <Field label="Blood Type" value={s.blood_type || ''} onChange={v => set('blood_type', v)} options={[
          { value: '', label: 'Select...' },
          { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
          { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
          { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
          { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
          { value: 'unknown', label: 'Unknown' },
        ]} />
        <Field label="Location" value={s.location || ''} onChange={v => set('location', v)} placeholder="City, State" />
        <Field label="Primary Care Provider" value={s.primary_provider || ''} onChange={v => set('primary_provider', v)} placeholder="Dr. Name" />
      </Card>

      <SectionTitle>Emergency Contact</SectionTitle>
      <Card>
        <Field label="Contact Name" value={s.emergency_name || ''} onChange={v => set('emergency_name', v)} placeholder="Full name" />
        <Field label="Phone" value={s.emergency_phone || ''} onChange={v => set('emergency_phone', v)} type="tel" placeholder="(555) 555-5555" />
        <Field label="Relationship" value={s.emergency_relationship || ''} onChange={v => set('emergency_relationship', v)} placeholder="e.g. Spouse, Parent, Sibling" />
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
      <Card>
        <p className="text-xs text-salve-textMid mb-2.5 leading-relaxed italic">
          Add context about your health history. This gets included when AI features analyze your profile.
        </p>
        <Field
          label="Background & Context"
          value={s.health_background || ''}
          onChange={v => set('health_background', v)}
          textarea
          placeholder="e.g. I've had chronic fatigue since 2019, my pain flares are worst in cold weather..."
        />
      </Card>

      {/* ═══════════════════════════════════════════════════════
          IMPORT — Drag & Drop Zone
          ═══════════════════════════════════════════════════════ */}
      <SectionTitle>Import Health Data</SectionTitle>
      <Card>
        {/* Drop zone */}
        <div
          ref={dropRef}
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !importValidation && !processing && fileInputRef.current?.click()}
          className={`relative rounded-xl border-2 border-dashed p-6 text-center transition-all cursor-pointer ${
            dragOver
              ? 'border-salve-lav bg-salve-lav/10 scale-[1.01]'
              : importValidation
                ? 'border-salve-border bg-salve-card2 cursor-default'
                : 'border-salve-border hover:border-salve-lavDim hover:bg-salve-card2/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,.xml"
            onChange={handleFileInput}
            className="hidden"
          />

          {/* State: empty / ready for drop */}
          {!importValidation && !processing && !importFile && (
            <>
              <Upload size={28} className="mx-auto mb-3 text-salve-lavDim" strokeWidth={1.5} />
              <p className="text-sm font-medium text-salve-text mb-1">
                Drop a file here or tap to browse
              </p>
              <p className="text-xs text-salve-textFaint leading-relaxed">
                Salve backup (.json) or Apple Health export (.zip)
              </p>
              <div className="flex items-center justify-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-[11px] text-salve-textFaint">
                  <FileText size={12} /> .json
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-salve-textFaint">
                  <Smartphone size={12} /> .zip
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-salve-textFaint">
                  <Lock size={12} /> encrypted
                </div>
              </div>
            </>
          )}

          {/* State: processing file */}
          {processing && (
            <div className="py-4">
              <div className="w-6 h-6 border-2 border-salve-lav border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-salve-textMid">Reading {importFile}...</p>
            </div>
          )}

          {/* State: encrypted file — needs passphrase */}
          {importValidation?.encrypted && (
            <div className="text-left" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-3">
                <Lock size={16} className="text-salve-amber" />
                <span className="text-sm font-medium text-salve-text">Encrypted Backup</span>
                <span className="text-[11px] text-salve-textFaint ml-auto">{importFile}</span>
              </div>
              <p className="text-xs text-salve-textMid mb-3">Enter the passphrase used when this backup was created.</p>
              <input
                type="password"
                value={importPassphrase}
                onChange={e => setImportPassphrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDecrypt()}
                placeholder="Passphrase"
                autoFocus
                className="w-full bg-salve-bg border border-salve-border rounded-lg px-3 py-2.5 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav placeholder:text-salve-textFaint mb-3"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDecrypt}
                  className="flex-1 py-2.5 rounded-lg font-medium text-sm bg-salve-lav/20 text-salve-lav hover:bg-salve-lav/30 transition-colors"
                >
                  Decrypt & Preview
                </button>
                <button onClick={cancelImport} className="px-4 py-2.5 rounded-lg border border-salve-border text-salve-textMid text-sm hover:bg-salve-card2 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* State: file recognized — show preview */}
          {importValidation && !importValidation.encrypted && (
            <div className="text-left" onClick={e => e.stopPropagation()}>
              {(() => {
                const src = getSourceLabel();
                return (
                  <div className="flex items-center gap-2 mb-3">
                    <src.icon size={16} className={src.color} />
                    <span className="text-sm font-medium text-salve-text">{src.label}</span>
                    <span className={`text-[11px] ml-auto px-2 py-0.5 rounded-md ${
                      importValidation.mode === 'merge'
                        ? 'bg-salve-sage/20 text-salve-sage'
                        : 'bg-salve-amber/20 text-salve-amber'
                    }`}>
                      {importValidation.mode === 'merge' ? 'Add new records' : 'Full restore'}
                    </span>
                  </div>
                );
              })()}

              <div className="text-[11px] text-salve-textFaint mb-2">{importFile}</div>

              <div className="space-y-1 mb-4">
                {Object.entries(importValidation.preview).map(([key, count]) => (
                  <div key={key} className="flex justify-between text-sm py-0.5">
                    <span className="text-salve-textMid capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className="text-salve-text font-medium">{count}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
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
                  {importing
                    ? 'Importing...'
                    : importValidation.source === 'apple-health'
                      ? 'Import Apple Health Data'
                      : importValidation.mode === 'merge'
                        ? 'Merge New Records'
                        : 'Restore All Data'}
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
        </div>

        {/* Error message */}
        {importError && (
          <div className="mt-3 p-3 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-sm flex items-start gap-2">
            <span className="flex-1">{importError}</span>
            <button onClick={cancelImport} className="text-salve-rose/60 hover:text-salve-rose text-xs bg-transparent border-none cursor-pointer shrink-0">
              Dismiss
            </button>
          </div>
        )}

        {/* Success message */}
        {importResult && (
          <div className="mt-3 p-3 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-sm">
            {importResult}
          </div>
        )}

        {/* How-to for Apple Health */}
        <details className="mt-4 text-xs text-salve-textFaint">
          <summary className="cursor-pointer hover:text-salve-textMid transition-colors flex items-center gap-1.5">
            <Smartphone size={12} />
            How to export from iPhone / Apple Watch
          </summary>
          <div className="mt-2 pl-4 space-y-1 leading-relaxed">
            <p>1. Open the <strong className="text-salve-textMid">Health</strong> app on your iPhone</p>
            <p>2. Tap your <strong className="text-salve-textMid">profile picture</strong> (top right)</p>
            <p>3. Scroll down and tap <strong className="text-salve-textMid">Export All Health Data</strong></p>
            <p>4. Wait for it to prepare, then save or share the .zip file</p>
            <p>5. Drop that .zip file right here</p>
            <p className="text-salve-textFaint/70 italic mt-2">
              Imports: heart rate, blood pressure, weight, sleep, temperature, blood glucose, steps, medications, immunizations, and lab results.
            </p>
          </div>
        </details>
      </Card>

      <SectionTitle>Data Management</SectionTitle>
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

      <SectionTitle>Download Backup</SectionTitle>
      <Card>
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
            Encrypted backup with passphrase protection.
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

  // ── Decrypt handler ──
  async function handleDecrypt() {
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
  }
}

// ── Helpers ──

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex justify-between items-center mt-6 mb-3">
      <h2 className="font-playfair text-[17px] font-semibold text-salve-text m-0">{children}</h2>
      {action}
    </div>
  );
}
