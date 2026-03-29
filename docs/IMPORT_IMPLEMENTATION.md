# Import & Merge Implementation Guide

Drop this into `docs/IMPORT_IMPLEMENTATION.md` in the project root. Covers everything needed to add import/export/merge to the standalone app.

---

## Overview

Three capabilities in the Settings section:

1. **Import Backup (full restore)** - Overwrites all data from a one-time export file
2. **Import Sync (merge)** - Adds only new records from an MCP health sync file
3. **Download Backup** - Exports current localStorage data as JSON

The import detects which mode to use based on the `_export.type` field in the uploaded file.

---

## 1. Storage Service Additions

**File:** `src/services/storage.js`

Add these three functions alongside the existing `load`, `save`, `clearAll`:

```js
import { SK } from '../constants/defaults';

/**
 * Export all health data as a JSON object with metadata envelope.
 * Used by the "Download Backup" button in Settings.
 */
export function exportAll() {
  const data = {};
  for (const [name, key] of Object.entries(SK)) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) data[key] = JSON.parse(raw);
    } catch { /* skip corrupted keys */ }
  }

  return {
    _export: {
      app: "ambers-remedy",
      exportedAt: new Date().toISOString(),
      keyCount: Object.keys(data).length,
    },
    ...data,
  };
}

/**
 * Validate an uploaded JSON file before import.
 * Returns { valid: true, mode, preview } or { valid: false, error }.
 *
 * mode: "restore" (full overwrite) or "merge" (add new only)
 * preview: { meds: N, conditions: N, ... } record counts
 */
export function validateImport(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not valid JSON.' };
  }
  if (!data._export || data._export.app !== 'ambers-remedy') {
    return { valid: false, error: 'This file is not a Remedy backup or sync file.' };
  }

  const mode = data._export.type === 'mcp-sync' ? 'merge' : 'restore';

  // Build preview counts
  const preview = {};
  const sources = [data['hc:core'], data['hc:tracking']];

  // Also check v2 individual keys
  const v2Keys = ['hc:meds', 'hc:vitals', 'hc:appts', 'hc:conditions', 'hc:providers', 'hc:allergies', 'hc:journal'];
  for (const k of v2Keys) {
    if (Array.isArray(data[k]) && data[k].length > 0) {
      const label = k.replace('hc:', '');
      preview[label] = data[k].length;
    }
  }

  for (const source of sources) {
    if (source && typeof source === 'object') {
      for (const [key, arr] of Object.entries(source)) {
        if (Array.isArray(arr) && arr.length > 0) {
          preview[key] = arr.length;
        }
      }
    }
  }

  if (Object.keys(preview).length === 0) {
    return { valid: false, error: 'File contains no health records.' };
  }

  return { valid: true, mode, preview };
}

/**
 * Full restore import. Overwrites all localStorage data.
 * Handles both v2 (individual keys) and v3 (batched keys) formats.
 */
export function importAll(data) {
  // Check if this is v2 format (individual keys)
  const hasV2Keys = ['hc:meds', 'hc:conditions', 'hc:allergies', 'hc:providers', 'hc:vitals', 'hc:appts', 'hc:journal']
    .some(k => data[k]);

  if (hasV2Keys && !data['hc:core']) {
    // Normalize v2 -> v3
    const core = {
      meds: data['hc:meds'] || [],
      conditions: data['hc:conditions'] || [],
      allergies: data['hc:allergies'] || [],
      providers: data['hc:providers'] || [],
    };
    const tracking = {
      vitals: data['hc:vitals'] || [],
      appts: data['hc:appts'] || [],
      journal: data['hc:journal'] || [],
    };
    localStorage.setItem(SK.core, JSON.stringify(core));
    localStorage.setItem(SK.tracking, JSON.stringify(tracking));
  } else {
    // v3 format: write batched keys directly
    if (data['hc:core']) {
      localStorage.setItem(SK.core, JSON.stringify(data['hc:core']));
    }
    if (data['hc:tracking']) {
      localStorage.setItem(SK.tracking, JSON.stringify(data['hc:tracking']));
    }
  }

  // Settings (same key in both versions)
  if (data['hc:settings']) {
    localStorage.setItem(SK.settings, JSON.stringify(data['hc:settings']));
  }

  // Last refresh timestamp
  if (data['hc:lastRefresh']) {
    localStorage.setItem(SK.lastRefresh, JSON.stringify(data['hc:lastRefresh']));
  }
}

/**
 * Merge import. Adds records with new IDs, skips records whose ID already exists.
 * Returns stats: { added: { meds: N, ... }, skipped: { meds: N, ... } }
 */
export function mergeImport(data) {
  const stats = { added: {}, skipped: {} };

  // Load current data
  let currentCore = {};
  let currentTracking = {};
  try { currentCore = JSON.parse(localStorage.getItem(SK.core)) || {}; } catch { currentCore = {}; }
  try { currentTracking = JSON.parse(localStorage.getItem(SK.tracking)) || {}; } catch { currentTracking = {}; }

  const incomingCore = data['hc:core'] || {};
  const incomingTracking = data['hc:tracking'] || {};

  // Merge helper: merges a single array by ID
  function mergeArray(existing, incoming, key) {
    if (!Array.isArray(incoming) || incoming.length === 0) return existing || [];

    const arr = Array.isArray(existing) ? [...existing] : [];
    const existingIds = new Set(arr.map(r => r.id));
    let added = 0;
    let skipped = 0;

    for (const record of incoming) {
      if (record.id && existingIds.has(record.id)) {
        skipped++;
      } else {
        arr.push(record);
        added++;
      }
    }

    if (added > 0) stats.added[key] = added;
    if (skipped > 0) stats.skipped[key] = skipped;
    return arr;
  }

  // Merge core arrays
  const mergedCore = {
    meds: mergeArray(currentCore.meds, incomingCore.meds, 'meds'),
    conditions: mergeArray(currentCore.conditions, incomingCore.conditions, 'conditions'),
    allergies: mergeArray(currentCore.allergies, incomingCore.allergies, 'allergies'),
    providers: mergeArray(currentCore.providers, incomingCore.providers, 'providers'),
  };

  // Merge tracking arrays
  const mergedTracking = {
    vitals: mergeArray(currentTracking.vitals, incomingTracking.vitals, 'vitals'),
    appts: mergeArray(currentTracking.appts, incomingTracking.appts, 'appts'),
    journal: mergeArray(currentTracking.journal, incomingTracking.journal, 'journal'),
  };

  localStorage.setItem(SK.core, JSON.stringify(mergedCore));
  localStorage.setItem(SK.tracking, JSON.stringify(mergedTracking));

  return stats;
}
```

**Important:** Make sure `SK` is exported from `src/constants/defaults.js`:

```js
export const SK = {
  core: "hc:core",
  tracking: "hc:tracking",
  settings: "hc:settings",
  lastRefresh: "hc:lastRefresh",
};
```

---

## 2. Settings UI Components

**File:** `src/components/sections/Settings.jsx`

Add these sections inside the Settings component, after the "Erase All Data" card and before the footer.

### State

```jsx
const [importFile, setImportFile] = useState(null);
const [importData, setImportData] = useState(null);
const [importValidation, setImportValidation] = useState(null);
const [importResult, setImportResult] = useState(null);
const [importError, setImportError] = useState(null);
const fileInputRef = useRef(null);
```

### File Selection Handler

```jsx
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
```

### Import Execution Handler

```jsx
function executeImport() {
  if (!importData || !importValidation) return;

  try {
    if (importValidation.mode === 'merge') {
      const stats = mergeImport(importData);
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
    } else {
      importAll(importData);
      setImportResult('Full restore complete. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
      return; // reload will handle the rest
    }

    // For merge mode, reset the data hook to pick up new records
    // Call whatever reload/refresh function your useHealthData hook exposes
    reloadData(); // <-- wire this to your data hook's reload function

    setImportData(null);
    setImportValidation(null);
    setImportFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  } catch (e) {
    setImportError('Import failed: ' + e.message);
  }
}
```

### Export Handler

```jsx
function handleExport() {
  const data = exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remedy-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### JSX

```jsx
{/* ── Import Section ── */}
<Card title="Import Data">
  <p className="text-sm text-remedy-textMid mb-4 leading-relaxed">
    Upload a backup file or a health sync file from the Claude sync artifact.
  </p>

  <input
    ref={fileInputRef}
    type="file"
    accept=".json"
    onChange={handleFileSelect}
    className="block w-full text-sm text-remedy-textMid
      file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0
      file:text-sm file:font-medium file:bg-remedy-card2 file:text-remedy-lav
      file:cursor-pointer hover:file:bg-remedy-border cursor-pointer"
  />

  {/* Validation error */}
  {importError && (
    <div className="mt-3 p-3 rounded-lg bg-remedy-rose/10 border border-remedy-rose/30 text-remedy-rose text-sm">
      {importError}
    </div>
  )}

  {/* Preview */}
  {importValidation && (
    <div className="mt-4 p-4 rounded-xl bg-remedy-card2 border border-remedy-border">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-remedy-textFaint">
          {importValidation.mode === 'merge' ? 'Sync Preview' : 'Restore Preview'}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-md ${
          importValidation.mode === 'merge'
            ? 'bg-remedy-sage/20 text-remedy-sage'
            : 'bg-remedy-amber/20 text-remedy-amber'
        }`}>
          {importValidation.mode === 'merge' ? 'Add new only' : 'Full overwrite'}
        </span>
      </div>

      <div className="space-y-1.5">
        {Object.entries(importValidation.preview).map(([key, count]) => (
          <div key={key} className="flex justify-between text-sm">
            <span className="text-remedy-textMid capitalize">{key}</span>
            <span className="text-remedy-text">{count}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={executeImport}
          className={`flex-1 py-2.5 rounded-lg font-medium text-sm ${
            importValidation.mode === 'merge'
              ? 'bg-remedy-sage text-remedy-bg'
              : 'bg-remedy-amber text-remedy-bg'
          }`}
        >
          {importValidation.mode === 'merge' ? 'Merge New Records' : 'Restore All Data'}
        </button>
        <button
          onClick={() => {
            setImportData(null);
            setImportValidation(null);
            setImportFile(null);
            setImportError(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="px-4 py-2.5 rounded-lg border border-remedy-border text-remedy-textMid text-sm"
        >
          Cancel
        </button>
      </div>

      {importValidation.mode === 'restore' && (
        <p className="mt-3 text-xs text-remedy-rose/80 leading-relaxed">
          This will replace all current data. Any records not in this file will be lost.
        </p>
      )}
    </div>
  )}

  {/* Success result */}
  {importResult && (
    <div className="mt-3 p-3 rounded-lg bg-remedy-sage/10 border border-remedy-sage/30 text-remedy-sage text-sm">
      {importResult}
    </div>
  )}
</Card>

{/* ── Export Section ── */}
<Card title="Download Backup">
  <p className="text-sm text-remedy-textMid mb-4 leading-relaxed">
    Save all your health data as a JSON file. Use this to restore later or transfer to another device.
  </p>
  <button
    onClick={handleExport}
    className="w-full py-3 rounded-xl bg-remedy-card2 border border-remedy-border text-remedy-lav font-medium text-sm
      hover:bg-remedy-border transition-colors flex items-center justify-center gap-2"
  >
    <Download size={16} />
    Download Backup
  </button>
</Card>
```

### Required Imports

At the top of Settings.jsx:

```jsx
import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { validateImport, importAll, mergeImport, exportAll } from '../../services/storage';
```

---

## 3. Tailwind Config Additions

Make sure these colors are in `tailwind.config.js` under `theme.extend.colors.remedy` (they should already be there from the base migration, but confirm):

```js
rose: '#e88a9a',
sage: '#8fbfa0',
amber: '#e8c88a',
lav: '#b8a9e8',
card2: '#2a2a44',
border: '#33335a',
textMid: '#a8a4b8',
textFaint: '#6e6a80',
text: '#e8e4f0',
bg: '#1a1a2e',
```

The Tailwind opacity modifier syntax (`bg-remedy-rose/10`, `border-remedy-sage/30`) requires the colors to be defined without alpha. If they're already hex values as above, Tailwind handles the `/10` etc. natively.

---

## 4. Wiring to useHealthData

The merge import writes directly to localStorage but the React state won't reflect the changes until the hook reloads. Two options:

**Option A (simpler):** After merge import, call `window.location.reload()` just like full restore. Slightly jarring UX but guaranteed correct.

**Option B (smoother):** Expose a `reloadData()` function from `useHealthData` that re-reads all localStorage keys and sets state. Call it after `mergeImport()` returns. The Settings component would need access to this via prop or context.

Go with Option A initially, upgrade to Option B later if the reload flash bothers Amber.

---

## 5. Testing

After implementation, verify these scenarios:

| Scenario | File type | Expected behavior |
|----------|-----------|-------------------|
| First-time import from artifact export | `remedy-backup-*.json` (no `_export.type`) | Full restore, reload, all data appears |
| First-time import from v2 artifact export | File with `hc:meds`, `hc:vitals` etc. | Normalizes to v3 schema, full restore |
| First MCP sync import | `remedy-sync-*.json` (`_export.type: "mcp-sync"`) | Merge mode, all records added (0 skipped) |
| Repeat MCP sync import (same data) | Same sync file again | Merge mode, 0 added, all skipped |
| MCP sync after manual edits | Sync file + manually added records in app | Merge adds new MCP records, manual records untouched |
| Invalid file | Random .json file | Error: "not a Remedy backup" |
| Non-JSON file | .txt or .csv | Error: "Please select a .json file" |
| Corrupt JSON | Malformed .json | Error: "Could not parse file" |
| Empty backup | Valid envelope but empty arrays | Error: "contains no health records" |
| Export then re-import | Download Backup -> Import that file | Full restore, identical data |

---

## 6. File Checklist

| File | Action |
|------|--------|
| `src/services/storage.js` | Add `exportAll`, `validateImport`, `importAll`, `mergeImport` |
| `src/constants/defaults.js` | Confirm `SK` is exported |
| `src/components/sections/Settings.jsx` | Add import/export UI and handlers |
| `tailwind.config.js` | Confirm opacity modifier support for remedy colors |
