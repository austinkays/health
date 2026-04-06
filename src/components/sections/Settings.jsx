import { useState, useRef, useEffect } from 'react';
import { Trash2, Download, Upload, ShieldOff, Shield, Sparkles, ChevronDown, ChevronUp, Star, ClipboardCopy, Loader, Unlink, RefreshCw, Apple, LogOut, MapPin, Crown, MessageCircle, Bug, Info, Heart } from 'lucide-react';
import Card from '../ui/Card';
import DropZone from '../ui/DropZone';
import { OuraIcon } from '../ui/OuraIcon';
import Field from '../ui/Field';
import Button from '../ui/Button';
import Motif from '../ui/Motif';
import { exportAll, validateImport, importRestore, importMerge, encryptExport, decryptExport } from '../../services/storage';
import { hasAIConsent, revokeAIConsent } from '../ui/AIConsentGate';
import { getAIProvider, setAIProvider, isPremiumActive, isAdminActive, trialDaysRemaining } from '../../services/ai';
// Auto-set AI provider based on tier — no manual model picker needed
import { useTheme } from '../../hooks/useTheme';
import AIProfilePreview from '../ui/AIProfilePreview';
import AppleHealthImport from '../ui/AppleHealthImport';
import { isOuraConnected, getOuraAuthUrl, exchangeOuraCode, clearOuraTokens, getOuraTokens, syncAllOuraData } from '../../services/oura';
import { db } from '../../services/db';
import { signOut, deleteAccount } from '../../services/auth';
import { supabase } from '../../services/supabase';

const PREP_PROMPT = `I'm going to send you a file called salve-sync.jsx in my next message. It's the complete source code for a React artifact called "Salve Health Sync" — a health-data sync tool that uses MCP connections (healthex, Function Health, etc.) to pull my medical records and export them as JSON for import into the Salve app.

When the file arrives, do this immediately — no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE file contents into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have the required MCP connectors enabled in Claude. The artifact needs these two:
   - healthex (URL: https://api.healthex.io/mcp) — pulls records from my patient portals
   - function-health (URL: https://services.functionhealth.com/ai-chat/mcp) — pulls my Function Health lab panels
   If either is missing, walk me through adding it step by step: tell me to open Claude settings → Connectors → Add custom connector, paste the URL, and complete the OAuth sign-in for that service. Don't assume I know where "Connectors" lives — spell out the exact clicks. Once both are connected, tell me to click "Pull Health Records" in the artifact.

Ready? I'll attach the file next.`;

const PROJECT_INSTRUCTIONS = `This project is for syncing my health records into Salve (a personal health management app).

The knowledge file salve-sync.jsx is the complete source code for a React artifact called "Salve Health Sync". It uses MCP connections (healthex, Function Health, etc.) to pull my medical records and export them as JSON that I import into Salve.

Whenever I ask you to sync, pull records, start the sync artifact, or anything similar, do this immediately — no commentary, no questions first:

1. Create a React artifact. Use identifier "salve-health-sync", type "application/vnd.ant.react", title "Salve Health Sync". Put the ENTIRE contents of salve-sync.jsx into the artifact, unchanged. Do not rewrite, refactor, summarize, shorten, or "fix" anything. The code is already complete and working.

2. Do NOT analyze the code, describe what it does, or ask what I want before creating the artifact.

3. After the artifact renders, tell me in one short sentence that it's ready. Then check whether I have the required MCP connectors enabled in Claude. The artifact needs these two:
   - healthex (URL: https://api.healthex.io/mcp) — pulls records from my patient portals
   - function-health (URL: https://services.functionhealth.com/ai-chat/mcp) — pulls my Function Health lab panels
   If either is missing, walk me through adding it step by step: tell me to open Claude settings → Connectors → Add custom connector, paste the URL, and complete the OAuth sign-in for that service. Don't assume I know where "Connectors" lives — spell out the exact clicks. Once both are connected, tell me to click "Pull Health Records" in the artifact.

Dependencies available in the Claude artifacts runtime: react and lucide-react. No other imports needed, no external API calls from the file itself.`;

function CopyButton({ text, label, copiedLabel = 'Copied!', ariaLabel }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className={`w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors border cursor-pointer font-montserrat ${
        copied
          ? 'bg-salve-sage/15 border-salve-sage/30 text-salve-sage'
          : 'bg-salve-card2 border-salve-border text-salve-textMid hover:border-salve-lav/40 hover:text-salve-lav'
      }`}
      aria-label={ariaLabel || (copied ? 'Copied to clipboard' : label)}
    >
      <ClipboardCopy size={14} />
      {copied ? copiedLabel : label}
    </button>
  );
}

/* ── ThemeTile ───────────────────────────────────────────────────────────────
   A single theme preview tile. Shows 4 brand-color swatches + theme name +
   light/dark indicator. Supports hover-to-preview callbacks.
──────────────────────────────────────────────────────────────────────────── */
function ThemeTile({ theme, isActive, isLocked, onSelect }) {
  const c = theme.colors;
  return (
    <button
      onClick={() => !isLocked && onSelect(theme.id)}
      aria-label={`${theme.label} theme${theme.type === 'light' ? ' (light)' : ' (dark)'}${isLocked ? ' — premium' : ''}`}
      aria-pressed={isActive}
      style={{ backgroundColor: c.bg, borderColor: isActive ? undefined : c.border }}
      className={`relative p-2 rounded-xl border transition-all font-montserrat text-center ${
        isActive
          ? 'border-salve-lav/50 ring-2 ring-salve-lav/50'
          : isLocked
            ? 'opacity-50 cursor-not-allowed'
            : 'hover:brightness-110 cursor-pointer'
      }`}
    >
      {isLocked && (
        <div className="absolute top-1 right-1.5 text-[9px]" style={{ color: c.lav }} aria-hidden="true">🔒</div>
      )}
      {/* Palette bar — accent colours as segmented strip */}
      <div className="flex gap-px mb-1.5 rounded-md overflow-hidden h-1.5">
        {['lav', 'sage', 'amber', 'rose'].map(key => (
          <span key={key} className="flex-1 h-full" style={{ backgroundColor: c[key] }} />
        ))}
      </div>
      <span className="text-[11px] font-medium block leading-tight" style={{ color: c.text }}>{theme.label}</span>
      {theme.type === 'light'
        ? <span className="text-[8px] block mt-0.5" style={{ color: c.amber }}>☀ Light</span>
        : <span className="text-[8px] block mt-0.5" style={{ color: c.textFaint }}>◑ Dark</span>
      }
    </button>
  );
}

/* ── ThemeSelector ───────────────────────────────────────────────────────────
   Full redesigned theme picker:
   • 3-column grid (less scrolling than 2-col)
   • Hover-to-preview (reverts when mouse leaves before clicking)
   • Save/Revert bar anchored at the TOP of the section so it's always visible
   • Experimental themes in a collapsible panel (no jarring <details> shift)
──────────────────────────────────────────────────────────────────────────── */
function ThemeSelector({ allThemes, themeId, setTheme, saveTheme, revertTheme, hasUnsavedChanges, userTier }) {
  const [showExperimental, setShowExperimental] = useState(false);

  const core = Object.values(allThemes).filter(t => !t.experimental)
    .sort((a, b) => (a.type === 'light' ? 0 : 1) - (b.type === 'light' ? 0 : 1));
  const experimentalLight = Object.values(allThemes).filter(t => t.experimental && t.type === 'light');
  const experimentalDark  = Object.values(allThemes).filter(t => t.experimental && t.type === 'dark');
  const experimental = [...experimentalLight, ...experimentalDark];

  const handleSelect = (id) => {
    setTheme(id);
  };

  const previewed = allThemes[themeId];
  const isPremiumOnly = previewed?.experimental && userTier === 'free';
  const hasUnsaved = hasUnsavedChanges;

  return (
    <div>
      {/* ── Save / Revert bar — lives at the TOP so it's always in view ── */}
      {hasUnsaved && (
        <div className="mb-3 p-3 rounded-xl border border-salve-lav/30 bg-salve-lav/5 flex items-center justify-between gap-3">
          <p className="text-xs text-salve-text font-montserrat min-w-0 truncate">
            Previewing <strong className="text-salve-lav">{previewed?.label}</strong>
            {isPremiumOnly && <span className="text-salve-textFaint"> · Premium</span>}
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => !isPremiumOnly && saveTheme()}
              disabled={isPremiumOnly}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border font-montserrat transition-colors ${
                isPremiumOnly
                  ? 'text-salve-textFaint bg-transparent border-salve-border cursor-not-allowed'
                  : 'text-salve-lav bg-salve-lav/15 border-salve-lav/30 cursor-pointer hover:bg-salve-lav/25'
              }`}
              title={isPremiumOnly ? 'Upgrade to premium to save this theme' : 'Save this theme'}
            >
              {isPremiumOnly ? '🔒 Save' : 'Save'}
            </button>
            <button
              onClick={revertTheme}
              className="text-xs text-salve-textMid bg-transparent px-3 py-1.5 rounded-lg border border-salve-border cursor-pointer font-montserrat hover:border-salve-border2 transition-colors"
            >
              Revert
            </button>
          </div>
        </div>
      )}

      {/* ── Core themes — 3-col grid (6 themes = 2 perfect rows, no orphans) ── */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {core.map(t => (
          <ThemeTile
            key={t.id}
            theme={t}
            isActive={themeId === t.id}
            isLocked={false}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {/* ── Experimental / Premium themes — collapsible panel ── */}
      {experimental.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowExperimental(v => !v)}
            aria-expanded={showExperimental}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-salve-border bg-salve-card2 hover:border-salve-border2 transition-colors cursor-pointer font-montserrat focus:outline-none focus-visible:ring-2 focus-visible:ring-salve-lav/50"
          >
            <span className="flex items-center gap-1.5 text-[11px] text-salve-textMid">
              <Sparkles size={11} className="text-salve-lav" aria-hidden="true" />
              Experimental themes
              <span className="px-1.5 py-0.5 rounded-full bg-salve-lav/10 text-salve-lav text-[9px]">Premium</span>
            </span>
            {showExperimental
              ? <ChevronUp size={14} className="text-salve-textFaint" aria-hidden="true" />
              : <ChevronDown size={14} className="text-salve-textFaint" aria-hidden="true" />
            }
          </button>
          {showExperimental && (
            <div className="mt-2 space-y-2">
              {/* Light experimental themes */}
              {experimentalLight.length > 0 && (
                <>
                  <p className="text-[9px] uppercase tracking-widest text-salve-textFaint font-montserrat px-0.5">☀ Light</p>
                  <div className="grid grid-cols-3 gap-2">
                    {experimentalLight.map(t => (
                      <ThemeTile
                        key={t.id}
                        theme={t}
                        isActive={themeId === t.id}
                        isLocked={userTier === 'free'}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                </>
              )}
              {/* Dark experimental themes */}
              {experimentalDark.length > 0 && (
                <>
                  <p className="text-[9px] uppercase tracking-widest text-salve-textFaint font-montserrat px-0.5">◑ Dark</p>
                  <div className="grid grid-cols-3 gap-2">
                    {experimentalDark.map(t => (
                      <ThemeTile
                        key={t.id}
                        theme={t}
                        isActive={themeId === t.id}
                        isLocked={userTier === 'free'}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings({ data, updateSettings, updateItem, addItem, addItemSilent, eraseAll, reloadData, onNav, demoMode = false }) {
  const s = data.settings;
  const pharmacies = data.pharmacies || [];
  const set = (k, v) => updateSettings({ [k]: v });
  const [showEraseConfirm, setShowEraseConfirm] = useState(false);
  const [deleteStage, setDeleteStage] = useState('idle'); // 'idle' | 'confirm' | 'deleting' | 'error'
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState(null);
  const [dedupStatus, setDedupStatus] = useState(null); // null | 'running' | { results }
  const [aiConsent, setAiConsent] = useState(() => hasAIConsent());
  // Effective tier — factors in trial expiry + localStorage dev override
  const userTier = isAdminActive(s) ? 'admin' : isPremiumActive(s) ? 'premium' : 'free';
  const trialDays = trialDaysRemaining(s);
  const isOnTrial = trialDays != null && trialDays > 0;
  const trialExpired = s?.tier === 'premium' && trialDays === 0;
  const [tierOverride, setTierOverride] = useState(() => {
    try { return localStorage.getItem('salve:tier-override') || ''; } catch { return ''; }
  });
  const applyOverride = (val) => {
    try {
      if (val) localStorage.setItem('salve:tier-override', val);
      else localStorage.removeItem('salve:tier-override');
    } catch { /* ignore */ }
    setTierOverride(val);
    window.location.reload();
  };
  const { themeId, committedThemeId, setTheme, saveTheme, revertTheme, hasUnsavedChanges, themes: allThemes } = useTheme();

  // Auto-set AI provider based on tier — premium gets Claude, free gets Gemini
  useEffect(() => {
    const shouldBe = userTier === 'premium' ? 'anthropic' : 'gemini';
    if (getAIProvider() !== shouldBe) setAIProvider(shouldBe);
  }, [userTier]);
  const [dataExpanded, setDataExpanded] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null);
  const toggleSource = (id) => setExpandedSource(prev => prev === id ? null : id);

  const [userEmail, setUserEmail] = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // null | 'detecting' | 'error' | 'success'
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

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
      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
      {/* ── Left Column ── */}
      <div>
      {/* ══════════════ 1. Account ══════════════ */}
      <SectionTitle>Account</SectionTitle>
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-salve-text font-medium font-montserrat">{s.name || 'No name set'}</p>
            <p className="text-[11px] text-salve-textFaint font-montserrat">{demoMode ? 'Demo mode' : (userEmail || 'Loading...')}</p>
          </div>
          <button
            onClick={async () => {
              if (demoMode) { window.location.reload(); return; }
              await signOut();
              window.location.reload();
            }}
            className="flex items-center gap-1.5 text-xs text-salve-rose/70 hover:text-salve-rose font-montserrat bg-transparent border border-salve-rose/20 hover:border-salve-rose/40 rounded-lg px-3 py-1.5 cursor-pointer transition-colors"
          >
            <LogOut size={12} /> {demoMode ? 'Exit demo' : 'Sign out'}
          </button>
        </div>
      </Card>

      {/* ══════════════ 2. Appearance ══════════════ */}
      <SectionTitle>Appearance</SectionTitle>
      <Card>
        <label className="block text-xs font-medium text-salve-textMid mb-2 font-montserrat">Theme</label>
        <ThemeSelector
          allThemes={allThemes}
          themeId={themeId}
          setTheme={setTheme}
          saveTheme={saveTheme}
          revertTheme={revertTheme}
          hasUnsavedChanges={hasUnsavedChanges}
          userTier={userTier}
        />
      </Card>

      {/* ══════════════ 3. Sage ══════════════ */}
      <SectionTitle>Sage</SectionTitle>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-salve-sage" aria-hidden="true" />
            <span className="text-sm text-salve-text font-medium font-montserrat">Your health assistant</span>
          </div>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${(s.ai_mode || 'onDemand') === 'alwaysOn' ? 'bg-salve-lav/15 text-salve-lav' : 'bg-salve-sage/15 text-salve-sage'}`}>
            {(s.ai_mode || 'onDemand') === 'alwaysOn' ? 'Always On' : 'On Demand'}
          </span>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => set('ai_mode', 'onDemand')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer font-montserrat text-left ${
              (s.ai_mode || 'onDemand') === 'onDemand'
                ? 'border-salve-sage/50 bg-salve-sage/10'
                : 'border-salve-border bg-salve-card2 hover:border-salve-border2'
            }`}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${(s.ai_mode || 'onDemand') === 'onDemand' ? 'bg-salve-sage' : 'bg-salve-textFaint/40'}`} />
            <div className="flex-1 min-w-0">
              <span className="text-sm text-salve-text font-medium">☽ On Demand</span>
              <p className="text-[10px] text-salve-textFaint mt-0.5 leading-relaxed">
                Sage responds when you ask — included free
              </p>
            </div>
          </button>
          <button
            onClick={() => { if (userTier === 'premium') set('ai_mode', 'alwaysOn'); }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all font-montserrat text-left ${
              s.ai_mode === 'alwaysOn' && userTier === 'premium'
                ? 'border-salve-lav/50 bg-salve-lav/10 cursor-pointer'
                : userTier === 'premium'
                  ? 'border-salve-border bg-salve-card2 hover:border-salve-border2 cursor-pointer'
                  : 'border-salve-border bg-salve-card2 opacity-50 cursor-not-allowed'
            }`}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.ai_mode === 'alwaysOn' && userTier === 'premium' ? 'bg-salve-lav' : 'bg-salve-textFaint/40'}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-salve-text font-medium">✨ Always On</span>
                {userTier !== 'premium' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-salve-lav/15 text-salve-lav font-medium">Premium</span>}
              </div>
              <p className="text-[10px] text-salve-textFaint mt-0.5 leading-relaxed">
                {userTier === 'premium'
                  ? 'Sage proactively surfaces insights throughout the app'
                  : 'Proactive insights, smarter analysis, and more'}
              </p>
            </div>
          </button>
        </div>

        {aiConsent && (
          <>
            <div className="my-3 border-t border-salve-border/50" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-salve-sage" />
                <span className="text-[11px] text-salve-textMid font-montserrat">Data sharing enabled</span>
              </div>
              <button
                onClick={() => { revokeAIConsent(); setAiConsent(false); }}
                className="text-xs text-salve-rose bg-transparent border-none cursor-pointer font-montserrat hover:underline"
              >
                Revoke
              </button>
            </div>
          </>
        )}
      </Card>

      <div className="flex flex-col items-center gap-1.5 my-1">
        <AIProfilePreview data={data} />
        <button
          onClick={() => onNav('ai')}
          className="text-[10px] text-salve-lav/60 font-montserrat bg-transparent border-none cursor-pointer hover:text-salve-lav transition-colors p-0"
        >
          Want to make a change? Chat with Sage →
        </button>
      </div>

      {/* ══════════════ 4. Premium ══════════════ */}
      <SectionTitle>Premium</SectionTitle>
      <Card>
        <div className="flex items-center gap-2.5 mb-2">
          <Crown size={16} className={userTier === 'admin' ? 'text-salve-amber' : userTier === 'premium' ? 'text-salve-amber' : 'text-salve-textFaint'} />
          <div>
            <span className="text-sm text-salve-text font-medium font-montserrat">
              {userTier === 'admin' ? 'Admin Tier' : userTier === 'premium' ? (isOnTrial ? 'Free Trial' : 'Premium') : 'Free Plan'}
            </span>
            <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-full font-medium ${userTier === 'admin' ? 'bg-salve-amber/15 text-salve-amber' : userTier === 'premium' ? 'bg-salve-amber/15 text-salve-amber' : 'bg-salve-card2 text-salve-textFaint'}`}>
              {userTier === 'admin' ? 'Active' : userTier === 'premium' ? (isOnTrial ? `${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Active') : 'Current'}
            </span>
          </div>
        </div>
        {userTier === 'admin' && (
          <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed mt-1.5">
            All features unlocked. House Consultation uses both Claude and Gemini simultaneously for dual-AI differential analysis.
          </p>
        )}
        {isOnTrial && (
          <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed mt-1.5">
            You're on a 14-day free trial with full access to every feature. Enjoy the ride — no payment needed to explore.
          </p>
        )}
        {trialExpired && (
          <div className="space-y-2 mt-2">
            <p className="text-[11px] text-salve-rose font-montserrat leading-relaxed">
              Your trial ended. You're now on the free plan.
            </p>
            <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed">
              Upgrading keeps advanced insights, experimental themes, and unlimited access.
              <br />
              <em className="text-salve-textFaint">Payment coming soon — reach out at <a href="mailto:salveapp@proton.me" className="text-salve-lav no-underline hover:underline">salveapp@proton.me</a> if you'd like early access.</em>
            </p>
          </div>
        )}
        {userTier === 'free' && !trialExpired && (
          <div className="mt-2">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-montserrat">
              <div className="text-salve-textFaint font-medium col-span-2 border-b border-salve-border/50 pb-1 mb-0.5">Free vs Premium</div>
              <span className="text-salve-textMid">☽ On Demand Sage</span>
              <span className="text-salve-sage text-right">✓ Included</span>
              <span className="text-salve-textMid">✨ Always On Sage</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Smarter AI models</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Connections & patterns</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Care gaps & cost savings</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Experimental themes</span>
              <span className="text-salve-lav text-right">Premium</span>
              <span className="text-salve-textMid">Daily AI limit</span>
              <span className="text-salve-textFaint text-right">10 / day → Unlimited</span>
            </div>
          </div>
        )}
        {/* Dev-mode tier override — lets you preview the free/expired state without waiting */}
        {import.meta.env.DEV && (
          <div className="mt-3 pt-3 border-t border-salve-border">
            <p className="text-[10px] text-salve-textFaint font-montserrat uppercase tracking-wider mb-1.5">Dev: tier override</p>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => applyOverride('')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === '' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
              >
                Actual ({s?.tier === 'premium' && isOnTrial ? 'trial' : s?.tier || 'free'})
              </button>
              <button
                onClick={() => applyOverride('free')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'free' ? 'border-salve-rose/50 bg-salve-rose/10 text-salve-rose' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force free
              </button>
              <button
                onClick={() => applyOverride('premium')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'premium' ? 'border-salve-lav/50 bg-salve-lav/10 text-salve-lav' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force premium
              </button>
              <button
                onClick={() => applyOverride('admin')}
                className={`text-[10px] px-2 py-1 rounded-full border font-montserrat ${tierOverride === 'admin' ? 'border-salve-amber/50 bg-salve-amber/10 text-salve-amber' : 'border-salve-border text-salve-textFaint'}`}
              >
                Force admin
              </button>
            </div>
          </div>
        )}
      </Card>

      </div>
      {/* ── Right Column ── */}
      <div>
      {/* ══════════════ 5. Profile ══════════════ */}
      <SectionTitle>Profile</SectionTitle>
      <Card>
        <Field label="Your Name" value={s.name || ''} onChange={v => set('name', v)} placeholder="How should we greet you?" />
        <div className="relative">
          <Field label="Location" value={s.location || ''} onChange={v => set('location', v)} placeholder="City, State" />
          <button
            onClick={() => {
              if (!navigator.geolocation) {
                setLocationStatus('error');
                return;
              }
              setLocationStatus('detecting');
              navigator.geolocation.getCurrentPosition(
                async (pos) => {
                  try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`);
                    const data = await res.json();
                    const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || '';
                    const state = data.address?.state || '';
                    if (city || state) {
                      set('location', [city, state].filter(Boolean).join(', '));
                      setLocationStatus('success');
                      setTimeout(() => setLocationStatus(null), 2000);
                    } else {
                      setLocationStatus('error');
                    }
                  } catch {
                    setLocationStatus('error');
                  }
                },
                () => setLocationStatus('error'),
                { timeout: 10000 }
              );
            }}
            disabled={locationStatus === 'detecting'}
            className="absolute right-2 top-6 text-[10px] text-salve-lav font-montserrat bg-transparent border-none cursor-pointer hover:underline flex items-center gap-0.5 disabled:opacity-50"
            aria-label="Detect location"
          >
            {locationStatus === 'detecting' ? <Loader size={10} className="animate-spin" /> : <MapPin size={10} />}
            {locationStatus === 'detecting' ? 'Detecting...' : locationStatus === 'success' ? 'Done' : locationStatus === 'error' ? 'Failed' : 'Detect'}
          </button>
        </div>
        <Field
          label="Health Background"
          value={s.health_background || ''}
          onChange={v => set('health_background', v)}
          textarea
          placeholder="Context for Sage — e.g. chronic fatigue since 2019, pain flares in cold weather..."
        />
        <p className="text-[10px] text-salve-textFaint mt-1 font-montserrat italic">Sage includes this when analyzing your profile.</p>
      </Card>

      <Card className="!mt-2">
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

        <div className="mt-3 pt-3 border-t border-salve-border/50">
          <Field label="Insurance Plan" value={s.insurance_plan || ''} onChange={v => set('insurance_plan', v)} placeholder="e.g. Kaiser HMO" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Member ID" value={s.insurance_id || ''} onChange={v => set('insurance_id', v)} placeholder="Member ID" />
            <Field label="Group #" value={s.insurance_group || ''} onChange={v => set('insurance_group', v)} placeholder="Group #" />
          </div>
          <Field label="Member Services" value={s.insurance_phone || ''} onChange={v => set('insurance_phone', v)} type="tel" placeholder="Phone" />
        </div>
      </Card>

      {/* ══════════════ 6. Connected Sources ══════════════ */}
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
            <div className="mt-3 pt-3 border-t border-salve-border/50 space-y-4">
              {/* ── Recommended: Claude Project (one-time setup) ── */}
              <div className="bg-salve-lav/5 border border-salve-lav/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-salve-lav font-montserrat">Recommended · one-time setup</span>
                </div>
                <h4 className="text-[13px] text-salve-text font-medium font-montserrat mb-1">Create a Claude Project</h4>
                <p className="text-[11px] text-salve-textFaint leading-relaxed mb-3">
                  Set this up once on Claude.ai and every future sync is one short message like "sync my records" — no re-attaching files, no re-pasting prompts.
                </p>

                <ol className="text-[11px] text-salve-textMid space-y-2.5 leading-relaxed list-decimal pl-5 mb-3">
                  <li>
                    On Claude.ai, click <strong className="text-salve-text">Projects</strong> → <strong className="text-salve-text">New project</strong>. Name it "Salve Health Sync".
                  </li>
                  <li>
                    In the <strong className="text-salve-text">What are you trying to achieve?</strong> field, paste the project instructions below.
                    <div className="mt-2">
                      <CopyButton text={PROJECT_INSTRUCTIONS} label="Copy project instructions" copiedLabel="Project instructions copied!" />
                    </div>
                  </li>
                  <li>
                    In the project's <strong className="text-salve-text">Files</strong> section (also called Project knowledge), upload <code className="text-salve-textMid text-[10px]">salve-sync.jsx</code>.
                    <div className="mt-2">
                      <a
                        href="/salve-sync.jsx"
                        download="salve-sync.jsx"
                        className="btn-magic btn-magic-lav w-full py-2.5 rounded-lg font-medium text-xs no-underline
                          bg-gradient-to-r from-salve-lav/20 via-salve-sage/10 to-salve-lav/20
                          border border-salve-lav/30 text-salve-lav
                          flex items-center justify-center gap-2
                          hover:border-salve-lav/50 hover:from-salve-lav/30 hover:to-salve-lav/30"
                      >
                        <Sparkles size={14} className="animate-pulse" />
                        Download salve-sync.jsx
                      </a>
                    </div>
                  </li>
                  <li>
                    Start a <strong className="text-salve-text">new chat</strong> inside that project and say <em className="text-salve-textMid">"sync my health records"</em>. The artifact will render automatically.
                  </li>
                  <li>
                    Pull your records, download the JSON, and import it via <strong className="text-salve-text">Data Management → Import</strong> above.
                  </li>
                </ol>

                <p className="text-[10px] text-salve-textFaint italic leading-relaxed">
                  After setup, future syncs only need step 4 + step 5.
                </p>
              </div>

              {/* ── MCP connectors required ── */}
              <div className="bg-salve-card2 border border-salve-border rounded-xl p-3">
                <h4 className="text-[11px] text-salve-text font-semibold uppercase tracking-wider font-montserrat mb-2">Connectors you'll need on Claude.ai</h4>
                <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2.5">
                  The sync artifact pulls records through MCP connectors. Add these once under <strong className="text-salve-textMid">Claude settings → Connectors → Add custom connector</strong>, complete the OAuth sign-in for each, and you're set.
                </p>
                <ul className="space-y-2 mb-2.5">
                  <li className="text-[11px] text-salve-textMid leading-relaxed">
                    <div className="font-medium text-salve-text">healthex</div>
                    <div className="text-[10px] text-salve-textFaint">Pulls records from patient portals (Epic/MyChart, Cerner, etc.)</div>
                    <code className="text-[10px] text-salve-lav break-all">https://api.healthex.io/mcp</code>
                  </li>
                  <li className="text-[11px] text-salve-textMid leading-relaxed">
                    <div className="font-medium text-salve-text">function-health</div>
                    <div className="text-[10px] text-salve-textFaint">Pulls Function Health lab panels (only if you're a Function member)</div>
                    <code className="text-[10px] text-salve-lav break-all">https://services.functionhealth.com/ai-chat/mcp</code>
                  </li>
                </ul>
                <p className="text-[10px] text-salve-textFaint italic leading-relaxed">
                  Don't worry if you're not sure how to add connectors — Claude will walk you through it once the artifact loads and checks what's missing.
                </p>
              </div>

              {/* ── Fallback: one-off chat ── */}
              <details className="group">
                <summary className="cursor-pointer text-[11px] text-salve-textMid font-montserrat hover:text-salve-text flex items-center gap-1.5">
                  <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
                  Or do a one-off sync without setting up a project
                </summary>
                <div className="mt-3 pl-4 space-y-4 border-l-2 border-salve-border/40">
                  <p className="text-[11px] text-salve-textFaint leading-relaxed">
                    Open a new chat on Claude.ai and follow these steps in order.
                  </p>

                  {/* Step 1 — Prep prompt */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">1</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Send the prep prompt</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2 pl-7">
                      Primes Claude so it knows what to do when the file arrives.
                    </p>
                    <div className="pl-7">
                      <CopyButton text={PREP_PROMPT} label="Copy prep prompt" copiedLabel="Prep prompt copied!" />
                    </div>
                  </div>

                  {/* Step 2 — Attach file */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">2</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Attach the file</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed mb-2 pl-7">
                      Download it, then attach it as your next message in Claude. You don't need to type anything — Claude already has its instructions from step 1.
                    </p>
                    <div className="pl-7">
                      <a
                        href="/salve-sync.jsx"
                        download="salve-sync.jsx"
                        className="btn-magic w-full py-2.5 rounded-lg font-medium text-xs no-underline
                          bg-salve-card2 border border-salve-border text-salve-textMid
                          flex items-center justify-center gap-2
                          hover:border-salve-lav/40 hover:text-salve-lav"
                      >
                        <Sparkles size={14} />
                        Download salve-sync.jsx
                      </a>
                    </div>
                  </div>

                  {/* Step 3 — Import */}
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-full bg-salve-lav/20 text-salve-lav text-[10px] font-semibold flex items-center justify-center font-montserrat">3</span>
                      <span className="text-[12px] text-salve-text font-medium font-montserrat">Import the JSON back here</span>
                    </div>
                    <p className="text-[10px] text-salve-textFaint leading-relaxed pl-7">
                      Pull records in the artifact, download the JSON, and import via Data Management → Import above.
                    </p>
                  </div>
                </div>
              </details>
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

        {/* ── Flo ── */}
        <Card>
          <button onClick={() => toggleSource('flo')} className="w-full flex items-center justify-between bg-transparent border-none cursor-pointer p-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-salve-rose/15">
                <Heart size={16} className="text-salve-rose" />
              </div>
              <div className="text-left">
                <span className="text-[13px] text-salve-text font-medium block">Flo</span>
                <span className="text-[10px] text-salve-textFaint">Import cycle data from Flo GDPR export</span>
              </div>
            </div>
            {expandedSource === 'flo' ? <ChevronUp size={14} className="text-salve-textFaint" /> : <ChevronDown size={14} className="text-salve-textFaint" />}
          </button>
          {expandedSource === 'flo' && (
            <div className="mt-3 pt-3 border-t border-salve-border/50">
              <p className="text-[11px] text-salve-textMid font-montserrat leading-relaxed mb-2">
                Import your cycle history from Flo. Go to Flo → Profile → Settings → Request My Data, then upload the JSON file in the Cycle Tracker section.
              </p>
              <button
                onClick={() => onNav('cycles')}
                className="text-xs text-salve-rose font-montserrat bg-transparent border border-salve-rose/30 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-salve-rose/10 transition-colors"
              >
                Go to Cycle Tracker →
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* ══════════════ 7. Data & Privacy ══════════════ */}
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

            <DropZone
              onFile={processImportFile}
              accept=".json"
              label="Drop backup file here"
              hint="Or click to browse — accepts .json backups"
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

          {/* ── Remove Duplicates ── */}
          <div className="mt-4">
            <p className="text-[11px] text-salve-textFaint mb-2 font-montserrat">
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
              <p className="text-[11px] text-salve-textMid mt-1.5 font-montserrat">
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

          {/* ── Delete Account (permanent, removes auth.users row + cascades) ── */}
          <div className="mt-4 pt-4 border-t border-salve-border">
            <h4 className="text-[13px] font-medium text-salve-text mb-1 font-montserrat">Delete Account</h4>
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
                <p className="text-[13px] text-salve-rose font-medium mb-2">
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
                        // Account is gone — force a clean reload
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
              <p className="text-[13px] text-salve-textMid italic">Deleting your account…</p>
            )}
            {deleteStage === 'error' && (
              <div className="bg-salve-rose/10 border border-salve-rose/30 rounded-xl p-3.5">
                <p className="text-[13px] text-salve-rose mb-2">{deleteError}</p>
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

      {/* ══════════════ 8. Support ══════════════ */}
      <SectionTitle>Support</SectionTitle>
      <Card>
        <div className="space-y-3">
          <a
            href="https://github.com/austinkays/health/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-sm text-salve-text font-montserrat no-underline hover:text-salve-lav transition-colors"
          >
            <Bug size={14} className="text-salve-textFaint" />
            Report a Bug
          </a>
          <button
            onClick={() => onNav('feedback')}
            className="flex items-center gap-2.5 text-sm text-salve-text font-montserrat bg-transparent border-none cursor-pointer p-0 hover:text-salve-lav transition-colors"
          >
            <MessageCircle size={14} className="text-salve-textFaint" />
            Send Feedback
          </button>
          <div className="flex items-center gap-2.5 text-sm text-salve-textFaint font-montserrat">
            <Info size={14} />
            Salve v1.0
          </div>
        </div>
      </Card>

      </div>
      </div>

      {/* ══════════════ 9. Footer ══════════════ */}
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
