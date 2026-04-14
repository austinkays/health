/**
 * Visible app CSV import.
 *
 * Visible is a chronic-illness pacing app for ME/CFS, POTS, fibromyalgia,
 * and similar conditions. It tracks morning HRV/resting HR/stability via a
 * Polar armband, and evening symptom check-ins on a 0-3 scale.
 *
 * Export format: CSV with 4 columns (tall/long format, one metric per row):
 *   observation_date, tracker_name, tracker_category, observation_value
 *
 * We fan out:
 *   - Resting HR         → vitals (type: 'hr')
 *   - HR Variability     → vitals (type: 'hr', HRV in notes)
 *   - Sleep              → vitals (type: 'sleep', qualitative 1-4 → hours estimate)
 *   - Stability Score    → vitals (type: 'energy', 1-5 → 1-10 scale)
 *   - Symptoms (0-3)     → journal_entries (bundled per day, symptoms JSONB)
 *   - Exertion scores    → journal_entries (merged into same day entry)
 *   - Crash / PEM        → journal_entries (tagged)
 *   - Period             → cycles (type: 'period')
 *   - Note               → journal_entries (content)
 *   - PacePoints         → vitals (type: 'energy', notes)
 */

import { parseCSV, normalizeDate, toNum } from './_parse';

export const META = {
  id: 'visible',
  label: 'Visible',
  tagline: 'Import HR, HRV, symptoms, and stability scores from Visible.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open the Visible app on your phone',
    'Go to <strong>Profile</strong> → <strong>Data Export</strong>',
    'Tap <strong>Export CSV</strong>',
    'Save or share the file to your device',
    'Upload the CSV below',
  ],
};

// Visible symptom severity 0-3 → Salve 0-10 scale
function visibleToSalveSeverity(v) {
  const n = toNum(v);
  if (n == null || n === 0) return 0;
  if (n <= 1) return 3;   // Mild → 3/10
  if (n <= 2) return 6;   // Moderate → 6/10
  return 9;               // Severe → 9/10
}

// Visible sleep quality 1-4 → rough hour estimate for the sleep chart
// (Visible doesn't export actual sleep duration, only a 1-4 quality rating)
function sleepQualityToHours(v) {
  const n = toNum(v);
  if (n == null) return null;
  if (n >= 4) return 8;
  if (n >= 3) return 6.5;
  if (n >= 2) return 5;
  return 3.5;
}

// Stability Score 1-5 → energy 1-10
function stabilityToEnergy(v) {
  const n = toNum(v);
  if (n == null) return null;
  return Math.min(10, Math.round(n * 2));
}

// Exertion 0-3 → descriptive label
function exertionLabel(v) {
  const n = toNum(v);
  if (n == null || n === 0) return 'none';
  if (n <= 1) return 'a little';
  if (n <= 2) return 'somewhat';
  return 'a lot';
}

// Visible mood/sleep quality → Salve mood labels
function qualityToMood(n) {
  if (n >= 4) return 'amazing';
  if (n >= 3) return 'good';
  if (n >= 2) return 'okay';
  return 'rough';
}

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 3000).toLowerCase();
  return (
    head.includes('observation_date') &&
    head.includes('tracker_name') &&
    head.includes('tracker_category') &&
    head.includes('observation_value')
  );
}

export function parse(text, { onProgress } = {}) {
  const rows = parseCSV(text);
  if (!rows.length) return { counts: {} };

  // Find columns (case-insensitive)
  const hdr = rows[0];
  const ci = (name) => {
    const idx = hdr.findIndex(h => h.toLowerCase().trim() === name.toLowerCase());
    return idx;
  };
  const iDate = ci('observation_date');
  const iTracker = ci('tracker_name');
  const iCategory = ci('tracker_category');
  const iValue = ci('observation_value');

  if (iDate < 0 || iTracker < 0 || iValue < 0) {
    return { counts: {} };
  }

  // ── Pass 1: group observations by date ──
  const byDate = {}; // { 'YYYY-MM-DD': { hr, hrv, sleep, stability, symptoms, exertion, notes, crash, period } }

  for (let i = 1; i < rows.length; i++) {
    if (onProgress && i % 500 === 0) onProgress(i / rows.length);
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const rawDate = normalizeDate(row[iDate]);
    if (!rawDate) continue;

    const tracker = (row[iTracker] || '').trim();
    const category = iCategory >= 0 ? (row[iCategory] || '').trim() : '';
    const value = (row[iValue] || '').trim();
    const trackerLower = tracker.toLowerCase();

    if (!byDate[rawDate]) {
      byDate[rawDate] = {
        hr: null, hrv: null, sleep: null, sleepQuality: null,
        stability: null, symptoms: [], exertion: [],
        notes: [], crash: false, period: false, pacePoints: null,
      };
    }
    const day = byDate[rawDate];

    // ── Measurements ──
    if (trackerLower === 'resting hr' || trackerLower === 'resting heart rate') {
      day.hr = toNum(value);
    } else if (trackerLower === 'hr variability' || trackerLower === 'hrv') {
      day.hrv = toNum(value);
    } else if (trackerLower === 'sleep') {
      day.sleepQuality = toNum(value);
      day.sleep = sleepQualityToHours(value);
    } else if (trackerLower === 'stability score' || trackerLower === 'stability') {
      day.stability = toNum(value);

    // ── Symptoms (0-3 scale) ──
    } else if (
      category.toLowerCase() === 'general' ||
      category.toLowerCase() === 'pain' ||
      category.toLowerCase() === 'muscles' ||
      category.toLowerCase() === 'brain / cognitive' ||
      category.toLowerCase() === 'cognitive' ||
      category.toLowerCase() === 'heart and lungs' ||
      category.toLowerCase() === 'sensory' ||
      category.toLowerCase() === 'gastrointestinal' ||
      category.toLowerCase() === 'emotional'
    ) {
      const sev = toNum(value);
      if (sev != null && sev > 0) {
        day.symptoms.push({
          name: tracker,
          severity: visibleToSalveSeverity(value),
        });
      }

    // ── Exertion scores ──
    } else if (
      trackerLower === 'physically active' ||
      trackerLower === 'mentally demanding' ||
      trackerLower === 'emotionally stressful' ||
      trackerLower === 'socially demanding'
    ) {
      const n = toNum(value);
      if (n != null && n > 0) {
        day.exertion.push(`${tracker}: ${exertionLabel(value)}`);
      }

    // ── Special entries ──
    } else if (trackerLower === 'crash' || trackerLower === 'pem') {
      if (toNum(value) > 0 || value.toLowerCase() === 'true' || value === '1') {
        day.crash = true;
      }
    } else if (trackerLower === 'period') {
      if (toNum(value) > 0 || value.toLowerCase() === 'true' || value === '1') {
        day.period = true;
      }
    } else if (trackerLower === 'note') {
      if (value) day.notes.push(value);
    } else if (trackerLower === 'pacepoints' || trackerLower === 'pace points') {
      day.pacePoints = toNum(value);
    }
    // Skip FUNCAP27 rows, medication rows, and unknown trackers
  }

  // ── Pass 2: build Salve records ──
  const vitals = [];
  const journal_entries = [];
  const cycles = [];

  const dates = Object.keys(byDate).sort();
  for (const date of dates) {
    const day = byDate[date];

    // Resting HR vital
    if (day.hr != null) {
      const notes = ['Visible app'];
      if (day.hrv != null) notes.push(`HRV: ${day.hrv}ms`);
      vitals.push({
        date, type: 'hr', value: String(Math.round(day.hr)),
        value2: '', unit: 'bpm', notes: notes.join(' · '),
        source: 'visible',
      });
    }

    // Sleep vital (estimated from quality rating)
    if (day.sleep != null) {
      vitals.push({
        date, type: 'sleep', value: String(day.sleep),
        value2: '', unit: 'hrs',
        notes: `Visible app (quality: ${day.sleepQuality}/4, estimated duration)`,
        source: 'visible',
      });
    }

    // Stability → energy (1-5 → 2-10)
    if (day.stability != null) {
      vitals.push({
        date, type: 'energy', value: String(stabilityToEnergy(day.stability)),
        value2: '', unit: '/10',
        notes: `Visible stability score: ${day.stability}/5`,
        source: 'visible',
      });
    }

    // Journal entry (symptoms + exertion + crash + notes bundled per day)
    if (day.symptoms.length > 0 || day.crash || day.notes.length > 0 || day.exertion.length > 0) {
      const contentParts = [];
      if (day.crash) contentParts.push('⚠ Crash / PEM day');
      if (day.exertion.length > 0) contentParts.push('Exertion: ' + day.exertion.join(', '));
      if (day.notes.length > 0) contentParts.push(...day.notes);
      if (day.pacePoints != null) contentParts.push(`PacePoints: ${day.pacePoints}`);

      const tags = ['visible'];
      if (day.crash) tags.push('crash', 'PEM');

      // Overall severity = max symptom severity
      const maxSev = day.symptoms.reduce((mx, s) => Math.max(mx, s.severity || 0), 0);

      journal_entries.push({
        date,
        title: day.crash ? 'Crash day' : (day.symptoms.length > 0 ? 'Visible check-in' : 'Visible note'),
        mood: day.sleepQuality ? qualityToMood(day.sleepQuality) : '',
        severity: maxSev > 0 ? String(maxSev) : '',
        content: contentParts.join('\n') || '',
        tags: tags.join(','),
        symptoms: day.symptoms,
        linked_conditions: [],
        linked_meds: [],
        gratitude: '',
      });
    }

    // Period → cycles
    if (day.period) {
      cycles.push({
        date, type: 'period', value: 'medium',
        symptom: '', notes: 'Visible app',
      });
    }
  }

  if (onProgress) onProgress(1);

  const counts = {};
  if (vitals.length) counts.vitals = vitals.length;
  if (journal_entries.length) counts.journal_entries = journal_entries.length;
  if (cycles.length) counts.cycles = cycles.length;

  return {
    vitals: vitals.length ? vitals : undefined,
    journal_entries: journal_entries.length ? journal_entries : undefined,
    cycles: cycles.length ? cycles : undefined,
    counts,
  };
}
