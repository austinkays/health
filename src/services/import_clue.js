/**
 * Clue CSV import.
 *
 * Clue's "Export Data" produces a single CSV with one row per day and a
 * wide set of columns for every tracked metric (period flow, pain,
 * emotions, mental, energy, sleep, digestion, fluid, etc.). Some cells
 * are boolean ("true"/"yes"/"1"), others are severity labels ("light",
 * "medium", "heavy"), and tag columns hold comma-separated values.
 *
 * We pull out:
 *   - Period days (flow level)  → cycles ('period')
 *   - Ovulation / LH test flags → cycles ('ovulation')
 *   - Symptom flags             → cycles ('symptom', one per tracked symptom)
 *
 * Everything maps into the existing `cycles` table so it shows up on the
 * CycleTracker calendar next to Flo imports, Oura BBT, and manual entries.
 */

import { parseCSV, normalizeDate } from './_parse';

export const META = {
  id: 'clue',
  label: 'Clue',
  tagline: 'Import period, symptoms, and ovulation tracking from Clue.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open the Clue app on your phone',
    'Go to <strong>Profile</strong>, then <strong>Settings</strong>',
    'Tap <strong>Privacy</strong>, then <strong>Export my data</strong>',
    'Choose <strong>CSV</strong> and email it to yourself',
    'Download the CSV and upload it below',
  ],
};

// Columns we map into cycles. Keys are Clue column names (lowercased),
// values describe how to translate a truthy cell into a cycle record.
const FLOW_COLS = ['period', 'bleeding', 'flow', 'menstruation'];
const FLOW_MAP = {
  spotting: 'Spotting', light: 'Light', medium: 'Medium',
  heavy: 'Heavy', max: 'Heavy', 'heavy-max': 'Heavy',
};

const SYMPTOM_COLS = [
  'pain', 'cramps', 'headache', 'tender_breasts', 'ovulation_pain',
  'backache', 'nausea', 'bloating', 'acne', 'fatigue', 'insomnia',
  'constipation', 'diarrhea',
];

const OVULATION_COLS = ['ovulation_test', 'lh_test', 'ovulation'];

function truthy(v) {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s && s !== '0' && s !== 'false' && s !== 'no' && s !== 'none';
}

function normFlow(v) {
  const s = String(v || '').trim().toLowerCase().replace(/\s+/g, '-');
  return FLOW_MAP[s] || (truthy(v) ? 'Medium' : '');
}

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 2000).toLowerCase();
  return (head.includes('day') || head.includes('date')) &&
         (head.includes('period') || head.includes('bleeding') || head.includes('menstruation'));
}

export function parse(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { cycles: [], counts: { total: 0 } };

  // Build a case-insensitive column lookup against the first row
  const keys = Object.keys(rows[0] || {});
  const findKey = (...candidates) => {
    for (const c of candidates) {
      const match = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());
      if (match) return match;
    }
    // Fuzzy: any key that contains the candidate
    for (const c of candidates) {
      const match = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
      if (match) return match;
    }
    return null;
  };

  const dateKey = findKey('day', 'date', 'timestamp');
  if (!dateKey) return { cycles: [], counts: { total: 0 } };

  const flowKey = FLOW_COLS.map(c => findKey(c)).find(Boolean);
  const ovulationKey = OVULATION_COLS.map(c => findKey(c)).find(Boolean);

  const cycles = [];

  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;

    // Period / flow
    if (flowKey && truthy(row[flowKey])) {
      const flow = normFlow(row[flowKey]) || 'Medium';
      cycles.push({ date, type: 'period', value: flow, symptom: '', notes: '' });
    }

    // Ovulation
    if (ovulationKey && truthy(row[ovulationKey])) {
      cycles.push({ date, type: 'ovulation', value: 'positive', symptom: '', notes: '' });
    }

    // Symptoms
    for (const sym of SYMPTOM_COLS) {
      const key = findKey(sym);
      if (!key || !truthy(row[key])) continue;
      cycles.push({
        date,
        type: 'symptom',
        value: String(row[key]).slice(0, 40),
        symptom: sym.replace(/_/g, ' '),
        notes: '',
      });
    }
  }

  return { cycles, counts: { total: cycles.length } };
}
