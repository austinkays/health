import { supabase } from './supabase';
import { db } from './db';

// ── Map internal keys → Supabase table names ──
const TABLE_MAP = {
  // Original 7 sections
  meds:       'medications',
  conditions: 'conditions',
  allergies:  'allergies',
  providers:  'providers',
  vitals:     'vitals',
  appts:      'appointments',
  journal:    'journal_entries',
  pharmacies:           'pharmacies',
  // Comprehensive schema v3 — new 8 sections
  // These use the same name internally and externally
  labs:                 'labs',
  procedures:           'procedures',
  immunizations:        'immunizations',
  care_gaps:            'care_gaps',
  anesthesia_flags:     'anesthesia_flags',
  appeals_and_disputes: 'appeals_and_disputes',
  surgical_planning:    'surgical_planning',
  insurance:            'insurance',
  insurance_claims:     'insurance_claims',
  drug_prices:          'drug_prices',
  todos:                'todos',
  conversations:        'ai_conversations',
};

// Strip server-generated fields before inserting
function stripMeta(record) {
  const { id, created_at, updated_at, user_id, ...rest } = record;
  return rest;
}

/**
 * Export all health data as a JSON object with metadata envelope.
 * Fetches from Supabase to include sync_id for round-trip deduplication.
 */
export async function exportAll() {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user.id;

  const exported = {
    _export: {
      app: 'salve',
      exportedAt: new Date().toISOString(),
      version: 1,
    },
  };

  for (const [key, table] of Object.entries(TABLE_MAP)) {
    const { data: rows, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });

    if (!error && rows) {
      exported[key] = rows.map(row => {
        const out = { ...row };
        // Preserve sync_id as _sync_id in export format
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
    .eq('id', uid)
    .single();

  if (profile) {
    exported.settings = profile;
    delete exported.settings.id;
  }

  exported._export.recordCount = Object.keys(TABLE_MAP)
    .reduce((sum, key) => sum + (exported[key]?.length || 0), 0);
  exported._export.version = 3;

  return exported;
}

/**
 * Encrypt an export payload with a user-supplied passphrase (AES-GCM).
 * Returns a JSON string with { _encrypted, salt, iv, data }.
 */
export async function encryptExport(exportData, passphrase) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const plaintext = enc.encode(JSON.stringify(exportData));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return JSON.stringify({
    _encrypted: { app: 'salve', version: 1 },
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  }, null, 2);
}

/**
 * Decrypt an encrypted backup file with a passphrase.
 * Returns the parsed export object.
 */
export async function decryptExport(encryptedObj, passphrase) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(encryptedObj.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(encryptedObj.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encryptedObj.data), c => c.charCodeAt(0));

  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

/**
 * Validate an uploaded JSON file before import.
 * Returns { valid, mode, preview, normalized } or { valid: false, error }.
 */
export function validateImport(fileData) {
  if (!fileData || typeof fileData !== 'object') {
    return { valid: false, error: 'File is not valid JSON.' };
  }

  const isAppExport = fileData._export &&
    (fileData._export.app === 'salve' || fileData._export.app === 'ambers-remedy');
  const isLegacyFormat = fileData['hc:core'] || fileData['hc:meds'];

  if (!isAppExport && !isLegacyFormat) {
    return { valid: false, error: 'This file is not a Salve backup or sync file.' };
  }

  // Both 'mcp-sync' and 'mcp-sync-comprehensive' are merge imports
  const isMerge = fileData._export?.type?.startsWith('mcp-sync');
  const mode = isMerge ? 'merge' : 'restore';
  const normalized = normalizeImportData(fileData);

  const preview = {};
  for (const [key, arr] of Object.entries(normalized)) {
    if (key === 'settings') continue;
    if (Array.isArray(arr) && arr.length > 0) {
      preview[key] = arr.length;
    }
  }

  if (Object.keys(preview).length === 0) {
    return { valid: false, error: 'File contains no health records.' };
  }

  return { valid: true, mode, preview, normalized };
}

/**
 * Normalize any supported file format into a flat structure.
 */
function normalizeImportData(fileData) {
  // MCP sync format — both 'mcp-sync' (v1) and 'mcp-sync-comprehensive' (v3)
  if (fileData._export?.type?.startsWith('mcp-sync')) {
    return {
      settings: null,
      // Original 7 (name-mapped)
      meds:       fileData.medications    || [],
      conditions: fileData.conditions     || [],
      allergies:  fileData.allergies      || [],
      providers:  fileData.providers      || [],
      vitals:     fileData.vitals         || [],
      appts:      fileData.appointments   || [],
      journal:    fileData.journal_entries || [],
      // Comprehensive v3 — same name internally and externally
      labs:                 fileData.labs                 || [],
      procedures:           fileData.procedures           || [],
      immunizations:        fileData.immunizations        || [],
      care_gaps:            fileData.care_gaps            || [],
      anesthesia_flags:     fileData.anesthesia_flags     || [],
      appeals_and_disputes: fileData.appeals_and_disputes || [],
      surgical_planning:    fileData.surgical_planning    || [],
      insurance:            fileData.insurance            || [],
    };
  }

  // Salve v1 format (our own backup export)
  if (fileData._export?.app === 'salve') {
    return {
      settings: fileData.settings || null,
      meds:       fileData.meds       || [],
      conditions: fileData.conditions || [],
      allergies:  fileData.allergies  || [],
      providers:  fileData.providers  || [],
      vitals:     fileData.vitals     || [],
      appts:      fileData.appts      || [],
      journal:    fileData.journal    || [],
      // v3 fields if present in a future backup export
      labs:                 fileData.labs                 || [],
      procedures:           fileData.procedures           || [],
      immunizations:        fileData.immunizations        || [],
      care_gaps:            fileData.care_gaps            || [],
      anesthesia_flags:     fileData.anesthesia_flags     || [],
      appeals_and_disputes: fileData.appeals_and_disputes || [],
      surgical_planning:    fileData.surgical_planning    || [],
      insurance:            fileData.insurance            || [],
    };
  }

  // Legacy v3 format (batched hc:core / hc:tracking)
  if (fileData['hc:core']) {
    const core = fileData['hc:core'];
    const tracking = fileData['hc:tracking'] || {};
    return {
      settings: fileData['hc:settings'] || null,
      meds: core.meds || [],
      conditions: core.conditions || [],
      allergies: core.allergies || [],
      providers: core.providers || [],
      vitals: tracking.vitals || [],
      appts: tracking.appts || [],
      journal: tracking.journal || [],
    };
  }

  // Legacy v2 format (individual hc: keys)
  return {
    settings: fileData['hc:settings'] || null,
    meds: fileData['hc:meds'] || [],
    conditions: fileData['hc:conditions'] || [],
    allergies: fileData['hc:allergies'] || [],
    providers: fileData['hc:providers'] || [],
    vitals: fileData['hc:vitals'] || fileData['hc:appointments'] || [],
    appts: fileData['hc:appts'] || [],
    journal: fileData['hc:journal'] || [],
  };
}

/**
 * Full restore: erase existing data, insert all imported records.
 * Creates an in-memory backup before erasing so data can be recovered on failure.
 */
export async function importRestore(normalized) {
  // Create backup of current data before erasing
  let backup;
  try {
    backup = await exportAll();
  } catch {
    // If we can't backup, proceed anyway — user explicitly chose restore
    backup = null;
  }

  try {
    await db.eraseAll();

    const { data: { user } } = await supabase.auth.getUser();
    const uid = user.id;

    // Restore profile/settings if present
    if (normalized.settings) {
      const { id, created_at, updated_at, user_id, ...fields } = normalized.settings;
      await supabase.from('profiles').update(fields).eq('id', uid);
    }

    // Bulk insert each table
    for (const [key, table] of Object.entries(TABLE_MAP)) {
      const records = normalized[key];
      if (records && records.length > 0) {
        const rows = records.map(r => ({ ...stripMeta(r), user_id: uid }));
        const { error } = await supabase.from(table).insert(rows);
        if (error) console.error(`Import error for ${table}:`, error);
      }
    }
  } catch (err) {
    // Import failed — attempt to restore from backup
    if (backup) {
      console.error('Import failed, attempting to restore backup:', err);
      try {
        const backupNormalized = normalizeImportData(backup);
        const { data: { user } } = await supabase.auth.getUser();
        const uid = user.id;
        for (const [key, table] of Object.entries(TABLE_MAP)) {
          const records = backupNormalized[key];
          if (records && records.length > 0) {
            const rows = records.map(r => ({ ...stripMeta(r), user_id: uid }));
            await supabase.from(table).insert(rows);
          }
        }
      } catch (restoreErr) {
        console.error('Backup restore also failed:', restoreErr);
      }
    }
    throw err;
  }
}

/**
 * Merge import: add only records whose sync_id doesn't already exist.
 * Uses sync_id for deduplication against Supabase.
 * Returns stats: { added: { meds: N, ... }, skipped: { meds: N, ... } }
 */
export async function importMerge(normalized) {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user.id;

  const stats = { added: {}, skipped: {} };

  for (const [key, table] of Object.entries(TABLE_MAP)) {
    const incoming = normalized[key];
    if (!incoming || incoming.length === 0) continue;

    // Collect sync IDs for dedup query
    const syncIds = incoming.map(r => r._sync_id).filter(Boolean);

    let existingSyncIds = new Set();
    if (syncIds.length > 0) {
      const { data: existing, error } = await supabase
        .from(table)
        .select('sync_id')
        .eq('user_id', uid)
        .in('sync_id', syncIds);

      if (!error && existing) {
        existingSyncIds = new Set(existing.map(r => r.sync_id));
      }
    }

    const toInsert = [];
    let skipped = 0;

    for (const record of incoming) {
      const syncId = record._sync_id;

      if (syncId && existingSyncIds.has(syncId)) {
        skipped++;
        continue;
      }

      // Build insert row: strip metadata, add user_id and sync_id
      const stripped = stripMeta(record);
      const { _sync_id: _, ...rowData } = stripped;
      const row = { ...rowData, user_id: uid };
      if (syncId) {
        row.sync_id = syncId;
      }

      toInsert.push(row);
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from(table).insert(toInsert);
      if (error) {
        console.error(`Merge insert error for ${table}:`, error);
      } else {
        stats.added[key] = toInsert.length;
      }
    }
    if (skipped > 0) stats.skipped[key] = skipped;
  }

  return stats;
}
