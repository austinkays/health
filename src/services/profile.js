import { VITAL_TYPES } from '../constants/defaults';

/**
 * Builds a comprehensive health profile string for AI context.
 *
 * CRITICAL: This profile is used by AI to give health guidance.
 * Every piece of user data MUST be represented — missing data
 * could mean missing a life-threatening interaction, allergy,
 * or surgical safety flag. NO table is optional.
 *
 * Tables covered (15 + profile):
 *   demographics, emergency contact, anesthesia flags, allergies,
 *   medications (active + discontinued), conditions, labs, procedures,
 *   immunizations, care gaps, providers, appointments (upcoming + past notes),
 *   surgical planning, vitals (trends), journal, insurance, appeals,
 *   health background
 */
export function buildProfile(data) {
  const s = data.settings || {};
  const lines = [];

  // ═══════════════════════════════════════════
  // DEMOGRAPHICS — compact single-line summary
  // ═══════════════════════════════════════════
  const demo = [];
  if (s.name) demo.push('Name: ' + s.name);
  if (s.dob) demo.push('DOB: ' + s.dob + calcAge(s.dob));
  if (s.sex && s.sex !== 'prefer-not') demo.push('Sex: ' + s.sex);
  if (s.height) demo.push('Height: ' + s.height);
  if (s.blood_type && s.blood_type !== 'unknown') demo.push('Blood type: ' + s.blood_type);
  if (s.location) demo.push('Location: ' + s.location);
  if (s.primary_provider) demo.push('PCP: ' + s.primary_provider);
  if (demo.length) lines.push(demo.join(' | '));

  // ═══════════════════════════════════════════
  // EMERGENCY CONTACT
  // ═══════════════════════════════════════════
  if (s.emergency_name) {
    let ec = 'Emergency contact: ' + s.emergency_name;
    if (s.emergency_relationship) ec += ' (' + s.emergency_relationship + ')';
    if (s.emergency_phone) ec += ' ' + s.emergency_phone;
    lines.push(ec);
  }

  // ═══════════════════════════════════════════
  // ⚠️ ANESTHESIA / SURGICAL SAFETY FLAGS
  // Listed FIRST after demographics — these are
  // the most safety-critical items in the profile
  // ═══════════════════════════════════════════
  const aFlags = data.anesthesia_flags || [];
  if (aFlags.length) {
    lines.push('\n⚠️ — ANESTHESIA & SURGICAL SAFETY FLAGS —');
    aFlags.forEach(f => {
      let l = '- ⚠️ ' + f.condition;
      if (f.implication) l += ' → ' + f.implication;
      if (f.action_required) l += ' ACTION: ' + f.action_required;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // ALLERGIES — high priority, safety-critical
  // ALL allergies included, never truncated
  // ═══════════════════════════════════════════
  const allergies = data.allergies || [];
  if (allergies.length) {
    lines.push('\n— ALLERGIES (' + allergies.length + ') —');
    allergies.forEach(a => {
      let l = '- ' + a.substance + ' (' + a.severity + ')';
      if (a.type) l += ' [' + a.type + ']';
      if (a.reaction) l += ' — reaction: ' + a.reaction;
      if (a.confirmed_by) l += ' [confirmed: ' + a.confirmed_by + ']';
      if (a.onset_date) l += ' since ' + a.onset_date;
      if (a.notes) l += ' — ' + a.notes;
      lines.push(l);
    });
  } else {
    lines.push('\n— ALLERGIES —\nNKDA (no known drug allergies on file)');
  }

  // ═══════════════════════════════════════════
  // ACTIVE MEDICATIONS — full detail, never truncated
  // ═══════════════════════════════════════════
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
      if (m.pharmacy) l += ' [pharmacy: ' + m.pharmacy + ']';
      if (m.start_date) l += ' started ' + m.start_date;
      if (m.quantity && m.days_supply) l += ' qty:' + m.quantity + '/' + m.days_supply + 'days';
      if (m.refill_date) l += ' refill:' + m.refill_date;
      if (m.prior_auth) l += ' [PA: ' + m.prior_auth + ']';
      if (m.notes) l += ' — ' + m.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // DISCONTINUED MEDICATIONS — important for history
  // ═══════════════════════════════════════════
  const disc = (data.meds || []).filter(m => m.active === false);
  if (disc.length) {
    lines.push('\n— DISCONTINUED MEDICATIONS (' + disc.length + ') —');
    disc.forEach(m => {
      let l = '- ' + m.name;
      if (m.dose) l += ' ' + m.dose;
      if (m.purpose) l += ' — was for: ' + m.purpose;
      if (m.notes) l += ' — ' + m.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // CONDITIONS & DIAGNOSES — all included
  // ═══════════════════════════════════════════
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

  // ═══════════════════════════════════════════
  // LABS & IMAGING — all results, flagged items first
  // ═══════════════════════════════════════════
  const labs = data.labs || [];
  if (labs.length) {
    // Sort: abnormal/flagged results first, then by date descending
    const sorted = [...labs].sort((a, b) => {
      const aAbn = a.flag && a.flag !== 'normal' ? 0 : 1;
      const bAbn = b.flag && b.flag !== 'normal' ? 0 : 1;
      if (aAbn !== bAbn) return aAbn - bAbn;
      return (b.date || '').localeCompare(a.date || '');
    });

    lines.push('\n— LAB RESULTS & IMAGING (' + labs.length + ') —');
    sorted.forEach(lab => {
      let l = '- ' + (lab.date || '?');
      l += ' ' + lab.test_name;
      if (lab.result) l += ': ' + lab.result;
      if (lab.unit) l += ' ' + lab.unit;
      if (lab.range) l += ' (ref: ' + lab.range + ')';
      if (lab.flag && lab.flag !== 'normal') l += ' ⚠️' + lab.flag.toUpperCase();
      if (lab.provider) l += ' [' + lab.provider + ']';
      if (lab.notes) l += ' — ' + lab.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // PROCEDURES — surgical & diagnostic history
  // ═══════════════════════════════════════════
  const procedures = data.procedures || [];
  if (procedures.length) {
    lines.push('\n— PROCEDURES & SURGERIES (' + procedures.length + ') —');
    const sorted = [...procedures].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    sorted.forEach(p => {
      let l = '- ' + (p.date || '?');
      l += ' ' + p.name;
      if (p.type) l += ' [' + p.type + ']';
      if (p.provider) l += ' by ' + p.provider;
      if (p.location) l += ' @ ' + p.location;
      if (p.reason) l += ' — reason: ' + p.reason;
      if (p.outcome) l += ' → outcome: ' + p.outcome;
      if (p.notes) l += ' — ' + p.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // IMMUNIZATIONS — vaccination history
  // ═══════════════════════════════════════════
  const immunizations = data.immunizations || [];
  if (immunizations.length) {
    lines.push('\n— IMMUNIZATIONS (' + immunizations.length + ') —');
    const sorted = [...immunizations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    sorted.forEach(imm => {
      let l = '- ' + (imm.date || '?');
      l += ' ' + imm.name;
      if (imm.dose) l += ' dose:' + imm.dose;
      if (imm.site) l += ' site:' + imm.site;
      if (imm.lot_number) l += ' lot:' + imm.lot_number;
      if (imm.provider) l += ' [' + imm.provider + ']';
      if (imm.location) l += ' @ ' + imm.location;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // CARE GAPS — overdue/urgent items first
  // ═══════════════════════════════════════════
  const careGaps = data.care_gaps || [];
  if (careGaps.length) {
    const urgencyOrder = { 'urgent': 0, 'needs prompt attention': 1, 'worth raising at next appointment': 2, 'routine': 3, 'completed': 4 };
    const sorted = [...careGaps].sort((a, b) => (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3));

    lines.push('\n— CARE GAPS & OVERDUE ITEMS (' + careGaps.length + ') —');
    sorted.forEach(g => {
      let l = '- ';
      if (g.urgency === 'urgent') l += '🔴 ';
      else if (g.urgency === 'needs prompt attention') l += '🟡 ';
      l += g.item;
      if (g.category) l += ' [' + g.category + ']';
      if (g.urgency) l += ' urgency:' + g.urgency;
      if (g.last_done) l += ' last:' + g.last_done;
      if (g.notes) l += ' — ' + g.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // SURGICAL PLANNING — upcoming/active plans
  // ═══════════════════════════════════════════
  const surgPlans = data.surgical_planning || [];
  if (surgPlans.length) {
    lines.push('\n— SURGICAL PLANNING —');
    surgPlans.forEach(sp => {
      let l = '- Status: ' + (sp.status || 'planning');
      if (sp.facility) l += ' @ ' + sp.facility;
      if (sp.surgeon) l += ', surgeon: ' + sp.surgeon;
      if (sp.coordinator) l += ', coord: ' + sp.coordinator;
      if (sp.case_number) l += ' case#' + sp.case_number;
      if (sp.target_date) l += ', target: ' + sp.target_date;
      lines.push(l);

      const procs = sp.procedures || [];
      if (procs.length) lines.push('  Procedures: ' + procs.join('; '));

      const notOnList = sp.procedures_not_on_list || [];
      if (notOnList.length) lines.push('  Additional (not on list): ' + notOnList.join('; '));

      const constraints = sp.constraints || [];
      if (constraints.length) lines.push('  Constraints: ' + constraints.join('; '));

      const outstanding = sp.outstanding_items || [];
      if (outstanding.length) lines.push('  Outstanding items: ' + outstanding.join('; '));

      if (sp.accommodation) lines.push('  Accommodation needs: ' + sp.accommodation);
    });
  }

  // ═══════════════════════════════════════════
  // CARE TEAM / PROVIDERS — all providers with details
  // ═══════════════════════════════════════════
  const providers = data.providers || [];
  if (providers.length) {
    lines.push('\n— CARE TEAM (' + providers.length + ') —');
    providers.forEach(pr => {
      let l = '- ' + pr.name;
      if (pr.specialty) l += ' (' + pr.specialty + ')';
      if (pr.npi) l += ' NPI:' + pr.npi;
      if (pr.clinic) l += ' @ ' + pr.clinic;
      const addr = [pr.address, pr.city, pr.state, pr.zip].filter(Boolean).join(', ');
      if (addr) l += ', ' + addr;
      if (pr.phone) l += ' tel:' + pr.phone;
      if (pr.fax) l += ' fax:' + pr.fax;
      if (pr.email) l += ' email:' + pr.email;
      if (pr.portal_url) l += ' portal:' + pr.portal_url;
      if (pr.accepted_insurance) l += ' [accepts: ' + pr.accepted_insurance + ']';
      if (pr.notes) l += ' — ' + pr.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // UPCOMING APPOINTMENTS — all upcoming, not capped
  // ═══════════════════════════════════════════
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data.appts || [])
    .filter(a => a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length) {
    lines.push('\n— UPCOMING APPOINTMENTS (' + upcoming.length + ') —');
    upcoming.forEach(a => {
      let l = '- ' + a.date;
      if (a.time) l += ' ' + a.time;
      if (a.visit_type) l += ' [' + a.visit_type + ']';
      if (a.provider) l += ' with ' + a.provider;
      if (a.location) l += ' @ ' + a.location;
      if (a.reason) l += ' — ' + a.reason;
      if (a.linked_condition) l += ' (re: ' + a.linked_condition + ')';
      if (a.telehealth_url) l += ' link:' + a.telehealth_url;
      if (a.questions) l += ' Q: ' + a.questions;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // PAST APPOINTMENT NOTES — all visits with notes
  // ═══════════════════════════════════════════
  const pastWithNotes = (data.appts || [])
    .filter(a => a.date < today && a.post_notes)
    .sort((a, b) => b.date.localeCompare(a.date));
  if (pastWithNotes.length) {
    lines.push('\n— PAST VISIT NOTES (' + pastWithNotes.length + ') —');
    pastWithNotes.forEach(a => {
      let l = '- ' + a.date;
      if (a.provider) l += ' ' + a.provider;
      if (a.reason) l += ' (' + a.reason + ')';
      if (a.visit_type) l += ' [' + a.visit_type + ']';
      l += ': ' + a.post_notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // VITAL TRENDS — aggregated with trend direction
  // ═══════════════════════════════════════════
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
        const sorted = [...readings].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const last = sorted[sorted.length - 1];
        let l = '- ' + label + ': last ' + last.value + '/' + last.value2 + ' ' + unit;
        if (last.date) l += ' on ' + last.date;
        if (sorted.length > 1) {
          const first = sorted[0];
          l += ' (range: ' + Math.min(...sorted.map(r => +r.value)) + '/' + Math.min(...sorted.map(r => +r.value2));
          l += ' to ' + Math.max(...sorted.map(r => +r.value)) + '/' + Math.max(...sorted.map(r => +r.value2)) + ')';
        }
        l += ' (' + readings.length + ' readings)';
        lines.push(l);
      } else {
        const nums = readings
          .map(r => ({ val: parseFloat(r.value), date: r.date, notes: r.notes }))
          .filter(n => !isNaN(n.val));
        if (nums.length === 0) continue;

        const vals = nums.map(n => n.val);
        const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const last = nums[nums.length - 1];

        let l = '- ' + label + ': last ' + last.val + unit;
        if (last.date) l += ' (' + last.date + ')';
        l += ', avg ' + avg.toFixed(1) + unit;
        l += ', range ' + min + '-' + max + unit;

        // Trend calculation
        if (vals.length >= 4) {
          const half = Math.floor(vals.length / 2);
          const older = vals.slice(0, half).reduce((s, n) => s + n, 0) / half;
          const newer = vals.slice(half).reduce((s, n) => s + n, 0) / (vals.length - half);
          const diff = newer - older;
          const pct = older !== 0 ? Math.abs(diff / older) * 100 : 0;
          if (pct > 5) {
            l += diff > 0 ? ' ↑trending up' : ' ↓trending down';
          } else {
            l += ' →stable';
          }
        }
        l += ' (' + vals.length + ' readings)';

        // Flag any readings with notes (could contain critical context)
        const withNotes = nums.filter(n => n.notes);
        if (withNotes.length) {
          lines.push(l);
          withNotes.slice(-3).forEach(n => {
            lines.push('  note ' + (n.date || '') + ': ' + n.notes);
          });
        } else {
          lines.push(l);
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // JOURNAL ENTRIES — all entries, full content
  // These may contain symptom reports, reactions,
  // flare documentation — all medically relevant
  // ═══════════════════════════════════════════
  const journal = data.journal || [];
  if (journal.length) {
    lines.push('\n— HEALTH JOURNAL (' + journal.length + ' entries) —');
    journal.forEach(e => {
      let l = '- ' + e.date;
      if (e.mood) l += ' [' + e.mood + ']';
      if (e.severity) l += ' sev:' + e.severity + '/10';
      if (e.title) l += ' "' + e.title + '"';
      if (e.content) l += ' ' + e.content;
      if (e.tags) l += ' #' + e.tags;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // INSURANCE COVERAGE — all plans from insurance table
  // ═══════════════════════════════════════════
  const insuranceRecords = data.insurance || [];
  const hasProfileIns = s.insurance_plan;
  if (insuranceRecords.length || hasProfileIns) {
    lines.push('\n— INSURANCE COVERAGE —');

    // Profile-level insurance (legacy/summary)
    if (hasProfileIns) {
      let l = '- ' + s.insurance_plan;
      if (s.insurance_id) l += ', ID: ' + s.insurance_id;
      if (s.insurance_group) l += ', Group: ' + s.insurance_group;
      if (s.insurance_phone) l += ', Phone: ' + s.insurance_phone;
      lines.push(l);
    }

    // Detailed insurance records
    insuranceRecords.forEach(ins => {
      let l = '- ' + ins.name;
      if (ins.type) l += ' [' + ins.type + ']';
      if (ins.member_id) l += ' ID:' + ins.member_id;
      if (ins.group) l += ' Group:' + ins.group;
      if (ins.phone) l += ' tel:' + ins.phone;
      if (ins.notes) l += ' — ' + ins.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // APPEALS & DISPUTES — active insurance fights
  // These affect care access and treatment options
  // ═══════════════════════════════════════════
  const appeals = data.appeals_and_disputes || [];
  if (appeals.length) {
    lines.push('\n— APPEALS & DISPUTES (' + appeals.length + ') —');
    const sorted = [...appeals].sort((a, b) => {
      // Active/filed first, resolved last
      const statusOrder = { 'active': 0, 'filed': 1, 'draft': 2, 'resolved': 3 };
      return (statusOrder[a.status] || 2) - (statusOrder[b.status] || 2);
    });
    sorted.forEach(ap => {
      let l = '- [' + (ap.status || 'draft') + '] ' + ap.subject;
      if (ap.against) l += ' vs ' + ap.against;
      if (ap.date_filed) l += ', filed ' + ap.date_filed;
      if (ap.deadline) l += ', deadline: ' + ap.deadline;
      if (ap.notes) l += ' — ' + ap.notes;
      lines.push(l);
    });
  }

  // ═══════════════════════════════════════════
  // PHARMACY
  // ═══════════════════════════════════════════
  if (s.pharmacy) {
    lines.push('\n— PHARMACY —');
    lines.push('Preferred: ' + s.pharmacy);
  }

  // ═══════════════════════════════════════════
  // HEALTH BACKGROUND — free-text context
  // ═══════════════════════════════════════════
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
