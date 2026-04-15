/**
 * Shared parsing utilities for import parsers (Clue, Daylio, Libre, Samsung
 * Health, Garmin, etc.). Every new parser should reuse these helpers for
 * consistency: CSV splitting, date normalization, daily aggregation, and
 * deduplication against existing records.
 */

/**
 * Parse a CSV text blob into an array of row objects keyed by header name.
 * Handles quoted fields (including embedded commas and escaped quotes),
 * auto-detects `\n` / `\r\n` line endings, and trims each cell.
 *
 * Options:
 *   delimiter: default ','   (pass ';' or '\t' for TSV)
 *   headerRow: default 0     (first non-empty row is treated as headers)
 *   skipEmpty: default true  (skip blank lines)
 *
 * Returns [] on empty input.
 */
export function parseCSV(text, opts = {}) {
  if (!text || typeof text !== 'string') return [];
  const delimiter = opts.delimiter || ',';
  const skipEmpty = opts.skipEmpty !== false;

  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { cur.push(field); field = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      cur.push(field);
      field = '';
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (!skipEmpty || cur.some(v => v.trim() !== '')) rows.push(cur);
      cur = [];
      continue;
    }
    field += ch;
  }
  if (field !== '' || cur.length) {
    cur.push(field);
    if (!skipEmpty || cur.some(v => v.trim() !== '')) rows.push(cur);
  }

  if (rows.length < 2) return [];

  const headerIdx = opts.headerRow || 0;
  const headers = rows[headerIdx].map(h => h.trim());
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (row[c] || '').trim();
    }
    out.push(obj);
  }
  return out;
}

/**
 * Try to pull a YYYY-MM-DD date string out of anything resembling a date.
 * Accepts:
 *   ISO strings ("2025-04-13", "2025-04-13T09:00:00Z")
 *   US format ("04/13/2025", "4/13/25")
 *   EU format ("13/04/2025", "13.04.2025")
 *   Unix timestamps (ms or s)
 *   Date instances
 *
 * Returns null if nothing parses cleanly.
 */
export function normalizeDate(value) {
  if (value == null || value === '') return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return null;

  // ISO 8601 (strip time if present)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = iso[1], m = iso[2].padStart(2, '0'), d = iso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Slash / dot separated
  const slash = s.match(/^(\d{1,4})[/.](\d{1,2})[/.](\d{1,4})/);
  if (slash) {
    let [, a, b, c] = slash;
    // Heuristic: if first part is 4 digits it's YYYY/MM/DD, else MM/DD/YYYY
    if (a.length === 4) {
      return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    }
    // If third part is 2 digits, assume 2000s
    if (c.length === 2) c = (parseInt(c, 10) > 50 ? '19' : '20') + c;
    // Assume MM/DD/YYYY (US). Locale-aware day-first detection is hard; users
    // from DD/MM/YYYY locales will see swapped dates and can fix in the UI.
    return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }

  // Fallback: let the JS Date parser try
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

/**
 * Extract HH:MM from a datetime-ish string for hourly-bucketed vitals.
 * Returns null if no time component is present.
 */
export function extractHour(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return `${String(value.getHours()).padStart(2, '0')}:00`;
  }
  const s = String(value);
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:00`;
}

/**
 * Convert a number or string to a finite number, or null if invalid.
 * Handles commas in European decimals (e.g. "7,5" for 7.5).
 */
export function toNum(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;
  const s = String(value).trim().replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}

/** Round a number to N decimal places. */
export function round(n, places = 1) {
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}

/** Convert kilograms to pounds. */
export function kgToLbs(kg) { return kg * 2.20462; }

/** Convert Celsius to Fahrenheit. */
export function cToF(c) { return (c * 9) / 5 + 32; }

/** Convert meters to miles. */
export function mToMi(m) { return m / 1609.344; }

/** Convert meters to kilometers. */
export function mToKm(m) { return m / 1000; }

/** Convert mmol/L glucose to mg/dL (US units). */
export function mmolToMgDl(mmol) { return mmol * 18.0182; }

/**
 * Group records by day, aggregating values with an aggregator function.
 * Useful for high-frequency data like CGM glucose or heart rate streams.
 *
 *   bucketByDay(readings, r => r.date, r => r.value, {
 *     agg: 'avg',                // 'avg' | 'sum' | 'min' | 'max' | 'first' | 'last'
 *     keep: ['min', 'max', 'n'], // extra fields in the output record
 *   })
 */
export function bucketByDay(records, dateFn, valueFn, opts = {}) {
  const agg = opts.agg || 'avg';
  const keep = new Set(opts.keep || []);
  const groups = new Map();

  for (const r of records) {
    const d = dateFn(r);
    const v = valueFn(r);
    if (!d || v == null || !isFinite(v)) continue;
    let g = groups.get(d);
    if (!g) { g = { date: d, values: [], sum: 0, min: Infinity, max: -Infinity }; groups.set(d, g); }
    g.values.push(v);
    g.sum += v;
    if (v < g.min) g.min = v;
    if (v > g.max) g.max = v;
  }

  const out = [];
  for (const g of groups.values()) {
    let value;
    switch (agg) {
      case 'sum':   value = g.sum; break;
      case 'min':   value = g.min; break;
      case 'max':   value = g.max; break;
      case 'first': value = g.values[0]; break;
      case 'last':  value = g.values[g.values.length - 1]; break;
      case 'avg':
      default:      value = g.sum / g.values.length; break;
    }
    const rec = { date: g.date, value: round(value, 1) };
    if (keep.has('min')) rec.min = round(g.min, 1);
    if (keep.has('max')) rec.max = round(g.max, 1);
    if (keep.has('n'))   rec.n = g.values.length;
    out.push(rec);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Deduplicate `incoming` records against `existing` records using a
 * per-record key function. Returns only the new records.
 */
export function deduplicateAgainst(incoming, existing, keyFn) {
  if (!incoming || !incoming.length) return [];
  const seen = new Set();
  for (const r of existing || []) {
    try { seen.add(keyFn(r)); } catch { /* ignore malformed existing rows */ }
  }
  const out = [];
  for (const r of incoming) {
    let k;
    try { k = keyFn(r); } catch { continue; }
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/**
 * Standard dedup keys per Salve table, shared across all import parsers.
 * Every parser uses these so re-importing the same file is idempotent and
 * cross-source data (Apple + Samsung + Garmin) never creates duplicates on
 * the same day+type.
 */
export const DEDUP_KEYS = {
  vitals:          (r) => `${r.date}|${r.type}|${r.time || ''}|${r.value}|${r.value2 || ''}`,
  activities:      (r) => `${r.date}|${r.type}|${r.duration_minutes || ''}|${r.distance || ''}`,
  cycles:          (r) => `${r.date}|${r.type}|${r.value || ''}|${r.symptom || ''}`,
  journal_entries: (r) => `${r.date}|${(r.title || '').slice(0, 40)}|${(r.content || '').slice(0, 60)}`,
  labs:            (r) => `${r.date}|${r.test_name}|${r.result}`,
  genetic_results: (r) => `${r.gene}|${r.variant}|${r.source || ''}`,
};

/** Read a File as text (UTF-8). Returns a promise. */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

/** Read a File as ArrayBuffer (for ZIPs). Returns a promise. */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
