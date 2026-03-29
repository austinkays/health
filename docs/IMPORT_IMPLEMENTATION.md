# Import & Merge Implementation Guide (Supabase)

Covers everything needed for the MCP health sync import into Salve's Supabase backend.

---

## Overview

The Claude sync artifact (`salve-health-sync.jsx`) pulls health records from MCP-connected services and exports a JSON file. Salve's Settings imports that file and merges new records into Supabase without duplicating anything or touching manually-entered data.

The merge uses a **`sync_id` column** on each health table. MCP-synced records get a deterministic content-based ID (e.g. `mcp-med-00a3f2k1`). Manually created records have `sync_id = null`. On import, the merge checks: does a row with this `sync_id` already exist for this user? If yes, skip. If no, insert.

---

## 1. Schema Migration

**File:** `supabase/migrations/002_sync_id.sql`

Add a nullable `sync_id` column to every health table. Index it for fast merge lookups.

```sql
-- Add sync_id to all health tables for MCP merge deduplication
-- sync_id is null for manually-created records
-- sync_id is a deterministic hash for MCP-synced records (e.g. "mcp-med-00a3f2k1")

ALTER TABLE medications ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE conditions ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE vitals ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS sync_id TEXT;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS sync_id TEXT;

-- Composite indexes: user_id + sync_id for fast merge lookups
CREATE INDEX IF NOT EXISTS idx_medications_sync ON medications (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conditions_sync ON conditions (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_allergies_sync ON allergies (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providers_sync ON providers (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vitals_sync ON vitals (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_sync ON appointments (user_id, sync_id) WHERE sync_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_sync ON journal_entries (user_id, sync_id) WHERE sync_id IS NOT NULL;
```

Run this migration in the Supabase dashboard (SQL Editor) or via CLI.

---

## 2. Sync Export Format

The sync artifact outputs this structure:

```json
{
  "_export": {
    "app": "salve",
    "type": "mcp-sync",
    "exportedAt": "2026-03-28T...",
    "source": "claude-mcp-health-sync"
  },
  "medications": [
    { "name": "...", "dose": "...", "frequency": "...", "route": "...", "prescriber": "...", "pharmacy": "...", "purpose": "...", "start_date": "...", "refill_date": "...", "active": true, "notes": "", "_sync_id": "mcp-med-00a3f2k1" }
  ],
  "conditions": [
    { "name": "...", "diagnosed_date": "...", "status": "active", "provider": "...", "linked_meds": "", "notes": "", "_sync_id": "mcp-cond-0b2e8f1a" }
  ],
  "allergies": [...],
  "providers": [...],
  "vitals": [...],
  "appointments": [...],
  "journal_entries": [...]
}
```

Each record has a `_sync_id` field (content-based deterministic hash, prefixed with `mcp-`). This maps to the `sync_id` column in Supabase.

---

## 3. Storage Service: `importMerge()`

**File:** `src/services/storage.js`

Replace or update the existing `importMerge` function:

```js
import { supabase } from './supabase';

/**
 * Table names that support MCP sync merge.
 * Keys match the export JSON keys AND the Supabase table names.
 */
const SYNC_TABLES = {
  medications: 'medications',
  conditions: 'conditions',
  allergies: 'allergies',
  providers: 'providers',
  vitals: 'vitals',
  appointments: 'appointments',
  journal_entries: 'journal_entries',
};

/**
 * Fields to strip before inserting into Supabase.
 * These are export-only metadata, not real columns.
 */
const STRIP_FIELDS = ['_sync_id', 'id', 'user_id', 'created_at', 'updated_at'];

/**
 * Merge import from MCP sync file.
 * Adds records whose _sync_id doesn't already exist for this user.
 * Returns { added: { medications: N, ... }, skipped: { medications: N, ... } }
 */
export async function importMerge(data, userId) {
  const stats = { added: {}, skipped: {} };

  for (const [key, table] of Object.entries(SYNC_TABLES)) {
    const incoming = data[key];
    if (!Array.isArray(incoming) || incoming.length === 0) continue;

    // Collect all sync IDs from this batch
    const syncIds = incoming
      .map(r => r._sync_id)
      .filter(Boolean);

    // Query which sync_ids already exist for this user
    let existingIds = new Set();
    if (syncIds.length > 0) {
      const { data: existing, error } = await supabase
        .from(table)
        .select('sync_id')
        .eq('user_id', userId)
        .in('sync_id', syncIds);

      if (!error && existing) {
        existingIds = new Set(existing.map(r => r.sync_id));
      }
    }

    // Split into new vs duplicate
    const toInsert = [];
    let skipped = 0;

    for (const record of incoming) {
      const syncId = record._sync_id;

      if (syncId && existingIds.has(syncId)) {
        skipped++;
        continue;
      }

      // Build the insert row: strip metadata, add user_id and sync_id
      const row = { user_id: userId };
      for (const [field, value] of Object.entries(record)) {
        if (!STRIP_FIELDS.includes(field)) {
          row[field] = value;
        }
      }
      if (syncId) {
        row.sync_id = syncId;
      }

      toInsert.push(row);
    }

    // Bulk insert new records
    if (toInsert.length > 0) {
      const { error } = await supabase
        .from(table)
        .insert(toInsert);

      if (error) {
        console.error(`Merge insert error for ${table}:`, error);
        // Continue with other tables rather than aborting entirely
      } else {
        stats.added[key] = toInsert.length;
      }
    }

    if (skipped > 0) {
      stats.skipped[key] = skipped;
    }
  }

  return stats;
}
```

---

## 4. Validation Update

**File:** `src/services/storage.js`

Update `validateImport()` to recognize the sync format and preview by table:

```js
export function validateImport(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'File is not valid JSON.' };
  }

  // Accept both "salve" and legacy "ambers-remedy" app names
  const appName = data._export?.app;
  if (!data._export || (appName !== 'salve' && appName !== 'ambers-remedy')) {
    return { valid: false, error: 'This file is not a Salve backup or sync file.' };
  }

  const mode = data._export.type === 'mcp-sync' ? 'merge' : 'restore';

  // Build preview counts from table-level arrays
  const preview = {};
  for (const key of Object.keys(SYNC_TABLES)) {
    if (Array.isArray(data[key]) && data[key].length > 0) {
      preview[key] = data[key].length;
    }
  }

  // Also check legacy batched format (hc:core, hc:tracking)
  for (const container of [data['hc:core'], data['hc:tracking']]) {
    if (container && typeof container === 'object') {
      for (const [key, arr] of Object.entries(container)) {
        if (Array.isArray(arr) && arr.length > 0 && !preview[key]) {
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
```

---

## 5. Settings UI: Import Handler

**File:** `src/components/sections/Settings.jsx`

The import execution handler needs to pass `userId` and call the async Supabase-based merge:

```js
import { validateImport, importMerge, importRestore, exportAll } from '../../services/storage';

// Inside Settings component, get the session from wherever you access it:
// const { session } = useAuth();  -or-  passed as prop, etc.

async function executeImport() {
  if (!importData || !importValidation) return;
  setImportError(null);

  try {
    if (importValidation.mode === 'merge') {
      const userId = session.user.id;
      const stats = await importMerge(importData, userId);

      const addedTotal = Object.values(stats.added).reduce((s, n) => s + n, 0);
      const skippedTotal = Object.values(stats.skipped).reduce((s, n) => s + n, 0);

      const parts = [];
      for (const [key, count] of Object.entries(stats.added)) {
        const label = key.replace(/_/g, ' ');
        parts.push(`${count} ${label}`);
      }

      setImportResult(
        addedTotal > 0
          ? `Added ${parts.join(', ')}. Skipped ${skippedTotal} existing.`
          : `All ${skippedTotal} records already exist. Nothing new to add.`
      );

      // Refresh React state from Supabase
      await reloadData();

      // Reset file input
      setImportData(null);
      setImportValidation(null);
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      // Full restore (existing logic)
      await importRestore(importData, session.user.id);
      setImportResult('Full restore complete. Reloading...');
      setTimeout(() => window.location.reload(), 1500);
    }
  } catch (e) {
    setImportError('Import failed: ' + e.message);
  }
}
```

The rest of the Settings import UI (file picker, preview card, confirm/cancel buttons, export button) stays the same. The only change is swapping the old `importMerge(data)` call for `importMerge(data, userId)` and making it `await`.

---

## 6. Export Update

**File:** `src/services/storage.js`

Update `exportAll()` to preserve `sync_id` so round-tripping (export from Salve, re-import as merge) deduplicates correctly:

```js
export async function exportAll(userId) {
  const data = {
    _export: {
      app: "salve",
      exportedAt: new Date().toISOString(),
    },
  };

  for (const [key, table] of Object.entries(SYNC_TABLES)) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && rows) {
      data[key] = rows.map(row => {
        const out = { ...row };
        // Map sync_id to _sync_id for export format compatibility
        if (row.sync_id) {
          out._sync_id = row.sync_id;
        }
        // Strip Supabase internal fields
        delete out.user_id;
        delete out.sync_id;
        return out;
      });
    }
  }

  // Include profile/settings
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (profile) {
    data.profile = profile;
    delete data.profile.id;
  }

  data._export.recordCount = Object.keys(SYNC_TABLES)
    .reduce((sum, key) => sum + (data[key]?.length || 0), 0);

  return data;
}
```

---

## 7. Testing

| Scenario | Expected |
|----------|----------|
| First MCP sync import | Merge mode, all records inserted with `sync_id` populated |
| Repeat sync (identical data) | 0 added, all skipped (sync_ids match) |
| Sync after new MCP data appears | New records added, old ones skipped |
| Sync + manually added records | Manual records untouched (no sync_id to collide) |
| Full restore import | All data wiped and replaced (existing behavior) |
| Export then re-import as merge | All records skipped (sync_ids preserved in export) |
| Legacy `ambers-remedy` file | Accepted by validator, restore mode |
| Invalid / non-Salve JSON | Rejected with error |
| Encrypted file | Detected, passphrase prompt, decrypt, then validate (existing behavior) |

---

## 8. Checklist

| File | Action |
|------|--------|
| `supabase/migrations/002_sync_id.sql` | **Create.** Add `sync_id` column + partial indexes to all 7 health tables |
| `src/services/storage.js` | **Update.** New `importMerge(data, userId)`, update `validateImport()`, update `exportAll(userId)` |
| `src/components/sections/Settings.jsx` | **Update.** Pass `session.user.id` to `importMerge`, `await` the call, call `reloadData()` after |
| No changes needed | `db.js`, `cache.js`, `crypto.js`, `auth.js`, `ai.js`, UI components, section files |
