import { VITAL_TYPES } from '../constants/defaults';

export function buildProfile(data) {
  const s = data.settings || {};
  let p = '';

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
    p += '\n';
  });

  // Discontinued medications
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    p += '\n— DISCONTINUED MEDICATIONS —\n';
    disc.forEach(m => {
      p += '- ' + m.name;
      if (m.dose) p += ' ' + m.dose;
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

  // Recent vitals (last 10)
  const vitals = data.vitals || [];
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

  // Recent journal entries (last 5)
  const journal = data.journal || [];
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
    p += '\n';
  }

  // Health background
  if (s.health_background) {
    p += '\n— ADDITIONAL HEALTH BACKGROUND —\n' + s.health_background + '\n';
  }

  // Labs (highlight abnormal results, last 10)
  const labs = data.labs || [];
  if (labs.length) {
    const abnormal = labs.filter(l => l.flag && l.flag !== 'normal');
    const recent = labs.slice(0, 10);
    if (abnormal.length) {
      p += '\n— ABNORMAL LAB RESULTS —\n';
      abnormal.forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        p += ' [' + l.flag + ']';
        if (l.range) p += ' (ref: ' + l.range + ')';
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
    const normal = recent.filter(l => !l.flag || l.flag === 'normal');
    if (normal.length) {
      p += '\n— RECENT LAB RESULTS (normal, last 5) —\n';
      normal.slice(0, 5).forEach(l => {
        p += '- ' + l.test_name + ': ' + l.result;
        if (l.unit) p += ' ' + l.unit;
        if (l.date) p += ' on ' + l.date;
        p += '\n';
      });
    }
  }

  // Procedures (last 5)
  const procedures = data.procedures || [];
  if (procedures.length) {
    p += '\n— RECENT PROCEDURES —\n';
    procedures.slice(0, 5).forEach(pr => {
      p += '- ' + pr.name;
      if (pr.date) p += ' on ' + pr.date;
      if (pr.provider) p += ' by ' + pr.provider;
      if (pr.outcome) p += ' — outcome: ' + pr.outcome;
      if (pr.notes) p += ' — ' + pr.notes;
      p += '\n';
    });
  }

  // Immunizations
  const immunizations = data.immunizations || [];
  if (immunizations.length) {
    p += '\n— IMMUNIZATIONS —\n';
    immunizations.forEach(i => {
      p += '- ' + i.name;
      if (i.date) p += ' on ' + i.date;
      if (i.dose) p += ' (dose ' + i.dose + ')';
      if (i.provider) p += ' at ' + i.provider;
      if (i.site) p += ' [site: ' + i.site + ']';
      p += '\n';
    });
  }

  // Care gaps
  const careGaps = data.care_gaps || [];
  if (careGaps.length) {
    p += '\n— CARE GAPS (overdue screenings/preventive care) —\n';
    careGaps.forEach(g => {
      p += '- ' + g.item;
      if (g.urgency) p += ' [' + g.urgency + ']';
      if (g.category) p += ' (' + g.category + ')';
      if (g.last_done) p += ' last done ' + g.last_done;
      if (g.notes) p += ' — ' + g.notes;
      p += '\n';
    });
  }

  // Anesthesia flags
  const anesthesiaFlags = data.anesthesia_flags || [];
  if (anesthesiaFlags.length) {
    p += '\n— ANESTHESIA FLAGS (safety-critical) —\n';
    anesthesiaFlags.forEach(f => {
      p += '- ' + f.condition;
      if (f.implication) p += ': ' + f.implication;
      if (f.action_required) p += ' → ' + f.action_required;
      p += '\n';
    });
  }

  // Surgical planning
  const surgical = data.surgical_planning || [];
  if (surgical.length) {
    p += '\n— SURGICAL PLANNING —\n';
    surgical.forEach(sp => {
      const procs = Array.isArray(sp.procedures) ? sp.procedures.join(', ') : '';
      p += '- ' + (procs || 'Surgical plan');
      if (sp.target_date) p += ' scheduled ' + sp.target_date;
      if (sp.surgeon) p += ' with ' + sp.surgeon;
      if (sp.facility) p += ' at ' + sp.facility;
      if (sp.status) p += ' (' + sp.status + ')';
      if (sp.accommodation) p += ' | accommodations: ' + sp.accommodation;
      p += '\n';
    });
  }

  // Appeals & disputes
  const appeals = data.appeals_and_disputes || [];
  if (appeals.length) {
    p += '\n— INSURANCE APPEALS & DISPUTES —\n';
    appeals.forEach(a => {
      p += '- ' + a.subject;
      if (a.status) p += ' (' + a.status + ')';
      if (a.date_filed) p += ' filed ' + a.date_filed;
      if (a.notes) p += ' — ' + a.notes;
      p += '\n';
    });
  }

  return p;
}
