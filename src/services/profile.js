import { VITAL_TYPES } from '../constants/defaults';

export function buildProfile(data) {
  const s = data.settings || {};
  let p = '';

  // Current date for temporal reasoning
  p += 'Today\'s date: ' + new Date().toISOString().slice(0, 10) + '\n';

  if (s.name) p += 'Patient name: ' + s.name + '\n';
  if (s.location) p += 'Location: ' + s.location + '\n';

  // Active medications
  p += '\n— ACTIVE MEDICATIONS —\n';
  const active = (data.meds || []).filter(m => m.active !== false);
  if (active.length === 0) p += '(none)\n';
  active.forEach(m => {
    p += '- ' + m.name;
    if (m.dose) p += ' ' + m.dose;
    if (m.frequency) p += ', ' + m.frequency;
    if (m.route) p += ' (' + m.route + ')';
    if (m.purpose) p += ' — for: ' + m.purpose;
    if (m.prescriber) p += ' [prescribed by ' + m.prescriber + ']';
    if (m.start_date) p += ' [started ' + m.start_date + ']';
    if (m.refill_date) p += ' [refill due ' + m.refill_date + ']';
    p += '\n';
  });

  // Discontinued medications
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    p += '\n— DISCONTINUED MEDICATIONS —\n';
    disc.forEach(m => {
      p += '- ' + m.name;
      if (m.dose) p += ' ' + m.dose;
      if (m.purpose) p += ' — was for: ' + m.purpose;
      if (m.notes) p += ' — ' + m.notes;
      p += '\n';
    });
  }

  // Conditions
  p += '\n— CONDITIONS & DIAGNOSES —\n';
  const conds = data.conditions || [];
  if (conds.length === 0) p += '(none)\n';
  conds.forEach(c => {
    p += '- ' + c.name + ' (status: ' + c.status + ')';
    if (c.diagnosed_date) p += ', diagnosed ' + c.diagnosed_date;
    if (c.provider) p += ', treated by ' + c.provider;
    if (c.linked_meds) p += ', meds: ' + c.linked_meds;
    if (c.notes) p += ' — ' + c.notes;
    p += '\n';
  });

  // Allergies
  const allergies = data.allergies || [];
  if (allergies.length) {
    p += '\n— ALLERGIES —\n';
    allergies.forEach(a => {
      p += '- ' + a.substance + ' (' + a.severity + ')';
      if (a.reaction) p += ' — reaction: ' + a.reaction;
      p += '\n';
    });
  }

  // Providers
  const providers = data.providers || [];
  if (providers.length) {
    p += '\n— CARE TEAM —\n';
    providers.forEach(pr => {
      p += '- ' + pr.name;
      if (pr.specialty) p += ' (' + pr.specialty + ')';
      if (pr.clinic) p += ' at ' + pr.clinic;
      p += '\n';
    });
  }

  // Recent vitals (last 10, sorted by date)
  const vitals = [...(data.vitals || [])].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (vitals.length) {
    p += '\n— RECENT VITALS (last 10) —\n';
    vitals.slice(-10).forEach(v => {
      const t = VITAL_TYPES.find(x => x.id === v.type);
      p += '- ' + (t ? t.label : v.type) + ': ';
      p += v.type === 'bp' ? v.value + '/' + v.value2 : v.value;
      if (t) p += ' ' + t.unit;
      p += ' on ' + v.date;
      if (v.notes) p += ' — ' + v.notes;
      p += '\n';
    });
  }

  // Upcoming appointments
  const now = new Date().toISOString().slice(0, 10);
  const upcoming = (data.appts || [])
    .filter(a => a.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  if (upcoming.length) {
    p += '\n— UPCOMING APPOINTMENTS —\n';
    upcoming.forEach(a => {
      p += '- ' + a.date;
      if (a.time) p += ' at ' + a.time;
      if (a.provider) p += ' with ' + a.provider;
      if (a.reason) p += ' — ' + a.reason;
      if (a.questions) p += ' [questions: ' + a.questions + ']';
      p += '\n';
    });
  }

  // Recent journal entries (last 5, sorted newest first)
  const journal = [...(data.journal || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (journal.length) {
    p += '\n— RECENT JOURNAL ENTRIES (last 5) —\n';
    journal.slice(0, 5).forEach(e => {
      p += '- ' + e.date;
      if (e.mood) p += ' [mood: ' + e.mood + ']';
      if (e.severity) p += ' [severity: ' + e.severity + '/10]';
      p += ': ' + (e.content || e.title || '');
      if (e.tags) p += ' (tags: ' + e.tags + ')';
      p += '\n';
    });
  }

  // Insurance
  if (s.insurance_plan) {
    p += '\n— INSURANCE —\n';
    p += 'Plan: ' + s.insurance_plan;
    if (s.insurance_id) p += ', ID: ' + s.insurance_id;
    if (s.insurance_group) p += ', Group: ' + s.insurance_group;
    if (s.insurance_phone) p += ', Phone: ' + s.insurance_phone;
    p += '\n';
  }

  // Health background
  if (s.health_background) {
    p += '\n— ADDITIONAL HEALTH BACKGROUND —\n' + s.health_background + '\n';
  }

  return p;
}
