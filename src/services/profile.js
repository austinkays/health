import { VITAL_TYPES } from '../constants/defaults';

/**
 * Builds a token-efficient health profile string for AI context.
 * Includes all user data: demographics, meds, conditions, allergies,
 * providers, appointments, vital trends, and journal summary.
 */
export function buildProfile(data) {
  const s = data.settings || {};
  const lines = [];

  // ── Demographics ──
  const demo = [];
  if (s.name) demo.push('Name: ' + s.name);
  if (s.dob) demo.push('DOB: ' + s.dob + calcAge(s.dob));
  if (s.sex && s.sex !== 'prefer-not') demo.push('Sex: ' + s.sex);
  if (s.height) demo.push('Height: ' + s.height);
  if (s.blood_type && s.blood_type !== 'unknown') demo.push('Blood type: ' + s.blood_type);
  if (s.location) demo.push('Location: ' + s.location);
  if (s.primary_provider) demo.push('PCP: ' + s.primary_provider);
  if (demo.length) lines.push(demo.join(' | '));

  // ── Emergency Contact ──
  if (s.emergency_name) {
    let ec = 'Emergency contact: ' + s.emergency_name;
    if (s.emergency_relationship) ec += ' (' + s.emergency_relationship + ')';
    if (s.emergency_phone) ec += ' ' + s.emergency_phone;
    lines.push(ec);
  }

  // ── Active Medications ──
  lines.push('\n— ACTIVE MEDICATIONS —');
  const active = (data.meds || []).filter(m => m.active !== false);
  if (active.length === 0) {
    lines.push('(none)');
  } else {
    active.forEach(m => {
      let l = '- ' + m.name;
      if (m.dose) l += ' ' + m.dose;
      if (m.frequency) l += ', ' + m.frequency;
      if (m.route && m.route !== 'Oral') l += ' (' + m.route + ')';
      if (m.time_of_day) l += ' [' + m.time_of_day + ']';
      if (m.purpose) l += ' — for: ' + m.purpose;
      if (m.prescriber) l += ' [Rx: ' + m.prescriber + ']';
      if (m.manufacturer) l += ' [' + m.manufacturer + ']';
      if (m.prior_auth && m.prior_auth !== 'approved') l += ' [PA: ' + m.prior_auth + ']';
      lines.push(l);
    });
  }

  // ── Discontinued Medications (compact) ──
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    lines.push('\n— DISCONTINUED MEDICATIONS (' + disc.length + ') —');
    disc.forEach(m => {
      let l = '- ' + m.name;
      if (m.dose) l += ' ' + m.dose;
      if (m.notes) l += ' — ' + m.notes;
      lines.push(l);
    });
  }

  // ── Conditions ──
  lines.push('\n— CONDITIONS & DIAGNOSES —');
  const conds = data.conditions || [];
  if (conds.length === 0) {
    lines.push('(none)');
  } else {
    conds.forEach(c => {
      let l = '- ' + c.name + ' (' + c.status + ')';
      if (c.icd10) l += ' [' + c.icd10 + ']';
      if (c.severity) l += ' severity:' + c.severity;
      if (c.diagnosed_date) l += ', dx ' + c.diagnosed_date;
      if (c.provider) l += ', by ' + c.provider;
      if (c.facility) l += ' at ' + c.facility;
      if (c.linked_meds) l += ', meds: ' + c.linked_meds;
      if (c.notes) l += ' — ' + c.notes;
      lines.push(l);
    });
  }

  // ── Allergies ──
  const allergies = data.allergies || [];
  if (allergies.length) {
    lines.push('\n— ALLERGIES —');
    allergies.forEach(a => {
      let l = '- ' + a.substance + ' (' + a.severity + ')';
      if (a.type) l += ' [' + a.type + ']';
      if (a.reaction) l += ' — ' + a.reaction;
      if (a.confirmed_by) l += ' [confirmed: ' + a.confirmed_by + ']';
      lines.push(l);
    });
  }

  // ── Providers / Care Team ──
  const providers = data.providers || [];
  if (providers.length) {
    lines.push('\n— CARE TEAM —');
    providers.forEach(pr => {
      let l = '- ' + pr.name;
      if (pr.specialty) l += ' (' + pr.specialty + ')';
      if (pr.clinic) l += ' @ ' + pr.clinic;
      const addr = [pr.city, pr.state].filter(Boolean).join(', ');
      if (addr) l += ', ' + addr;
      if (pr.phone) l += ' tel:' + pr.phone;
      if (pr.accepted_insurance) l += ' [ins: ' + pr.accepted_insurance + ']';
      lines.push(l);
    });
  }

  // ── Upcoming Appointments ──
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data.appts || [])
    .filter(a => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  if (upcoming.length) {
    lines.push('\n— UPCOMING APPOINTMENTS —');
    upcoming.forEach(a => {
      let l = '- ' + a.date;
      if (a.time) l += ' ' + a.time;
      if (a.visit_type) l += ' [' + a.visit_type + ']';
      if (a.provider) l += ' with ' + a.provider;
      if (a.location) l += ' @ ' + a.location;
      if (a.reason) l += ' — ' + a.reason;
      if (a.linked_condition) l += ' (re: ' + a.linked_condition + ')';
      if (a.questions) l += ' Q: ' + a.questions.slice(0, 60);
      lines.push(l);
    });
  }

  // ── Recent Appointment Notes (last 3 past visits with notes) ──
  const pastWithNotes = (data.appts || [])
    .filter(a => a.date < today && a.post_notes)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (pastWithNotes.length) {
    lines.push('\n— RECENT VISIT NOTES —');
    pastWithNotes.forEach(a => {
      let l = '- ' + a.date;
      if (a.provider) l += ' ' + a.provider;
      if (a.reason) l += ' (' + a.reason + ')';
      l += ': ' + a.post_notes.slice(0, 120);
      lines.push(l);
    });
  }

  // ── Vital Trends (aggregated, not raw) ──
  const vitals = data.vitals || [];
  if (vitals.length) {
    lines.push('\n— VITAL TRENDS —');
    const byType = {};
    vitals.forEach(v => {
      if (!byType[v.type]) byType[v.type] = [];
      byType[v.type].push(v);
    });

    for (const [type, readings] of Object.entries(byType)) {
      const t = VITAL_TYPES.find(x => x.id === type);
      const label = t ? t.label : type;
      const unit = t ? t.unit : '';

      if (type === 'bp') {
        // Blood pressure: show last reading + range
        const last = readings[readings.length - 1];
        let l = '- ' + label + ': last ' + last.value + '/' + last.value2 + ' ' + unit;
        if (readings.length > 1) l += ' (' + readings.length + ' readings)';
        lines.push(l);
      } else {
        const nums = readings.map(r => parseFloat(r.value)).filter(n => !isNaN(n));
        if (nums.length === 0) continue;
        const avg = nums.reduce((s, n) => s + n, 0) / nums.length;
        const last = nums[nums.length - 1];

        let l = '- ' + label + ': last ' + last + unit + ', avg ' + avg.toFixed(1) + unit;

        // Trend from recent vs older readings
        if (nums.length >= 4) {
          const half = Math.floor(nums.length / 2);
          const older = nums.slice(0, half).reduce((s, n) => s + n, 0) / half;
          const newer = nums.slice(half).reduce((s, n) => s + n, 0) / (nums.length - half);
          const diff = newer - older;
          const pct = Math.abs(diff / older) * 100;
          if (pct > 5) {
            l += diff > 0 ? ' ↑trending up' : ' ↓trending down';
          } else {
            l += ' →stable';
          }
        }
        l += ' (' + nums.length + ' readings)';
        lines.push(l);
      }
    }
  }

  // ── Recent Journal (last 5, compact) ──
  const journal = data.journal || [];
  if (journal.length) {
    lines.push('\n— RECENT JOURNAL (last 5) —');
    journal.slice(0, 5).forEach(e => {
      let l = '- ' + e.date;
      if (e.mood) l += ' [' + e.mood + ']';
      if (e.severity) l += ' sev:' + e.severity + '/10';
      l += ' ' + (e.content || e.title || '').slice(0, 100);
      if (e.tags) l += ' #' + e.tags;
      lines.push(l);
    });
  }

  // ── Insurance ──
  if (s.insurance_plan) {
    lines.push('\n— INSURANCE —');
    let l = 'Plan: ' + s.insurance_plan;
    if (s.insurance_id) l += ', ID: ' + s.insurance_id;
    if (s.insurance_group) l += ', Group: ' + s.insurance_group;
    if (s.insurance_phone) l += ', Phone: ' + s.insurance_phone;
    lines.push(l);
  }

  // ── Health Background ──
  if (s.health_background) {
    lines.push('\n— HEALTH BACKGROUND —');
    lines.push(s.health_background);
  }

  return lines.join('\n');
}

function calcAge(dob) {
  if (!dob) return '';
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return ' (age ' + age + ')';
}
