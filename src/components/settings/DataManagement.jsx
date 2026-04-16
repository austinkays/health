import { useState, useRef } from 'react';
import { Trash2, Download, Shield, Upload, Loader, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import Card from '../ui/Card';
import DropZone from '../ui/DropZone';
import Button from '../ui/Button';
import SectionTitle from '../ui/SectionTitle';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { trackEvent, EVENTS } from '../../services/analytics';
import { db } from '../../services/db';
import { deleteAccount } from '../../services/auth';
import { todayISO } from '../../utils/dates';

export default function DataManagement({ eraseAll, reloadData, demoMode }) {
  const [dataExpanded, setDataExpanded] = useState(false);
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [deleteStage, setDeleteStage] = useState('idle'); // 'idle' | 'confirm' | 'deleting' | 'error'
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [dedupStatus, setDedupStatus] = useState(null); // null | 'running' | { results }

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

  function processImportFile(file) {
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

  function handleFileSelect(e) {
    processImportFile(e.target.files?.[0]);
  }

  async function executeImport() {
    if (!importValidation) return;

    setImporting(true);
    setImportError(null);

    try {
      if (importValidation.mode === 'merge') {
        const stats = await importMerge(importValidation.normalized);
        trackEvent(`${EVENTS.IMPORT_COMPLETED}:sync`);
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
      } else {
        await importRestore(importValidation.normalized);
        trackEvent(`${EVENTS.IMPORT_COMPLETED}:backup`);
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
    a.download = `salve-backup-${todayISO()}.json`;
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
      a.download = `salve-backup-encrypted-${todayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <>
      <SectionTitle
        action={
          <button
            onClick={() => setDataExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-salve-textMid hover:text-salve-lav transition-colors bg-transparent border-none cursor-pointer font-montserrat"
            aria-expanded={dataExpanded}
            aria-label={dataExpanded ? 'Collapse data management' : 'Expand data management'}
          >
            {dataExpanded ? 'Collapse' : 'Expand'}
            {dataExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        }
      >
        Data & Privacy
      </SectionTitle>

      {!dataExpanded && (
        <Card>
          <button
            onClick={() => setDataExpanded(true)}
            className="w-full text-left bg-transparent border-none cursor-pointer p-0 font-montserrat"
          >
            <p className="text-[15px] text-salve-textMid leading-relaxed">
              Backup, restore, import, and erase your data.
            </p>
            <p className="text-[13px] text-salve-textFaint mt-1 flex items-center gap-1">
              Tap to expand <ChevronDown size={12} />
            </p>
          </button>
        </Card>
      )}

      {dataExpanded && (
        <Card>
          {/* ── Download Backup ── */}
          <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Download Backup</span>
          <p className="text-[15px] text-salve-textMid mb-3 leading-relaxed">
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

          <div className="mt-3.5 pt-3.5 border-t border-salve-border/50">
            <p className="text-[15px] text-salve-textMid mb-2.5 leading-relaxed">
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

          {/* ── Import Data ── */}
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Import Data</span>
            <p className="text-[15px] text-salve-textMid mb-3 leading-relaxed">
              Upload a backup file or a health sync file.
            </p>

            <DropZone
              onFile={processImportFile}
              accept=".json"
              label="Drop backup file here"
              hint="Or click to browse, accepts .json backups"
              className="mb-3"
            />

            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-salve-textMid md:hidden
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
                <p className="text-[15px] text-salve-textMid mb-3">Enter the passphrase to decrypt this backup file.</p>
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
          </div>

          {/* ── Remove Duplicates ── */}
          <div className="mt-4">
            <p className="text-[13px] text-salve-textFaint mb-2 font-montserrat">
              Duplicate entries can appear when wearable data syncs multiple times.
            </p>
            <button
              onClick={async () => {
                setDedupStatus('running');
                try {
                  const results = await db.removeDuplicates();
                  setDedupStatus({ results });
                  if (results.some(r => r.removed > 0)) reloadData();
                } catch { setDedupStatus({ results: [] }); }
              }}
              disabled={dedupStatus === 'running'}
              className="flex items-center gap-1.5 text-xs text-salve-lav font-montserrat bg-transparent border border-salve-lav/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-lav/10 disabled:opacity-50 transition-colors"
            >
              {dedupStatus === 'running' ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {dedupStatus === 'running' ? 'Scanning...' : 'Remove Duplicates'}
            </button>
            {dedupStatus && dedupStatus !== 'running' && (
              <p className="text-[13px] text-salve-textMid mt-1.5 font-montserrat">
                {dedupStatus.results.length > 0
                  ? dedupStatus.results.map(r => `${r.removed} duplicate${r.removed > 1 ? 's' : ''} removed from ${r.table}`).join('. ') + '.'
                  : 'No duplicates found.'}
              </p>
            )}
          </div>

          {/* ── Danger Zone: erase data + delete account (hidden in demo mode) ── */}
          {!demoMode && (
          <>
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Danger Zone</span>
            <p className="text-[15px] text-salve-textMid mb-3 leading-relaxed">
              All data is synced to your account and available across devices.
            </p>
            {showEraseConfirm ? (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[15px] text-salve-rose font-medium mb-2.5">
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
          </div>

          {/* ── Delete Account (permanent, removes auth.users row + cascades) ── */}
          <div className="mt-4 pt-4 border-t border-salve-border">
            <h4 className="text-[15px] font-medium text-salve-text mb-1 font-montserrat">Delete Account</h4>
            <p className="text-xs text-salve-textFaint mb-3 leading-relaxed">
              Permanently deletes your account and all associated data. You will be signed out. This cannot be undone.
            </p>
            {deleteStage === 'idle' && (
              <Button variant="danger" onClick={() => setDeleteStage('confirm')} className="text-xs">
                <Trash2 size={14} /> Delete My Account
              </Button>
            )}
            {deleteStage === 'confirm' && (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[15px] text-salve-rose font-medium mb-2">
                  Type <span className="font-mono">DELETE</span> to confirm permanent deletion.
                </p>
                <input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder="DELETE"
                  aria-label="Type DELETE to confirm"
                  className="w-full mb-2.5 px-3 py-2 rounded-lg border border-salve-rose/30 bg-salve-card text-salve-text text-sm font-montserrat outline-none focus:border-salve-rose/60"
                />
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    disabled={deleteInput !== 'DELETE'}
                    onClick={async () => {
                      setDeleteStage('deleting');
                      setDeleteError(null);
                      try {
                        await deleteAccount();
                        window.location.href = '/';
                      } catch (err) {
                        setDeleteError(err.message || 'Deletion failed');
                        setDeleteStage('error');
                      }
                    }}
                    className="text-xs"
                  >
                    <Trash2 size={14} /> Permanently Delete
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setDeleteStage('idle'); setDeleteInput(''); }}
                    className="text-xs"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {deleteStage === 'deleting' && (
              <p className="text-[15px] text-salve-textMid italic">Deleting your account…</p>
            )}
            {deleteStage === 'error' && (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[15px] text-salve-rose mb-2">{deleteError}</p>
                <Button
                  variant="ghost"
                  onClick={() => { setDeleteStage('idle'); setDeleteInput(''); setDeleteError(null); }}
                  className="text-xs"
                >
                  Try again
                </Button>
              </div>
            )}
          </div>
          </>
          )}
        </Card>
      )}
    </>
  );
}
