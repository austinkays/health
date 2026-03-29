import { supabase } from './supabase';
import { db } from './db';

// ── Map internal keys → Supabase table names ──
const TABLE_MAP = {
  meds: 'medications',
  conditions: 'conditions',
  allergies: 'allergies',
  providers: 'providers',
  vitals: 'vitals',
  appts: 'appointments',
  journal: 'journal_entries',
};

// Strip server-generated fields before inserting
function stripMeta(record) {
  const { id, created_at, updated_at, user_id, ...rest } = record;
  return rest;
}

/**
 * Export all health data as a JSON object with metadata envelope.
 * Takes the current React state (from useHealthData).
 */
export function exportAll(data) {
  return {
    _export: {
      app: 'salve',
      exportedAt: new Date().toISOString(),
      version: 1,
    },
    settings: data.settings,
    meds: data.meds,
    conditions: data.conditions,
    allergies: data.allergies,
    providers: data.providers,
    vitals: data.vitals,
    appts: data.appts,
    journal: data.journal,
  };
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

  const mode = fileData._export?.type === 'mcp-sync' ? 'merge' : 'restore';
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
  // Salve v1 format (our own export)
  if (fileData._export?.app === 'salve') {
    return {
      settings: fileData.settings || null,
      meds: fileData.meds || [],
      conditions: fileData.conditions || [],
      allergies: fileData.allergies || [],
      providers: fileData.providers || [],
      vitals: fileData.vitals || [],
      appts: fileData.appts || [],
      journal: fileData.journal || [],
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
 */
export async function importRestore(normalized) {
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
}

/**
 * Merge import: add only records whose ID doesn't already exist.
 * Returns stats: { added: { meds: N, ... }, skipped: { meds: N, ... } }
 */
export async function importMerge(normalized, existingData) {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user.id;

  const stats = { added: {}, skipped: {} };

  for (const [key, table] of Object.entries(TABLE_MAP)) {
    const incoming = normalized[key];
    if (!incoming || incoming.length === 0) continue;

    const existing = existingData[key] || [];
    const existingIds = new Set(existing.map(r => r.id));

    const toAdd = [];
    let skipped = 0;

    for (const record of incoming) {
      if (record.id && existingIds.has(record.id)) {
        skipped++;
      } else {
        toAdd.push({ ...stripMeta(record), user_id: uid });
      }
    }

    if (toAdd.length > 0) {
      const { error } = await supabase.from(table).insert(toAdd);
      if (error) {
        console.error(`Merge error for ${table}:`, error);
      } else {
        stats.added[key] = toAdd.length;
      }
    }
    if (skipped > 0) stats.skipped[key] = skipped;
  }

  return stats;
}
