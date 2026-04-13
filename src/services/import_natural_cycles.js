/**
 * Natural Cycles CSV import.
 *
 * Natural Cycles exports a CSV with columns for date, temperature (°C),
 * menstruation/flow, LH test result, and a handful of daily markers.
 * We map:
 *   - Temperature → cycles ('bbt') as °F
 *   - Menstruation → cycles ('period')
 *   - LH positive → cycles ('ovulation')
 */

import { parseCSV, normalizeDate, toNum, cToF, round } from './_parse';

export const META = {
  id: 'natural_cycles',
  label: 'Natural Cycles',
  tagline: 'Import BBT and period tracking from Natural Cycles.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open Natural Cycles on your phone or web',
    'Go to <strong>Profile</strong>, then <strong>Settings</strong>',
    'Tap <strong>Data management</strong>, then <strong>Export data</strong>',
    'Choose CSV and save it to your device',
    'Upload the CSV below',
  ],
};

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 3000).toLowerCase();
  return (head.includes('temperature') || head.includes('temp')) &&
         (head.includes('menstruation') || head.includes('cycle') || head.includes('period'));
}

export function parse(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { cycles: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0] || {});
  const findKey = (...candidates) => {
    for (const c of candidates) {
      const m = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
      if (m) return m;
    }
    return null;
  };

  const dateKey = findKey('date', 'day');
  const tempKey = findKey('temperature', 'temp', 'bbt');
  const periodKey = findKey('menstruation', 'period', 'bleeding');
  const lhKey = findKey('lh', 'ovulation');
  if (!dateKey) return { cycles: [], counts: { total: 0 } };

  // Heuristic: if temperatures look like 36.x we're getting Celsius; if 97.x
  // we're already Fahrenheit.
  let isCelsius = null;
  for (const row of rows.slice(0, 30)) {
    const t = toNum(row[tempKey]);
    if (t != null) {
      isCelsius = t < 50;
      break;
    }
  }

  const cycles = [];
  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;

    // BBT
    if (tempKey) {
      const t = toNum(row[tempKey]);
      if (t != null && t > 0) {
        const f = isCelsius ? cToF(t) : t;
        cycles.push({
          date,
          type: 'bbt',
          value: String(round(f, 2)),
          symptom: '',
          notes: 'from Natural Cycles',
        });
      }
    }

    // Period
    if (periodKey) {
      const raw = String(row[periodKey] || '').trim().toLowerCase();
      if (raw && raw !== 'none' && raw !== '0' && raw !== 'false' && raw !== 'no') {
        const flow = raw.includes('spot') ? 'Spotting'
                   : raw.includes('light') || raw === '1' ? 'Light'
                   : raw.includes('heavy') || raw === '3' ? 'Heavy'
                   : 'Medium';
        cycles.push({ date, type: 'period', value: flow, symptom: '', notes: '' });
      }
    }

    // LH test positive
    if (lhKey) {
      const raw = String(row[lhKey] || '').trim().toLowerCase();
      if (raw.includes('positive') || raw === 'yes' || raw === '1' || raw === 'true') {
        cycles.push({ date, type: 'ovulation', value: 'LH positive', symptom: '', notes: '' });
      }
    }
  }

  return { cycles, counts: { total: cycles.length } };
}
