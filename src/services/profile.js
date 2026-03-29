import { VITAL_TYPES } from '../constants/defaults';

export function buildProfile(data) {
  const s = data.settings || {};
  let p = '';

  if (s.name) p += 'Patient name: ' + s.name + '\n';
  if (s.location) p += 'Location: ' + s.location + '\n';

  // AI health summary (auto-generated cross-referenced narrative)
  if (s.ai_health_summary) {
    p += '\n— AI HEALTH SUMMARY —\n' + s.ai_health_summary + '\n';
  }

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
    if (m.pharmacy) p += ' [pharmacy: ' + m.pharmacy + ']';
    if (m.start_date) p += ' [started: ' + m.start_date + ']';
    if (m.refill_date) p += ' [refill: ' + m.refill_date + ']';
    if (m.notes) p += ' — notes: ' + m.notes;
    p += '\n';
  });

  // Discontinued medications
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    p += '\n— DISCONTINUED MEDICATIONS —\n';
    disc.forEach(m => {
      p += '- ' + m.name;
      if (m.dose) p += ' ' + m.dose;
      if (m.frequency) p += ', ' + m.frequency;
      if (m.route) p += ' (' + m.route + ')';
      if (m.purpose) p += ' — for: ' + m.purpose;
      if (m.prescriber) p += ' [prescribed by ' + m.prescriber + ']';
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
      if (a.notes) p += ' — notes: ' + a.notes;
      p += '\n';
    });
  }

  // Anesthesia flags (SAFETY CRITICAL)
  const aFlags = data.anesthesia_flags || [];
  if (aFlags.length) {
    p += '\n— ⚠ ANESTHESIA FLAGS (SAFETY CRITICAL) —\n';
    aFlags.forEach(f => {
      p += '- ⚠ ' + f.condition + ' → ' + f.implication;
      if (f.action_required) p += ' | Action: ' + f.action_required;
      p += '\n';
    });
  }

  // Providers
  const providers = data.providers || [];
  if (providers.length) {
    p += '\n— HEALTHCARE PROVIDERS —\n';
    providers.forEach(pr => {
      p += '- ' + pr.name;
      if (pr.specialty) p += ' (' + pr.specialty + ')';
      if (pr.clinic) p += ', ' + pr.clinic;
      if (pr.phone) p += ', ' + pr.phone;
      if (pr.notes) p += ' — ' + pr.notes;
      p += '\n';
    });
  }

  // Appointments (upcoming + last 5 past)
  const appts = data.appts || [];
  if (appts.length) {
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = appts.filter(a => a.date >= today);
    const past = appts.filter(a => a.date < today).slice(-5);

    if (upcoming.length) {
      p += '\n— UPCOMING APPOINTMENTS —\n';
      upcoming.forEach(a => {
        p += '- ' + a.date;
        if (a.time) p += ' ' + a.time;
        if (a.provider) p += ' with ' + a.provider;
        if (a.location) p += ' at ' + a.location;
        if (a.reason) p += ' — ' + a.reason;
        if (a.questions) p += ' [questions: ' + a.questions + ']';
        p += '\n';
      });
    }
    if (past.length) {
      p += '\n— RECENT PAST APPOINTMENTS —\n';
      past.forEach(a => {
        p += '- ' + a.date;
        if (a.provider) p += ' with ' + a.provider;
        if (a.reason) p += ' — ' + a.reason;
        if (a.post_notes) p += ' [notes: ' + a.post_notes + ']';
        p += '\n';
      });
    }
  }

  // Labs (last 20, flagged first)
  const labs = data.labs || [];
  if (labs.length) {
    p += '\n— LAB RESULTS (last 20) —\n';
    const sorted = [...labs].sort((a, b) => {
      if (a.flag && !b.flag) return -1;
      if (!a.flag && b.flag) return 1;
      return 0;
    });
    sorted.slice(0, 20).forEach(l => {
      p += '- ' + l.date + ': ' + l.test_name + ' = ' + l.result;
      if (l.unit) p += ' ' + l.unit;
      if (l.range) p += ' (ref: ' + l.range + ')';
      if (l.flag) p += ' [' + l.flag + ']';
      if (l.provider) p += ' — ' + l.provider;
      if (l.notes) p += ' — ' + l.notes;
      p += '\n';
    });
  }

  // Procedures
  const procedures = data.procedures || [];
  if (procedures.length) {
    p += '\n— PROCEDURES & SURGERIES —\n';
    procedures.forEach(pr => {
      p += '- ' + pr.date + ': ' + pr.name;
      if (pr.type) p += ' (' + pr.type + ')';
      if (pr.provider) p += ' by ' + pr.provider;
      if (pr.location) p += ' at ' + pr.location;
      if (pr.reason) p += ' — reason: ' + pr.reason;
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
      if (i.dose) p += ' dose ' + i.dose;
      if (i.date) p += ', ' + i.date;
      if (i.provider) p += ', ' + i.provider;
      p += '\n';
    });
  }

  // Care gaps
  const careGaps = data.care_gaps || [];
  if (careGaps.length) {
    p += '\n— CARE GAPS —\n';
    const urgencyOrder = ['urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed', ''];
    const sorted = [...careGaps].sort((a, b) => urgencyOrder.indexOf(a.urgency) - urgencyOrder.indexOf(b.urgency));
    sorted.forEach(g => {
      p += '- ';
      if (g.urgency) p += '[' + g.urgency + '] ';
      if (g.category) p += g.category + ': ';
      p += g.item;
      if (g.last_done) p += ' (last done: ' + g.last_done + ')';
      if (g.notes) p += ' — ' + g.notes;
      p += '\n';
    });
  }

  // Insurance (from table)
  const insuranceRecords = data.insurance || [];
  if (insuranceRecords.length) {
    p += '\n— INSURANCE COVERAGE —\n';
    insuranceRecords.forEach(ins => {
      p += '- ' + ins.name;
      if (ins.type) p += ' (' + ins.type + ')';
      if (ins.member_id) p += ', Member: ' + ins.member_id;
      if (ins.group) p += ', Group: ' + ins.group;
      if (ins.phone) p += ', Phone: ' + ins.phone;
      if (ins.notes) p += ' — ' + ins.notes;
      p += '\n';
    });
  }

  // Insurance (from settings, as fallback/supplement)
  if (s.insurance_plan && !insuranceRecords.length) {
    p += '\n— INSURANCE —\n';
    p += 'Plan: ' + s.insurance_plan;
    if (s.insurance_id) p += ', ID: ' + s.insurance_id;
    if (s.insurance_group) p += ', Group: ' + s.insurance_group;
    if (s.insurance_phone) p += ', Phone: ' + s.insurance_phone;
    p += '\n';
  }

  // Appeals & disputes
  const appeals = data.appeals_and_disputes || [];
  if (appeals.length) {
    p += '\n— APPEALS & DISPUTES —\n';
    appeals.forEach(a => {
      p += '- ' + a.date_filed + ': ' + a.subject;
      if (a.against) p += ' (against: ' + a.against + ')';
      p += ' — Status: ' + a.status;
      if (a.deadline) p += ', Deadline: ' + a.deadline;
      if (a.notes) p += ' — ' + a.notes;
      p += '\n';
    });
  }

  // Surgical planning
  const surgPlans = data.surgical_planning || [];
  if (surgPlans.length) {
    p += '\n— SURGICAL PLANNING —\n';
    surgPlans.forEach(sp => {
      p += '- ' + sp.facility;
      if (sp.surgeon) p += ', Surgeon: ' + sp.surgeon;
      if (sp.target_date) p += ', Target: ' + sp.target_date;
      if (sp.status) p += ' [' + sp.status + ']';
      p += '\n';
      if (sp.procedures && sp.procedures.length) {
        const procs = typeof sp.procedures === 'string' ? JSON.parse(sp.procedures) : sp.procedures;
        if (Array.isArray(procs) && procs.length) p += '  Procedures: ' + procs.join(', ') + '\n';
      }
      if (sp.constraints && sp.constraints.length) {
        const cons = typeof sp.constraints === 'string' ? JSON.parse(sp.constraints) : sp.constraints;
        if (Array.isArray(cons) && cons.length) p += '  Constraints: ' + cons.join(', ') + '\n';
      }
      if (sp.outstanding_items && sp.outstanding_items.length) {
        const items = typeof sp.outstanding_items === 'string' ? JSON.parse(sp.outstanding_items) : sp.outstanding_items;
        if (Array.isArray(items) && items.length) p += '  Outstanding: ' + items.join(', ') + '\n';
      }
      if (sp.accommodation) p += '  Accommodation: ' + sp.accommodation + '\n';
      if (sp.coordinator) p += '  Coordinator: ' + sp.coordinator + '\n';
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
      if (e.title) p += ' "' + e.title + '"';
      p += ': ' + (e.content || '');
      if (e.tags) p += ' (tags: ' + e.tags + ')';
      p += '\n';
    });
  }

  // Health background (user's manual notes)
  if (s.health_background) {
    p += '\n— ADDITIONAL HEALTH BACKGROUND (user notes) —\n' + s.health_background + '\n';
  }

  return p;
}

// Full data dump with no truncation — used only for AI health summary generation
export function buildFullDataDump(data) {
  const s = data.settings || {};
  let p = '';

  if (s.name) p += 'Patient name: ' + s.name + '\n';
  if (s.location) p += 'Location: ' + s.location + '\n';
  if (s.pharmacy) p += 'Pharmacy: ' + s.pharmacy + '\n';

  // All medications
  p += '\n— ALL MEDICATIONS —\n';
  const meds = data.meds || [];
  if (meds.length === 0) p += '(none)\n';
  meds.forEach(m => {
    p += '- ' + m.name;
    if (m.dose) p += ' ' + m.dose;
    if (m.frequency) p += ', ' + m.frequency;
    if (m.route) p += ' (' + m.route + ')';
    p += ' [' + (m.active !== false ? 'ACTIVE' : 'DISCONTINUED') + ']';
    if (m.purpose) p += ' — for: ' + m.purpose;
    if (m.prescriber) p += ' [prescribed by ' + m.prescriber + ']';
    if (m.pharmacy) p += ' [pharmacy: ' + m.pharmacy + ']';
    if (m.start_date) p += ' [started: ' + m.start_date + ']';
    if (m.refill_date) p += ' [refill: ' + m.refill_date + ']';
    if (m.notes) p += ' — notes: ' + m.notes;
    p += '\n';
  });

  // All conditions
  p += '\n— ALL CONDITIONS & DIAGNOSES —\n';
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

  // All allergies
  const allergies = data.allergies || [];
  if (allergies.length) {
    p += '\n— ALL ALLERGIES —\n';
    allergies.forEach(a => {
      p += '- ' + a.substance + ' (' + a.severity + ')';
      if (a.reaction) p += ' — reaction: ' + a.reaction;
      if (a.notes) p += ' — notes: ' + a.notes;
      p += '\n';
    });
  }

  // All anesthesia flags
  const aFlags = data.anesthesia_flags || [];
  if (aFlags.length) {
    p += '\n— ⚠ ANESTHESIA FLAGS —\n';
    aFlags.forEach(f => {
      p += '- ' + f.condition + ' → ' + f.implication;
      if (f.action_required) p += ' | Action: ' + f.action_required;
      p += '\n';
    });
  }

  // All providers
  const providers = data.providers || [];
  if (providers.length) {
    p += '\n— ALL PROVIDERS —\n';
    providers.forEach(pr => {
      p += '- ' + pr.name;
      if (pr.specialty) p += ' (' + pr.specialty + ')';
      if (pr.clinic) p += ', ' + pr.clinic;
      if (pr.phone) p += ', ' + pr.phone;
      if (pr.notes) p += ' — ' + pr.notes;
      p += '\n';
    });
  }

  // All appointments
  const appts = data.appts || [];
  if (appts.length) {
    p += '\n— ALL APPOINTMENTS —\n';
    appts.forEach(a => {
      p += '- ' + a.date;
      if (a.time) p += ' ' + a.time;
      if (a.provider) p += ' with ' + a.provider;
      if (a.location) p += ' at ' + a.location;
      if (a.reason) p += ' — ' + a.reason;
      if (a.questions) p += ' [questions: ' + a.questions + ']';
      if (a.post_notes) p += ' [post-visit notes: ' + a.post_notes + ']';
      p += '\n';
    });
  }

  // All labs
  const labs = data.labs || [];
  if (labs.length) {
    p += '\n— ALL LAB RESULTS —\n';
    labs.forEach(l => {
      p += '- ' + l.date + ': ' + l.test_name + ' = ' + l.result;
      if (l.unit) p += ' ' + l.unit;
      if (l.range) p += ' (ref: ' + l.range + ')';
      if (l.flag) p += ' [' + l.flag + ']';
      if (l.provider) p += ' — ' + l.provider;
      if (l.notes) p += ' — ' + l.notes;
      p += '\n';
    });
  }

  // All procedures
  const procedures = data.procedures || [];
  if (procedures.length) {
    p += '\n— ALL PROCEDURES & SURGERIES —\n';
    procedures.forEach(pr => {
      p += '- ' + pr.date + ': ' + pr.name;
      if (pr.type) p += ' (' + pr.type + ')';
      if (pr.provider) p += ' by ' + pr.provider;
      if (pr.location) p += ' at ' + pr.location;
      if (pr.reason) p += ' — reason: ' + pr.reason;
      if (pr.outcome) p += ' — outcome: ' + pr.outcome;
      if (pr.notes) p += ' — ' + pr.notes;
      p += '\n';
    });
  }

  // All immunizations
  const immunizations = data.immunizations || [];
  if (immunizations.length) {
    p += '\n— ALL IMMUNIZATIONS —\n';
    immunizations.forEach(i => {
      p += '- ' + i.name;
      if (i.dose) p += ' dose ' + i.dose;
      if (i.date) p += ', ' + i.date;
      if (i.site) p += ', site: ' + i.site;
      if (i.provider) p += ', ' + i.provider;
      p += '\n';
    });
  }

  // All care gaps
  const careGaps = data.care_gaps || [];
  if (careGaps.length) {
    p += '\n— ALL CARE GAPS —\n';
    careGaps.forEach(g => {
      p += '- ';
      if (g.urgency) p += '[' + g.urgency + '] ';
      if (g.category) p += g.category + ': ';
      p += g.item;
      if (g.last_done) p += ' (last done: ' + g.last_done + ')';
      if (g.notes) p += ' — ' + g.notes;
      p += '\n';
    });
  }

  // All insurance
  const insuranceRecords = data.insurance || [];
  if (insuranceRecords.length) {
    p += '\n— ALL INSURANCE COVERAGE —\n';
    insuranceRecords.forEach(ins => {
      p += '- ' + ins.name;
      if (ins.type) p += ' (' + ins.type + ')';
      if (ins.member_id) p += ', Member: ' + ins.member_id;
      if (ins.group) p += ', Group: ' + ins.group;
      if (ins.phone) p += ', Phone: ' + ins.phone;
      if (ins.notes) p += ' — ' + ins.notes;
      p += '\n';
    });
  }
  if (s.insurance_plan) {
    p += 'Settings insurance — Plan: ' + s.insurance_plan;
    if (s.insurance_id) p += ', ID: ' + s.insurance_id;
    if (s.insurance_group) p += ', Group: ' + s.insurance_group;
    if (s.insurance_phone) p += ', Phone: ' + s.insurance_phone;
    p += '\n';
  }

  // All appeals
  const appeals = data.appeals_and_disputes || [];
  if (appeals.length) {
    p += '\n— ALL APPEALS & DISPUTES —\n';
    appeals.forEach(a => {
      p += '- ' + a.date_filed + ': ' + a.subject;
      if (a.against) p += ' (against: ' + a.against + ')';
      p += ' — Status: ' + a.status;
      if (a.deadline) p += ', Deadline: ' + a.deadline;
      if (a.notes) p += ' — ' + a.notes;
      p += '\n';
    });
  }

  // All surgical planning
  const surgPlans = data.surgical_planning || [];
  if (surgPlans.length) {
    p += '\n— ALL SURGICAL PLANNING —\n';
    surgPlans.forEach(sp => {
      p += '- ' + sp.facility;
      if (sp.surgeon) p += ', Surgeon: ' + sp.surgeon;
      if (sp.target_date) p += ', Target: ' + sp.target_date;
      if (sp.status) p += ' [' + sp.status + ']';
      if (sp.case_number) p += ', Case #: ' + sp.case_number;
      p += '\n';
      if (sp.procedures && sp.procedures.length) {
        const procs = typeof sp.procedures === 'string' ? JSON.parse(sp.procedures) : sp.procedures;
        if (Array.isArray(procs) && procs.length) p += '  Procedures: ' + procs.join(', ') + '\n';
      }
      if (sp.procedures_not_on_list && sp.procedures_not_on_list.length) {
        const extra = typeof sp.procedures_not_on_list === 'string' ? JSON.parse(sp.procedures_not_on_list) : sp.procedures_not_on_list;
        if (Array.isArray(extra) && extra.length) p += '  Additional procedures: ' + extra.join(', ') + '\n';
      }
      if (sp.constraints && sp.constraints.length) {
        const cons = typeof sp.constraints === 'string' ? JSON.parse(sp.constraints) : sp.constraints;
        if (Array.isArray(cons) && cons.length) p += '  Constraints: ' + cons.join(', ') + '\n';
      }
      if (sp.outstanding_items && sp.outstanding_items.length) {
        const items = typeof sp.outstanding_items === 'string' ? JSON.parse(sp.outstanding_items) : sp.outstanding_items;
        if (Array.isArray(items) && items.length) p += '  Outstanding: ' + items.join(', ') + '\n';
      }
      if (sp.accommodation) p += '  Accommodation: ' + sp.accommodation + '\n';
      if (sp.coordinator) p += '  Coordinator: ' + sp.coordinator + '\n';
    });
  }

  // All vitals
  const vitals = data.vitals || [];
  if (vitals.length) {
    p += '\n— ALL VITALS —\n';
    vitals.forEach(v => {
      const t = VITAL_TYPES.find(x => x.id === v.type);
      p += '- ' + (t ? t.label : v.type) + ': ';
      p += v.type === 'bp' ? v.value + '/' + v.value2 : v.value;
      if (t) p += ' ' + t.unit;
      p += ' on ' + v.date;
      if (v.notes) p += ' — ' + v.notes;
      p += '\n';
    });
  }

  // All journal entries
  const journal = data.journal || [];
  if (journal.length) {
    p += '\n— ALL JOURNAL ENTRIES —\n';
    journal.forEach(e => {
      p += '- ' + e.date;
      if (e.mood) p += ' [mood: ' + e.mood + ']';
      if (e.severity) p += ' [severity: ' + e.severity + '/10]';
      if (e.title) p += ' "' + e.title + '"';
      p += ': ' + (e.content || '');
      if (e.tags) p += ' (tags: ' + e.tags + ')';
      p += '\n';
    });
  }

  // User's manual health background
  if (s.health_background) {
    p += '\n— USER HEALTH BACKGROUND NOTES —\n' + s.health_background + '\n';
  }

  return p;
}
