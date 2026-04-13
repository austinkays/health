/**
 * Daylio CSV import.
 *
 * Daylio exports a CSV with columns like:
 *   full_date, date, weekday, time, mood, activities, note, note_title
 *
 * Each row is one micro-journal entry. Mood is a word like "rad", "good",
 * "meh", "bad", "awful". Activities is a pipe or comma separated list of
 * tags. We map every row to a journal_entries record with Salve mood
 * labels (amazing/good/okay/low/rough) so existing mood filters work.
 */

import { parseCSV, normalizeDate } from './_parse';

export const META = {
  id: 'daylio',
  label: 'Daylio',
  tagline: 'Import mood and journal entries from Daylio.',
  accept: '.csv',
  inputType: 'text',
  walkthrough: [
    'Open Daylio on your phone',
    'Tap <strong>More</strong> (three dots), then <strong>Backup and Restore</strong>',
    'Tap <strong>Export CSV</strong> and save or share the file',
    'Upload the CSV below',
  ],
};

// Daylio default mood slugs → Salve mood labels
const MOOD_MAP = {
  rad:     'amazing',
  good:    'good',
  meh:     'okay',
  bad:     'low',
  awful:   'rough',
  great:   'amazing',
  okay:    'okay',
  fine:    'okay',
  sad:     'low',
  angry:   'rough',
  anxious: 'low',
};

function normMood(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return MOOD_MAP[s] || s || 'okay';
}

export function detect(text) {
  if (!text || typeof text !== 'string') return false;
  const head = text.slice(0, 2000).toLowerCase();
  return head.includes('mood') &&
         (head.includes('activities') || head.includes('note'));
}

export function parse(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { journal_entries: [], counts: { total: 0 } };

  const keys = Object.keys(rows[0] || {});
  const findKey = (...cands) => {
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().trim() === c);
      if (m) return m;
    }
    for (const c of cands) {
      const m = keys.find(k => k.toLowerCase().includes(c));
      if (m) return m;
    }
    return null;
  };

  const dateKey = findKey('full_date', 'date');
  const moodKey = findKey('mood');
  const actKey = findKey('activities', 'tags');
  const noteKey = findKey('note', 'entry');
  const titleKey = findKey('note_title', 'title');

  if (!dateKey || !moodKey) {
    return { journal_entries: [], counts: { total: 0 } };
  }

  const entries = [];
  for (const row of rows) {
    const date = normalizeDate(row[dateKey]);
    if (!date) continue;

    const mood = normMood(row[moodKey]);
    const activities = String(row[actKey] || '').split(/[|,]/).map(s => s.trim()).filter(Boolean);
    const note = String(row[noteKey] || '').trim();
    const title = String(row[titleKey] || '').trim() || (note ? note.slice(0, 60) : `Daylio ${mood}`);

    entries.push({
      date,
      title,
      mood,
      content: note,
      tags: activities.join(', '),
    });
  }

  return { journal_entries: entries, counts: { total: entries.length } };
}
