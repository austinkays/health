import { useState, useRef, useEffect } from 'react';
import { Trash2, Download, Upload, ShieldOff, Shield, Sparkles, ChevronDown, ChevronUp, Star, ClipboardCopy, Loader, Unlink, RefreshCw, Apple } from 'lucide-react';
import Card from '../ui/Card';
import { OuraIcon } from '../ui/OuraIcon';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';
import AIProfilePreview from '../ui/AIProfilePreview';
import AppleHealthImport from '../ui/AppleHealthImport';
import { isOuraConnected, getOuraAuthUrl, exchangeOuraCode, clearOuraTokens, getOuraTokens, syncAllOuraData } from '../../services/oura';

const SYNC_PROMPT = `I'm using Salve, a personal health management app. This is the Salve Health Sync artifact — please render it as an interactive React component so I can use it.

It connects to health services via MCP to pull my medical records (medications, conditions, labs, etc.) and export them as a JSON file I can import into Salve.

Before I start, can you check if I have any health-related MCP connections set up (like healthex or Function Health)? If not, help me get connected so the sync can pull my records.`;

function CopyPromptButton() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SYNC_PROMPT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`mt-2 w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors border cursor-pointer font-montserrat ${
        copied
          ? 'bg-salve-sage/15 border-salve-sage/30 text-salve-sage'
          : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
      }`}
      aria-label={copied ? 'Prompt copied to clipboard' : 'Copy prompt to send with artifact'}
    >
      <ClipboardCopy size={14} />
      {copied ? 'Copied!' : 'Copy prompt to send with file'}
    </button>
  );
}

export default function Settings({ data, updateSettings, updateItem, addItem, addItemSilent, eraseAll, reloadData, onNav }) {
  const s = data.settings;
  const pharmacies = data.pharmacies || [];
  const set = (k, v) => updateSettings({ [k]: v });
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [aiConsent, setAiConsent] = useState(() => hasAIConsent());
  const [dataExpanded, setDataExpanded] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null);
  const toggleSource = (id) => setExpandedSource(prev => prev === id ? null : id);

  // Source detection
  const hasAppleHealth = (data.vitals || []).some(v => v.source === 'apple_health' || v.source === 'Apple Health')
    || (data.activities || []).some(a => a.source === 'apple_health' || a.source === 'Apple Health');

  // Oura state
  const [ouraConnected, setOuraConnected] = useState(() => isOuraConnected());
  const [ouraLoading, setOuraLoading] = useState(false);
  const [ouraError, setOuraError] = useState(null);
  const [ouraSuccess, setOuraSuccess] = useState(null);
  const [ouraSyncing, setOuraSyncing] = useState(false);
  const [ouraBaseline, setOuraBaseline] = useState(() => localStorage.getItem('salve:oura-baseline') || '97.7');

  // Handle OAuth callback (code stashed by supabase.js before Supabase init)
  useEffect(() => {
    const code = window.__ouraCode;
    if (code) {
      delete window.__ouraCode;
      setOuraLoading(true);
      exchangeOuraCode(code)
        .then(() => {
          setOuraConnected(true);
          setOuraSuccess('Oura Ring connected successfully!');
          setOuraError(null);
        })
        .catch(e => setOuraError(e.message))
        .finally(() => setOuraLoading(false));
    }
  }, []);

  async function connectOura() {
    setOuraLoading(true);
    setOuraError(null);
    try {
      const url = await getOuraAuthUrl();
      if (!url) {
        setOuraError('Oura integration is not configured. Add OURA_CLIENT_ID and OURA_CLIENT_SECRET to Vercel env vars.');
        return;
      }
      window.location.href = url;
    } catch (e) {
      setOuraError(e.message);
    } finally {
      setOuraLoading(false);
    }
  }

  function disconnectOura() {
    clearOuraTokens();
    setOuraConnected(false);
    setOuraSuccess(null);
  }

  async function handleOuraSync() {
    setOuraSyncing(true);
    setOuraError(null);
    setOuraSuccess(null);
    try {
      const baseline = parseFloat(ouraBaseline) || 97.7;
      const results = await syncAllOuraData(data, addItemSilent, 30, baseline);

      // Build summary
      const parts = [];
      const errors = [];
      for (const [key, val] of Object.entries(results)) {
        if (val.error) { errors.push(`${key}: ${val.error}`); continue; }
        if (val.added > 0) parts.push(`${val.added} ${key}`);
      }

      if (parts.length > 0) {
        setOuraSuccess(`Synced ${parts.join(', ')} from Oura.${errors.length ? '\nFailed: ' + errors.join('; ') : ''}`);
        await reloadData();
      } else {
        setOuraSuccess(`Nothing new to sync.${errors.length ? '\nFailed: ' + errors.join('; ') : ''}`);
      }
    } catch (e) {
      if (e.message.includes('expired') || e.message.includes('reconnect')) {
        setOuraConnected(false);
      }
      setOuraError(e.message);
    } finally {
      setOuraSyncing(false);
    }
  }

  function saveOuraBaseline(v) {
    setOuraBaseline(v);
    localStorage.setItem('salve:oura-baseline', v);
  }

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

  const preferredPharmacy = pharmacies.find(p => p.is_preferred);

  async function handlePreferredChange(pharmacyId) {
    // Unset the current preferred
    if (preferredPharmacy) {
      await updateItem('pharmacies', preferredPharmacy.id, { is_preferred: false });
    }
    // Set new preferred (if not "none")
    if (pharmacyId) {
      const selected = pharmacies.find(p => p.id === pharmacyId);
      if (selected) {
        await updateItem('pharmacies', selected.id, { is_preferred: true });
        set('pharmacy', selected.name + (selected.address ? ` — ${selected.address}` : ''));
      }
    } else {
      set('pharmacy', '');
    }
  }

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

      <SectionTitle>Sage</SectionTitle>
      <Card>
        <Field
          label="Sage Mode"
          value={s.ai_mode || 'onDemand'}
          onChange={v => set('ai_mode', v)}
          options={[
            { value: 'alwaysOn', label: '✨ Always On' },
            { value: 'onDemand', label: '☽ On Demand' },
            { value: 'off', label: '✧ Off — tracker only' },
          ]}
        />
        <p className="text-xs text-salve-textFaint italic leading-relaxed mt-1">
          Sage uses your health profile for personalized insights.
        </p>
      </Card>

      {aiConsent && (
        <Card className="!mt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-salve-sage" />
              <span className="text-[13px] text-salve-textMid">Sage data sharing enabled</span>
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

      <div className="flex flex-col items-center gap-1.5 my-1">
        <AIProfilePreview data={data} />
        <button
          onClick={() => onNav('ai')}
          className="text-[10px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Want to make a change? Chat with Sage →
        </button>
      </div>

      <SectionTitle>Pharmacy</SectionTitle>
      <Card>
        {pharmacies.length > 0 ? (
          <>
            <label className="block text-xs font-medium text-salve-textMid mb-1.5 font-montserrat">Preferred Pharmacy</label>
            <div className="relative">
              <select
                value={preferredPharmacy?.id || ''}
                onChange={e => handlePreferredChange(e.target.value || null)}
                className="w-full bg-salve-card2 border border-salve-border rounded-lg px-3 py-2.5 text-sm text-salve-text font-montserrat outline-none focus:border-salve-lav appearance-none cursor-pointer pr-8"
              >
                <option value="">No preferred pharmacy</option>
                {pharmacies.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                  <option key={p.id} value={p.id}>
                    {p.is_preferred ? '★ ' : ''}{p.name}{p.address ? ` — ${p.address}` : ''}
                  </option>
                ))}
              </select>
              <Star size={14} className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${preferredPharmacy ? 'text-salve-amber' : 'text-salve-textFaint'}`} />
            </div>
            {preferredPharmacy && (
              <p className="text-xs text-salve-sage mt-2 flex items-center gap-1">
                <Star size={10} className="fill-salve-amber text-salve-amber" />
                {preferredPharmacy.name} is your preferred pharmacy
              </p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-salve-textFaint italic leading-relaxed">
            No pharmacies added yet. Add pharmacies in the Pharmacies section to pick a preferred one here.
          </p>
        )}
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
          Add context about your health history. Sage includes this when analyzing your profile.
        </p>
        <Field
          label="Background & Context"
          value={s.health_background || ''}
          onChange={v => set('health_background', v)}
          textarea
          placeholder="e.g. I've had chronic fatigue since 2019, my pain flares are worst in cold weather..."
        />
      </Card>

      <SectionTitle>Connected Sources</SectionTitle>

      <div className="space-y-2 mb-4">
        {/* ── Claude Health Sync (always first) ── */}
        <Card>
          <button onClick={() => toggleSource('claude')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-lav/15">
                <Sparkles size={16} className="text-salve-lav" />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Claude Health Sync</span>
                <span className="text-[10px] text-salve-textFaint">Pull records from MCP providers</span>
              </div>
            </div>
            {expandedSource === 'claude' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'claude' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              <ol className="text-[11px] text-salve-textMid space-y-1 leading-relaxed list-decimal pl-5 mb-3">
                <li>Download the sync artifact</li>
                <li>Open <strong className="text-salve-text">Claude.ai</strong> and attach it</li>
                <li>Paste the prompt and pull records</li>
                <li>Import the sync file in Data Management</li>
              </ol>
              <a
                href="/salve-sync.jsx"
                download="salve-sync.jsx"
                className="btn-magic btn-magic-lav w-full py-3 rounded-xl font-semibold text-sm no-underline
                  bg-gradient-to-r from-salve-lav/20 via-salve-sage/10 to-salve-lav/20
                  border border-salve-lav/30 text-salve-lav
                  flex items-center justify-center gap-2.5
                  hover:border-salve-lav/50 hover:from-salve-lav/30 hover:to-salve-lav/30"
              >
                <Sparkles size={18} className="animate-pulse" />
                Download Sync Artifact
                <Sparkles size={14} className="opacity-50" />
              </a>
              <CopyPromptButton />
            </div>
          )}
        </Card>

        {/* ── Oura Ring ── */}
        <Card>
          <button onClick={() => toggleSource('oura')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${ouraConnected ? 'bg-salve-sage/15' : 'bg-salve-card2'}`}>
                <OuraIcon size={16} className={ouraConnected ? 'text-salve-sage' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Oura Ring</span>
                <span className="text-[10px] text-salve-textFaint">
                  {ouraConnected
                    ? `Connected${getOuraTokens()?.connected_at ? ` · ${new Date(getOuraTokens().connected_at).toLocaleDateString()}` : ''}`
                    : 'Sleep, readiness, temperature, workouts'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {ouraConnected && (
                <span className="w-2 h-2 rounded-full bg-salve-sage" />
              )}
              {expandedSource === 'oura' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {expandedSource === 'oura' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              {ouraConnected ? (
                <>
                  <div className="flex justify-end mb-2">
                    <button onClick={() => onNav('oura')} className="text-[10px] text-salve-sage font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Oura data →</button>
                  </div>
                  <Field
                    label="BBT Baseline (°F)"
                    value={ouraBaseline}
                    onChange={saveOuraBaseline}
                    placeholder="97.7"
                    type="number"
                  />
                  <p className="text-[10px] text-salve-textFaint italic mb-3 -mt-1 leading-relaxed">
                    Oura measures temperature deviation from your personal baseline. Average waking BBT is ~97.7°F.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleOuraSync}
                      disabled={ouraSyncing}
                      className="flex-1 py-2 rounded-lg bg-salve-sage/15 border border-salve-sage/30 text-salve-sage text-xs font-medium font-montserrat
                        flex items-center justify-center gap-1.5 hover:bg-salve-sage/25 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {ouraSyncing ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      {ouraSyncing ? 'Syncing...' : 'Sync All Data'}
                    </button>
                    <button
                      onClick={disconnectOura}
                      className="py-2 px-3 rounded-lg border border-salve-border text-salve-textFaint text-xs font-montserrat
                        flex items-center gap-1.5 hover:border-salve-rose/40 hover:text-salve-rose transition-colors cursor-pointer"
                    >
                      <Unlink size={12} /> Disconnect
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[13px] text-salve-textMid leading-relaxed mb-3">
                    Connect your Oura Ring to import sleep, readiness, heart rate, temperature, and workout data.
                  </p>
                  <button
                    onClick={connectOura}
                    disabled={ouraLoading}
                    className="w-full py-2.5 rounded-xl bg-salve-card2 border border-salve-border text-salve-lav font-medium text-sm font-montserrat
                      hover:bg-salve-border transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {ouraLoading ? <Loader size={16} className="animate-spin" /> : <OuraIcon size={16} />}
                    {ouraLoading ? 'Connecting...' : 'Connect Oura Ring'}
                  </button>
                </>
              )}
              {ouraError && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-salve-rose/10 border border-salve-rose/30 text-salve-rose text-xs">{ouraError}</div>
              )}
              {ouraSuccess && (
                <div className="mt-2.5 p-2.5 rounded-lg bg-salve-sage/10 border border-salve-sage/30 text-salve-sage text-xs whitespace-pre-line">{ouraSuccess}</div>
              )}
            </div>
          )}
        </Card>

        {/* ── Apple Health ── */}
        <Card>
          <button onClick={() => toggleSource('apple')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasAppleHealth ? 'bg-salve-lav/15' : 'bg-salve-card2'}`}>
                <Apple size={16} className={hasAppleHealth ? 'text-salve-lav' : 'text-salve-textFaint'} />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Apple Health</span>
                <span className="text-[10px] text-salve-textFaint">
                  {hasAppleHealth ? 'Data imported' : 'Vitals, workouts, labs from iPhone'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {hasAppleHealth && <span className="w-2 h-2 rounded-full bg-salve-lav" />}
              {expandedSource === 'apple' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
            </div>
          </button>
          {expandedSource === 'apple' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              {hasAppleHealth && (
                <div className="flex justify-end mb-2">
                  <button onClick={() => onNav('apple_health')} className="text-[10px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline">View Apple Health data →</button>
                </div>
              )}
              <AppleHealthImport data={data} reloadData={reloadData} />
            </div>
          )}
        </Card>
      </div>

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
        Data Management
      </SectionTitle>

      {!dataExpanded && (
        <Card>
          <button
            onClick={() => setDataExpanded(true)}
            className="w-full text-left bg-transparent border-none cursor-pointer p-0 font-montserrat"
          >
            <p className="text-[13px] text-salve-textMid leading-relaxed">
              Backup, restore, import, and erase your data.
            </p>
            <p className="text-[11px] text-salve-textFaint mt-1 flex items-center gap-1">
              Tap to expand <ChevronDown size={12} />
            </p>
          </button>
        </Card>
      )}

      {dataExpanded && (
        <Card>
          {/* ── Download Backup ── */}
          <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Download Backup</span>
          <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
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

          {/* ── Import Data ── */}
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Import Data</span>
            <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
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
          </div>

          {/* ── Erase All Data ── */}
          <div className="mt-5 pt-5 border-t border-salve-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-salve-textFaint mb-3 block">Danger Zone</span>
            <p className="text-[13px] text-salve-textMid mb-3 leading-relaxed">
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
          </div>
        </Card>
      )}

      <div className="text-center mt-6 mb-2">
        <button
          onClick={() => onNav('legal')}
          className="text-[12px] text-salve-textFaint hover:text-salve-lav bg-transparent border-none cursor-pointer font-montserrat transition-colors underline underline-offset-2"
        >
          Privacy, Terms & HIPAA Notice
        </button>
      </div>

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
