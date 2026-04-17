import { localISODate } from '../utils/dates';

/**
 * Flo GDPR Data Export Parser
 *
 * Flo's "Download My Data" (GDPR) produces a JSON-based export.
 * This module parses it into Salve's cycles table format.
 *
 * Supported structures:
 * - cycles / menstrual_cycles array with start_date, end_date, flow
 * - symptoms array with date, symptom/name, severity
 * - ovulation / ovulation_days array with date
 */

const FLOW_MAP = {
  light: 'Light', medium: 'Medium', heavy: 'Heavy', spotting: 'Spotting',
  1: 'Light', 2: 'Medium', 3: 'Heavy',
};

const SYMPTOM_MAP = {
  cramps: 'Cramps', bloating: 'Bloating', headache: 'Headache',
  fatigue: 'Fatigue', acne: 'Acne', nausea: 'Nausea',
  backache: 'Backache', insomnia: 'Insomnia',
  breast_tenderness: 'Breast tenderness', mood_swing: 'Mood swing',
  mood_swings: 'Mood swing', breast_pain: 'Breast tenderness',
  back_pain: 'Backache', headaches: 'Headache',
};

function normalizeDate(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function normFlow(v) {
  if (!v) return '';
  return FLOW_MAP[String(v).toLowerCase()] || String(v);
}

function normSymptom(s) {
  if (!s) return '';
  const key = String(s).toLowerCase().replace(/[\s-]+/g, '_');
  return SYMPTOM_MAP[key] || String(s);
}

/**
 * Detect whether a parsed JSON object looks like a Flo export.
 */
export function detectFloFormat(data) {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data).map(k => k.toLowerCase());
  return keys.some(k =>
    k.includes('cycle') || k.includes('menstrual') ||
    k.includes('period') || k.includes('ovulation') ||
    (k === 'symptoms' && Array.isArray(data[k]))
  );
}

/**
 * Parse a Flo GDPR export into Salve cycle records.
 * Returns an array of objects matching the cycles table schema.
 */
export function parseFloExport(data) {
  const records = [];

  // Find arrays by flexible key matching
  const find = (...patterns) => {
    for (const [k, v] of Object.entries(data)) {
      const lower = k.toLowerCase();
      if (patterns.some(p => lower.includes(p)) && Array.isArray(v)) return v;
    }
    return [];
  };

  // Period / cycle entries → expand date ranges into individual days
  const cycles = find('cycle', 'menstrual', 'period');
  for (const c of cycles) {
    const start = normalizeDate(c.start_date || c.date || c.start);
    if (!start) continue;
    const end = normalizeDate(c.end_date || c.end) || start;
    const flow = normFlow(c.flow || c.intensity || c.flow_level || '');

    // Expand range into individual day records.
    // Append 'T00:00:00' so Date parses as local time — bare 'YYYY-MM-DD'
    // is parsed as UTC, which drifts a day in negative-offset timezones.
    let d = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    while (d <= last) {
      records.push({
        date: localISODate(d),
        type: 'period',
        value: flow || 'Medium',
        symptom: '',
        notes: '',
      });
      d.setDate(d.getDate() + 1);
    }
  }

  // Symptoms
  const symptoms = find('symptom');
  for (const s of symptoms) {
    const date = normalizeDate(s.date);
    if (!date) continue;
    const symptom = normSymptom(s.symptom || s.name || s.type || '');
    if (!symptom) continue;
    records.push({
      date,
      type: 'symptom',
      value: s.severity || '',
      symptom,
      notes: s.notes || '',
    });
  }

  // Ovulation
  const ovulation = find('ovulation');
  for (const o of ovulation) {
    const date = normalizeDate(o.date || o.ovulation_date);
    if (!date) continue;
    records.push({
      date,
      type: 'ovulation',
      value: o.confidence || '',
      symptom: '',
      notes: '',
    });
  }

  // Dedupe by date+type+value+symptom
  const seen = new Set();
  return records.filter(r => {
    const key = `${r.date}|${r.type}|${r.value}|${r.symptom}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
