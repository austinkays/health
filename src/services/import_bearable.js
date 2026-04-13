/**
 * Bearable CSV import.
 *
 * Bearable is a chronic-illness tracker. Its export is a CSV with one row
 * per entry and columns like:
 *   date, time of day, category, detail, rating/amount
 *
 * "category" covers things like mood, energy, sleep, symptoms, medication,
 * factors, etc. "detail" is the name of the thing tracked. "rating" is a
 * numeric score, usually 1-5 for mood/energy or severity for symptoms.
 *
 * We fan out:
 *   - category=mood     → journal_entries with mood
 *   - category=energy   → vitals ('energy')
 *   - category=sleep    → vitals ('sleep')
 *   - category=symptoms → journal_entries content + symptom tags
 *   - everything else   → journal_entries tagged by category
 */

import { parseCSV, normalizeDate, toNum } from './_parse';

export const META = {
  id: 'bearable',
  label: 'Bearable',
  tagline: 'Import mood, energy, sleep, and symptoms from Bearable.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open Bearable on your phone',
    'Go to <strong>Settings</strong>, then <strong>Export Data</strong>',
    'Choose <strong>CSV</strong> and pick a date range',
    'Save or share the export to your device',
    'Upload the CSV below',
  ],
};

// Bearable mood ratings 1-5 → Salve mood labels
function ratingToMood(n) {
  if (n >= 4.5) return 'amazing';
  if (n >= 3.5) return 'good';
  if (n >= 2.5) return 'okay';
  if (n >= 1.5) return 'low';
  return 'rough';
}

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 3000).toLowerCase();
  return head.includes('bearable') ||
         (head.includes('category') && head.includes('rating') && head.includes('detail')) ||
         (head.includes('mood') && head.includes('symptom') && head.includes('energy'));
}

export function parse(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { journal_entries: [], vitals: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0] || {});
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const dateKey = findKey('date');
  const catKey = findKey('category');
  const detKey = findKey('detail', 'item', 'name');
  const ratKey = findKey('rating', 'score', 'amount', 'severity');
  if (!dateKey) return { journal_entries: [], vitals: [], counts: { total: 0 } };

  // Group entries per date so we emit one journal entry per day (with all
  // symptoms/factors bundled) rather than 30 tiny journal entries per day.
  const byDate = new Map();
  const vitals = [];

  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;

    const category = String(row[catKey] || '').trim().toLowerCase();
    const detail = String(row[detKey] || '').trim();
    const rating = toNum(row[ratKey]);

    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        title: '',
        mood: null,
        moodRating: null,
        content: '',
        symptoms: [],
        factors: [],
      });
    }
    const entry = byDate.get(date);

    if (category === 'mood' && rating != null) {
      entry.moodRating = rating;
      entry.mood = ratingToMood(rating);
    } else if (category === 'energy' && rating != null) {
      // Bearable uses a 1-5 scale. Normalize to Salve's /10 convention so
      // the energy chart stays consistent with Oura and manual entries.
      const normalized = Math.max(1, Math.min(10, Math.round(rating * 2)));
      vitals.push({
        date,
        type: 'energy',
        value: String(normalized),
        unit: '/10',
        notes: 'from Bearable',
        source: 'bearable',
      });
    } else if (category === 'sleep' && rating != null) {
      // Bearable's "sleep" category can be either a 1-5 quality rating or
      // actual hours slept. We only store rows that look like realistic hour
      // counts (3-14) and drop quality ratings since they'd corrupt the
      // vitals sleep chart if treated as hours.
      if (rating >= 3 && rating <= 14) {
        vitals.push({
          date,
          type: 'sleep',
          value: String(rating),
          unit: 'hr',
          notes: 'from Bearable',
          source: 'bearable',
        });
      }
    } else if (category.includes('symptom')) {
      entry.symptoms.push(detail + (rating != null ? ` (${rating})` : ''));
    } else if (detail) {
      entry.factors.push(`${category || 'note'}: ${detail}`);
    }
  }

  const entries = [];
  for (const entry of byDate.values()) {
    const parts = [];
    if (entry.symptoms.length) parts.push(`Symptoms: ${entry.symptoms.join(', ')}`);
    if (entry.factors.length)  parts.push(entry.factors.join('; '));

    entries.push({
      date: entry.date,
      title: entry.title || `Bearable ${entry.mood || 'check-in'}`,
      mood: entry.mood || 'okay',
      content: parts.join('\n\n'),
      tags: 'bearable',
    });
  }

  return { journal_entries: entries, vitals, counts: { total: entries.length + vitals.length } };
}
